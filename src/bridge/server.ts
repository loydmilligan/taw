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
              background_color: '#f4efe6',
              theme_color: '#b85c38',
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
        const size = parsedUrl.pathname.endsWith('512.png') ? 512 : 192;
        response.statusCode = 200;
        response.setHeader('content-type', 'image/png');
        response.end(renderAppIconPng(size));
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
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#b85c38" />
  <link rel="manifest" href="/app/manifest.webmanifest" />
  <link rel="icon" href="/app/icon.svg" type="image/svg+xml" />
  <title>TAW Companion</title>
  <style>
    :root {
      --bg: #f2eadf;
      --panel: #fffaf4;
      --line: #d9c7b3;
      --ink: #221b14;
      --muted: #6d6154;
      --accent: #b85c38;
      --accent-soft: #f3c8a8;
      --ok: #46693d;
      --error: #9e2c2c;
    }
    body {
      margin: 0;
      font-family: Georgia, "Palatino Linotype", serif;
      background: radial-gradient(circle at top, #f9f2e8 0%, var(--bg) 65%);
      color: var(--ink);
    }
    main {
      max-width: 760px;
      margin: 0 auto;
      padding: 18px 14px 36px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 20px;
      padding: 18px;
      box-shadow: 0 14px 30px rgba(34, 27, 20, 0.08);
    }
    .hero {
      display: flex;
      gap: 12px;
      align-items: center;
      margin-bottom: 12px;
    }
    .hero svg {
      width: 56px;
      height: 56px;
      flex: none;
    }
    h1, h2, h3 {
      margin: 0;
    }
    h1 { font-size: 1.7rem; }
    h2 { font-size: 1.15rem; margin-bottom: 10px; }
    h3 { font-size: 1rem; margin-bottom: 8px; }
    p {
      color: var(--muted);
      line-height: 1.45;
    }
    .nav {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin: 18px 0 10px;
    }
    .nav button,
    .actions button,
    .panel button {
      appearance: none;
      border: 0;
      border-radius: 14px;
      padding: 14px;
      font: inherit;
      font-weight: 700;
    }
    .nav button {
      background: #efe3d5;
      color: var(--ink);
    }
    .nav button.active {
      background: var(--accent);
      color: #fffaf4;
    }
    .panel {
      border-top: 1px solid var(--line);
      padding-top: 16px;
      margin-top: 16px;
    }
    label {
      display: block;
      margin-top: 14px;
      margin-bottom: 6px;
      font-weight: 700;
    }
    input, textarea, select {
      width: 100%;
      box-sizing: border-box;
      font: inherit;
      border-radius: 12px;
      border: 1px solid var(--line);
      padding: 14px;
      background: #fffdfa;
      color: var(--ink);
    }
    textarea { min-height: 110px; resize: vertical; }
    .row {
      display: flex;
      gap: 10px;
      margin-top: 14px;
      align-items: center;
    }
    .row input[type="checkbox"] { width: auto; transform: scale(1.2); }
    .actions {
      display: flex;
      gap: 10px;
      margin-top: 18px;
      flex-wrap: wrap;
    }
    .actions button,
    .action-item button,
    .panel button.primary {
      background: var(--accent);
      color: #fffaf4;
    }
    .actions button.secondary,
    .action-item button.secondary,
    .panel button.secondary {
      background: #d6c1ab;
      color: var(--ink);
    }
    .hidden { display: none; }
    .message, .output, .preview-box {
      margin-top: 16px;
      white-space: pre-wrap;
      line-height: 1.45;
    }
    .preview-box, .surface, .action-item {
      background: #fffdf9;
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 12px;
    }
    .surface + .surface,
    .action-item + .action-item {
      margin-top: 10px;
    }
    .surface .meta {
      color: var(--muted);
      font-size: 0.94rem;
      margin-top: 6px;
    }
    .section-grid {
      display: grid;
      gap: 12px;
    }
    @media (min-width: 720px) {
      .nav { grid-template-columns: repeat(5, minmax(0, 1fr)); }
    }
  </style>
</head>
<body>
  <main>
    <div class="card">
      <div class="hero">
        ${renderAppIconSvg()}
        <div>
          <h1>TAW Companion</h1>
          <p>Capture sources, ask TAWD questions, run review actions, and explore wiki topics from your phone.</p>
        </div>
      </div>
      <div id="secureHint" class="hidden">
        <p><strong>Install/share target note:</strong> Android Chrome usually requires a secure context for PWA install and share target behavior. <code>http://127.0.0.1</code> is fine locally, but <code>http://&lt;laptop-ip&gt;</code> on LAN usually is not. For real install/share-target testing, use HTTPS or a secure tunnel.</p>
      </div>
      <div id="authBlock"${hasSession ? ' class="hidden"' : ''}>
        <label for="bridgeToken">Bridge Token</label>
        <input id="bridgeToken" type="password" placeholder="Paste bridge token once" />
        <div class="actions">
          <button id="bootstrapBtn" type="button" class="primary">Unlock App</button>
        </div>
      </div>
      <div id="appBlock"${hasSession ? '' : ' class="hidden"'}>
        <div class="nav">
          <button data-panel="capture" class="active" type="button">Capture</button>
          <button data-panel="ask" type="button">Ask TAWD</button>
          <button data-panel="actions" type="button">Actions</button>
          <button data-panel="status" type="button">Recent Status</button>
          <button data-panel="topics" type="button">Topics</button>
        </div>

        <section id="panel-capture" class="panel">
          <h2>Capture</h2>
          <p>Send a URL into a wiki topic or the research inbox.</p>
          <div class="row">
            <button id="captureWikiTab" class="primary" type="button">Wiki</button>
            <button id="captureResearchTab" class="secondary" type="button">Research Inbox</button>
          </div>
          <label for="url">URL</label>
          <input id="url" type="url" inputmode="url" placeholder="https://example.com/article" />
          <div id="wikiTopicWrap">
            <label for="topic">Wiki Topic</label>
            <select id="topic"><option value="">Loading topics...</option></select>
            <div id="newTopicWrap" class="hidden">
              <label for="newTopic">New Topic</label>
              <input id="newTopic" type="text" placeholder="vibecoding" />
            </div>
          </div>
          <div id="researchQuestionWrap" class="hidden">
            <label for="initialQuestion">Initial Question</label>
            <input id="initialQuestion" type="text" placeholder="What should TAW investigate here?" />
          </div>
          <label for="userNote">Note</label>
          <textarea id="userNote" placeholder="Why this matters, what to focus on, or any extra context..."></textarea>
          <label class="row"><input id="autoRun" type="checkbox" checked /> Auto-run after confirm</label>
          <div class="actions">
            <button id="previewBtn" type="button" class="primary">Preview Capture</button>
          </div>
          <div id="preview" class="hidden">
            <h3 id="previewTitle"></h3>
            <div class="preview-box" id="previewExcerpt"></div>
            <div class="actions">
              <button id="confirmBtn" type="button" class="primary">Confirm Submit</button>
              <button id="cancelBtn" type="button" class="secondary">Cancel</button>
            </div>
          </div>
          <div id="captureStatus" class="message"></div>
        </section>

        <section id="panel-ask" class="panel hidden">
          <h2>Ask TAWD</h2>
          <p>Send a short question and get a concise response.</p>
          <label for="askPrompt">Prompt</label>
          <textarea id="askPrompt" placeholder="What changed in this wiki recently?"></textarea>
          <div class="actions">
            <button id="askBtn" type="button" class="primary">Ask</button>
          </div>
          <div id="askOutput" class="output"></div>
        </section>

        <section id="panel-actions" class="panel hidden">
          <h2>Actions</h2>
          <p>Review queued work and run existing wiki maintenance actions.</p>
          <div id="actionsWrap" class="section-grid"></div>
        </section>

        <section id="panel-status" class="panel hidden">
          <h2>Recent Status</h2>
          <p>Check what the bridge and this app session have been doing recently.</p>
          <div id="statusWrap" class="section-grid"></div>
        </section>

        <section id="panel-topics" class="panel hidden">
          <h2>Topics</h2>
          <p>Pick a wiki topic, then summarize it, generate research seeds, or run a deeper analysis.</p>
          <label for="topicsTopic">Topic</label>
          <select id="topicsTopic"><option value="">Loading topics...</option></select>
          <label class="row"><input id="wikiOnly" type="checkbox" checked /> Wiki only for summarize</label>
          <div class="actions">
            <button id="topicSummaryBtn" type="button" class="primary">Summarize</button>
            <button id="topicSeedsBtn" type="button" class="secondary">Research Seeds</button>
          </div>
          <label for="topicsNote">Analysis Note</label>
          <select id="topicsNote"><option value="">Choose a note...</option></select>
          <label for="topicsQuestion">Analysis Question</label>
          <textarea id="topicsQuestion" placeholder="What tension or gap should TAW analyze here?"></textarea>
          <div class="actions">
            <button id="topicAnalysisBtn" type="button" class="primary">Run Analysis</button>
          </div>
          <div id="topicsOutput" class="output"></div>
        </section>
      </div>
    </div>
  </main>
  <script>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/app/sw.js').catch(() => {});
    }

    const authBlock = document.getElementById('authBlock');
    const appBlock = document.getElementById('appBlock');
    const secureHintEl = document.getElementById('secureHint');
    const topicStorageKey = 'taw-app-topic';
    const pendingShareStorageKey = 'taw-app-pending-share';
    const captureStatusEl = document.getElementById('captureStatus');
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

    function setMessage(node, message, tone) {
      node.textContent = message || '';
      node.style.color = tone === 'error' ? 'var(--error)' : tone === 'ok' ? 'var(--ok)' : 'var(--muted)';
    }

    function currentTopic() {
      return topicEl.value === '__new__' ? newTopicEl.value.trim() : topicEl.value.trim();
    }

    function syncTopicMode() {
      const isNew = topicEl.value === '__new__';
      newTopicWrapEl.classList.toggle('hidden', !isNew);
    }

    function switchPanel(nextPanel) {
      document.querySelectorAll('.nav button').forEach((node) => {
        node.classList.toggle('active', node.dataset.panel === nextPanel);
      });
      document.querySelectorAll('[id^="panel-"]').forEach((node) => {
        node.classList.toggle('hidden', node.id !== 'panel-' + nextPanel);
      });
    }

    function switchCaptureMode(nextMode) {
      captureMode = nextMode;
      document.getElementById('captureWikiTab').className = nextMode === 'wiki' ? 'primary' : 'secondary';
      document.getElementById('captureResearchTab').className = nextMode === 'research' ? 'primary' : 'secondary';
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
      setMessage(captureStatusEl, 'Shared content received. Preview it before submitting.', 'ok');
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
      await loadState();
    }

    function renderActions(data) {
      const categories = data.categories || [];
      actionsWrapEl.innerHTML = categories.map((category) => {
        const items = category.items || [];
        return [
          '<div class="surface">',
          '<h3>' + category.title + '</h3>',
          items.length === 0 ? '<div class="meta">Nothing queued here right now.</div>' : items.map((item) => [
            '<div class="action-item">',
            '<strong>' + item.title + '</strong>',
            '<div class="meta">' + item.detail + '</div>',
            '<div class="actions"><button type="button" data-action="' + item.action + '" data-topic="' + (item.topic || '') + '">' + item.title + '</button></div>',
            '</div>'
          ].join('')).join(''),
          '</div>'
        ].join('');
      }).join('');

      actionsWrapEl.querySelectorAll('button[data-action]').forEach((node) => {
        node.addEventListener('click', async () => {
          setMessage(captureStatusEl, 'Running action...', undefined);
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
            setMessage(captureStatusEl, body.error || 'Action failed.', 'error');
            return;
          }
          setMessage(captureStatusEl, body.message || 'Action completed.', 'ok');
          renderActions(body.actions);
          renderStatus(body.recentStatus);
          switchPanel('actions');
        });
      });
    }

    function renderStatus(status) {
      const jobLines = (status.backgroundJobs || []).map((job) =>
        '<div class="surface"><strong>' + job.topic + '</strong><div class="meta">' + job.status + ' | started ' + job.startedAt + (job.completedAt ? ' | finished ' + job.completedAt : '') + '</div></div>'
      );

      statusWrapEl.innerHTML = [
        '<div class="surface"><strong>Mode</strong><div class="meta">' + status.mode + '</div></div>',
        '<div class="surface"><strong>Queued Inputs</strong><div class="meta">' + status.queuedInputs + '</div></div>',
        '<div class="surface"><strong>Research Sources</strong><div class="meta">' + status.researchSources + '</div></div>',
        '<div class="surface"><strong>Session Folder</strong><div class="meta">' + status.sessionDir + '</div></div>',
        '<div class="surface"><strong>Background Jobs</strong>' + (jobLines.length ? jobLines.join('') : '<div class="meta">No recent background jobs.</div>') + '</div>'
      ].join('');
    }

    async function loadTopicNotes(topic) {
      if (!topic) {
        topicsNoteEl.innerHTML = '<option value="">Choose a note...</option>';
        return;
      }
      const response = await fetch('/app/api/topics/notes?topic=' + encodeURIComponent(topic));
      const body = await response.json();
      if (!response.ok || !body.ok) {
        throw new Error(body.error || 'Could not load notes.');
      }
      topicsNoteEl.innerHTML = ['<option value="">Choose a note...</option>']
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
      topicEl.innerHTML = ['<option value="__new__">New Topic...</option>']
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
        setMessage(captureStatusEl, 'Enter a URL first.', 'error');
        return;
      }
      if (captureMode === 'wiki' && !currentTopic()) {
        setMessage(captureStatusEl, 'Choose an existing wiki topic or enter a new one.', 'error');
        return;
      }
      setMessage(captureStatusEl, 'Fetching page preview...');
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
      setMessage(captureStatusEl, 'Preview ready. Confirm to submit.', 'ok');
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
        setMessage(captureStatusEl, ['Wiki ingest queued.', 'Topic: ' + body.topic, 'Title: ' + previewPayload.pageTitle, autoRun ? 'Background ingest started.' : 'Queued for later run.'].join('\\n'), 'ok');
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
        setMessage(captureStatusEl, ['Research inbox capture sent.', 'Title: ' + previewPayload.pageTitle, 'A research session was seeded from this source.'].join('\\n'), 'ok');
      }

      previewEl.classList.add('hidden');
      previewPayload = null;
      const statusResponse = await fetch('/app/api/status');
      const statusBody = await statusResponse.json();
      if (statusResponse.ok && statusBody.ok) {
        renderStatus(statusBody.recentStatus);
      }
    }

    document.querySelectorAll('.nav button').forEach((node) => {
      node.addEventListener('click', () => switchPanel(node.dataset.panel));
    });
    document.getElementById('captureWikiTab').addEventListener('click', () => switchCaptureMode('wiki'));
    document.getElementById('captureResearchTab').addEventListener('click', () => switchCaptureMode('research'));
    topicEl.addEventListener('change', syncTopicMode);
    topicsTopicEl.addEventListener('change', () => {
      loadTopicNotes(topicsTopicEl.value).catch((error) => {
        setMessage(topicsOutputEl, error.message || 'Could not load topic notes.', 'error');
      });
    });
    document.getElementById('previewBtn').addEventListener('click', () => {
      previewCapture().catch((error) => setMessage(captureStatusEl, error.message || 'Preview failed.', 'error'));
    });
    document.getElementById('confirmBtn').addEventListener('click', () => {
      confirmSubmit().catch((error) => setMessage(captureStatusEl, error.message || 'Submit failed.', 'error'));
    });
    document.getElementById('cancelBtn').addEventListener('click', () => {
      previewPayload = null;
      previewEl.classList.add('hidden');
      setMessage(captureStatusEl, 'Preview discarded.');
    });
    document.getElementById('bootstrapBtn').addEventListener('click', () => {
      const token = document.getElementById('bridgeToken').value.trim();
      bootstrap(token)
        .then(() => {
          const shared = JSON.parse(localStorage.getItem(pendingShareStorageKey) || 'null');
          if (shared) {
            applySharedPayload(shared);
            localStorage.removeItem(pendingShareStorageKey);
          }
        })
        .catch((error) => setMessage(captureStatusEl, error.message || 'Unlock failed.', 'error'));
    });
    document.getElementById('askBtn').addEventListener('click', async () => {
      setMessage(askOutputEl, 'Thinking...');
      const response = await fetch('/app/api/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: document.getElementById('askPrompt').value.trim() })
      });
      const body = await response.json();
      setMessage(askOutputEl, !response.ok || !body.ok ? body.error || 'Ask failed.' : body.answer, !response.ok || !body.ok ? 'error' : undefined);
    });
    document.getElementById('topicSummaryBtn').addEventListener('click', async () => {
      setMessage(topicsOutputEl, 'Building summary...');
      const response = await fetch('/app/api/topics/summarize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          topic: topicsTopicEl.value,
          wikiOnly: document.getElementById('wikiOnly').checked
        })
      });
      const body = await response.json();
      setMessage(topicsOutputEl, !response.ok || !body.ok ? body.error || 'Summary failed.' : body.answer, !response.ok || !body.ok ? 'error' : undefined);
    });
    document.getElementById('topicSeedsBtn').addEventListener('click', async () => {
      setMessage(topicsOutputEl, 'Finding research seeds...');
      const response = await fetch('/app/api/topics/research-seeds', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ topic: topicsTopicEl.value })
      });
      const body = await response.json();
      setMessage(topicsOutputEl, !response.ok || !body.ok ? body.error || 'Research seeds failed.' : body.answer, !response.ok || !body.ok ? 'error' : undefined);
    });
    document.getElementById('topicAnalysisBtn').addEventListener('click', async () => {
      const notePath = topicsNoteEl.value;
      const question = document.getElementById('topicsQuestion').value.trim();
      if (!notePath || !question) {
        setMessage(topicsOutputEl, 'Choose a note and enter an analysis question first.', 'error');
        return;
      }
      setMessage(topicsOutputEl, 'Running analysis...');
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
      setMessage(topicsOutputEl, !response.ok || !body.ok ? body.error || 'Analysis failed.' : body.answer, !response.ok || !body.ok ? 'error' : undefined);
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
        .catch((error) => setMessage(captureStatusEl, error.message || 'Could not load app state.', 'error'));
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
