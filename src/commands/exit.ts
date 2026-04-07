import { createId } from '../utils/ids.js';
import type { CommandDefinition } from './types.js';

export const exitCommand: CommandDefinition = {
  name: 'exit',
  description: 'Exit TAW gracefully.',
  usage: '/exit',
  async run() {
    return {
      shouldExit: true,
      entries: [
        {
          id: createId('exit'),
          kind: 'notice',
          title: 'Exiting',
          body: 'Closing TAW.'
        }
      ]
    };
  }
};
