import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SessionRecord } from '../../types/session.js';

export interface RecentWikiWritesEntry {
  path: string;
  operation: 'created' | 'updated';
  recordedAt: string;
}

export interface RecentWikiWrites {
  topic: string;
  modeType: string;
  updatedAt: string;
  entries: RecentWikiWritesEntry[];
}

const RECENT_WRITES_WINDOW_MS = 30 * 60 * 1000;

function getRecentWikiWritesPath(session: SessionRecord): string {
  return path.join(session.sessionDir, 'recent-wiki-writes.json');
}

export async function readRecentWikiWrites(
  session: SessionRecord
): Promise<RecentWikiWrites | null> {
  try {
    const content = await readFile(getRecentWikiWritesPath(session), 'utf8');
    return JSON.parse(content) as RecentWikiWrites;
  } catch {
    return null;
  }
}

export async function recordRecentWikiWrite(
  session: SessionRecord,
  value: {
    topic: string;
    modeType: string;
    path: string;
    operation: 'created' | 'updated';
    recordedAt?: string;
  }
): Promise<void> {
  const recordedAt = value.recordedAt ?? new Date().toISOString();
  const previous = await readRecentWikiWrites(session);
  const canAppend =
    previous &&
    previous.topic === value.topic &&
    previous.modeType === value.modeType &&
    Date.parse(recordedAt) - Date.parse(previous.updatedAt) <= RECENT_WRITES_WINDOW_MS;

  const entries = canAppend ? [...previous.entries] : [];
  const existingIndex = entries.findIndex((entry) => entry.path === value.path);
  const nextEntry: RecentWikiWritesEntry = {
    path: value.path,
    operation: value.operation,
    recordedAt
  };

  if (existingIndex >= 0) {
    entries[existingIndex] = nextEntry;
  } else {
    entries.push(nextEntry);
  }

  const payload: RecentWikiWrites = {
    topic: value.topic,
    modeType: value.modeType,
    updatedAt: recordedAt,
    entries: entries.sort((left, right) => left.path.localeCompare(right.path))
  };

  await writeFile(
    getRecentWikiWritesPath(session),
    `${JSON.stringify(payload, null, 2)}\n`,
    'utf8'
  );
}
