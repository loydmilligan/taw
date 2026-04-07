import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CommandDefinition } from './types.js';
import { createId } from '../utils/ids.js';
import { ensureProjectAssistantReferenceFiles } from '../core/context/assistant-files.js';

const DEFAULT_PROJECT_CONFIG = {
  projectName: '',
  defaultAttachedDirs: [],
  preferredArtifactOutputs: ['artifacts'],
  promptOverrides: {}
};

export const initCommand: CommandDefinition = {
  name: 'init',
  description: 'Create local .ai project scaffolding in the current directory.',
  usage: '/init',
  async run(_input, context) {
    const aiDir = path.join(context.cwd, '.ai');
    const sessionsDir = path.join(aiDir, 'sessions');
    const assistantDir = path.join(aiDir, 'assistant');
    const configPath = path.join(aiDir, 'config.json');
    const created: string[] = [];

    await mkdir(aiDir, { recursive: true });
    await mkdir(sessionsDir, { recursive: true });
    await mkdir(assistantDir, { recursive: true });
    const { commandRegistry } = await import('./registry.js');
    await ensureProjectAssistantReferenceFiles(context.cwd, commandRegistry);

    created.push(
      '.ai/',
      '.ai/sessions/',
      '.ai/assistant/',
      '.ai/assistant/AGENTS.md',
      '.ai/assistant/SOUL.md',
      '.ai/assistant/USER.md',
      '.ai/assistant/USER.summary.md',
      '.ai/assistant/MEMORY.md',
      '.ai/assistant/MEMORY.summary.md',
      '.ai/assistant/COMMANDS.md'
    );

    try {
      await readFile(configPath, 'utf8');
    } catch {
      const config = {
        ...DEFAULT_PROJECT_CONFIG,
        projectName: path.basename(context.cwd)
      };

      await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
      created.push('.ai/config.json');
    }

    return {
      entries: [
        {
          id: createId('init'),
          kind: 'notice',
          title: 'Project Initialized',
          body: `Created or verified:\n${created.map((item) => `- ${item}`).join('\n')}`
        }
      ]
    };
  }
};
