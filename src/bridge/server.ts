import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { z } from 'zod';
import { resolvePhaseAfterCommand } from '../app/state.js';
import { bootstrapApp } from '../cli/bootstrap.js';
import { parseCommand } from '../commands/parser.js';
import { getCommandDefinition } from '../commands/registry.js';
import { executeChatTurn } from '../core/chat/engine.js';
import { searchWebAndStoreSources } from '../core/research/search.js';
import { browserResearchPayloadSchema } from '../core/research/schema.js';
import { readResearchSources } from '../core/research/store.js';
import type { BrowserResearchPayload } from '../core/research/types.js';
import type { AppState, TranscriptEntry } from '../types/app.js';
import {
  writeBridgeMarkdownFile,
  writeBridgePayloadFile,
  writeQueuedInputsFile
} from './payload-file.js';
import {
  type LaunchSessionInput,
  launchResearchSession,
  launchTawSession,
  launchTawSessionBackground,
  type LaunchResult
} from './launcher.js';
import type { SearchBackendStatus } from '../services/search/searxng-manager.js';
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
import { APP_VERSION } from '../version.js';
import { createId } from '../utils/ids.js';

interface BackgroundJob {
  jobId: string;
  topic: string;
  startedAt: string;
  status: 'running' | 'success' | 'failed';
  completedAt?: string;
  exitCode?: number | null;
}

const activeJobs = new Map<string, BackgroundJob>();
const appSessions = new Map<
  string,
  { createdAt: string; lastSeenAt: string; appState: AppState | null }
>();

interface AppActionItem {
  id: string;
  category: 'pending-review' | 'pending-intake';
  title: string;
  detail: string;
  action: 'stage-link-review' | 'stage-reindex' | 'confirm' | 'cancel';
  topic?: string;
}

function cleanupOldJobs(): void {
  const cutoffMs = Date.now() - 2 * 60 * 60 * 1000; // 2 hours
  for (const [id, job] of activeJobs) {
    if (new Date(job.startedAt).getTime() < cutoffMs) {
      activeJobs.delete(id);
    }
  }
}

function cleanupOldAppSessions(): void {
  const cutoffMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const [id, session] of appSessions) {
    if (new Date(session.lastSeenAt).getTime() < cutoffMs) {
      appSessions.delete(id);
    }
  }
}

