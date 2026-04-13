import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SessionRecord } from '../../types/session.js';
import type { HisterSearchResult } from '../hister/client.js';

export interface PendingWikiIngest {
  kind: 'hister';
  topic: string;
  review: boolean;
  query: string;
  maxResults: number;
  createdAt: string;
  results: HisterSearchResult[];
}

function getPendingIngestPath(session: SessionRecord): string {
  return path.join(session.sessionDir, 'pending-wiki-ingest.json');
}

export async function readPendingWikiIngest(
  session: SessionRecord
): Promise<PendingWikiIngest | null> {
  try {
    const content = await readFile(getPendingIngestPath(session), 'utf8');
    return JSON.parse(content) as PendingWikiIngest;
  } catch {
    return null;
  }
}

export async function writePendingWikiIngest(
  session: SessionRecord,
  value: PendingWikiIngest
): Promise<void> {
  await writeFile(
    getPendingIngestPath(session),
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8'
  );
}

export async function clearPendingWikiIngest(
  session: SessionRecord
): Promise<void> {
  await rm(getPendingIngestPath(session), { force: true });
}
