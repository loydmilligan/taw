import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SessionRecord } from '../../types/session.js';

export interface PendingLinkReviewProposal {
  filePath: string;
  kind: 'new-to-old-inline-link' | 'old-to-new-see-also';
  reason: string;
  confidence: 'high' | 'medium';
  updatedContent: string;
  summary: string;
}

export interface PendingLinkReview {
  kind: 'link-review';
  topic: string;
  scope: 'recent';
  createdAt: string;
  newNotes: string[];
  proposals: PendingLinkReviewProposal[];
}

function getPendingLinkReviewPath(session: SessionRecord): string {
  return path.join(session.sessionDir, 'pending-link-review.json');
}

export async function readPendingLinkReview(
  session: SessionRecord
): Promise<PendingLinkReview | null> {
  try {
    const content = await readFile(getPendingLinkReviewPath(session), 'utf8');
    return JSON.parse(content) as PendingLinkReview;
  } catch {
    return null;
  }
}

export async function writePendingLinkReview(
  session: SessionRecord,
  value: PendingLinkReview
): Promise<void> {
  await writeFile(
    getPendingLinkReviewPath(session),
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8'
  );
}

export async function clearPendingLinkReview(
  session: SessionRecord
): Promise<void> {
  await rm(getPendingLinkReviewPath(session), { force: true });
}
