import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { TranscriptEntry } from '../../types/app.js';
import type { FeedbackEntry, FeedbackKind } from '../../types/feedback.js';
import type { SessionRecord } from '../../types/session.js';
import { createId } from '../../utils/ids.js';
import { getGlobalAssistantDir, getProjectAssistantDir } from '../../services/filesystem/paths.js';

export async function captureFeedback(
  kind: FeedbackKind,
  session: SessionRecord,
  transcript: TranscriptEntry[],
  mode: string,
  summary: string,
  note: string | null
): Promise<FeedbackEntry> {
  const storePath = await getFeedbackStorePath(session, kind);
  const entries = await loadFeedback(kind, session);
  const latestUserMessage = [...transcript].reverse().find((entry) => entry.kind === 'user')?.body ?? null;
  const latestAssistantMessage =
    [...transcript].reverse().find((entry) => entry.kind === 'assistant')?.body ?? null;

  const entry: FeedbackEntry = {
    id: createId(kind),
    kind,
    summary,
    note,
    createdAt: new Date().toISOString(),
    mode,
    sessionId: session.metadata.id,
    latestUserMessage,
    latestAssistantMessage
  };

  entries.push(entry);
  await writeFile(storePath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
  return entry;
}

export async function loadFeedback(
  kind: FeedbackKind,
  session: SessionRecord
): Promise<FeedbackEntry[]> {
  const storePath = await getFeedbackStorePath(session, kind);

  try {
    const content = await readFile(storePath, 'utf8');
    return JSON.parse(content) as FeedbackEntry[];
  } catch {
    return [];
  }
}

export function renderFeedbackMarkdown(kind: FeedbackKind, entries: FeedbackEntry[]): string {
  const title = kind === 'idea' ? 'Feature Ideas' : 'Issues';

  if (entries.length === 0) {
    return `# ${title}\n\n_No entries yet._\n`;
  }

  const body = entries
    .slice()
    .reverse()
    .map((entry) =>
      [
        `## ${entry.summary}`,
        '',
        `- Captured: ${entry.createdAt}`,
        `- Mode: ${entry.mode}`,
        `- Session: ${entry.sessionId}`,
        entry.note ? `- Note: ${entry.note}` : null,
        '',
        '### Latest User Message',
        '',
        entry.latestUserMessage ?? '_None captured._',
        '',
        '### Latest Assistant Message',
        '',
        entry.latestAssistantMessage ?? '_None captured._',
        ''
      ]
        .filter(Boolean)
        .join('\n')
    )
    .join('\n');

  return `# ${title}\n\n${body}`;
}

async function getFeedbackStorePath(
  session: SessionRecord,
  kind: FeedbackKind = 'idea'
): Promise<string> {
  const assistantDir =
    session.storageMode === 'project' && session.projectRoot
      ? getProjectAssistantDir(session.projectRoot)
      : getGlobalAssistantDir();

  await mkdir(assistantDir, { recursive: true });
  return path.join(assistantDir, kind === 'idea' ? 'ideas.json' : 'issues.json');
}
