import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sessionMetadataSchema } from './schema.js';
import type { SessionMetadata, SessionRecord } from '../../types/session.js';
import {
  getAppConfigDir,
  getCacheDir,
  getGeneralSessionsRoot,
  getLogsDir,
  getProjectConfigPath,
  getProjectSessionsRoot
} from '../../services/filesystem/paths.js';

export interface CreateSessionOptions {
  cwd: string;
  provider?: string;
  model?: string;
}

export async function createSession(
  options: CreateSessionOptions
): Promise<SessionRecord> {
  const createdAt = new Date().toISOString();
  const sessionId = createSessionId(createdAt);
  const projectRoot = (await isProjectInitialized(options.cwd))
    ? options.cwd
    : null;
  const storageMode = projectRoot ? 'project' : 'general';
  const sessionsRoot = projectRoot
    ? getProjectSessionsRoot(projectRoot)
    : getGeneralSessionsRoot();
  const slug = createSessionSlug(projectRoot ?? options.cwd);
  const sessionDir = path.join(
    sessionsRoot,
    `${toSessionPrefix(createdAt)}_${slug}`
  );
  const artifactsDir = path.join(sessionDir, 'artifacts');
  const sourcesDir = path.join(sessionDir, 'sources');
  const notesPath = path.join(sessionDir, 'notes.md');
  const sessionJsonPath = path.join(sessionDir, 'session.json');
  const sourcesJsonPath = path.join(sessionDir, 'sources.json');
  const sourceViewsJsonPath = path.join(sessionDir, 'source-views.json');
  const summaryPath = path.join(sessionDir, 'session-summary.md');

  await ensureBaseDirectories(options.cwd);
  await mkdir(artifactsDir, { recursive: true });
  await mkdir(sourcesDir, { recursive: true });

  const metadata: SessionMetadata = {
    id: sessionId,
    slug,
    createdAt,
    cwdAtLaunch: options.cwd,
    attachedDirs: projectRoot ? [projectRoot] : [],
    modeHistory: ['general'],
    artifacts: [],
    provider: options.provider ?? 'openrouter',
    model: options.model ?? 'openrouter/auto',
    summaryStatus: 'idle'
  };

  sessionMetadataSchema.parse(metadata);

  await writeFile(
    sessionJsonPath,
    `${JSON.stringify(metadata, null, 2)}\n`,
    'utf8'
  );
  await writeFile(sourcesJsonPath, '[]\n', 'utf8');
  await writeFile(sourceViewsJsonPath, '[]\n', 'utf8');
  await writeFile(notesPath, buildInitialNotes(metadata, storageMode), 'utf8');

  return {
    metadata,
    sessionDir,
    artifactsDir,
    sourcesDir,
    sourcesJsonPath,
    sourceViewsJsonPath,
    notesPath,
    sessionJsonPath,
    summaryPath,
    storageMode,
    projectRoot
  };
}

export async function updateSessionMetadata(
  session: SessionRecord
): Promise<void> {
  sessionMetadataSchema.parse(session.metadata);
  await writeFile(
    session.sessionJsonPath,
    `${JSON.stringify(session.metadata, null, 2)}\n`,
    'utf8'
  );
}

export async function loadSessionMetadata(
  sessionJsonPath: string
): Promise<SessionMetadata> {
  const content = await readFile(sessionJsonPath, 'utf8');
  return sessionMetadataSchema.parse(JSON.parse(content));
}

export async function ensureBaseDirectories(cwd: string): Promise<void> {
  await mkdir(getAppConfigDir(), { recursive: true });
  await mkdir(getGeneralSessionsRoot(), { recursive: true });
  await mkdir(getLogsDir(), { recursive: true });
  await mkdir(getCacheDir(), { recursive: true });

  if (await isProjectInitialized(cwd)) {
    await mkdir(path.join(cwd, '.ai'), { recursive: true });
    await mkdir(getProjectSessionsRoot(cwd), { recursive: true });
  }
}

export async function isProjectInitialized(cwd: string): Promise<boolean> {
  try {
    const config = await readFile(getProjectConfigPath(cwd), 'utf8');
    return config.trim().length > 0;
  } catch {
    return false;
  }
}

export function createSessionId(createdAt: string): string {
  return createdAt.replaceAll(':', '').replaceAll('-', '').replaceAll('.', '');
}

export function createSessionSlug(seedPath: string): string {
  const base = path.basename(seedPath) || 'workspace';
  return sanitizeSlug(base);
}

export function sanitizeSlug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'session'
  );
}

function toSessionPrefix(createdAt: string): string {
  return createdAt.slice(0, 19).replace('T', '_').replaceAll(':', '-');
}

function buildInitialNotes(
  metadata: SessionMetadata,
  storageMode: SessionRecord['storageMode']
): string {
  return [
    '# Session Notes',
    '',
    `- Session ID: ${metadata.id}`,
    `- Started: ${metadata.createdAt}`,
    `- Storage Mode: ${storageMode}`,
    `- Launch Directory: ${metadata.cwdAtLaunch}`,
    '',
    '## Transcript Notes',
    ''
  ].join('\n');
}
