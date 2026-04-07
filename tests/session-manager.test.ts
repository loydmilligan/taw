import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSession } from '../src/core/sessions/session-manager.js';

const originalHome = process.env.HOME;

describe('session manager', () => {
  let tempDir = '';

  afterEach(async () => {
    process.env.HOME = originalHome;

    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('creates a general session under the user config dir when no project is initialized', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-general-'));
    process.env.HOME = tempDir;
    const cwd = path.join(tempDir, 'workspace');
    await writeFile(path.join(tempDir, 'placeholder.txt'), 'x');
    await writeFile(path.join(tempDir, '.keep'), 'x');
    await rm(cwd, { recursive: true, force: true }).catch(() => undefined);
    await writeFile(path.join(tempDir, 'workspace-marker'), 'x');
    await rm(path.join(tempDir, 'workspace-marker'));
    await import('node:fs/promises').then(({ mkdir }) => mkdir(cwd, { recursive: true }));

    const session = await createSession({ cwd });

    expect(session.storageMode).toBe('general');
    expect(session.sessionDir).toContain(path.join(tempDir, '.config', 'taw', 'sessions'));
    const sessionJson = JSON.parse(await readFile(session.sessionJsonPath, 'utf8'));
    expect(sessionJson.cwdAtLaunch).toBe(cwd);
  });

  it('creates a project session under .ai/sessions when the project is initialized', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-project-'));
    process.env.HOME = tempDir;
    const cwd = path.join(tempDir, 'project');
    await import('node:fs/promises').then(({ mkdir }) => mkdir(path.join(cwd, '.ai'), { recursive: true }));
    await writeFile(
      path.join(cwd, '.ai', 'config.json'),
      JSON.stringify({ projectName: 'project' }, null, 2)
    );

    const session = await createSession({ cwd });

    expect(session.storageMode).toBe('project');
    expect(session.sessionDir).toContain(path.join(cwd, '.ai', 'sessions'));
  });
});