interface BridgeServerOptions {
  token: string;
  defaultCwd: string;
  launch?: (
    input: LaunchSessionInput,
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

interface NewResearchRequestBody {
  cwd?: string;
  payload: BrowserResearchPayload;
}

const newWikiIngestRequestSchema = z.object({
  cwd: z.string().optional(),
  topic: z.string().min(1),
  pageTitle: z.string().min(1),
  pageUrl: z.string().nullable(),
  pageTextExcerpt: z.string().nullable(),
  selectedText: z.string().nullable().default(null),
  userNote: z.string().nullable().default(null),
  autoRun: z.boolean().default(false)
});

const newMobileWikiIngestRequestSchema = z.object({
  cwd: z.string().optional(),
  topic: z.string().min(1),
  url: z.string().url(),
  userNote: z.string().nullable().default(null),
  autoRun: z.boolean().default(false)
});

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

export function createBridgeServer(options: BridgeServerOptions): http.Server {
  return http.createServer(async (request, response) => {
    try {
      const parsedUrl = parseRequestUrl(request);

      // Public endpoints (no auth required)
      if (request.method === 'GET' && request.url === '/version') {
        writeJson(response, 200, { version: APP_VERSION });
        return;
      }

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
        const iconFile = parsedUrl.pathname.endsWith('512.png')
          ? path.join(import.meta.dirname, '../../assets/icon-512.png')
          : path.join(import.meta.dirname, '../../assets/icon-192.png');
        try {
          const iconData = await readFile(iconFile);
          response.statusCode = 200;
          response.setHeader('content-type', 'image/png');
          response.end(iconData);
        } catch {
          const size = parsedUrl.pathname.endsWith('512.png') ? 512 : 192;
          response.statusCode = 200;
          response.setHeader('content-type', 'image/png');
          response.end(renderAppIconPng(size));
        }
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

      if (request.method === 'GET' && parsedUrl?.pathname === '/app/api/state') {
        if (!authorizeApp(request)) {
          writeJson(response, 401, { ok: false, error: 'App session required.' });
          return;
        }
        const appState = await ensureAppState(request, options.defaultCwd);
        writeJson(response, 200, {
          ok: true,
          topics: await listWikiTopics(),
          actions: await buildAppActions(appState),
          recentStatus: await buildRecentStatus(appState)
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
          actions: await buildAppActions(appState)
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
          actions: await buildAppActions(appState),
          recentStatus: await buildRecentStatus(appState)
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
          recentStatus: await buildRecentStatus(appState)
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
          options
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

      if (!authorize(request, options.token)) {
        writeJson(response, 401, { error: 'Unauthorized' });
        return;
      }

      if (request.method === 'GET' && request.url === '/health') {
        writeJson(response, 200, { ok: true, version: APP_VERSION });
        return;
      }

      // Job status polling
      if (request.method === 'GET' && request.url?.startsWith('/job/')) {
        const jobId = request.url.slice('/job/'.length);
        const job = activeJobs.get(jobId);
        if (!job) {
          writeJson(response, 404, { ok: false, error: 'Job not found.' });
          return;
        }
        writeJson(response, 200, { ok: true, job });
        return;
      }

      if (
        request.method === 'GET' &&
        request.url === '/wiki/topics'
      ) {
        writeJson(response, 200, {
          ok: true,
          topics: await listWikiTopics()
        });
        return;
      }

      if (
        options.searchBackend &&
        request.method === 'GET' &&
        request.url === '/search-backend/status'
      ) {
        writeJson(response, 200, {
          ok: true,
          status: await options.searchBackend.getStatus()
        });
        return;
      }

      if (
        options.searchBackend &&
        request.method === 'POST' &&
        request.url === '/search-backend/start'
      ) {
        writeJson(response, 200, {
          ok: true,
          status: await options.searchBackend.start()
        });
        return;
      }

      if (
        options.searchBackend &&
        request.method === 'POST' &&
        request.url === '/search-backend/stop'
      ) {
        writeJson(response, 200, {
          ok: true,
          status: await options.searchBackend.stop()
        });
        return;
      }

      if (
        options.searchBackend &&
        request.method === 'POST' &&
        request.url === '/search-backend/touch'
      ) {
        writeJson(response, 200, {
          ok: true,
          status: await options.searchBackend.touch()
        });
        return;
      }

      if (
        request.method === 'POST' &&
        request.url === '/session/new-research'
      ) {
        const body = (await readJson(request)) as NewResearchRequestBody;
        const result = await queueResearchIngestRequest(body, options);
        writeJson(response, 200, result);
        return;
      }

      if (
        request.method === 'POST' &&
        request.url === '/session/new-wiki-ingest'
      ) {
        const body = newWikiIngestRequestSchema.parse(await readJson(request));
        const result = await queueWikiIngestRequest(body, options);
        writeJson(response, 200, result);
        return;
      }

      if (
        request.method === 'POST' &&
        request.url === '/session/new-mobile-wiki-ingest'
      ) {
        const body = newMobileWikiIngestRequestSchema.parse(await readJson(request));
        const capturePage = options.capturePage ?? captureMobilePage;
        const captured = await capturePage(body.url);
        const result = await queueWikiIngestRequest(
          {
            cwd: body.cwd,
            topic: body.topic,
            pageTitle: captured.pageTitle,
            pageUrl: body.url,
            pageTextExcerpt: captured.pageTextExcerpt,
            selectedText: null,
            userNote: body.userNote,
            autoRun: body.autoRun
          },
          options
        );

        writeJson(response, 200, {
          ...result,
          pageTitle: captured.pageTitle
        });
        return;
      }

      if (
        request.method === 'POST' &&
        request.url === '/session/append-context'
      ) {
        writeJson(response, 501, {
          ok: false,
          error: 'Append-context targeting is not implemented yet.'
        });
        return;
      }

      writeJson(response, 404, { error: 'Not found' });
    } catch (error) {
      writeJson(response, 400, {
        error: error instanceof Error ? error.message : 'Unknown bridge error.'
      });
    }
  });
}

async function queueResearchIngestRequest(
  body: NewResearchRequestBody,
  options: BridgeServerOptions
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
    ((input, nextCwd, windowName) => {
      if (!input.researchPayloadPath) {
        throw new Error('Missing research payload path.');
      }
      return launchResearchSession(input.researchPayloadPath, nextCwd, windowName);
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
  body: z.infer<typeof newWikiIngestRequestSchema>,
  options: BridgeServerOptions
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
  body: z.infer<typeof newWikiIngestRequestSchema>
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

function normalizeTopic(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

function authorize(request: http.IncomingMessage, token: string): boolean {
  const requestToken = request.headers['x-taw-token'];

  if (typeof requestToken !== 'string') {
    return false;
  }

  return requestToken === token;
}

function authorizeApp(request: http.IncomingMessage): boolean {
  const session = getAppSessionRecord(request);
  if (!session) {
    return false;
  }
  session.lastSeenAt = new Date().toISOString();
  cleanupOldAppSessions();
  return true;
}

function getAppSessionId(request: http.IncomingMessage): string | null {
  return parseCookies(request.headers.cookie ?? '')['taw_app_session'] ?? null;
}

function getAppSessionRecord(
  request: http.IncomingMessage
): { createdAt: string; lastSeenAt: string; appState: AppState | null } | null {
  const sessionId = getAppSessionId(request);
  if (!sessionId) {
    return null;
  }
  return appSessions.get(sessionId) ?? null;
}

async function ensureAppState(
  request: http.IncomingMessage,
  defaultCwd: string
): Promise<AppState> {
  const sessionId = getAppSessionId(request);
  if (!sessionId) {
    throw new Error('App session required.');
  }
  const record = appSessions.get(sessionId);
  if (!record) {
    throw new Error('App session not found.');
  }
  if (!record.appState) {
    record.appState = await bootstrapApp(defaultCwd);
  }
  record.lastSeenAt = new Date().toISOString();
  return record.appState;
}

function parseRequestUrl(request: http.IncomingMessage): URL | null {
  if (!request.url) {
    return null;
  }
  const host = request.headers.host ?? '127.0.0.1';
  return new URL(request.url, `http://${host}`);
}

function createAppSession(): string {
  const sessionId = randomUUID();
  const now = new Date().toISOString();
  appSessions.set(sessionId, { createdAt: now, lastSeenAt: now, appState: null });
  cleanupOldAppSessions();
  return sessionId;
}

function setAppSessionCookie(
  response: http.ServerResponse,
  sessionId: string
): void {
  response.setHeader(
    'set-cookie',
    `taw_app_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`
  );
}

function parseCookies(rawCookieHeader: string): Record<string, string> {
  return rawCookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, part) => {
      const separator = part.indexOf('=');
      if (separator <= 0) {
        return acc;
      }
      acc[part.slice(0, separator)] = decodeURIComponent(part.slice(separator + 1));
      return acc;
    }, {});
}

function readJson(request: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = '';
    request.on('data', (chunk) => {
      data += String(chunk);
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function writeJson(
  response: http.ServerResponse,
  statusCode: number,
  body: unknown
): void {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(body));
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

async function buildAppActions(appState: AppState): Promise<{
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

async function buildRecentStatus(appState: AppState): Promise<{
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
        (item) => `- ${item.title}${item.url ? ` — ${item.url}` : ''}${item.excerpt ? `\n  ${item.excerpt}` : ''}`
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
      `## Search Results\n\n${resultLines.join('\n')}`
    ].join('\n\n')
  );
}

function renderMobilePage(token: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TAW Mobile Ingest</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4efe6;
      --panel: #fffaf2;
      --line: #d8c7ae;
      --ink: #1f1b16;
      --muted: #6a5f52;
      --accent: #b85c38;
      --accent-ink: #fffaf2;
    }
    body {
      margin: 0;
      font-family: Georgia, "Iowan Old Style", serif;
      background: linear-gradient(180deg, #efe3d1 0%, var(--bg) 100%);
      color: var(--ink);
    }
    main {
      max-width: 720px;
      margin: 0 auto;
      padding: 20px 16px 40px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 18px;
      box-shadow: 0 8px 24px rgba(31, 27, 22, 0.08);
    }
    h1 {
      margin: 0 0 10px;
      font-size: 1.8rem;
    }
    p {
      color: var(--muted);
      line-height: 1.45;
    }
    label {
      display: block;
      margin-top: 14px;
      margin-bottom: 6px;
      font-weight: 700;
    }
    input, select, textarea, button {
      width: 100%;
      box-sizing: border-box;
      font: inherit;
      border-radius: 12px;
      border: 1px solid var(--line);
      padding: 14px;
      background: #fffdfa;
      color: var(--ink);
    }
    textarea {
      min-height: 120px;
      resize: vertical;
    }
    .row {
      display: flex;
      gap: 10px;
      align-items: center;
      margin-top: 14px;
    }
    .row input[type="checkbox"] {
      width: auto;
      transform: scale(1.2);
    }
    button {
      margin-top: 18px;
      font-weight: 700;
      background: var(--accent);
      color: var(--accent-ink);
      border: 0;
    }
    #status {
      margin-top: 16px;
      white-space: pre-wrap;
      line-height: 1.45;
    }
    .hidden { display: none; }
    code { font-size: 0.92em; }
  </style>
</head>
<body>
  <main>
    <div class="card">
      <h1>TAW Mobile Ingest</h1>
      <p>Paste a URL from your phone, choose a wiki, and queue it for ingest through the local bridge.</p>
      <form id="form">
        <label for="url">URL</label>
        <input id="url" name="url" type="url" inputmode="url" placeholder="https://example.com/article" required />

        <label for="topic">Wiki Topic</label>
        <select id="topic" name="topic">
          <option value="">Loading topics...</option>
        </select>

        <div id="newTopicWrap" class="hidden">
          <label for="newTopic">New Topic</label>
          <input id="newTopic" name="newTopic" type="text" placeholder="vibecoding" />
        </div>

        <label for="userNote">Note</label>
        <textarea id="userNote" name="userNote" placeholder="Optional context, why this matters, what to focus on..."></textarea>

        <label class="row"><input id="autoRun" name="autoRun" type="checkbox" /> Auto-run ingest in the background</label>

        <button type="submit">Queue Wiki Ingest</button>
      </form>
      <div id="status"></div>
    </div>
  </main>
  <script>
    const token = ${JSON.stringify(token)};
    const statusEl = document.getElementById('status');
    const topicEl = document.getElementById('topic');
    const newTopicWrapEl = document.getElementById('newTopicWrap');
    const newTopicEl = document.getElementById('newTopic');
    const formEl = document.getElementById('form');
    const topicStorageKey = 'taw-mobile-topic';

    function setStatus(message, isError = false) {
      statusEl.textContent = message;
      statusEl.style.color = isError ? '#9f2d2d' : '#3f4f2f';
    }

    function selectedTopic() {
      return topicEl.value === '__new__' ? newTopicEl.value.trim() : topicEl.value.trim();
    }

    function syncTopicMode() {
      const isNew = topicEl.value === '__new__';
      newTopicWrapEl.classList.toggle('hidden', !isNew);
      if (!isNew) {
        newTopicEl.value = '';
      }
    }

    async function loadTopics() {
      const response = await fetch('/wiki/topics', {
        headers: { 'x-taw-token': token }
      });
      const body = await response.json();
      if (!response.ok || !body.ok) {
        throw new Error(body.error || 'Could not load wiki topics.');
      }
      const saved = localStorage.getItem(topicStorageKey);
      const topics = body.topics || [];
      topicEl.innerHTML = ['<option value="__new__">New Topic...</option>']
        .concat(topics.map((topic) => '<option value="' + topic + '">' + topic + '</option>'))
        .join('');
      topicEl.value = saved && topics.includes(saved) ? saved : (topics[0] || '__new__');
      syncTopicMode();
    }

    topicEl.addEventListener('change', syncTopicMode);

    formEl.addEventListener('submit', async (event) => {
      event.preventDefault();
      const topic = selectedTopic();
      if (!topic) {
        setStatus('Choose an existing wiki topic or enter a new one.', true);
        return;
      }

      const payload = {
        topic,
        url: document.getElementById('url').value.trim(),
        userNote: document.getElementById('userNote').value.trim() || null,
        autoRun: document.getElementById('autoRun').checked
      };

      localStorage.setItem(topicStorageKey, topic);
      setStatus('Fetching page and queueing ingest...');

      try {
        const response = await fetch('/session/new-mobile-wiki-ingest', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-taw-token': token
          },
          body: JSON.stringify(payload)
        });
        const body = await response.json();
        if (!response.ok || !body.ok) {
          throw new Error(body.error || 'Could not queue ingest.');
        }
        setStatus(
          [
            'Queued successfully.',
            'Topic: ' + body.topic,
            'Title: ' + body.pageTitle,
            'Source File: ' + body.sourceFilePath,
            body.autoRun ? 'Background ingest started.' : 'Open TAW to run the queued ingest.'
          ].join('\\n')
        );
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Request failed.', true);
      }
    });

    loadTopics().catch((error) => {
      setStatus(error instanceof Error ? error.message : 'Failed to load topics.', true);
    });
  </script>
</body>
</html>`;
}

function renderPwaAppPage(hasSession: boolean): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#0f172a" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <link rel="manifest" href="/app/manifest.webmanifest" />
  <link rel="icon" href="/app/icon.svg" type="image/svg+xml" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <title>TAW Companion</title>
  <style>
    :root {
      --bg: #080e1a;
      --bg-grid: rgba(34,197,94,0.03);
      --surface: #111827;
      --surface-2: #1a2336;
      --surface-3: #202d42;
      --line: #2d3f55;
      --line-soft: #1a2336;
      --ink: #f1f5f9;
      --muted: #7c8fa6;
      --accent: #22c55e;
      --accent-dim: rgba(34,197,94,0.12);
      --accent-glow: rgba(34,197,94,0.3);
      --accent-glow-sm: rgba(34,197,94,0.15);
      --ok: #22c55e;
      --error: #f87171;
      --warn: #fbbf24;
      --hint-bg: rgba(34,197,94,0.07);
      --hint-border: rgba(34,197,94,0.22);
      --scan-line: rgba(255,255,255,0.015);
    }
    *, *::before, *::after { box-sizing: border-box; }
    html { height: 100%; }
    body {
      margin: 0;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      font-size: 16px;
      background-color: var(--bg);
      /* Subtle grid + radial accent glow */
      background-image:
        radial-gradient(ellipse 80% 50% at 50% -10%, rgba(34,197,94,0.07) 0%, transparent 70%),
        linear-gradient(var(--bg-grid) 1px, transparent 1px),
        linear-gradient(90deg, var(--bg-grid) 1px, transparent 1px);
      background-size: auto, 32px 32px, 32px 32px;
      color: var(--ink);
      min-height: 100dvh;
      overscroll-behavior-y: contain;
      -webkit-font-smoothing: antialiased;
    }
    a, button, [role="button"], input, select, textarea {
      touch-action: manipulation;
    }
    /* ── Top App Bar ── */
    .app-bar {
      position: sticky;
      top: 0;
      z-index: 20;
      background: rgba(8,14,26,0.93);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-bottom: 1px solid var(--line);
      padding-top: env(safe-area-inset-top);
      box-shadow: 0 1px 0 rgba(34,197,94,0.08);
    }
    .app-bar-inner {
      display: flex;
      align-items: center;
      gap: 10px;
      height: 56px;
      padding: 0 16px;
    }
    .app-bar-icon {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(255,255,255,0.05);
      display: flex;
      align-items: center;
      justify-content: center;
      flex: none;
    }
    .app-bar-title {
      font-size: 1.05rem;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--ink);
    }
    .app-bar-badge {
      margin-left: 6px;
      font-size: 10px;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 999px;
      background: var(--accent-dim);
      border: 1px solid var(--hint-border);
      color: var(--accent);
    }
    /* ── Page Content ── */
    main {
      max-width: 680px;
      margin: 0 auto;
      padding: 16px 16px 96px;
    }
    /* ── Bottom Nav ── */
    .bottom-nav {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 20;
      background: rgba(8,14,26,0.96);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-top: 1px solid var(--line);
      box-shadow: 0 -1px 0 rgba(34,197,94,0.08), 0 -8px 32px rgba(0,0,0,0.4);
      padding-bottom: env(safe-area-inset-bottom);
    }
    .bottom-nav-inner {
      display: flex;
      height: 60px;
    }
    .nav-btn {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      border: none;
      background: none;
      color: #64748b;
      font-family: inherit;
      font-size: 10px;
      font-weight: 500;
      cursor: pointer;
      padding: 0;
      min-height: 48px;
      position: relative;
      transition: color 150ms ease;
    }
    .nav-btn.active {
      color: var(--accent);
    }
    .nav-btn.active::before {
      content: '';
      position: absolute;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 32px;
      height: 2px;
      border-radius: 2px 2px 0 0;
      background: var(--accent);
    }
    .nav-btn svg {
      width: 22px;
      height: 22px;
      transition: transform 150ms ease;
    }
    .nav-btn.active svg {
      transform: scale(1.1);
    }
    /* ── Panels ── */
    .panel {
      animation: fadeIn 180ms ease;
      will-change: transform, opacity;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    main {
      overflow-x: hidden;
    }
    /* ── Auth Screen ── */
    .auth-card {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 20px;
      padding: 28px 24px;
      box-shadow: 0 24px 48px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04);
      margin-top: 8px;
    }
    .auth-logo {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
    }
    .auth-logo-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(34,197,94,0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 20px rgba(34,197,94,0.15);
    }
    .auth-title { font-size: 1.4rem; font-weight: 700; margin: 0; }
    .auth-sub { color: var(--muted); font-size: 0.875rem; margin: 4px 0 0; }
    /* ── Typography ── */
    h2 {
      font-size: 1.15rem;
      font-weight: 700;
      margin: 0 0 4px;
      letter-spacing: -0.01em;
    }
    h3 {
      font-size: 0.95rem;
      font-weight: 600;
      margin: 0 0 6px;
    }
    p { margin: 0; line-height: 1.5; }
    /* ── Hint Chips ── */
    .hint {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      background: var(--hint-bg);
      border: 1px solid var(--hint-border);
      border-radius: 10px;
      padding: 10px 12px;
      margin-bottom: 18px;
      font-size: 0.82rem;
      color: #86efac;
      line-height: 1.45;
    }
    .hint-icon { font-size: 14px; flex: none; margin-top: 1px; }
    /* ── Section header ── */
    .panel-header {
      margin-bottom: 18px;
    }
    .panel-header p {
      color: var(--muted);
      font-size: 0.875rem;
      margin-top: 3px;
    }
    /* ── Cards / Surfaces ── */
    .card {
      background: var(--surface);
      border: 1px solid var(--line);
      border-top: 1px solid rgba(255,255,255,0.07);
      border-radius: 16px;
      padding: 16px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04);
    }
    .card + .card { margin-top: 10px; }
    .surface, .action-item {
      background: var(--surface-2);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 14px;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
    }
    .surface + .surface, .action-item + .action-item { margin-top: 8px; }
    .surface .meta {
      color: var(--muted);
      font-size: 0.82rem;
      margin-top: 5px;
      line-height: 1.4;
    }
    .section-grid { display: grid; gap: 10px; }
    /* ── Form elements ── */
    label {
      display: block;
      margin-top: 16px;
      margin-bottom: 6px;
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    input, textarea, select {
      width: 100%;
      font-family: inherit;
      font-size: 1rem;
      border-radius: 10px;
      border: 1px solid var(--line);
      padding: 12px 14px;
      background: var(--surface-2);
      color: var(--ink);
      outline: none;
      transition: border-color 150ms ease, box-shadow 150ms ease;
    }
    input:focus, textarea:focus, select:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-dim);
    }
    input::placeholder, textarea::placeholder { color: #475569; }
    select { appearance: none; cursor: pointer; }
    textarea { min-height: 100px; resize: vertical; }
    .row {
      display: flex;
      gap: 8px;
      margin-top: 14px;
      align-items: center;
    }
    .row input[type="checkbox"] { width: auto; transform: scale(1.2); accent-color: var(--accent); }
    .row label { margin: 0; text-transform: none; font-size: 0.875rem; font-weight: 400; color: var(--muted); }
    /* ── Buttons ── */
    .btn {
      appearance: none;
      border: none;
      border-radius: 10px;
      padding: 13px 20px;
      font-family: inherit;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      transition: transform 100ms ease, box-shadow 100ms ease, opacity 150ms ease;
      min-height: 48px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .btn:active { transform: scale(0.96); }
    .btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .btn-primary {
      background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
      color: #052e16;
      box-shadow: 0 4px 16px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.25);
      text-shadow: 0 1px 0 rgba(0,0,0,0.15);
    }
    .btn-primary:hover { box-shadow: 0 6px 24px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.25); }
    .btn-secondary {
      background: linear-gradient(180deg, var(--surface-3) 0%, var(--surface-2) 100%);
      color: var(--ink);
      border: 1px solid var(--line);
      box-shadow: 0 2px 8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.05);
    }
    .btn-ghost {
      background: transparent;
      color: var(--muted);
      border: 1px solid var(--line);
    }
    .btn-sm {
      padding: 8px 14px;
      font-size: 0.82rem;
      min-height: 36px;
      border-radius: 8px;
    }
    .btn-full { width: 100%; }
    .actions {
      display: flex;
      gap: 8px;
      margin-top: 16px;
      flex-wrap: wrap;
    }
    /* ── Tab pills (within panel) ── */
    .tab-pills {
      display: flex;
      gap: 6px;
      background: var(--surface-2);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 4px;
    }
    .tab-pill {
      flex: 1;
      border: none;
      border-radius: 7px;
      padding: 9px 12px;
      font-family: inherit;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      background: transparent;
      color: var(--muted);
      transition: background 150ms ease, color 150ms ease;
      min-height: 44px;
    }
    .tab-pill.active {
      background: var(--accent);
      color: #052e16;
    }
    /* ── Status / Message ── */
    .message {
      margin-top: 14px;
      font-size: 0.875rem;
      line-height: 1.5;
      border-radius: 8px;
      padding: 0;
      color: var(--muted);
    }
    .message:not(:empty) {
      padding: 10px 12px;
      background: var(--surface-2);
      border: 1px solid var(--line);
    }
    .message.tone-ok { color: var(--ok); border-color: rgba(34,197,94,0.25); background: rgba(34,197,94,0.08); }
    .message.tone-error { color: var(--error); border-color: rgba(239,68,68,0.25); background: rgba(239,68,68,0.08); }
    /* ── Markdown Output ── */
    .md-output {
      margin-top: 16px;
      font-size: 0.9rem;
      line-height: 1.65;
      color: var(--ink);
    }
    .md-output:not(:empty) {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 16px;
    }
    .md-output h1, .md-output h2, .md-output h3, .md-output h4 {
      margin: 1em 0 0.4em;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--ink);
    }
    .md-output h1 { font-size: 1.15rem; }
    .md-output h2 { font-size: 1.05rem; }
    .md-output h3 { font-size: 0.95rem; }
    .md-output p { margin: 0.6em 0; }
    .md-output ul, .md-output ol { margin: 0.6em 0; padding-left: 1.4em; }
    .md-output li { margin: 0.3em 0; }
    .md-output code {
      font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
      font-size: 0.82em;
      background: rgba(255,255,255,0.06);
      border: 1px solid var(--line);
      border-radius: 4px;
      padding: 1px 5px;
      color: #a5f3c0;
    }
    .md-output pre {
      background: #0d1117;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
      overflow-x: auto;
      margin: 0.8em 0;
    }
    .md-output pre code {
      background: none;
      border: none;
      padding: 0;
      font-size: 0.82rem;
      color: #e2e8f0;
    }
    .md-output blockquote {
      border-left: 3px solid var(--accent);
      margin: 0.8em 0;
      padding: 6px 14px;
      color: var(--muted);
      font-style: italic;
    }
    .md-output strong { font-weight: 700; color: var(--ink); }
    .md-output em { font-style: italic; color: #cbd5e1; }
    .md-output hr { border: none; border-top: 1px solid var(--line); margin: 1em 0; }
    /* ── Preview box ── */
    .preview-box {
      background: var(--surface-2);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 12px 14px;
      margin-top: 10px;
      font-size: 0.875rem;
      color: var(--muted);
      line-height: 1.5;
      white-space: pre-wrap;
    }
    .preview-title {
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--ink);
      margin: 14px 0 0;
    }
    /* ── Loading spinner ── */
    @keyframes spin { to { transform: rotate(360deg); } }
    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255,255,255,0.2);
      border-top-color: currentColor;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }
    /* ── Misc ── */
    .hidden { display: none !important; }
    .secure-hint {
      background: rgba(245,158,11,0.08);
      border: 1px solid rgba(245,158,11,0.2);
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 0.82rem;
      color: #fcd34d;
      margin-bottom: 14px;
    }
    .divider {
      border: none;
      border-top: 1px solid var(--line);
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <!-- Top App Bar -->
  <header class="app-bar">
    <div class="app-bar-inner">
      <div class="app-bar-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2">
          <path d="M8 9l3 3-3 3M13 15h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
        </svg>
      </div>
      <span class="app-bar-title">TAW</span>
      <span class="app-bar-badge">Companion</span>
    </div>
  </header>

  <main>
    <!-- Auth Screen -->
    <div id="authBlock"${hasSession ? ' class="hidden"' : ''}>
      <div class="auth-card">
        <div class="auth-logo">
          <div class="auth-logo-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="1.75">
              <path d="M8 9l3 3-3 3M13 15h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
          </div>
          <div>
            <p class="auth-title">TAW Companion</p>
            <p class="auth-sub">Terminal AI Workspace — mobile interface</p>
          </div>
        </div>
        <div class="hint">
          <span class="hint-icon">🔑</span>
          <span>Paste the bridge token shown in your TAW terminal session to unlock this companion app. The token persists in this browser until you clear it.</span>
        </div>
        <div id="secureHint" class="secure-hint hidden">
          ⚠️ <strong>Secure context required</strong> for PWA install and share-target on Android Chrome. <code>http://127.0.0.1</code> is fine locally; use HTTPS or a tunnel for LAN access.
        </div>
        <label for="bridgeToken">Bridge Token</label>
        <input id="bridgeToken" type="password" placeholder="Paste token from TAW terminal" autocomplete="current-password" />
        <div class="actions">
          <button id="bootstrapBtn" type="button" class="btn btn-primary btn-full">Unlock App</button>
        </div>
        <div id="captureStatus" class="message"></div>
      </div>
    </div>

    <!-- App Panels -->
    <div id="appBlock"${hasSession ? '' : ' class="hidden"'}>

      <section id="panel-capture" class="panel">
        <div class="panel-header">
          <h2>Capture</h2>
          <p>Send a URL or content to your wiki or research inbox.</p>
        </div>
        <div class="hint">
          <span class="hint-icon">💡</span>
          <span>Share links directly from Chrome → <em>Share → TAW</em> — auto-fills this form. Wiki mode adds to an existing topic; Research Inbox queues it for deeper investigation.</span>
        </div>
        <div class="tab-pills">
          <button id="captureWikiTab" class="tab-pill active" type="button">Wiki</button>
          <button id="captureResearchTab" class="tab-pill" type="button">Research Inbox</button>
        </div>
        <label for="url">URL</label>
        <input id="url" type="url" inputmode="url" placeholder="https://example.com/article" />
        <div id="wikiTopicWrap">
          <label for="topic">Wiki Topic</label>
          <select id="topic"><option value="">Loading topics...</option></select>
          <div id="newTopicWrap" class="hidden">
            <label for="newTopic">New Topic Name</label>
            <input id="newTopic" type="text" placeholder="e.g. vibecoding" />
          </div>
        </div>
        <div id="researchQuestionWrap" class="hidden">
          <label for="initialQuestion">Initial Question</label>
          <input id="initialQuestion" type="text" placeholder="What should TAW investigate here?" />
        </div>
        <label for="userNote">Note (optional)</label>
        <textarea id="userNote" placeholder="Why this matters, what to focus on, or any extra context…"></textarea>
        <div class="row">
          <input id="autoRun" type="checkbox" checked />
          <label for="autoRun">Auto-run ingest after confirm</label>
        </div>
        <div class="actions">
          <button id="previewBtn" type="button" class="btn btn-primary">Preview Capture</button>
        </div>
        <div id="preview" class="hidden">
          <hr class="divider" />
          <p class="preview-title" id="previewTitle"></p>
          <div class="preview-box" id="previewExcerpt"></div>
          <div class="actions">
            <button id="confirmBtn" type="button" class="btn btn-primary">Confirm &amp; Submit</button>
            <button id="cancelBtn" type="button" class="btn btn-ghost">Cancel</button>
          </div>
        </div>
        <div id="captureStatusApp" class="message"></div>
      </section>

      <section id="panel-ask" class="panel hidden">
        <div class="panel-header">
          <h2>Ask TAWD</h2>
          <p>Get a concise answer from your AI workspace.</p>
        </div>
        <div class="hint">
          <span class="hint-icon">🤖</span>
          <span>TAWD has context about your sessions and wiki. Try: <em>"What changed in vibecoding recently?"</em> or <em>"Summarize what I know about agentic loops."</em></span>
        </div>
        <label for="askPrompt">Your Question</label>
        <textarea id="askPrompt" placeholder="What changed in this wiki recently?"></textarea>
        <div class="actions">
          <button id="askBtn" type="button" class="btn btn-primary">Ask TAWD</button>
        </div>
        <div id="askOutput" class="md-output"></div>
      </section>

      <section id="panel-actions" class="panel hidden">
        <div class="panel-header">
          <h2>Actions</h2>
          <p>Review queued work and trigger wiki maintenance.</p>
        </div>
        <div class="hint">
          <span class="hint-icon">⚡</span>
          <span>Actions appear here when TAW has pending work — like pages needing link review, index updates, or ingest jobs waiting to run. Tap to execute.</span>
        </div>
        <div id="actionsWrap" class="section-grid"></div>
      </section>

      <section id="panel-status" class="panel hidden">
        <div class="panel-header">
          <h2>Status</h2>
          <p>What the bridge and session have been doing.</p>
        </div>
        <div class="hint">
          <span class="hint-icon">📡</span>
          <span>Background jobs run TAW commands asynchronously. Check here after capturing a URL to see if the ingest finished successfully.</span>
        </div>
        <div id="statusWrap" class="section-grid"></div>
      </section>

      <section id="panel-topics" class="panel hidden">
        <div class="panel-header">
          <h2>Topics</h2>
          <p>Explore, summarize, and analyze your wiki topics.</p>
        </div>
        <div class="hint">
          <span class="hint-icon">🗂️</span>
          <span><strong>Summarize</strong> gives a quick overview. <strong>Research Seeds</strong> finds gaps and open questions. <strong>Run Analysis</strong> asks TAWD to reason deeply about a specific note.</span>
        </div>
        <label for="topicsTopic">Topic</label>
        <select id="topicsTopic"><option value="">Loading topics…</option></select>
        <div class="row">
          <input id="wikiOnly" type="checkbox" checked />
          <label for="wikiOnly">Wiki-only for summarize (exclude raw research)</label>
        </div>
        <div class="actions">
          <button id="topicSummaryBtn" type="button" class="btn btn-primary">Summarize</button>
          <button id="topicSeedsBtn" type="button" class="btn btn-secondary">Research Seeds</button>
        </div>
        <hr class="divider" />
        <h3>Deep Analysis</h3>
        <label for="topicsNote">Source Note</label>
        <select id="topicsNote"><option value="">Choose a note…</option></select>
        <label for="topicsQuestion">Analysis Question</label>
        <textarea id="topicsQuestion" placeholder="What tension or gap should TAW analyze here?"></textarea>
        <div class="actions">
          <button id="topicAnalysisBtn" type="button" class="btn btn-primary">Run Analysis</button>
        </div>
        <div id="topicsOutput" class="md-output"></div>
      </section>

    </div>
  </main>

  <!-- Bottom Navigation Bar -->
  <nav class="bottom-nav" id="bottomNav"${hasSession ? '' : ' style="display:none"'}>
    <div class="bottom-nav-inner">
      <button class="nav-btn active" data-panel="capture" type="button" aria-label="Capture">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <path d="M12 5v14M5 12h14" stroke-linecap="round"/>
        </svg>
        <span>Capture</span>
      </button>
      <button class="nav-btn" data-panel="ask" type="button" aria-label="Ask TAWD">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <path d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.862 9.862 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>Ask</span>
      </button>
      <button class="nav-btn" data-panel="actions" type="button" aria-label="Actions">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <path d="M13 10V3L4 14h7v7l9-11h-7z" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>Actions</span>
      </button>
      <button class="nav-btn" data-panel="status" type="button" aria-label="Status">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>Status</span>
      </button>
      <button class="nav-btn" data-panel="topics" type="button" aria-label="Topics">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>Topics</span>
      </button>
    </div>
  </nav>

  <script>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/app/sw.js').catch(() => {});
    }

    const authBlock = document.getElementById('authBlock');
    const appBlock = document.getElementById('appBlock');
    const bottomNav = document.getElementById('bottomNav');
    const secureHintEl = document.getElementById('secureHint');
    const topicStorageKey = 'taw-app-topic';
    const pendingShareStorageKey = 'taw-app-pending-share';
    const captureStatusEl = document.getElementById('captureStatus');
    const captureStatusAppEl = document.getElementById('captureStatusApp');
    const askOutputEl = document.getElementById('askOutput');
    const actionsWrapEl = document.getElementById('actionsWrap');
    const statusWrapEl = document.getElementById('statusWrap');
    const topicsOutputEl = document.getElementById('topicsOutput');
    const topicEl = document.getElementById('topic');
    const topicsTopicEl = document.getElementById('topicsTopic');
    const topicsNoteEl = document.getElementById('topicsNote');
    const newTopicWrapEl = document.getElementById('newTopicWrap');
    const newTopicEl = document.getElementById('newTopic');
    const wikiTopicWrapEl = document.getElementById('wikiTopicWrap');
    const researchQuestionWrapEl = document.getElementById('researchQuestionWrap');
    const previewEl = document.getElementById('preview');
    const previewTitleEl = document.getElementById('previewTitle');
    const previewExcerptEl = document.getElementById('previewExcerpt');
    let captureMode = 'wiki';
    let previewPayload = null;

    // Lightweight markdown renderer
    function renderMarkdown(text) {
      if (!text) return '';
      let html = text
        // Escape HTML
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        // Code blocks
        .replace(/\`\`\`[\\w]*\\n?([\\s\\S]*?)\`\`\`/g, (_, code) => '<pre><code>' + code.trim() + '</code></pre>')
        // Inline code
        .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
        // Headings
        .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        // Bold / italic
        .replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>')
        .replace(/\\*([^*]+)\\*/g, '<em>$1</em>')
        // Blockquote
        .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
        // HR
        .replace(/^---$/gm, '<hr/>')
        // Unordered lists
        .replace(/^[\\-\\*] (.+)$/gm, '<li>$1</li>')
        // Ordered lists
        .replace(/^\\d+\\. (.+)$/gm, '<li>$1</li>')
        // Paragraphs (double newline)
        .replace(/\\n\\n/g, '</p><p>')
        // Single newlines in non-block contexts
        .replace(/\\n/g, '<br/>');
      // Wrap li in ul
      html = html.replace(/(<li>.*?<\\/li>)+/gs, (m) => '<ul>' + m + '</ul>');
      return '<p>' + html + '</p>';
    }

    function setMarkdown(node, text) {
      node.innerHTML = renderMarkdown(text);
    }

    function setMessage(node, message, tone) {
      node.textContent = message || '';
      node.className = 'message' + (tone === 'error' ? ' tone-error' : tone === 'ok' ? ' tone-ok' : '');
    }

    function currentTopic() {
      return topicEl.value === '__new__' ? newTopicEl.value.trim() : topicEl.value.trim();
    }

    function syncTopicMode() {
      const isNew = topicEl.value === '__new__';
      newTopicWrapEl.classList.toggle('hidden', !isNew);
    }

    function switchPanel(nextPanel) {
      document.querySelectorAll('.nav-btn').forEach((node) => {
        node.classList.toggle('active', node.dataset.panel === nextPanel);
      });
      document.querySelectorAll('[id^="panel-"]').forEach((node) => {
        node.classList.toggle('hidden', node.id !== 'panel-' + nextPanel);
      });
    }

    function switchCaptureMode(nextMode) {
      captureMode = nextMode;
      document.getElementById('captureWikiTab').classList.toggle('active', nextMode === 'wiki');
      document.getElementById('captureResearchTab').classList.toggle('active', nextMode === 'research');
      wikiTopicWrapEl.classList.toggle('hidden', nextMode !== 'wiki');
      researchQuestionWrapEl.classList.toggle('hidden', nextMode !== 'research');
    }

    function readSharedPayloadFromUrl() {
      const params = new URLSearchParams(window.location.search);
      const shared = {
        title: params.get('title'),
        text: params.get('text'),
        url: params.get('url')
      };
      if (!shared.title && !shared.text && !shared.url) {
        return null;
      }
      window.history.replaceState({}, '', '/app');
      return shared;
    }

    function applySharedPayload(shared) {
      if (!shared) {
        return;
      }
      if (shared.url) {
        document.getElementById('url').value = shared.url;
      }
      if (shared.text) {
        const existing = document.getElementById('userNote').value.trim();
        document.getElementById('userNote').value = existing ? existing + '\\n\\n' + shared.text : shared.text;
      }
      if (!document.getElementById('initialQuestion').value && shared.title && captureMode === 'research') {
        document.getElementById('initialQuestion').value = 'Review shared item: ' + shared.title;
      }
      setMessage(captureStatusAppEl, 'Shared content received. Preview it before submitting.', 'ok');
      switchPanel('capture');
    }

    async function bootstrap(token) {
      const response = await fetch('/app/api/bootstrap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) {
        throw new Error(body.error || 'Could not unlock app.');
      }
      authBlock.classList.add('hidden');
      appBlock.classList.remove('hidden');
      if (bottomNav) bottomNav.style.display = '';
      await loadState();
    }

    function renderActions(data) {
      const categories = data.categories || [];
      actionsWrapEl.innerHTML = categories.map((category) => {
        const items = category.items || [];
        return [
          '<div class="card">',
          '<h3>' + category.title + '</h3>',
          items.length === 0 ? '<div class="meta">Nothing queued here right now.</div>' : items.map((item) => [
            '<div class="action-item" style="margin-top:10px">',
            '<strong>' + item.title + '</strong>',
            '<div class="meta">' + item.detail + '</div>',
            '<div class="actions"><button type="button" class="btn btn-primary btn-sm" data-action="' + item.action + '" data-topic="' + (item.topic || '') + '">' + item.title + '</button></div>',
            '</div>'
          ].join('')).join(''),
          '</div>'
        ].join('');
      }).join('');

      actionsWrapEl.querySelectorAll('button[data-action]').forEach((node) => {
        node.addEventListener('click', async () => {
          setMessage(captureStatusAppEl, 'Running action…', undefined);
          const response = await fetch('/app/api/actions/run', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              action: node.dataset.action,
              topic: node.dataset.topic || undefined
            })
          });
          const body = await response.json();
          if (!response.ok || !body.ok) {
            setMessage(captureStatusAppEl, body.error || 'Action failed.', 'error');
            return;
          }
          setMessage(captureStatusAppEl, body.message || 'Action completed.', 'ok');
          renderActions(body.actions);
          renderStatus(body.recentStatus);
          switchPanel('actions');
        });
      });
    }

    function renderStatus(status) {
      const jobLines = (status.backgroundJobs || []).map((job) =>
        '<div class="surface" style="margin-top:8px"><strong>' + job.topic + '</strong><div class="meta">' + job.status + ' · started ' + job.startedAt + (job.completedAt ? ' · finished ' + job.completedAt : '') + '</div></div>'
      );

      statusWrapEl.innerHTML = [
        '<div class="card"><div class="section-grid">',
        '<div class="surface"><strong>Mode</strong><div class="meta">' + status.mode + '</div></div>',
        '<div class="surface"><strong>Queued Inputs</strong><div class="meta">' + status.queuedInputs + '</div></div>',
        '<div class="surface"><strong>Research Sources</strong><div class="meta">' + status.researchSources + '</div></div>',
        '<div class="surface"><strong>Session Folder</strong><div class="meta">' + status.sessionDir + '</div></div>',
        '</div></div>',
        '<div class="card"><h3>Background Jobs</h3>' + (jobLines.length ? jobLines.join('') : '<div class="meta">No recent background jobs.</div>') + '</div>'
      ].join('');
    }

    async function loadTopicNotes(topic) {
      if (!topic) {
        topicsNoteEl.innerHTML = '<option value="">Choose a note…</option>';
        return;
      }
      const response = await fetch('/app/api/topics/notes?topic=' + encodeURIComponent(topic));
      const body = await response.json();
      if (!response.ok || !body.ok) {
        throw new Error(body.error || 'Could not load notes.');
      }
      topicsNoteEl.innerHTML = ['<option value="">Choose a note…</option>']
        .concat((body.notes || []).map((note) => '<option value="' + note.path + '">' + note.title + ' (' + (note.type || 'note') + ')</option>'))
        .join('');
    }

    async function loadState() {
      const response = await fetch('/app/api/state');
      const body = await response.json();
      if (!response.ok || !body.ok) {
        throw new Error(body.error || 'Could not load app state.');
      }
      const topics = body.topics || [];
      const saved = localStorage.getItem(topicStorageKey);
      const selected = saved && topics.includes(saved) ? saved : (topics[0] || '__new__');
      topicEl.innerHTML = ['<option value="__new__">New Topic…</option>']
        .concat(topics.map((topic) => '<option value="' + topic + '">' + topic + '</option>'))
        .join('');
      topicEl.value = selected;
      syncTopicMode();
      topicsTopicEl.innerHTML = topics.map((topic) => '<option value="' + topic + '">' + topic + '</option>').join('');
      if (topics.length > 0) {
        topicsTopicEl.value = topics[0];
        await loadTopicNotes(topics[0]);
      }
      renderActions(body.actions);
      renderStatus(body.recentStatus);
    }

    async function previewCapture() {
      const url = document.getElementById('url').value.trim();
      if (!url) {
        setMessage(captureStatusAppEl, 'Enter a URL first.', 'error');
        return;
      }
      if (captureMode === 'wiki' && !currentTopic()) {
        setMessage(captureStatusAppEl, 'Choose an existing wiki topic or enter a new one.', 'error');
        return;
      }
      setMessage(captureStatusAppEl, 'Fetching page preview…');
      const response = await fetch('/app/api/capture-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const body = await response.json();
      if (!response.ok || !body.ok) {
        throw new Error(body.error || 'Could not capture URL.');
      }
      previewPayload = body;
      previewTitleEl.textContent = body.pageTitle;
      previewExcerptEl.textContent = body.pageTextExcerpt || '(No readable excerpt captured.)';
      previewEl.classList.remove('hidden');
      setMessage(captureStatusAppEl, 'Preview ready — confirm to submit.', 'ok');
    }

    async function confirmSubmit() {
      if (!previewPayload) {
        return;
      }
      const note = document.getElementById('userNote').value.trim() || null;
      const autoRun = document.getElementById('autoRun').checked;
      const url = document.getElementById('url').value.trim();

      if (captureMode === 'wiki') {
        const topic = currentTopic();
        localStorage.setItem(topicStorageKey, topic);
        const response = await fetch('/app/api/wiki-ingest', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            topic,
            url,
            pageTitle: previewPayload.pageTitle,
            pageTextExcerpt: previewPayload.pageTextExcerpt || null,
            userNote: note,
            autoRun
          })
        });
        const body = await response.json();
        if (!response.ok || !body.ok) {
          throw new Error(body.error || 'Wiki ingest failed.');
        }
        setMessage(captureStatusAppEl, 'Wiki ingest queued for topic "' + body.topic + '".' + (autoRun ? ' Background ingest started.' : ' Queued for later run.'), 'ok');
      } else {
        const response = await fetch('/app/api/research-ingest', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            url,
            pageTitle: previewPayload.pageTitle,
            pageTextExcerpt: previewPayload.pageTextExcerpt || null,
            userNote: note,
            initialQuestion: document.getElementById('initialQuestion').value.trim() || null
          })
        });
        const body = await response.json();
        if (!response.ok || !body.ok) {
          throw new Error(body.error || 'Research ingest failed.');
        }
        setMessage(captureStatusAppEl, 'Research inbox capture sent. A session was seeded from this source.', 'ok');
      }

      previewEl.classList.add('hidden');
      previewPayload = null;
      const statusResponse = await fetch('/app/api/status');
      const statusBody = await statusResponse.json();
      if (statusResponse.ok && statusBody.ok) {
        renderStatus(statusBody.recentStatus);
      }
    }

    const panelOrder = ['capture', 'ask', 'actions', 'status', 'topics'];

    document.querySelectorAll('.nav-btn').forEach((node) => {
      node.addEventListener('click', () => switchPanel(node.dataset.panel));
    });

    // Tactile swipe navigation — panel tracks finger then snaps
    (function setupSwipe() {
      let startX = 0, startY = 0, curDx = 0;
      let locked = false; // true once we've committed to a horizontal swipe
      let cancelled = false;
      const main = document.querySelector('main');
      if (!main) return;

      function activePanel() {
        return document.querySelector('[id^="panel-"]:not(.hidden)');
      }

      function applyDrag(dx) {
        const panel = activePanel();
        if (panel) {
          panel.style.transition = 'none';
          panel.style.transform = 'translateX(' + dx + 'px)';
          panel.style.opacity = String(Math.max(0.55, 1 - Math.abs(dx) / window.innerWidth));
        }
      }

      function snapBack() {
        const panel = activePanel();
        if (!panel) return;
        panel.style.transition = 'transform 280ms cubic-bezier(0.22,1,0.36,1), opacity 200ms ease';
        panel.style.transform = 'translateX(0)';
        panel.style.opacity = '1';
      }

      function snapCommit(toPanel) {
        const panel = activePanel();
        const vw = window.innerWidth;
        const dir = curDx < 0 ? -1 : 1;
        if (panel) {
          panel.style.transition = 'transform 220ms cubic-bezier(0.4,0,1,1), opacity 180ms ease';
          panel.style.transform = 'translateX(' + (dir * -vw) + 'px)';
          panel.style.opacity = '0';
        }
        setTimeout(() => {
          switchPanel(toPanel);
          // incoming panel starts offset and slides in
          const incoming = document.getElementById('panel-' + toPanel);
          if (incoming) {
            incoming.style.transition = 'none';
            incoming.style.transform = 'translateX(' + (dir * vw) + 'px)';
            incoming.style.opacity = '0';
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                incoming.style.transition = 'transform 260ms cubic-bezier(0.22,1,0.36,1), opacity 200ms ease';
                incoming.style.transform = 'translateX(0)';
                incoming.style.opacity = '1';
              });
            });
          }
          // clean up outgoing
          if (panel) { panel.style.transform = ''; panel.style.opacity = ''; panel.style.transition = ''; }
        }, 180);
      }

      main.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        curDx = 0;
        locked = false;
        cancelled = false;
      }, { passive: true });

      main.addEventListener('touchmove', (e) => {
        if (cancelled) return;
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;
        if (!locked) {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
          if (Math.abs(dy) > Math.abs(dx)) { cancelled = true; return; }
          locked = true;
        }
        curDx = dx;
        // resistance at edges
        const activeBtn = document.querySelector('.nav-btn.active');
        const idx = panelOrder.indexOf(activeBtn ? activeBtn.dataset.panel : '');
        const atStart = idx === 0 && dx > 0;
        const atEnd = idx === panelOrder.length - 1 && dx < 0;
        const effective = (atStart || atEnd) ? dx * 0.25 : dx;
        applyDrag(effective);
      }, { passive: true });

      main.addEventListener('touchend', () => {
        if (!locked) return;
        locked = false;
        const activeBtn = document.querySelector('.nav-btn.active');
        if (!activeBtn || !activeBtn.dataset.panel) { snapBack(); return; }
        const idx = panelOrder.indexOf(activeBtn.dataset.panel);
        const threshold = window.innerWidth * 0.28;
        if (curDx < -threshold && idx < panelOrder.length - 1) {
          snapCommit(panelOrder[idx + 1]);
        } else if (curDx > threshold && idx > 0) {
          snapCommit(panelOrder[idx - 1]);
        } else {
          snapBack();
          // clean transform after snap-back animation
          setTimeout(() => {
            const panel = activePanel();
            if (panel) { panel.style.transform = ''; panel.style.opacity = ''; panel.style.transition = ''; }
          }, 300);
        }
      });

      main.addEventListener('touchcancel', () => { if (locked) snapBack(); locked = false; });
    })();

    document.getElementById('captureWikiTab').addEventListener('click', () => switchCaptureMode('wiki'));
    document.getElementById('captureResearchTab').addEventListener('click', () => switchCaptureMode('research'));
    topicEl.addEventListener('change', syncTopicMode);
    topicsTopicEl.addEventListener('change', () => {
      loadTopicNotes(topicsTopicEl.value).catch((error) => {
        setMessage(topicsOutputEl, error.message || 'Could not load topic notes.', 'error');
      });
    });
    document.getElementById('previewBtn').addEventListener('click', () => {
      previewCapture().catch((error) => setMessage(captureStatusAppEl, error.message || 'Preview failed.', 'error'));
    });
    document.getElementById('confirmBtn').addEventListener('click', () => {
      confirmSubmit().catch((error) => setMessage(captureStatusAppEl, error.message || 'Submit failed.', 'error'));
    });
    document.getElementById('cancelBtn').addEventListener('click', () => {
      previewPayload = null;
      previewEl.classList.add('hidden');
      setMessage(captureStatusAppEl, 'Preview discarded.');
    });
    document.getElementById('bootstrapBtn').addEventListener('click', () => {
      const token = document.getElementById('bridgeToken').value.trim();
      const btn = document.getElementById('bootstrapBtn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Unlocking…';
      bootstrap(token)
        .then(() => {
          const shared = JSON.parse(localStorage.getItem(pendingShareStorageKey) || 'null');
          if (shared) {
            applySharedPayload(shared);
            localStorage.removeItem(pendingShareStorageKey);
          }
        })
        .catch((error) => {
          setMessage(captureStatusEl, error.message || 'Unlock failed.', 'error');
          btn.disabled = false;
          btn.textContent = 'Unlock App';
        });
    });
    document.getElementById('askBtn').addEventListener('click', async () => {
      const btn = document.getElementById('askBtn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Thinking…';
      askOutputEl.innerHTML = '';
      try {
        const response = await fetch('/app/api/ask', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prompt: document.getElementById('askPrompt').value.trim() })
        });
        const body = await response.json();
        if (!response.ok || !body.ok) {
          setMessage(askOutputEl, body.error || 'Ask failed.', 'error');
        } else {
          setMarkdown(askOutputEl, body.answer);
        }
      } finally {
        btn.disabled = false;
        btn.textContent = 'Ask TAWD';
      }
    });
    document.getElementById('topicSummaryBtn').addEventListener('click', async () => {
      const btn = document.getElementById('topicSummaryBtn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Building…';
      topicsOutputEl.innerHTML = '';
      try {
        const response = await fetch('/app/api/topics/summarize', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            topic: topicsTopicEl.value,
            wikiOnly: document.getElementById('wikiOnly').checked
          })
        });
        const body = await response.json();
        if (!response.ok || !body.ok) {
          setMessage(topicsOutputEl, body.error || 'Summary failed.', 'error');
        } else {
          setMarkdown(topicsOutputEl, body.answer);
        }
      } finally {
        btn.disabled = false;
        btn.textContent = 'Summarize';
      }
    });
    document.getElementById('topicSeedsBtn').addEventListener('click', async () => {
      const btn = document.getElementById('topicSeedsBtn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Finding…';
      topicsOutputEl.innerHTML = '';
      try {
        const response = await fetch('/app/api/topics/research-seeds', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ topic: topicsTopicEl.value })
        });
        const body = await response.json();
        if (!response.ok || !body.ok) {
          setMessage(topicsOutputEl, body.error || 'Research seeds failed.', 'error');
        } else {
          setMarkdown(topicsOutputEl, body.answer);
        }
      } finally {
        btn.disabled = false;
        btn.textContent = 'Research Seeds';
      }
    });
    document.getElementById('topicAnalysisBtn').addEventListener('click', async () => {
      const notePath = topicsNoteEl.value;
      const question = document.getElementById('topicsQuestion').value.trim();
      if (!notePath || !question) {
        setMessage(topicsOutputEl, 'Choose a note and enter an analysis question first.', 'error');
        return;
      }
      const btn = document.getElementById('topicAnalysisBtn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Analyzing…';
      topicsOutputEl.innerHTML = '';
      try {
        const response = await fetch('/app/api/topics/analysis', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            topic: topicsTopicEl.value,
            notePath,
            question
          })
        });
        const body = await response.json();
        if (!response.ok || !body.ok) {
          setMessage(topicsOutputEl, body.error || 'Analysis failed.', 'error');
        } else {
          setMarkdown(topicsOutputEl, body.answer);
        }
      } finally {
        btn.disabled = false;
        btn.textContent = 'Run Analysis';
      }
    });

    if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      secureHintEl.classList.remove('hidden');
    }

    const sharedPayload = readSharedPayloadFromUrl();
    if (sharedPayload && !${JSON.stringify(hasSession)}) {
      localStorage.setItem(pendingShareStorageKey, JSON.stringify(sharedPayload));
    }

    if (${JSON.stringify(hasSession)}) {
      loadState()
        .then(() => {
          applySharedPayload(sharedPayload);
        })
        .catch((error) => setMessage(captureStatusAppEl, error.message || 'Could not load app state.', 'error'));
    }
  </script>
</body>
</html>`;
}

function renderAppServiceWorker(): string {
  return `const CACHE_NAME = 'taw-app-v1';
const APP_SHELL = [
  '/app',
  '/app/manifest.webmanifest',
  '/app/icon.svg',
  '/app/icon-192.png',
  '/app/icon-512.png'
];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    url.pathname === '/app' ||
    url.pathname === '/app/manifest.webmanifest' ||
    url.pathname === '/app/icon.svg' ||
    url.pathname === '/app/icon-192.png' ||
    url.pathname === '/app/icon-512.png'
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});
`;
}

function renderAppIconSvg(): string {
  return `<svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="TAW">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#d76f3f"/>
      <stop offset="100%" stop-color="#8d3f26"/>
    </linearGradient>
  </defs>
  <rect x="10" y="10" width="108" height="108" rx="28" fill="#f8f1e6" stroke="#cfb89c" stroke-width="6"/>
  <path d="M34 40h60l-12 16H70v34H58V56H46z" fill="url(#g)"/>
  <circle cx="94" cy="94" r="10" fill="#e3bf92"/>
  <path d="M32 94c16-12 30-18 44-18" fill="none" stroke="#8d3f26" stroke-width="8" stroke-linecap="round"/>
</svg>`;
}

function renderAppIconPng(size: number): Buffer {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);

  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * stride;
    raw[rowOffset] = 0;

    for (let x = 0; x < size; x += 1) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;

      let color = [248, 241, 230, 255];

      if (
        (u >= 0.28 && u <= 0.72 && v >= 0.22 && v <= 0.34) ||
        (u >= 0.44 && u <= 0.56 && v >= 0.34 && v <= 0.72)
      ) {
        const blend = Math.max(0, Math.min(1, (u - 0.28) / 0.44));
        color = [
          Math.round(215 * (1 - blend) + 141 * blend),
          Math.round(111 * (1 - blend) + 63 * blend),
          Math.round(63 * (1 - blend) + 38 * blend),
          255
        ];
      }

      const dx = u - 0.74;
      const dy = v - 0.74;
      if (dx * dx + dy * dy <= 0.08 * 0.08) {
        color = [227, 191, 146, 255];
      }

      const lineDistance = distanceToSegment(u, v, 0.25, 0.74, 0.60, 0.60);
      if (lineDistance <= 0.032) {
        color = [141, 63, 38, 255];
      }

      raw[pixelOffset] = color[0];
      raw[pixelOffset + 1] = color[1];
      raw[pixelOffset + 2] = color[2];
      raw[pixelOffset + 3] = color[3];
    }
  }

  return encodePng(size, size, raw);
}

function distanceToSegment(
  x: number,
  y: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(x - x1, y - y1);
  }
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared));
  const px = x1 + t * dx;
  const py = y1 + t * dy;
  return Math.hypot(x - px, y - py);
}

function encodePng(width: number, height: number, rawData: Buffer): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(rawData)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let current = index;
    for (let bit = 0; bit < 8; bit += 1) {
      current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
    }
    table[index] = current >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let current = 0xffffffff;
  for (const value of buffer) {
    current = CRC32_TABLE[(current ^ value) & 0xff] ^ (current >>> 8);
  }
  return (current ^ 0xffffffff) >>> 0;
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
