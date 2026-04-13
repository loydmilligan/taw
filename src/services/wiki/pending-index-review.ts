import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SessionRecord } from '../../types/session.js';

export interface PendingIndexReview {
  kind: 'index-review';
  topic: string;
  createdAt: string;
  pendingNotes: string[];
  updatedIndexContent: string;
  summaryLines: string[];
}

function getPendingIndexReviewPath(session: SessionRecord): string {
  return path.join(session.sessionDir, 'pending-index-review.json');
}

export async function readPendingIndexReview(
  session: SessionRecord
): Promise<PendingIndexReview | null> {
  try {
    const content = await readFile(getPendingIndexReviewPath(session), 'utf8');
    return JSON.parse(content) as PendingIndexReview;
  } catch {
    return null;
  }
}

export async function writePendingIndexReview(
  session: SessionRecord,
  value: PendingIndexReview
): Promise<void> {
  await writeFile(
    getPendingIndexReviewPath(session),
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8'
  );
}

export async function clearPendingIndexReview(
  session: SessionRecord
): Promise<void> {
  await rm(getPendingIndexReviewPath(session), { force: true });
}
