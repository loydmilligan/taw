import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSession } from '../src/core/sessions/session-manager.js';
import { wikiCommand } from '../src/commands/wiki.js';
import { globalConfigSchema } from '../src/services/config/schema.js';
import { initWiki } from '../src/services/wiki/manager.js';
import { searchHister } from '../src/services/hister/client.js';

vi.mock('../src/services/hister/client.js', () => ({
  searchHister: vi.fn(),
  addToHister: vi.fn()
}));

const originalHome = process.env.HOME;
const originalFetch = global.fetch;

describe('wiki command', () => {
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

  it('previews Hister results by default before ingesting', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-wiki-command-'));
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

    const result = await wikiCommand.run(
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

    expect(result.mode).toBeUndefined();
    expect(result.entries[0]?.title).toBe('Wiki Ingest Hister Preview');
    expect(result.entries[0]?.body).toContain('No content has been fetched or ingested yet.');
    expect(result.entries[0]?.body).toContain('--yes');
  });

  it('queues wiki ingest from fetched Hister pages after confirmation', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-wiki-command-'));
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

    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        '<html><head><title>Claude Code Documentation</title></head><body><main><h1>Claude Code</h1><p>Agentic coding workflow details.</p><p>Tool use and review loops.</p></main></body></html>',
        {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' }
        }
      )
    ) as typeof fetch;

    const result = await wikiCommand.run(
      {
        name: 'wiki',
        args: [
          'ingest-hister',
          'vibecoding',
          'claude code documentation',
          '--yes'
        ],
        raw: '/wiki ingest-hister vibecoding "claude code documentation" --yes'
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

    expect(result.mode).toBe('Wiki Ingest:vibecoding');
    expect(result.entries[0]?.title).toBe('Wiki Ingest — Auto Mode');
    expect(result.entries[0]?.body).toContain(
      'Hister query "claude code documentation" (1/1 pages fetched)'
    );
    expect(result.queuedInputs?.[0]).toContain('## Hister Query');
    expect(result.queuedInputs?.[0]).toContain('Claude Code Documentation');
    expect(result.queuedInputs?.[0]).toContain('Agentic coding workflow details.');
    expect(result.queuedInputs?.[0]).toContain(
      'Start with totals for notes created and notes updated'
    );
  });

  it('requires Hister to be enabled for ingest-hister', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-wiki-command-'));
    process.env.HOME = tempDir;
    const cwd = path.join(tempDir, 'project');
    await mkdir(path.join(cwd, '.ai'), { recursive: true });
    await writeFile(
      path.join(cwd, '.ai', 'config.json'),
      JSON.stringify({ projectName: 'project' })
    );
    const session = await createSession({ cwd });
    await initWiki('vibecoding');

    const result = await wikiCommand.run(
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
          providers: { openrouter: {}, openai: {}, anthropic: {} }
        },
        projectConfig: null
      }
    );

    expect(result.mode).toBeUndefined();
    expect(result.entries[0]?.title).toBe('Hister Disabled');
  });
});
