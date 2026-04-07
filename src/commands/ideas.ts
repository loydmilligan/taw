import { loadFeedback, renderFeedbackMarkdown } from '../core/feedback/store.js';
import { createId } from '../utils/ids.js';
import type { CommandDefinition } from './types.js';

export const ideasCommand: CommandDefinition = {
  name: 'ideas',
  description: 'Render captured feature ideas as markdown.',
  usage: '/ideas',
  async run(_input, context) {
    const entries = await loadFeedback('idea', context.session);

    return {
      entries: [
        {
          id: createId('ideas'),
          kind: 'notice',
          title: 'Ideas',
          body: renderFeedbackMarkdown('idea', entries)
        }
      ]
    };
  }
};
