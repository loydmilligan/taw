import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSession } from '../src/core/sessions/session-manager.js';
import { buildPromptContext } from '../src/core/context/prompt-context.js';
import { ensureAssistantReferenceFiles } from '../src/core/context/assistant-files.js';

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
    await ensureAssistantReferenceFiles(cwd, session, []);
    await writeFile(
      path.join(cwd, '.ai', 'assistant', 'USER.md'),
      '# USER\n\n## Preferences\n\n- Prefers Python for small automation tasks.\n',
      'utf8'
    );
    await writeFile(
      path.join(cwd, '.ai', 'assistant', 'MEMORY.md'),
      '# MEMORY\n\n## Decisions\n\n- Keep TAW focused on planning and workflow review.\n',
      'utf8'
    );
    await ensureAssistantReferenceFiles(cwd, session, []);

    const context = await buildPromptContext(session, {
      projectName: 'project',
      defaultAttachedDirs: [],
      preferredArtifactOutputs: ['artifacts'],
      promptOverrides: {}
    }, 'Can you help with Python workflow planning?');

    expect(context).toContain('Project Config');
    expect(context).toContain('/tmp/notes');
    expect(context).toContain('/tmp/brief.md');
    expect(context).toContain('# Summary');
    expect(context).toContain('Global Agent Rules');
    expect(context).toContain('Project User Summary');
    expect(context).toContain('Relevant User Context');
    expect(context).toContain('Prefers Python');
    expect(context).toContain('Relevant Durable Memory');
    expect(context).toContain('planning and workflow review');
  });
});
