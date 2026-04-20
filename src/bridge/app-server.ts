import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { resolvePhaseAfterCommand } from '../app/state.js';
import { bootstrapApp } from '../cli/bootstrap.js';
import {
  authorizeApp,
  createAppSession,
  ensureAppState,
  setAppSessionCookie
} from './auth.js';
import { parseRequestUrl, readJson, writeJson } from './http-utils.js';
import {
  renderMobilePage,
  renderPwaAppPage,
  renderAppServiceWorker,
  renderAppIconSvg
} from './renderer.js';
import {
  writeBridgeMarkdownFile,
  writeBridgePayloadFile,
  writeQueuedInputsFile
} from './payload-file.js';
import {
  launchTawSession,
  launchTawSessionBackground,
  type LaunchResult
} from './launcher.js';
import { browserResearchPayloadSchema } from '../core/research/schema.js';
import { parseCommand } from '../commands/parser.js';
import { getCommandDefinition } from '../commands/registry.js';
import { executeChatTurn } from '../core/chat/engine.js';
import { searchWebAndStoreSources } from '../core/research/search.js';
import { readResearchSources } from '../core/research/store.js';
import type { AppState, TranscriptEntry } from '../types/app.js';
import {
  buildWikiMode,
  getWikiInfo,
  listWikiTopics,
  resolveWikiPath,
  wikiExists
} from '../services/wiki/manager.js';
import {
  isOperationalWikiNotePath,
  readFrontmatterScalar
} from '../services/wiki/frontmatter.js';
import { readPendingWikiIngest } from '../services/wiki/pending-ingest.js';
import { readPendingIndexReview } from '../services/wiki/pending-index-review.js';
import { readPendingLinkReview } from '../services/wiki/pending-link-review.js';
import type { SearchBackendStatus } from '../services/search/searxng-manager.js';
import { createId } from '../utils/ids.js';

export interface AppServerOptions {
  token: string;
  defaultCwd: string;
  launch?: (
    input: { queuedInputsPath?: string; researchPayloadPath?: string; runQueuedAndExit?: boolean },
    cwd: string,
    windowName: string
  ) => Promise<LaunchResult>;
  searchBackend?: {
    getStatus: () => Promise<SearchBackendStatus>;
    start: () => Promise<SearchBackendStatus>;
    stop: () => Promise<SearchBackendStatus>;
    touch: () => Promise<SearchBackendStatus>;
  };
  capturePage?: (
    url: string
  ) => Promise<{ pageTitle: string; pageTextExcerpt: string | null }>;
}

interface BackgroundJob {
  jobId: string;
  topic: string;
  startedAt: string;
  status: 'running' | 'success' | 'failed';
  completedAt?: string;
  exitCode?: number | null;
}

interface AppActionItem {
  id: string;
  category: 'pending-review' | 'pending-intake';
  title: string;
  detail: string;
  action: 'stage-link-review' | 'stage-reindex' | 'confirm' | 'cancel';
  topic?: string;
}

const appBootstrapRequestSchema = z.object({
  token: z.string().min(1)
});

const appCaptureRequestSchema = z.object({
  url: z.string().url()
});

const appWikiIngestRequestSchema = z.object({
  cwd: z.string().optional(),
  topic: z.string().min(1),
  url: z.string().url(),
  pageTitle: z.string().min(1),
  pageTextExcerpt: z.string().nullable(),
  userNote: z.string().nullable().default(null),
  autoRun: z.boolean().default(true)
});

const appResearchIngestRequestSchema = z.object({
  cwd: z.string().optional(),
  url: z.string().url(),
  pageTitle: z.string().min(1),
  pageTextExcerpt: z.string().nullable(),
  userNote: z.string().nullable().default(null),
  initialQuestion: z.string().nullable().default(null)
});

const appAskRequestSchema = z.object({
  prompt: z.string().min(1).max(8000)
});

const appActionRunRequestSchema = z.object({
  action: z.enum(['stage-link-review', 'stage-reindex', 'confirm', 'cancel']),
  topic: z.string().optional()
});

const appTopicSummaryRequestSchema = z.object({
  topic: z.string().min(1),
  wikiOnly: z.boolean().default(true)
});

