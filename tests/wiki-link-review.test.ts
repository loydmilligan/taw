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

describe('wiki link review', () => {
  let tempDir = '';

  async function createWikiContext() {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-wiki-link-review-'));
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

  it('stages and applies recent link updates', async () => {
    const context = await createWikiContext();

    await writeWikiPage(
      'vibecoding',
      'pages/entities/claude-code.md',
      [
        '---',
        'title: Claude Code',
        'aliases: []',
        'type: entity',
        '---',
        '',
        '# Claude Code',
        '',
        'Claude Code is an agentic coding tool.'
      ].join('\n')
    );

    await writeWikiPage(
      'vibecoding',
      'pages/sources/2026-04-12-claude-code-notes.md',
      [
        '---',
        'title: Claude Code Notes',
        'aliases: []',
        'type: source',
        'url: https://example.com/claude-code-notes',
        'link_review_status: pending',
        'link_reviewed_at: null',
        'index_status: pending',
        'indexed_at: null',
        '---',
        '',
        '# Claude Code Notes',
        '',
        'Claude Code can be extended with reusable skills and stronger context discipline.'
      ].join('\n')
    );

    const review = await wikiCommand.run(
      {
        name: 'wiki',
        args: ['links', 'vibecoding', 'recent'],
        raw: '/wiki links vibecoding recent'
      },
      context
    );

    expect(review.entries[0]?.title).toBe('Wiki Link Review — vibecoding');
    expect(review.entries[0]?.body).toContain('Proposed 2 link updates');

    const confirmed = await confirmCommand.run(
      { name: 'confirm', args: [], raw: '/confirm' },
      context
    );

    expect(confirmed.entries[0]?.title).toBe('Wiki Link Review Applied');

    const sourceContent = await readFile(
      path.join(
        tempDir,
        '.config',
        'taw',
        'wiki',
        'vibecoding',
        'pages',
        'sources',
        '2026-04-12-claude-code-notes.md'
      ),
      'utf8'
    );
    expect(sourceContent).toContain('[[claude-code|Claude Code]]');
    expect(sourceContent).toContain('link_review_status: reviewed');
    expect(sourceContent).toContain('index_status: pending');

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
    expect(entityContent).toContain('## See also');
    expect(entityContent).toContain(
      '[[2026-04-12-claude-code-notes|Claude Code Notes]]'
    );
  });

  it('cancels a pending link review', async () => {
    const context = await createWikiContext();

    await writeWikiPage(
      'vibecoding',
      'pages/entities/claude-code.md',
      [
        '---',
        'title: Claude Code',
        'aliases: []',
        'type: entity',
        '---',
        '',
        '# Claude Code',
        '',
        'Claude Code is an agentic coding tool.'
      ].join('\n')
    );

    await writeWikiPage(
      'vibecoding',
      'pages/sources/2026-04-12-claude-code-notes.md',
      [
        '---',
        'title: Claude Code Notes',
        'aliases: []',
        'type: source',
        'link_review_status: pending',
        'link_reviewed_at: null',
        'index_status: pending',
        'indexed_at: null',
        '---',
        '',
        '# Claude Code Notes',
        '',
        'Claude Code works well with skills.'
      ].join('\n')
    );

    await wikiCommand.run(
      {
        name: 'wiki',
        args: ['links', 'vibecoding', 'recent'],
        raw: '/wiki links vibecoding recent'
      },
      context
    );

    const cancelled = await cancelCommand.run(
      { name: 'cancel', args: [], raw: '/cancel' },
      context
    );

    expect(cancelled.entries[0]?.title).toBe('Pending Wiki Link Review Cancelled');

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
    expect(entityContent).not.toContain('## See also');
  });
});
