import { updateSessionMetadata } from '../core/sessions/session-manager.js';
import { createId } from '../utils/ids.js';
import type { CommandDefinition } from './types.js';

const PHASE1_ENTRY = [
  'Explore the idea space. Share your concept, problem, or question — stream of consciousness is welcome here.',
  '',
  'I will ask questions, surface angles you may not have considered, and identify what is still unknown. When I have enough to map the space, I will suggest moving to Phase 2.',
  '',
  'Say "map it" or /brainstorm phase2 to move to Phase 2 at any time.'
].join('\n');

const PHASE2_ENTRY = [
  'Building your exploration map. I will present a structured skeleton and guide you through filling it in with targeted questions.',
  '',
  'Say "back to phase 1" or /brainstorm phase1 to revisit an area.',
  'Say "done" or use /finalize when the map is ready to save.'
].join('\n');

const PHASE1_RETURN = [
  'Back in Discovery mode. The mapping work above is preserved — I will keep it in view while we explore the missing area.'
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
      return {
        session: context.session,
        mode: 'Brainstorm',
        phase: 'idle',
        entries: [
          {
            id: createId('brainstorm'),
            kind: 'notice',
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
