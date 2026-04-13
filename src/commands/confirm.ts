import { buildWikiMode, getWikiInfo } from '../services/wiki/manager.js';
import {
  buildHisterIngestMaterialFromResults
} from '../services/wiki/hister-ingest.js';
import {
  clearPendingWikiIngest,
  readPendingWikiIngest
} from '../services/wiki/pending-ingest.js';
import {
  applyPendingLinkReview,
  appendLinkReviewLog
} from '../services/wiki/link-review.js';
import {
  clearPendingLinkReview,
  readPendingLinkReview
} from '../services/wiki/pending-link-review.js';
import {
  applyPendingIndexReview,
  appendIndexReviewLog
} from '../services/wiki/reindex.js';
import {
  clearPendingIndexReview,
  readPendingIndexReview
} from '../services/wiki/pending-index-review.js';
import { createId } from '../utils/ids.js';
import type { CommandDefinition } from './types.js';

export const confirmCommand: CommandDefinition = {
  name: 'confirm',
  description: 'Confirm the currently pending preview action, if one exists.',
  usage: '/confirm',
  async run(_input, context) {
    const pending = await readPendingWikiIngest(context.session);
    const pendingLinkReview = await readPendingLinkReview(context.session);
    const pendingIndexReview = await readPendingIndexReview(context.session);

    if (!pending && !pendingLinkReview && !pendingIndexReview) {
      return {
        entries: [
          {
            id: createId('confirm-empty'),
            kind: 'error' as const,
            title: 'Nothing To Confirm',
            body: 'There is no pending wiki ingest preview, link review, or reindex review to confirm.'
          }
        ]
      };
    }

    if (pendingIndexReview) {
      await applyPendingIndexReview(pendingIndexReview);
      await appendIndexReviewLog(pendingIndexReview.topic, pendingIndexReview);
      await clearPendingIndexReview(context.session);

      return {
        entries: [
          {
            id: createId('confirm-index-review'),
            kind: 'notice' as const,
            title: 'Wiki Reindex Applied',
            body: [
              `Wiki: ${pendingIndexReview.topic}`,
              `Indexed ${pendingIndexReview.pendingNotes.length} pending note${pendingIndexReview.pendingNotes.length === 1 ? '' : 's'} and rewrote index.md.`
            ].join('\n')
          }
        ]
      };
    }

    if (pendingLinkReview) {
      await applyPendingLinkReview(pendingLinkReview);
      await appendLinkReviewLog(pendingLinkReview.topic, pendingLinkReview);
      await clearPendingLinkReview(context.session);

      return {
        entries: [
          {
            id: createId('confirm-link-review'),
            kind: 'notice' as const,
            title: 'Wiki Link Review Applied',
            body: [
              `Wiki: ${pendingLinkReview.topic}`,
              `Applied ${pendingLinkReview.proposals.length} staged link update${pendingLinkReview.proposals.length === 1 ? '' : 's'}.`
            ].join('\n')
          }
        ]
      };
    }

    const pendingIngest = pending;

    if (!pendingIngest) {
      return {
        entries: [
          {
            id: createId('confirm-empty-fallback'),
            kind: 'error' as const,
            title: 'Nothing To Confirm',
            body: 'There is no pending wiki ingest preview to confirm.'
          }
        ]
      };
    }

    if (pendingIngest.kind !== 'hister') {
      return {
        entries: [
          {
            id: createId('confirm-unsupported'),
            kind: 'error' as const,
            title: 'Unsupported Pending Action',
            body: `Pending action type "${pendingIngest.kind}" is not supported by /confirm.`
          }
        ]
      };
    }

    const ingest = await buildHisterIngestMaterialFromResults(
      pendingIngest.query,
      pendingIngest.results,
      context.globalConfig.hister
    );

    if (!ingest.ok) {
      return {
        entries: [
          {
            id: createId('confirm-failed'),
            kind: 'error' as const,
            title: 'Wiki Ingest Failed',
            body: ingest.error ?? 'Could not build wiki ingest material.'
          }
        ]
      };
    }

    await clearPendingWikiIngest(context.session);

    const mode = buildWikiMode(
      pendingIngest.review ? 'Stage' : 'Ingest',
      pendingIngest.topic
    );
    const prompt = [
      `Ingest the following material into the ${pendingIngest.topic} wiki.`,
      `Wiki directory: ${getWikiInfo(pendingIngest.topic).topicDir}`,
      '',
      `## Material To Ingest\n\n${ingest.material}`,
      '',
      'Follow the wiki schema and index already in your context.',
      'Use Obsidian-safe wikilinks that match the actual page filename slugs. Example: [[agentic-loops|Agentic Loops]], [[context-management|Context Management]], [[claude-code|Claude Code]].',
      'Before creating a new page, check the wiki index. If a page with the same path/name already exists, do not create a duplicate page.',
      'When updating an existing page with write_wiki_page, set overwrite to true. For new pages, leave overwrite false.',
      'Use write_wiki_page to create or update pages — one per entity, concept, or source.',
      'Update pages/overview.md, index.md, and append to log.md.',
      'Cross-link using [[slug|Display Text]] notation when the filename slug differs from the human-readable title. A good ingest touches 5-10 pages.',
      'When done, summarize what was written. Start with totals for notes created and notes updated, then list each page path and whether it was created or updated.'
    ].join('\n\n');

    return {
      mode,
      phase: 'idle' as const,
      queuedInputs: [prompt],
      entries: [
        {
          id: createId('confirm'),
          kind: 'notice' as const,
          title: pendingIngest.review
            ? 'Wiki Stage — Review Mode'
            : 'Wiki Ingest — Auto Mode',
          body: [
            `Wiki: ${pendingIngest.topic}`,
            `Source: ${ingest.sourceLabel}`,
            pendingIngest.review
              ? 'TAW will show you what it plans to add from the confirmed history pages. Review it, give feedback, then /finalize to execute.'
              : 'TAW is writing wiki pages now from the confirmed history pages.'
          ].join('\n')
        }
      ]
    };
  }
};
