import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { authorize } from './auth.js';
import { readJson, writeJson } from './http-utils.js';
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
import { browserResearchPayloadSchema } from '../core/research/schema.js';
import { listWikiTopics, wikiExists } from '../services/wiki/manager.js';
import { APP_VERSION } from '../version.js';
import type { SearchBackendStatus } from '../services/search/searxng-manager.js';

export interface BridgeCoreOptions {
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

interface BackgroundJob {
  jobId: string;
  topic: string;
  startedAt: string;
  status: 'running' | 'success' | 'failed';
  completedAt?: string;
  exitCode?: number | null;
}

interface NewResearchRequestBody {
  cwd?: string;
  payload: unknown;
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

export function createBridgeCoreHandler(
  options: BridgeCoreOptions
): (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> {
  const activeJobs = new Map<string, BackgroundJob>();

  function cleanupOldJobs(): void {
    const cutoffMs = Date.now() - 2 * 60 * 60 * 1000; // 2 hours
    for (const [id, job] of activeJobs) {
      if (new Date(job.startedAt).getTime() < cutoffMs) {
        activeJobs.delete(id);
      }
    }
  }

  async function queueResearchIngestRequest(
    body: NewResearchRequestBody,
    opts: BridgeCoreOptions
  ): Promise<{
    ok: true;
    payloadPath: string;
    cwd: string;
    launchMethod: LaunchResult['launchMethod'];
    command: string;
  }> {
    const payload = browserResearchPayloadSchema.parse(body.payload);
    const payloadPath = await writeBridgePayloadFile(payload);
    const cwd = body.cwd ?? opts.defaultCwd;
    const launch =
      opts.launch ??
      ((input: LaunchSessionInput, nextCwd: string, windowName: string) => {
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
    opts: BridgeCoreOptions
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
    const cwd = body.cwd ?? opts.defaultCwd;
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

    if (body.autoRun && !opts.launch) {
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
      const launch = opts.launch ?? launchTawSession;
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

  return async (request: http.IncomingMessage, response: http.ServerResponse): Promise<void> => {
    // Public — no auth
    if (request.method === 'GET' && request.url === '/version') {
      writeJson(response, 200, { version: APP_VERSION });
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

    if (request.method === 'GET' && request.url === '/wiki/topics') {
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

    if (request.method === 'POST' && request.url === '/session/new-research') {
      const body = (await readJson(request)) as NewResearchRequestBody;
      const result = await queueResearchIngestRequest(body, options);
      writeJson(response, 200, result);
      return;
    }

    if (request.method === 'POST' && request.url === '/session/new-wiki-ingest') {
      const body = newWikiIngestRequestSchema.parse(await readJson(request));
      const result = await queueWikiIngestRequest(body, options);
      writeJson(response, 200, result);
      return;
    }

    if (request.method === 'POST' && request.url === '/session/new-mobile-wiki-ingest') {
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

    if (request.method === 'POST' && request.url === '/session/append-context') {
      writeJson(response, 501, {
        ok: false,
        error: 'Append-context targeting is not implemented yet.'
      });
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
