import { updateSessionMetadata } from '../core/sessions/session-manager.js';
import { createId } from '../utils/ids.js';
import type { CommandDefinition } from './types.js';

export const exitModeCommand: CommandDefinition = {
  name: 'exit-mode',
  description: 'Return to General mode without saving an artifact.',
  usage: '/exit-mode',
  async run(_input, context) {
    context.session.metadata.modeHistory.push('general');
    await updateSessionMetadata(context.session);

    return {
      mode: 'General',
      phase: 'idle',
      session: context.session,
      entries: [
        {
          id: createId('exit-mode'),
          kind: 'notice',
          title: 'Mode Exited',
          body: 'Returned to General mode.'
        }
      ]
    };
  }
};
