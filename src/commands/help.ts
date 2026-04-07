import type { CommandDefinition } from './types.js';
import { createId } from '../utils/ids.js';

export function createHelpCommand(commands: CommandDefinition[]): CommandDefinition {
  return {
    name: 'help',
    description: 'Show available commands and examples.',
    usage: '/help',
    async run() {
      const lines = commands.map((command) => `${command.usage}  ${command.description}`);

      return {
        entries: [
          {
            id: createId('help'),
            kind: 'notice',
            title: 'Command Help',
            body: lines.join('\n')
          }
        ]
      };
    }
  };
}
