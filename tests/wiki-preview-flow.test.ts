import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSession } from '../src/core/sessions/session-manager.js';
import { wikiCommand } from '../src/commands/wiki.js';
import { confirmCommand } from '../src/commands/confirm.js';
import { cancelCommand } from '../src/commands/cancel.js';
import { globalConfigSchema } from '../src/services/config/schema.js';
import { initWiki, writeWikiPage } from '../src/services/wiki/manager.js';
import { searchHister } from '../src/services/hister/client.js';

vi.mock('../src/services/hister/client.js', () => ({
  searchHister: vi.fn(),
  addToHister: vi.fn(),
  reindexHister: vi.fn()
}));

const originalHome = process.env.HOME;
const originalFetch = global.fetch;

describe('wiki preview flow', () => {
  let tempDir = '';

  afterEach(async () => {
    process.env.HOME = originalHome;
    global.fetch = originalFetch;
    vi.resetAllMocks();

    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('confirms a pending hister preview without rerunning the search command', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-wiki-preview-'));
    process.env.HOME = tempDir;
    const cwd = path.join(tempDir, 'project');
    await mkdir(path.join(cwd, '.ai'), { recursive: true });
    await writeFile(
      path.join(cwd, '.ai', 'config.json'),
      JSON.stringify({ projectName: 'project' })
    );
    const session = await createSession({ cwd });
    await initWiki('vibecoding');

    vi.mocked(searchHister).mockResolvedValue({
      ok: true,
      results: [
        {
          title: 'Claude Code docs',
          url: 'https://example.com/claude-code'
        }
      ]
    });

    const preview = await wikiCommand.run(
      {
        name: 'wiki',
        args: ['ingest-hister', 'vibecoding', 'claude code documentation'],
        raw: '/wiki ingest-hister vibecoding "claude code documentation"'
      },
      {
        cwd,
        session,
        transcript: [],
        providerConfig: { provider: 'openrouter', model: 'openrouter/auto' },
        mode: 'General',
        globalConfig: {
          ...globalConfigSchema.parse({}),
          hister: {
            enabled: true,
            baseUrl: 'http://localhost:4433'
          },
          providers: { openrouter: {}, openai: {}, anthropic: {} }
        },
        projectConfig: null
      }
    );

    expect(preview.entries[0]?.title).toBe('Wiki Ingest Hister Preview');
    expect(searchHister).toHaveBeenCalledTimes(1);

    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        '<html><head><title>Claude Code Documentation</title></head><body><main><h1>Claude Code</h1><p>Agentic coding workflow details.</p></main></body></html>',
        {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' }
        }
      )
    ) as typeof fetch;

    const confirmed = await confirmCommand.run(
      { name: 'confirm', args: [], raw: '/confirm' },
      {
        cwd,
        session,
        transcript: [],
        providerConfig: { provider: 'openrouter', model: 'openrouter/auto' },
        mode: 'General',
        globalConfig: {
          ...globalConfigSchema.parse({}),
          hister: {
            enabled: true,
            baseUrl: 'http://localhost:4433'
          },
          providers: { openrouter: {}, openai: {}, anthropic: {} }
        },
        projectConfig: null
      }
    );

    expect(searchHister).toHaveBeenCalledTimes(1);
    expect(confirmed.mode).toBe('Wiki Ingest:vibecoding');
  });

  it('cancels a pending preview', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-wiki-preview-'));
    process.env.HOME = tempDir;
    const cwd = path.join(tempDir, 'project');
    await mkdir(path.join(cwd, '.ai'), { recursive: true });
    await writeFile(
      path.join(cwd, '.ai', 'config.json'),
      JSON.stringify({ projectName: 'project' })
    );
    const session = await createSession({ cwd });
    await initWiki('vibecoding');

    vi.mocked(searchHister).mockResolvedValue({
      ok: true,
      results: [
        {
          title: 'Claude Code docs',
          url: 'https://example.com/claude-code'
        }
      ]
    });

    await wikiCommand.run(
      {
        name: 'wiki',
        args: ['ingest-hister', 'vibecoding', 'claude code documentation'],
        raw: '/wiki ingest-hister vibecoding "claude code documentation"'
      },
      {
        cwd,
        session,
        transcript: [],
        providerConfig: { provider: 'openrouter', model: 'openrouter/auto' },
        mode: 'General',
        globalConfig: {
          ...globalConfigSchema.parse({}),
          hister: {
            enabled: true,
            baseUrl: 'http://localhost:4433'
          },
          providers: { openrouter: {}, openai: {}, anthropic: {} }
        },
        projectConfig: null
      }
    );

    const cancelled = await cancelCommand.run(
      { name: 'cancel', args: [], raw: '/cancel' },
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

    expect(cancelled.entries[0]?.title).toBe('Pending Wiki Ingest Cancelled');
  });

  it('rejects duplicate page creation unless overwrite is true', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-wiki-preview-'));
    process.env.HOME = tempDir;
    await initWiki('vibecoding');

    await writeWikiPage('vibecoding', 'pages/entities/claude-code.md', '# Claude Code');

    await expect(
      writeWikiPage('vibecoding', 'pages/entities/claude-code.md', '# New Claude Code')
    ).rejects.toThrow('Wiki page already exists');

    await expect(
      writeWikiPage(
        'vibecoding',
        'pages/entities/claude-code.md',
        '# Updated Claude Code',
        { overwrite: true }
      )
    ).resolves.toBeTruthy();

    const updated = await readFile(
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
    expect(updated).toContain('Updated Claude Code');
  });
});
