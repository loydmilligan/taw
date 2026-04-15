import { updateSessionMetadata } from '../core/sessions/session-manager.js';
import { createId } from '../utils/ids.js';
import type { CommandDefinition } from './types.js';
import type { TranscriptEntry } from '../types/app.js';

/**
 * Extracts the current Phase 2 map state from the transcript to use as a
 * context anchor when the user navigates back to Phase 1. Returns null if
 * no meaningful map state is found.
 */
function extractMapAnchor(transcript: TranscriptEntry[]): string | null {
  // Find the most recent assistant message containing ## section headings
  // (i.e. a Phase 2 map response)
  const lastMapResponse = [...transcript]
    .reverse()
    .find(
      (e) =>
        e.kind === 'assistant' &&
        e.body != null &&
        /\n##\s/.test(e.body)
    );

  if (!lastMapResponse?.body) return null;

  // Strip the mode footer (─── divider and everything after it)
  const footerDivider = '─────────────────────────────────────────';
  const footerIndex = lastMapResponse.body.indexOf(footerDivider);
  const withoutFooter =
    footerIndex !== -1
      ? lastMapResponse.body.slice(0, footerIndex).trimEnd()
      : lastMapResponse.body;

  // Strip preamble before the first ## heading
  const headingMatch = withoutFooter.match(/\n(##\s)/);
  const sectionsOnly =
    headingMatch?.index !== undefined
      ? withoutFooter.slice(headingMatch.index).trimStart()
      : withoutFooter.trimStart().startsWith('##')
        ? withoutFooter.trimStart()
        : null;

  return sectionsOnly ?? null;
}

const PHASE1_ENTRY = [
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  'BRAINSTORM — Phase 1: Discovery',
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  'Explore the idea space. Share your concept, problem, or question — stream of consciousness is welcome.',
  'I will ask questions, surface angles you may not have considered, and identify what is still unknown.',
  'Available: "map it" to advance to Phase 2 | /exit-mode to leave brainstorm',
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
].join('\n');

const PHASE2_ENTRY = [
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  'BRAINSTORM — Phase 2: Mapping',
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  'Build the exploration map. I will present a skeleton and guide you through it with targeted questions.',
  'Answer as briefly or expansively as you like — your elaboration beyond the choice is the real signal.',
  'Available: "back to phase 1" to revisit | "done" or /finalize to save | /exit-mode to leave',
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
].join('\n');

const PHASE1_RETURN = [
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  'BRAINSTORM — Returning to Phase 1: Discovery',
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  'Back in Discovery mode. The mapping work is preserved — I will keep it in view while we explore further.',
  'Available: "map it" to return to Phase 2 | /exit-mode to leave brainstorm',
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
].join('\n');

export const brainstormCommand: CommandDefinition = {
  name: 'brainstorm',
  description: 'Enter brainstorm mode to explore and map ideas (Phase 1: Discovery).',
  usage: '/brainstorm [phase2|phase1]',
  async run(input, context) {
    const sub = input.args[0];

    if (sub === 'phase2') {
      return {
        session: context.session,
        mode: 'Brainstorm Phase 2',
        phase: 'idle',
        entries: [
          {
            id: createId('brainstorm'),
            kind: 'notice',
            title: 'Brainstorm — Phase 2: Mapping',
            body: PHASE2_ENTRY
          }
        ],
        queuedInputs: [
          'Based on our Phase 1 conversation, identify the session type and present the exploration map skeleton. Show each section with a one-line description of what it needs — leave content blank for now. Then ask your first mapping question to begin filling it in.'
        ]
      };
    }

    if (sub === 'phase1') {
      const mapAnchorBody = extractMapAnchor(context.transcript);

      return {
        session: context.session,
        mode: 'Brainstorm',
        phase: 'idle',
        entries: [
          ...(mapAnchorBody
            ? [
                {
                  id: createId('brainstorm-anchor'),
                  kind: 'notice' as const,
                  title: 'Context Anchor — Current Map State',
                  body: mapAnchorBody
                }
              ]
            : []),
          {
            id: createId('brainstorm'),
            kind: 'notice' as const,
            title: 'Brainstorm — Returning to Phase 1',
            body: PHASE1_RETURN
          }
        ]
      };
    }

    // Default: enter Phase 1
    context.session.metadata.modeHistory.push('brainstorm');
    await updateSessionMetadata(context.session);

    return {
      session: context.session,
      mode: 'Brainstorm',
      phase: 'idle',
      entries: [
        {
          id: createId('brainstorm'),
          kind: 'notice',
          title: 'Brainstorm — Phase 1: Discovery',
          body: PHASE1_ENTRY
        }
      ]
    };
  }
};
