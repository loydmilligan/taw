import { updateSessionMetadata } from '../core/sessions/session-manager.js';
import { createId } from '../utils/ids.js';
import type { CommandDefinition } from './types.js';

export const workflowCommand: CommandDefinition = {
  name: 'workflow',
  description: 'Enter workflow generate or review mode.',
  usage: '/workflow <generate|review>',
  async run(input, context) {
    const submode = input.args[0];

    if (submode !== 'generate' && submode !== 'review') {
      return {
        entries: [
          {
            id: createId('workflow-usage'),
            kind: 'error',
            title: 'Workflow Mode Usage',
            body: 'Usage: /workflow <generate|review>'
          }
        ]
      };
    }

    const mode = submode === 'review' ? 'Workflow Review' : 'Workflow Generate';
    context.session.metadata.modeHistory.push(`workflow-${submode}`);
    await updateSessionMetadata(context.session);

    return {
      session: context.session,
      mode,
      phase: 'idle',
      entries: [
        {
          id: createId('workflow'),
          kind: 'notice',
          title: mode,
          body:
            submode === 'review'
              ? 'Workflow review mode is active. Paste the workflow, symptoms, and constraints. TAW will analyze and iterate first. Use /finalize when you want to save the review artifact.'
              : 'Workflow generate mode is active. Describe the objective, actors, and constraints. TAW will design and refine first. Use /finalize when you want to save the workflow artifact.'
        }
      ]
    };
  }
};
