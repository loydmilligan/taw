import { captureFeedback } from '../core/feedback/store.js';
import { createId } from '../utils/ids.js';
import type { CommandDefinition } from './types.js';

export const captureIssueCommand: CommandDefinition = {
  name: 'capture-issue',
  description: 'Save a bug-like issue or product problem with recent chat context.',
  usage: '/capture-issue "<summary>" [note]',
  async run(input, context) {
    const summary = input.args[0];
    const note = input.args.slice(1).join(' ').trim() || null;

    if (!summary) {
      return {
        entries: [
          {
            id: createId('capture-issue-usage'),
            kind: 'error',
            title: 'Issue Capture Usage',
            body: 'Usage: /capture-issue "<summary>" [note]'
          }
        ]
      };
    }

    const entry = await captureFeedback(
      'issue',
      context.session,
      context.transcript,
      context.mode,
      summary,
      note
    );

    return {
      entries: [
        {
          id: createId('capture-issue'),
          kind: 'notice',
          title: 'Issue Captured',
          body: `Saved "${entry.summary}" with the latest user and assistant context.`
        }
      ]
    };
  }
};
