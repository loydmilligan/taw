import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ensureAssistantReferenceFiles } from '../src/core/context/assistant-files.js';
import { createSession } from '../src/core/sessions/session-manager.js';

const originalHome = process.env.HOME;

describe('assistant reference files', () => {
  let tempDir = '';

  afterEach(async () => {
    process.env.HOME = originalHome;

    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('writes COMMANDS.md for project sessions', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-assistant-'));
    process.env.HOME = tempDir;
    const cwd = path.join(tempDir, 'project');
    await rm(cwd, { recursive: true, force: true }).catch(() => undefined);
    await import('node:fs/promises').then(({ mkdir }) => mkdir(path.join(cwd, '.ai'), { recursive: true }));
    await writeFile(path.join(cwd, '.ai', 'config.json'), JSON.stringify({ projectName: 'project' }));

    const session = await createSession({ cwd });
    await ensureAssistantReferenceFiles(cwd, session, [
      {
        name: 'status',
        description: 'Show status.',
        usage: '/status',
        run: async () => ({ entries: [] })
      }
    ]);

    const content = await readFile(path.join(cwd, '.ai', 'assistant', 'COMMANDS.md'), 'utf8');
    expect(content).toContain('/status');
  });
});