const appTopicResearchSeedsRequestSchema = z.object({
  topic: z.string().min(1)
});

const appTopicAnalysisRequestSchema = z.object({
  topic: z.string().min(1),
  notePath: z.string().min(1),
  question: z.string().min(1)
});

const newWikiIngestFromAppSchema = z.object({
  cwd: z.string().optional(),
  topic: z.string().min(1),
  pageTitle: z.string().min(1),
  pageUrl: z.string().nullable(),
  pageTextExcerpt: z.string().nullable(),
  selectedText: z.string().nullable().default(null),
  userNote: z.string().nullable().default(null),
  autoRun: z.boolean().default(false)
});

export function createAppServerHandler(
  options: AppServerOptions
): (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> {
  const activeJobs = new Map<string, BackgroundJob>();

  function cleanupOldJobs(): void {
    const cutoffMs = Date.now() - 2 * 60 * 60 * 1000;
    for (const [id, job] of activeJobs) {
      if (new Date(job.startedAt).getTime() < cutoffMs) {
        activeJobs.delete(id);
      }
    }
  }

  return async (request: http.IncomingMessage, response: http.ServerResponse): Promise<void> => {
    const parsedUrl = parseRequestUrl(request);

    // ── Bootstrap (session creation) ─────────────────────────────────────────

    if (
      request.method === 'GET' &&
      parsedUrl?.pathname === '/app/bootstrap' &&
      parsedUrl.searchParams.get('token') === options.token
    ) {
      const sessionId = createAppSession();
      setAppSessionCookie(response, sessionId);
      response.statusCode = 302;
      response.setHeader('location', '/app');
      response.end();
      return;
    }

    if (request.method === 'POST' && parsedUrl?.pathname === '/app/api/bootstrap') {
      const body = appBootstrapRequestSchema.parse(await readJson(request));
      if (body.token !== options.token) {
        writeJson(response, 401, { ok: false, error: 'Invalid token.' });
        return;
      }
      const sessionId = createAppSession();
      setAppSessionCookie(response, sessionId);
      writeJson(response, 200, { ok: true });
      return;
    }

    // ── Static / PWA assets (no auth) ────────────────────────────────────────

    if (request.method === 'GET' && parsedUrl?.pathname === '/app/manifest.webmanifest') {
      response.statusCode = 200;
      response.setHeader('content-type', 'application/manifest+json');
      response.end(
        JSON.stringify(
          {
            name: 'TAW Companion',
            short_name: 'TAW',
            id: '/app',
            start_url: '/app',
            scope: '/app',
            display: 'standalone',
            display_override: ['standalone', 'minimal-ui', 'browser'],
            background_color: '#0f172a',
            theme_color: '#0f172a',
            icons: [
              {
                src: '/app/icon-192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any maskable'
              },
              {
                src: '/app/icon-512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any maskable'
              },
              {
                src: '/app/icon.svg',
                sizes: 'any',
                type: 'image/svg+xml',
                purpose: 'any maskable'
              }
            ],
            share_target: {
              action: '/app/share',
              method: 'GET',
              enctype: 'application/x-www-form-urlencoded',
              params: {
                title: 'title',
                text: 'text',
                url: 'url'
              }
            }
          },
          null,
          2
        )
      );
      return;
    }

    if (request.method === 'GET' && parsedUrl?.pathname === '/app/share') {
      const redirect = new URL('/app', `http://${request.headers.host ?? '127.0.0.1'}`);
      for (const key of ['title', 'text', 'url']) {
        const value = parsedUrl.searchParams.get(key);
        if (value) {
          redirect.searchParams.set(key, value);
        }
      }
      response.statusCode = 302;
      response.setHeader('location', `${redirect.pathname}${redirect.search}`);
      response.end();
      return;
    }

    if (request.method === 'GET' && parsedUrl?.pathname === '/app/icon.svg') {
      response.statusCode = 200;
      response.setHeader('content-type', 'image/svg+xml');
      response.end(renderAppIconSvg());
      return;
    }

    if (
      request.method === 'GET' &&
      (parsedUrl?.pathname === '/app/icon-192.png' ||
        parsedUrl?.pathname === '/app/icon-512.png')
    ) {
      // PNG encoder removed in plan 999.4-02; redirect to SVG icon
      response.statusCode = 302;
      response.setHeader('location', '/app/icon.svg');
      response.end();
      return;
    }

    if (request.method === 'GET' && parsedUrl?.pathname === '/app/sw.js') {
      response.statusCode = 200;
      response.setHeader('content-type', 'application/javascript');
      response.end(renderAppServiceWorker());
      return;
    }

    if (request.method === 'GET' && parsedUrl?.pathname === '/app') {
      const hasSession = authorizeApp(request);
      response.statusCode = 200;
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(renderPwaAppPage(hasSession));
      return;
    }

    if (
      request.method === 'GET' &&
      parsedUrl?.pathname === '/mobile' &&
      parsedUrl.searchParams.get('token') === options.token
    ) {
      response.statusCode = 200;
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(renderMobilePage(options.token));
      return;
    }

    // ── App API routes (cookie session auth) ─────────────────────────────────

    if (request.method === 'GET' && parsedUrl?.pathname === '/app/api/state') {
      if (!authorizeApp(request)) {
        writeJson(response, 401, { ok: false, error: 'App session required.' });
        return;
      }
      const appState = await ensureAppState(request, options.defaultCwd);
      writeJson(response, 200, {
        ok: true,
        topics: await listWikiTopics(),
        actions: await buildAppActions(appState, activeJobs),
        recentStatus: await buildRecentStatus(appState, activeJobs, cleanupOldJobs)
      });
      return;
    }

    if (request.method === 'GET' && parsedUrl?.pathname === '/app/api/actions') {
      if (!authorizeApp(request)) {
        writeJson(response, 401, { ok: false, error: 'App session required.' });
        return;
      }
      const appState = await ensureAppState(request, options.defaultCwd);
      writeJson(response, 200, {
        ok: true,
        actions: await buildAppActions(appState, activeJobs)
      });
      return;
    }

    if (request.method === 'POST' && parsedUrl?.pathname === '/app/api/actions/run') {
      if (!authorizeApp(request)) {
        writeJson(response, 401, { ok: false, error: 'App session required.' });
        return;
      }
      const appState = await ensureAppState(request, options.defaultCwd);
      const body = appActionRunRequestSchema.parse(await readJson(request));
      const result = await runAppAction(appState, body);
      writeJson(response, 200, {
        ok: true,
        ...result,
        actions: await buildAppActions(appState, activeJobs),
        recentStatus: await buildRecentStatus(appState, activeJobs, cleanupOldJobs)
      });
      return;
    }

    if (request.method === 'GET' && parsedUrl?.pathname === '/app/api/status') {
      if (!authorizeApp(request)) {
        writeJson(response, 401, { ok: false, error: 'App session required.' });
        return;
      }
      const appState = await ensureAppState(request, options.defaultCwd);
      writeJson(response, 200, {
        ok: true,
        recentStatus: await buildRecentStatus(appState, activeJobs, cleanupOldJobs)
      });
      return;
    }

    if (request.method === 'POST' && parsedUrl?.pathname === '/app/api/ask') {
      if (!authorizeApp(request)) {
        writeJson(response, 401, { ok: false, error: 'App session required.' });
        return;
      }
      const appState = await ensureAppState(request, options.defaultCwd);
      const body = appAskRequestSchema.parse(await readJson(request));
      const answer = await runAssistantQuery(appState, 'General', body.prompt);
      writeJson(response, 200, { ok: true, answer });
      return;
    }

    if (request.method === 'GET' && parsedUrl?.pathname === '/app/api/topics/notes') {
      if (!authorizeApp(request)) {
        writeJson(response, 401, { ok: false, error: 'App session required.' });
        return;
      }
      const topic = parsedUrl.searchParams.get('topic');
      if (!topic) {
        writeJson(response, 400, { ok: false, error: 'Topic is required.' });
        return;
      }
      writeJson(response, 200, {
        ok: true,
        notes: await listTopicNotes(topic)
      });
      return;
    }

    if (request.method === 'POST' && parsedUrl?.pathname === '/app/api/topics/summarize') {
      if (!authorizeApp(request)) {
        writeJson(response, 401, { ok: false, error: 'App session required.' });
        return;
      }
      const appState = await ensureAppState(request, options.defaultCwd);
      const body = appTopicSummaryRequestSchema.parse(await readJson(request));
      const answer = await runAssistantQuery(
        appState,
        buildWikiMode('Query', normalizeTopic(body.topic)),
        [
          `Summarize the "${normalizeTopic(body.topic)}" wiki topic.`,
          body.wikiOnly
            ? 'Restrict yourself to information grounded in the wiki context already provided. If something is missing, say so.'
            : 'Prioritize the wiki context, but you may add broader model knowledge when it clearly helps. Separate outside context from wiki-grounded claims.',
          'Do not write or update any wiki pages.',
          'Keep the answer concise but useful on mobile.'
        ].join('\n\n')
      );
      writeJson(response, 200, { ok: true, answer });
      return;
    }

    if (request.method === 'POST' && parsedUrl?.pathname === '/app/api/topics/research-seeds') {
      if (!authorizeApp(request)) {
        writeJson(response, 401, { ok: false, error: 'App session required.' });
        return;
      }
      const appState = await ensureAppState(request, options.defaultCwd);
      const body = appTopicResearchSeedsRequestSchema.parse(await readJson(request));
      const answer = await buildTopicResearchSeeds(appState, normalizeTopic(body.topic));
      writeJson(response, 200, { ok: true, answer });
      return;
    }

    if (request.method === 'POST' && parsedUrl?.pathname === '/app/api/topics/analysis') {
      if (!authorizeApp(request)) {
        writeJson(response, 401, { ok: false, error: 'App session required.' });
        return;
      }
      const appState = await ensureAppState(request, options.defaultCwd);
      const body = appTopicAnalysisRequestSchema.parse(await readJson(request));
      const notePath = body.notePath;
      const noteContent = await readFile(
        resolveWikiPath(normalizeTopic(body.topic), notePath),
        'utf8'
      );
      const answer = await runAssistantQuery(
        appState,
        buildWikiMode('Query', normalizeTopic(body.topic)),
        [
          `Analyze the topic "${normalizeTopic(body.topic)}" with this note as a focal point: ${notePath}`,
          `Required question: ${body.question}`,
          'Use the note content below together with the wiki context already in scope.',
          'Do not write or update any wiki pages.',
          `## Focal Note\n\n${noteContent.slice(0, 12000)}`
        ].join('\n\n')
      );
      writeJson(response, 200, { ok: true, answer });
      return;
    }

    if (request.method === 'POST' && parsedUrl?.pathname === '/app/api/capture-url') {
      if (!authorizeApp(request)) {
        writeJson(response, 401, { ok: false, error: 'App session required.' });
        return;
      }
      const body = appCaptureRequestSchema.parse(await readJson(request));
      const capturePage = options.capturePage ?? captureMobilePage;
      const captured = await capturePage(body.url);
      writeJson(response, 200, { ok: true, ...captured, url: body.url });
      return;
    }

    if (request.method === 'POST' && parsedUrl?.pathname === '/app/api/wiki-ingest') {
      if (!authorizeApp(request)) {
        writeJson(response, 401, { ok: false, error: 'App session required.' });
        return;
      }
      const body = appWikiIngestRequestSchema.parse(await readJson(request));
      const result = await queueWikiIngestRequest(
        {
          cwd: body.cwd,
          topic: body.topic,
          pageTitle: body.pageTitle,
          pageUrl: body.url,
          pageTextExcerpt: body.pageTextExcerpt,
          selectedText: null,
          userNote: body.userNote,
          autoRun: body.autoRun
        },
        options,
        activeJobs,
        cleanupOldJobs
      );
      writeJson(response, 200, { mode: 'wiki', ...result });
      return;
    }

    if (request.method === 'POST' && parsedUrl?.pathname === '/app/api/research-ingest') {
      if (!authorizeApp(request)) {
        writeJson(response, 401, { ok: false, error: 'App session required.' });
        return;
      }
      const body = appResearchIngestRequestSchema.parse(await readJson(request));
      const result = await queueResearchIngestRequest(
        {
          cwd: body.cwd,
          payload: {
            kind: 'article',
            researchType: 'tech',
            url: body.url,
            title: body.pageTitle,
            selectedText: null,
            pageTextExcerpt: body.pageTextExcerpt,
            userNote: body.userNote,
            sentAt: new Date().toISOString(),
            initialQuestion: body.initialQuestion
          }
        },
        options
      );
      writeJson(response, 200, { mode: 'research', ...result });
      return;
    }

    writeJson(response, 404, { error: 'Not found' });
  };
}

// ── Private helpers ──────────────────────────────────────────────────────────

function normalizeTopic(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

function buildResearchWindowName(title: string): string {
  const normalized = stripControlCharacters(title).replace(/\s+/g, ' ').trim();
  return normalized ? `taw: ${normalized}` : 'taw research';
}

function stripControlCharacters(value: string): string {
  return Array.from(value)
    .map((char) => {
      const code = char.charCodeAt(0);
      return code < 32 || code === 127 ? ' ' : char;
    })
    .join('');
}

async function queueResearchIngestRequest(
  body: { cwd?: string; payload: unknown },
  options: AppServerOptions
): Promise<{
  ok: true;
  payloadPath: string;
  cwd: string;
  launchMethod: LaunchResult['launchMethod'];
  command: string;
}> {
  const payload = browserResearchPayloadSchema.parse(body.payload);
  const payloadPath = await writeBridgePayloadFile(payload);
  const cwd = body.cwd ?? options.defaultCwd;
  const launch =
    options.launch ??
    (async (_input: { researchPayloadPath?: string }, _cwd: string, _windowName: string) => {
      throw new Error('launch not configured');
    });
  const launchResult = await launch(
    { researchPayloadPath: payloadPath },
    cwd,
    buildResearchWindowName(payload.title)
  );
  return {
    ok: true,
    payloadPath,
    cwd,
    launchMethod: launchResult.launchMethod,
    command: launchResult.command
  };
}

async function queueWikiIngestRequest(
  body: z.infer<typeof newWikiIngestFromAppSchema>,
  options: AppServerOptions,
  activeJobs: Map<string, BackgroundJob>,
  cleanupOldJobs: () => void
): Promise<{
  ok: true;
  cwd: string;
  topic: string;
  topicExists: boolean;
  sourceFilePath: string;
  queuedInputs: string[];
  autoRun: boolean;
  jobId?: string;
  launchMethod: LaunchResult['launchMethod'];
  command: string;
}> {
  const cwd = body.cwd ?? options.defaultCwd;
  const normalizedTopic = normalizeTopic(body.topic);
  const topicExists = await wikiExists(normalizedTopic);
  const sourceFilePath = await writeWikiSourceFile(body);
  const queuedInputs = [
    ...(topicExists ? [] : [`/wiki init ${normalizedTopic}`]),
    `/wiki ingest ${normalizedTopic} ${sourceFilePath}`
  ];
  const queuedInputsPath = await writeQueuedInputsFile(queuedInputs);

  let launchResult: LaunchResult;
  let jobId: string | undefined;

  if (body.autoRun && !options.launch) {
    jobId = randomUUID();
    const job: BackgroundJob = {
      jobId,
      topic: normalizedTopic,
      startedAt: new Date().toISOString(),
      status: 'running'
    };
    activeJobs.set(jobId, job);

    launchResult = await launchTawSessionBackground(
      { queuedInputsPath, runQueuedAndExit: true },
      cwd,
      (exitCode) => {
        const existing = activeJobs.get(jobId!);
        if (existing) {
          activeJobs.set(jobId!, {
            ...existing,
            status: exitCode === 0 ? 'success' : 'failed',
            completedAt: new Date().toISOString(),
            exitCode
          });
        }
        cleanupOldJobs();
      }
    );
  } else {
    const launch = options.launch ?? launchTawSession;
    launchResult = await launch(
      { queuedInputsPath, runQueuedAndExit: body.autoRun },
      cwd,
      buildResearchWindowName(body.pageTitle)
    );
  }

  return {
    ok: true,
    cwd,
    topic: normalizedTopic,
    topicExists,
    sourceFilePath,
    queuedInputs,
    autoRun: body.autoRun,
    jobId,
    launchMethod: launchResult.launchMethod,
    command: launchResult.command
  };
}

async function writeWikiSourceFile(
  body: z.infer<typeof newWikiIngestFromAppSchema>
): Promise<string> {
  const content = [
    `# ${body.pageTitle}`,
    '',
    body.pageUrl ? `URL: ${body.pageUrl}` : null,
    body.userNote ? `User Note: ${body.userNote}` : null,
    '',
    '## Captured Content',
    '',
    body.selectedText || body.pageTextExcerpt || '(No page text captured.)'
  ]
    .filter(Boolean)
    .join('\n');

  return writeBridgeMarkdownFile('wiki-source', content);
}

async function runAppAction(
  appState: AppState,
  input: z.infer<typeof appActionRunRequestSchema>
): Promise<{ message: string; entries: TranscriptEntry[] }> {
  if (input.action === 'stage-link-review') {
    if (!input.topic) {
      throw new Error('Topic is required for link review.');
    }
    return runAppCommand(appState, `/wiki links ${normalizeTopic(input.topic)} recent`);
  }

  if (input.action === 'stage-reindex') {
    if (!input.topic) {
      throw new Error('Topic is required for reindex.');
    }
    return runAppCommand(appState, `/wiki reindex ${normalizeTopic(input.topic)}`);
  }

  if (input.action === 'confirm') {
    return runAppCommand(appState, '/confirm');
  }

  return runAppCommand(appState, '/cancel');
}

async function runAppCommand(
  appState: AppState,
  raw: string
): Promise<{ message: string; entries: TranscriptEntry[] }> {
  const parsed = parseCommand(raw);
  const command = getCommandDefinition(parsed.name);

  if (!command) {
    throw new Error(`Unknown command: /${parsed.name}`);
  }

  const result = await command.run(parsed, {
    cwd: appState.session.projectRoot ?? appState.session.metadata.cwdAtLaunch,
    session: appState.session,
    transcript: appState.transcript,
    providerConfig: appState.providerConfig,
    mode: appState.mode,
    globalConfig: appState.globalConfig,
    projectConfig: appState.projectConfig
  });

  appState.mode = result.mode ?? appState.mode;
  appState.phase =
    result.phase ?? resolvePhaseAfterCommand(result.mode ?? appState.mode, appState.phase);
  appState.provider = result.provider ?? appState.provider;
  appState.model = result.model ?? appState.model;
  appState.providerConfig = result.providerConfig ?? appState.providerConfig;
  appState.globalConfig = result.globalConfig ?? appState.globalConfig;
  appState.projectConfig =
    result.projectConfig === undefined ? appState.projectConfig : result.projectConfig;
  appState.session = result.session ?? appState.session;
  appState.queuedInputs = [...(result.queuedInputs ?? []), ...appState.queuedInputs];
  appState.transcript = [...appState.transcript, ...result.entries];
  if (result.brainstormMap !== undefined) {
    appState.brainstormMap = result.brainstormMap;
  }

  const message =
    result.entries.at(-1)?.body ??
    result.entries.map((entry) => `${entry.title ?? entry.kind}\n${entry.body}`).join('\n\n');

  return { message, entries: result.entries };
}

async function runAssistantQuery(
  appState: AppState,
  mode: string,
  prompt: string
): Promise<string> {
  const userEntry: TranscriptEntry = {
    id: createId('mobile-user'),
    kind: 'user',
    body: prompt
  };

  const transcriptWithUser = [...appState.transcript, userEntry];

  const result = await executeChatTurn({
    transcript: transcriptWithUser,
    latestUserInput: prompt,
    mode,
    providerConfig: appState.providerConfig,
    globalConfig: appState.globalConfig,
    commandReference: appState.commandReference,
    session: appState.session,
    projectConfig: appState.projectConfig,
    onChunk: () => {}
  });

  const assistantEntry: TranscriptEntry = {
    id: createId('mobile-assistant'),
    kind: 'assistant',
    title: mode === 'General' ? 'Ask TAWD' : 'Topic Result',
    body: result.assistantText,
    draftState: result.interrupted ? 'interrupted' : 'complete'
  };

  appState.transcript = [...transcriptWithUser, assistantEntry];
  return result.assistantText;
}

async function buildAppActions(
  appState: AppState,
  _activeJobs: Map<string, BackgroundJob>
): Promise<{
  categories: Array<{ id: string; title: string; items: AppActionItem[] }>;
}> {
  const topics = await listWikiTopics();
  const reviewItems: AppActionItem[] = [];

  for (const topic of topics) {
    const status = await getTopicOperationalStatus(topic);
    if (status.pendingLinkReviewCount > 0) {
      reviewItems.push({
        id: `link-${topic}`,
        category: 'pending-review',
        title: `Review links for ${topic}`,
        detail: `${status.pendingLinkReviewCount} note${status.pendingLinkReviewCount === 1 ? '' : 's'} need link review`,
        action: 'stage-link-review',
        topic
      });
    }
    if (status.pendingIndexCount > 0) {
      reviewItems.push({
        id: `index-${topic}`,
        category: 'pending-review',
        title: `Rebuild index for ${topic}`,
        detail: `${status.pendingIndexCount} note${status.pendingIndexCount === 1 ? '' : 's'} need indexing`,
        action: 'stage-reindex',
        topic
      });
    }
  }

  const intakeItems: AppActionItem[] = [];
  const pendingIngest = await readPendingWikiIngest(appState.session);
  const pendingLinkReview = await readPendingLinkReview(appState.session);
  const pendingIndexReview = await readPendingIndexReview(appState.session);

  if (pendingIngest) {
    intakeItems.push({
      id: 'pending-intake-confirm',
      category: 'pending-intake',
      title: `Confirm pending wiki ingest`,
      detail: `${pendingIngest.topic}: ${pendingIngest.query}`,
      action: 'confirm'
    });
    intakeItems.push({
      id: 'pending-intake-cancel',
      category: 'pending-intake',
      title: `Discard pending wiki ingest`,
      detail: `${pendingIngest.topic}: ${pendingIngest.query}`,
      action: 'cancel'
    });
  }

  if (pendingLinkReview || pendingIndexReview) {
    const label = pendingLinkReview
      ? `Staged review for ${pendingLinkReview.topic}`
      : `Staged reindex for ${pendingIndexReview?.topic}`;
    intakeItems.push({
      id: 'pending-review-confirm',
      category: 'pending-intake',
      title: 'Apply staged review',
      detail: label,
      action: 'confirm'
    });
    intakeItems.push({
      id: 'pending-review-cancel',
      category: 'pending-intake',
      title: 'Discard staged review',
      detail: label,
      action: 'cancel'
    });
  }

  return {
    categories: [
      { id: 'pending-review', title: 'Pending Review', items: reviewItems },
      { id: 'pending-intake', title: 'Pending Intake', items: intakeItems }
    ]
  };
}

async function buildRecentStatus(
  appState: AppState,
  activeJobs: Map<string, BackgroundJob>,
  cleanupOldJobs: () => void
): Promise<{
  mode: string;
  sessionDir: string;
  queuedInputs: number;
  researchSources: number;
  backgroundJobs: BackgroundJob[];
}> {
  cleanupOldJobs();
  const researchSources = await readResearchSources(appState.session);
  const backgroundJobs = [...activeJobs.values()].sort((left, right) =>
    right.startedAt.localeCompare(left.startedAt)
  );

  return {
    mode: appState.mode,
    sessionDir: appState.session.sessionDir,
    queuedInputs: appState.queuedInputs.length,
    researchSources: researchSources.length,
    backgroundJobs
  };
}

async function getTopicOperationalStatus(topic: string): Promise<{
  pendingLinkReviewCount: number;
  pendingIndexCount: number;
}> {
  const files = await collectMarkdownFiles(getWikiInfo(topic).topicDir);
  let pendingLinkReviewCount = 0;
  let pendingIndexCount = 0;

  for (const relativePath of files) {
    if (!isOperationalWikiNotePath(relativePath)) {
      continue;
    }
    const content = await readFile(resolveWikiPath(topic, relativePath), 'utf8');
    if (readFrontmatterScalar(content, 'link_review_status') === 'pending') {
      pendingLinkReviewCount += 1;
    }
    if (readFrontmatterScalar(content, 'index_status') === 'pending') {
      pendingIndexCount += 1;
    }
  }

  return { pendingLinkReviewCount, pendingIndexCount };
}

async function listTopicNotes(topic: string): Promise<
  Array<{ path: string; title: string; type: string | null }>
> {
  const normalized = normalizeTopic(topic);
  const files = await collectMarkdownFiles(getWikiInfo(normalized).topicDir);
  const notes: Array<{ path: string; title: string; type: string | null }> = [];

  for (const relativePath of files) {
    if (!isOperationalWikiNotePath(relativePath)) {
      continue;
    }
    const content = await readFile(resolveWikiPath(normalized, relativePath), 'utf8');
    notes.push({
      path: relativePath,
      title:
        readFrontmatterScalar(content, 'title') ?? path.basename(relativePath, '.md'),
      type: readFrontmatterScalar(content, 'type')
    });
  }

  return notes.sort((left, right) => left.title.localeCompare(right.title));
}

async function collectMarkdownFiles(rootDir: string, relativeDir = ''): Promise<string[]> {
  const absoluteDir = path.join(rootDir, relativeDir);
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    const nextRelative = relativeDir ? path.join(relativeDir, entry.name) : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(rootDir, nextRelative)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(nextRelative);
    }
  }

  return files.sort();
}

