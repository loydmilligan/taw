import { generateSessionSummary } from '../core/summaries/summary-service.js';
import { createId } from '../utils/ids.js';
import type { CommandDefinition } from './types.js';

export const summarizeSessionCommand: CommandDefinition = {
  name: 'summarize-session',
  description: 'Write session-summary.md for the current session.',
  usage: '/summarize-session',
  async run(_input, context) {
    await generateSessionSummary(context.session, context.transcript, context.providerConfig);

    return {
      session: context.session,
      entries: [
        {
          id: createId('summary'),
          kind: 'notice',
          title: 'Session Summary Saved',
          body: context.session.summaryPath
        }
      ]
    };
  }
};
