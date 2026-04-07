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

  it('writes assistant scaffolding and summaries for project sessions', async () => {
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

    const assistantDir = path.join(cwd, '.ai', 'assistant');
    const commands = await readFile(path.join(assistantDir, 'COMMANDS.md'), 'utf8');
    const agents = await readFile(path.join(assistantDir, 'AGENTS.md'), 'utf8');
    const userSummary = await readFile(path.join(assistantDir, 'USER.summary.md'), 'utf8');
    const memorySummary = await readFile(path.join(assistantDir, 'MEMORY.summary.md'), 'utf8');

    expect(commands).toContain('/status');
    expect(agents).toContain('terminal-native AI workspace');
    expect(userSummary).toContain('# USER Summary');
    expect(memorySummary).toContain('# MEMORY Summary');
  });

  it('regenerates summaries from raw user and memory files', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-assistant-'));
    process.env.HOME = tempDir;
    const cwd = path.join(tempDir, 'project');
    await rm(cwd, { recursive: true, force: true }).catch(() => undefined);
    await import('node:fs/promises').then(({ mkdir }) => mkdir(path.join(cwd, '.ai', 'assistant'), { recursive: true }));
    await writeFile(path.join(cwd, '.ai', 'config.json'), JSON.stringify({ projectName: 'project' }));
    await writeFile(
      path.join(cwd, '.ai', 'assistant', 'USER.md'),
      '# USER\n\n## Preferences\n\n- Prefers concise technical summaries.\n- Uses Python often.\n',
      'utf8'
    );
    await writeFile(
      path.join(cwd, '.ai', 'assistant', 'MEMORY.md'),
      '# MEMORY\n\n## Decisions\n\n- Keep the app markdown-first.\n- Avoid coding-agent behavior.\n',
      'utf8'
    );

    const session = await createSession({ cwd });
    await ensureAssistantReferenceFiles(cwd, session, []);

    const userSummary = await readFile(path.join(cwd, '.ai', 'assistant', 'USER.summary.md'), 'utf8');
    const memorySummary = await readFile(path.join(cwd, '.ai', 'assistant', 'MEMORY.summary.md'), 'utf8');

    expect(userSummary).toContain('## Preferences');
    expect(userSummary).toContain('Prefers concise technical summaries.');
    expect(memorySummary).toContain('## Decisions');
    expect(memorySummary).toContain('markdown-first');
  });
});