async function buildTopicResearchSeeds(appState: AppState, topic: string): Promise<string> {
  const searchResult = await searchWebAndStoreSources({
    session: appState.session,
    globalConfig: appState.globalConfig,
    query: topic,
    maxResults: 5
  });

  const resultLines = searchResult.ok
    ? searchResult.stored.map(
        (item) =>
          `- ${item.title}${item.url ? ` — ${item.url}` : ''}${item.excerpt ? `\n  ${item.excerpt}` : ''}`
      )
    : [`- Search failed: ${searchResult.error ?? 'Unknown error.'}`];

  return runAssistantQuery(
    appState,
    buildWikiMode('Query', topic),
    [
      `Create research seeds for the wiki topic "${topic}".`,
      'Use the wiki context already in scope to identify important gaps, ambiguities, or next questions.',
      'Then use the search results below to propose a short set of worthwhile follow-up directions and candidate URLs.',
      'Return two sections: "Summary" and "Suggested Research Seeds".',
      'Do not write or update any wiki pages.',
      `## Recent Search Results\n\n${resultLines.join('\n')}`
    ].join('\n\n')
  );
}

async function captureMobilePage(
  url: string
): Promise<{ pageTitle: string; pageTextExcerpt: string | null }> {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent': 'TAW/0.1 mobile-ingest',
      accept:
        'text/html,application/xhtml+xml,text/plain,text/markdown,application/json;q=0.8,*/*;q=0.5'
    }
  });

  if (!response.ok) {
    throw new Error(`Could not fetch ${url} (${response.status}).`);
  }

  const raw = await response.text();
  const contentType = response.headers.get('content-type') ?? '';
  const pageTitle = extractTitle(raw) ?? url;
  const pageTextExcerpt = extractReadableExcerpt(raw, contentType);

  return { pageTitle, pageTextExcerpt };
}

function extractTitle(raw: string): string | null {
  const titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch?.[1]) {
    return decodeHtml(titleMatch[1]).trim();
  }
  const h1Match = raw.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return h1Match?.[1] ? decodeHtml(h1Match[1]).trim() : null;
}

function extractReadableExcerpt(raw: string, contentType: string): string | null {
  const normalized = contentType.toLowerCase();
  if (
    normalized.includes('text/plain') ||
    normalized.includes('text/markdown') ||
    normalized.includes('application/json')
  ) {
    return raw.trim().slice(0, 12000) || null;
  }

  const withoutScripts = raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  const mainMatch =
    withoutScripts.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ??
    withoutScripts.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const source = mainMatch?.[1] ?? withoutScripts;
  const text = decodeHtml(
    source
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
  return text.slice(0, 12000) || null;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
