import {
  clearPendingWikiIngest,
  readPendingWikiIngest
} from '../services/wiki/pending-ingest.js';
import {
  clearPendingLinkReview,
  readPendingLinkReview
} from '../services/wiki/pending-link-review.js';
import {
  clearPendingIndexReview,
  readPendingIndexReview
} from '../services/wiki/pending-index-review.js';
import { createId } from '../utils/ids.js';
import type { CommandDefinition } from './types.js';

export const cancelCommand: CommandDefinition = {
  name: 'cancel',
  description: 'Cancel the currently pending preview action, if one exists.',
  usage: '/cancel',
  async run(_input, context) {
    const pending = await readPendingWikiIngest(context.session);
    const pendingLinkReview = await readPendingLinkReview(context.session);
    const pendingIndexReview = await readPendingIndexReview(context.session);

    if (!pending && !pendingLinkReview && !pendingIndexReview) {
      return {
        entries: [
          {
            id: createId('cancel-empty'),
            kind: 'error' as const,
            title: 'Nothing To Cancel',
            body: 'There is no pending wiki ingest preview, link review, or reindex review to cancel.'
          }
        ]
      };
    }

    if (pendingIndexReview) {
      await clearPendingIndexReview(context.session);

      return {
        entries: [
          {
            id: createId('cancel-index-review'),
            kind: 'notice' as const,
            title: 'Pending Wiki Reindex Cancelled',
            body: `Discarded the staged reindex for "${pendingIndexReview.topic}".`
          }
        ]
      };
    }

    if (pendingLinkReview) {
      await clearPendingLinkReview(context.session);

      return {
        entries: [
          {
            id: createId('cancel-link-review'),
            kind: 'notice' as const,
            title: 'Pending Wiki Link Review Cancelled',
            body: `Discarded the staged link review for "${pendingLinkReview.topic}".`
          }
        ]
      };
    }

    const pendingIngest = pending;
    if (!pendingIngest) {
      return {
        entries: [
          {
            id: createId('cancel-empty-fallback'),
            kind: 'error' as const,
            title: 'Nothing To Cancel',
            body: 'There is no pending wiki ingest preview to cancel.'
          }
        ]
      };
    }

    await clearPendingWikiIngest(context.session);

    return {
      entries: [
          {
            id: createId('cancel'),
            kind: 'notice' as const,
            title: 'Pending Wiki Ingest Cancelled',
            body: `Cancelled the pending Hister ingest preview for "${pendingIngest.query}".`
          }
        ]
      };
  }
};
