import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSession } from '../src/core/sessions/session-manager.js';
import { buildPromptContext } from '../src/core/context/prompt-context.js';

const originalHome = process.env.HOME;

describe('prompt context', () => {
  let tempDir = '';

  afterEach(async () => {
    process.env.HOME = originalHome;

    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('includes project config, attachments, artifacts, and session summary when present', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-context-'));
    process.env.HOME = tempDir;
    const cwd = path.join(tempDir, 'project');
    await mkdir(path.join(cwd, '.ai'), { recursive: true });
    await writeFile(path.join(cwd, '.ai', 'config.json'), JSON.stringify({ projectName: 'project' }));
    const session = await createSession({ cwd });
    session.metadata.attachedDirs.push('/tmp/notes');
    session.metadata.artifacts.push({
      id: 'a1',
      type: 'brief',
      title: 'brief',
      path: '/tmp/brief.md',
      createdAt: new Date().toISOString()
    });
    await writeFile(session.summaryPath, '# Summary\n\nHello', 'utf8');

    const context = await buildPromptContext(session, {
      projectName: 'project',
      defaultAttachedDirs: [],
      preferredArtifactOutputs: ['artifacts'],
      promptOverrides: {}
    });

    expect(context).toContain('Project Config');
    expect(context).toContain('/tmp/notes');
    expect(context).toContain('/tmp/brief.md');
    expect(context).toContain('# Summary');
  });
});
