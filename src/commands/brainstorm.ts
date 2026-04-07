import { updateSessionMetadata } from '../core/sessions/session-manager.js';
import { createId } from '../utils/ids.js';
import type { CommandDefinition } from './types.js';

export const brainstormCommand: CommandDefinition = {
  name: 'brainstorm',
  description: 'Enter planning mode and generate project-brief style output.',
  usage: '/brainstorm',
  async run(_input, context) {
    context.session.metadata.modeHistory.push('brainstorm');
    await updateSessionMetadata(context.session);

    return {
      session: context.session,
      mode: 'Brainstorm',
      entries: [
        {
          id: createId('brainstorm'),
          kind: 'notice',
          title: 'Brainstorm Mode',
          body:
            'Brainstorm mode is active. Describe the idea, constraints, and desired outcome. TAW will steer toward a project brief and save the markdown artifact automatically.'
        }
      ]
    };
  }
};
