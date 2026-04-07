import { stat } from 'node:fs/promises';
import path from 'node:path';
import { updateSessionMetadata } from '../core/sessions/session-manager.js';
import type { CommandDefinition } from './types.js';
import { createId } from '../utils/ids.js';

export const attachDirCommand: CommandDefinition = {
  name: 'attach-dir',
  description: 'Attach a directory to the current session context.',
  usage: '/attach-dir <path>',
  async run(input, context) {
    const target = input.args[0];

    if (!target) {
      return {
        entries: [
          {
            id: createId('attach-dir-missing'),
            kind: 'error',
            title: 'Missing Path',
            body: 'Usage: /attach-dir <path>'
          }
        ]
      };
    }

    const resolvedPath = path.resolve(context.cwd, target);

    try {
      const details = await stat(resolvedPath);

      if (!details.isDirectory()) {
        throw new Error('Not a directory');
      }
    } catch {
      return {
        entries: [
          {
            id: createId('attach-dir-invalid'),
            kind: 'error',
            title: 'Invalid Directory',
            body: `Could not attach ${resolvedPath}. Check the path and try again.`
          }
        ]
      };
    }

    if (!context.session.metadata.attachedDirs.includes(resolvedPath)) {
      context.session.metadata.attachedDirs.push(resolvedPath);
      await updateSessionMetadata(context.session);
    }

    return {
      session: context.session,
      entries: [
        {
          id: createId('attach-dir'),
          kind: 'notice',
          title: 'Directory Attached',
          body: resolvedPath
        }
      ]
    };
  }
};
