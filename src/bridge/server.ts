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
  setAppSessionCookie,
  getAppSessionRecord,
  cleanupOldAppSessions,
  appSessions
} from './auth.js';
import { parseRequestUrl, readJson, writeJson } from './http-utils.js';
import { createBridgeCoreHandler, type BridgeCoreOptions } from './bridge-core.js';
import {
  renderMobilePage,
  renderPwaAppPage,
  renderAppServiceWorker,
  renderAppIconSvg
} from './renderer.js';
import { parseCommand } from '../commands/parser.js';
import { getCommandDefinition } from '../commands/registry.js';
import { executeChatTurn } from '../core/chat/engine.js';
import { searchWebAndStoreSources } from '../core/research/search.js';
import { readResearchSources } from '../core/research/store.js';
import type { AppState, TranscriptEntry } from '../types/app.js';
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
import { createId } from '../utils/ids.js';

interface BackgroundJob {
  jobId: string;
  topic: string;
  startedAt: string;
  status: 'running' | 'success' | 'failed';
  completedAt?: string;
  exitCode?: number | null;
}

// activeJobs is local to server.ts for now — tracks background wiki ingest jobs
// used by buildRecentStatus; moves to app-server in plan 03
const activeJobs = new Map<string, BackgroundJob>();

function cleanupOldJobs(): void {
  const cutoffMs = Date.now() - 2 * 60 * 60 * 1000; // 2 hours
  for (const [id, job] of activeJobs) {
    if (new Date(job.startedAt).getTime() < cutoffMs) {
      activeJobs.delete(id);
    }
  }
}

interface AppActionItem {
  id: string;
  category: 'pending-review' | 'pending-intake';
  title: string;
  detail: string;
  action: 'stage-link-review' | 'stage-reindex' | 'confirm' | 'cancel';
  topic?: string;
}

// BridgeServerOptions aliases BridgeCoreOptions — same shape, shared via import
export type BridgeServerOptions = BridgeCoreOptions;

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
  const bridgeCore = createBridgeCoreHandler(options);

  return http.createServer(async (request, response) => {
    try {
      const url = request.url ?? '/';
      if (url === '/app' || url.startsWith('/app/') || url === '/mobile') {
        await handleAppRequest(request, response, options);
      } else {
        await bridgeCore(request, response);
      }
    } catch (err) {
      response.statusCode = 500;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ error: 'Internal bridge error.' }));
    }
  });
}

function normalizeTopic(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

async function handleAppRequest(
  _request: http.IncomingMessage,
  response: http.ServerResponse,
  _options: BridgeServerOptions
): Promise<void> {
  // Stub — app-server module not yet loaded. Replaced in plan 999.4-03.
  response.statusCode = 503;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ error: 'App server module not yet loaded.' }));
}

