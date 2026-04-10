import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSession } from '../src/core/sessions/session-manager.js';
import { researchCommand } from '../src/commands/research.js';
import { globalConfigSchema } from '../src/services/config/schema.js';

const originalHome = process.env.HOME;

describe('research command', () => {
  let tempDir = '';

  afterEach(async () => {
    process.env.HOME = originalHome;

    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('enters typed research mode', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-research-'));
    process.env.HOME = tempDir;
    const cwd = path.join(tempDir, 'project');
    await mkdir(path.join(cwd, '.ai'), { recursive: true });
    await writeFile(
      path.join(cwd, '.ai', 'config.json'),
      JSON.stringify({ projectName: 'project' })
    );
    const session = await createSession({ cwd });

    const result = await researchCommand.run(
      {
        name: 'research',
        args: ['politics', 'norm', 'shifts'],
        raw: '/research politics norm shifts'
      },
      {
        cwd,
        session,
        transcript: [],
        providerConfig: { provider: 'openrouter', model: 'openrouter/auto' },
        mode: 'General',
        globalConfig: {
          ...globalConfigSchema.parse({}),
          providers: { openrouter: {}, openai: {}, anthropic: {} }
        },
        projectConfig: null
      }
    );

    expect(result.mode).toBe('Research Politics');
    expect(result.entries[0]?.title).toBe('Research Politics');
    expect(session.metadata.modeHistory.at(-1)).toBe('research-politics');
  });
});
