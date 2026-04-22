import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { bootstrapApp } from '../src/cli/bootstrap.js';

const originalHome = process.env.HOME;

describe('bootstrap app', () => {
  let tempDir = '';

  afterEach(async () => {
    process.env.HOME = originalHome;

    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('adds a startup notice when legacy wiki topics are migrated', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-bootstrap-'));
    process.env.HOME = tempDir;

    const cwd = path.join(tempDir, 'project');
    await mkdir(cwd, { recursive: true });
    await mkdir(path.join(tempDir, '.config', 'taw', 'wiki', 'legacy-topic'), {
      recursive: true
    });
    await writeFile(
      path.join(tempDir, '.config', 'taw', 'wiki', 'legacy-topic', 'index.md'),
      '# Legacy Topic\n',
      'utf8'
    );

    const state = await bootstrapApp(cwd);

    const migratedEntry = state.transcript.find(
      (entry) => entry.title === 'Wiki Layout Migrated'
    );

    expect(migratedEntry?.body).toContain('Moved 1 topic folder');
    expect(migratedEntry?.body).toContain('legacy-topic');
  });
});
