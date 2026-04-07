import { captureFeedback } from '../core/feedback/store.js';
import { createId } from '../utils/ids.js';
import type { CommandDefinition } from './types.js';

export const captureIdeaCommand: CommandDefinition = {
  name: 'capture-idea',
  description: 'Save a feature or improvement idea with recent chat context.',
  usage: '/capture-idea "<summary>" [note]',
  async run(input, context) {
    const summary = input.args[0];
    const note = input.args.slice(1).join(' ').trim() || null;

    if (!summary) {
      return {
        entries: [
          {
            id: createId('capture-idea-usage'),
            kind: 'error',
            title: 'Idea Capture Usage',
            body: 'Usage: /capture-idea "<summary>" [note]'
          }
        ]
      };
    }

    const entry = await captureFeedback(
      'idea',
      context.session,
      context.transcript,
      context.mode,
      summary,
      note
    );

    return {
      entries: [
        {
          id: createId('capture-idea'),
          kind: 'notice',
          title: 'Idea Captured',
          body: `Saved "${entry.summary}" with the latest user and assistant context.`
        }
      ]
    };
  }
};
