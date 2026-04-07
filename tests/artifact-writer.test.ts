import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSession } from '../src/core/sessions/session-manager.js';
import { createArtifact } from '../src/core/artifacts/writer.js';

const originalHome = process.env.HOME;

describe('artifact writer', () => {
  let tempDir = '';

  afterEach(async () => {
    process.env.HOME = originalHome;

    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('writes markdown artifacts and records them in session metadata', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-artifact-'));
    process.env.HOME = tempDir;
    const cwd = path.join(tempDir, 'workspace');
    await import('node:fs/promises').then(({ mkdir }) => mkdir(cwd, { recursive: true }));
    const session = await createSession({ cwd });

    const artifact = await createArtifact(session, {
      type: 'project-brief',
      title: 'project brief',
      content: '# Project Brief\n'
    });

    expect(artifact.path).toContain(session.artifactsDir);
    expect(await readFile(artifact.path, 'utf8')).toContain('# Project Brief');
    const sessionJson = JSON.parse(await readFile(session.sessionJsonPath, 'utf8'));
    expect(sessionJson.artifacts).toHaveLength(1);
  });
});
