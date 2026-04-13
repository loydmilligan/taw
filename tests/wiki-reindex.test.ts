import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSession } from '../src/core/sessions/session-manager.js';
import { wikiCommand } from '../src/commands/wiki.js';
import { confirmCommand } from '../src/commands/confirm.js';
import { cancelCommand } from '../src/commands/cancel.js';
import { globalConfigSchema } from '../src/services/config/schema.js';
import { initWiki, writeWikiPage } from '../src/services/wiki/manager.js';

const originalHome = process.env.HOME;

describe('wiki reindex', () => {
  let tempDir = '';

  async function createWikiContext() {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-wiki-reindex-'));
    process.env.HOME = tempDir;
    const cwd = path.join(tempDir, 'project');
    await mkdir(path.join(cwd, '.ai'), { recursive: true });
    await writeFile(
      path.join(cwd, '.ai', 'config.json'),
      JSON.stringify({ projectName: 'project' })
    );
    const session = await createSession({ cwd });
    await initWiki('vibecoding');

    return {
      cwd,
      session,
      transcript: [],
      providerConfig: { provider: 'openrouter', model: 'openrouter/auto' as const },
      mode: 'General',
      globalConfig: {
        ...globalConfigSchema.parse({}),
        providers: { openrouter: {}, openai: {}, anthropic: {} }
      },
      projectConfig: null
    };
  }

  afterEach(async () => {
    process.env.HOME = originalHome;
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('stages and applies an index rebuild for pending notes', async () => {
    const context = await createWikiContext();

    await writeWikiPage(
      'vibecoding',
      'pages/entities/claude-code.md',
      [
        '---',
        'title: Claude Code',
        'aliases: []',
        'type: entity',
        'link_review_status: reviewed',
        'link_reviewed_at: 2026-04-12',
        'index_status: pending',
        'indexed_at: null',
        '---',
        '',
        '# Claude Code',
        '',
        'Claude Code is an agentic coding environment.'
      ].join('\n')
    );

    const review = await wikiCommand.run(
      {
        name: 'wiki',
        args: ['reindex', 'vibecoding'],
        raw: '/wiki reindex vibecoding'
      },
      context
    );

    expect(review.entries[0]?.title).toBe('Wiki Reindex Review — vibecoding');
    expect(review.entries[0]?.body).toContain('Reviewed 1 pending note');

    const confirmed = await confirmCommand.run(
      { name: 'confirm', args: [], raw: '/confirm' },
      context
    );

    expect(confirmed.entries[0]?.title).toBe('Wiki Reindex Applied');

    const indexContent = await readFile(
      path.join(tempDir, '.config', 'taw', 'wiki', 'vibecoding', 'index.md'),
      'utf8'
    );
    expect(indexContent).toContain('[Claude Code](pages/entities/claude-code.md)');

    const entityContent = await readFile(
      path.join(
        tempDir,
        '.config',
        'taw',
        'wiki',
        'vibecoding',
        'pages',
        'entities',
        'claude-code.md'
      ),
      'utf8'
    );
    expect(entityContent).toContain('index_status: indexed');
  });

  it('cancels a pending index review', async () => {
    const context = await createWikiContext();

    await writeWikiPage(
      'vibecoding',
      'pages/entities/claude-code.md',
      [
        '---',
        'title: Claude Code',
        'aliases: []',
        'type: entity',
        'link_review_status: reviewed',
        'link_reviewed_at: 2026-04-12',
        'index_status: pending',
        'indexed_at: null',
        '---',
        '',
        '# Claude Code',
        '',
        'Claude Code is an agentic coding environment.'
      ].join('\n')
    );

    await wikiCommand.run(
      {
        name: 'wiki',
        args: ['reindex', 'vibecoding'],
        raw: '/wiki reindex vibecoding'
      },
      context
    );

    const cancelled = await cancelCommand.run(
      { name: 'cancel', args: [], raw: '/cancel' },
      context
    );

    expect(cancelled.entries[0]?.title).toBe('Pending Wiki Reindex Cancelled');

    const indexContent = await readFile(
      path.join(tempDir, '.config', 'taw', 'wiki', 'vibecoding', 'index.md'),
      'utf8'
    );
    expect(indexContent).not.toContain('[Claude Code](pages/entities/claude-code.md)');
  });
});
