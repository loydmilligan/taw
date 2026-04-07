import { loadFeedback, renderFeedbackMarkdown } from '../core/feedback/store.js';
import { createId } from '../utils/ids.js';
import type { CommandDefinition } from './types.js';

export const issuesCommand: CommandDefinition = {
  name: 'issues',
  description: 'Render captured issues as markdown.',
  usage: '/issues',
  async run(_input, context) {
    const entries = await loadFeedback('issue', context.session);

    return {
      entries: [
        {
          id: createId('issues'),
          kind: 'notice',
          title: 'Issues',
          body: renderFeedbackMarkdown('issue', entries)
        }
      ]
    };
  }
};
