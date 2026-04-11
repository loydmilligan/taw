import type { AppState, TranscriptEntry } from '../types/app.js';
import { createSession } from '../core/sessions/session-manager.js';
import { loadConfig } from '../services/config/loader.js';
import { ensureAssistantReferenceFiles } from '../core/context/assistant-files.js';
import { commandRegistry } from '../commands/registry.js';
import { summarizeSessionUsage } from '../core/telemetry/derivation.js';
import { readTelemetrySummaries } from '../core/telemetry/store.js';
import { addBrowserPayloadAsSource } from '../core/research/store.js';
import type { BrowserResearchPayload } from '../core/research/types.js';
import { fetchOpenRouterCredits } from '../services/openrouter/management.js';
import { createId } from '../utils/ids.js';

export interface BootstrapOptions {
  browserPayload?: BrowserResearchPayload | null;
}

export async function bootstrapApp(
  cwd: string,
  options: BootstrapOptions = {}
): Promise<AppState> {
  const config = await loadConfig(cwd);
  const session = await createSession({
    cwd,
    provider: config.providerConfig.provider,
    model: config.providerConfig.model
  });
  const references = await ensureAssistantReferenceFiles(
    cwd,
    session,
    commandRegistry
  );
  const summaries = await readTelemetrySummaries(session);
  const browserState = options.browserPayload
    ? await buildBrowserSeedState(session, options.browserPayload)
    : null;
  const openrouterAccount =
    config.providerConfig.provider === 'openrouter' &&
    config.openrouterManagementKey
      ? await loadOpenRouterAccountSnapshot(config.openrouterManagementKey)
      : null;

  return {
    mode: browserState?.mode ?? 'General',
    phase: 'idle',
    provider: session.metadata.provider,
    model: session.metadata.model,
    providerConfig: config.providerConfig,
    commandReference: references.commandReference,
    globalConfig: config.globalConfig,
    projectConfig: config.projectConfig,
    isStreaming: false,
    session,
    transcript: createInitialTranscript(
      session.storageMode,
      session.sessionDir,
      browserState?.entries ?? []
    ),
    usage: {
      session: summarizeSessionUsage(summaries),
      lastRequest: summaries.at(-1) ?? null
    },
    openrouterAccount,
    queuedInputs: browserState?.queuedInputs ?? []
  };
}

async function loadOpenRouterAccountSnapshot(managementKey: string): Promise<{
  remainingCredits: number | null;
  totalCredits: number | null;
  totalUsage: number | null;
  lastFetchedAt: string | null;
  error: string | null;
}> {
  try {
    const credits = await fetchOpenRouterCredits(managementKey);
    return {
      remainingCredits: credits.remainingCredits,
      totalCredits: credits.totalCredits,
      totalUsage: credits.totalUsage,
      lastFetchedAt: new Date().toISOString(),
      error: null
    };
  } catch (error) {
    return {
      remainingCredits: null,
      totalCredits: null,
      totalUsage: null,
      lastFetchedAt: new Date().toISOString(),
      error:
        error instanceof Error ? error.message : 'Unknown credits fetch error.'
    };
  }
}

function createInitialTranscript(
  storageMode: 'general' | 'project',
  sessionDir: string,
  extraEntries: TranscriptEntry[] = []
): TranscriptEntry[] {
  return [
    {
      id: 'welcome',
      kind: 'system',
      title: 'Session Started',
      body:
        storageMode === 'project'
          ? 'Project-aware session active. TAW found a local .ai/config.json and is saving this session in the project.'
          : 'General session active. No project has been initialized here, so TAW is using your user config directory.'
    },
    {
      id: 'session-path',
      kind: 'notice',
      title: 'Session Folder',
      body: sessionDir
    },
    ...extraEntries
  ];
}

async function buildBrowserSeedState(
  session: Awaited<ReturnType<typeof createSession>>,
  payload: BrowserResearchPayload
): Promise<{
  mode: string;
  entries: TranscriptEntry[];
  queuedInputs: string[];
}> {
  const source = await addBrowserPayloadAsSource(session, payload);
  const mode =
    payload.researchType === 'politics'
      ? 'Research Politics'
      : payload.researchType === 'tech'
        ? 'Research Tech'
        : payload.researchType === 'repo'
          ? 'Research Repo'
          : 'Research Video';

  return {
    mode,
    entries: [
      {
        id: createId('browser-source'),
        kind: 'notice',
        title: 'Browser Source Added',
        body: `${source.title}${source.url ? `\n${source.url}` : ''}`
      }
    ],
    queuedInputs: [
      `/research ${payload.researchType}${payload.initialQuestion ? ` ${payload.initialQuestion}` : ''}`.trim(),
      buildInitialResearchPrompt(payload)
    ]
  };
}

function buildInitialResearchPrompt(payload: BrowserResearchPayload): string {
  return [
    payload.initialQuestion
      ? `Initial question: ${payload.initialQuestion}`
      : null,
    `Source title: ${payload.title}`,
    payload.url ? `Source url: ${payload.url}` : null,
    payload.selectedText ? `Selected text:\n${payload.selectedText}` : null,
    payload.pageTextExcerpt
      ? `Page excerpt:\n${payload.pageTextExcerpt}`
      : null,
    payload.userNote ? `User note: ${payload.userNote}` : null,
    'Start by using this source as context and produce a draft research response.'
  ]
    .filter(Boolean)
    .join('\n\n');
}
