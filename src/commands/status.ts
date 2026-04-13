import type { CommandContext, CommandDefinition } from './types.js';
import { createId } from '../utils/ids.js';
import { APP_VERSION } from '../version.js';

export const statusCommand: CommandDefinition = {
  name: 'status',
  description: 'Show session, storage, and attachment details.',
  usage: '/status',
  async run(_input, context: CommandContext) {
    const { session } = context;

    return {
      entries: [
        {
          id: createId('status'),
          kind: 'notice',
          title: 'Workspace Status',
          body: [
            `Version: ${APP_VERSION}`,
            `Mode: ${context.mode}`,
            `Storage: ${session.storageMode}`,
            `Session Dir: ${session.sessionDir}`,
            `Attached Dirs: ${session.metadata.attachedDirs.length ? session.metadata.attachedDirs.join(', ') : 'none'}`,
            `Artifacts: ${session.metadata.artifacts.length}`,
            `Provider: ${session.metadata.provider} / ${session.metadata.model}`
          ].join('\n')
        }
      ]
    };
  }
};
