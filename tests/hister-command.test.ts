import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSession } from '../src/core/sessions/session-manager.js';
import { histerCommand } from '../src/commands/hister.js';
import { globalConfigSchema } from '../src/services/config/schema.js';
import { searchAndFetchHisterPages } from '../src/services/wiki/hister-ingest.js';
import { reindexHister } from '../src/services/hister/client.js';
import { APP_VERSION } from '../src/version.js';
import { statusCommand } from '../src/commands/status.js';

vi.mock('../src/services/wiki/hister-ingest.js', () => ({
  buildHisterIngestMaterial: vi.fn(),
  searchAndFetchHisterPages: vi.fn()
}));

vi.mock('../src/services/hister/client.js', () => ({
  searchHister: vi.fn(),
  addToHister: vi.fn(),
  reindexHister: vi.fn()
}));

const originalHome = process.env.HOME;

describe('hister command', () => {
  let tempDir = '';

  afterEach(async () => {
    process.env.HOME = originalHome;
    vi.resetAllMocks();

    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('imports fetched hister pages as research sources', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-hister-command-'));
    process.env.HOME = tempDir;
    const cwd = path.join(tempDir, 'project');
    await mkdir(path.join(cwd, '.ai'), { recursive: true });
    await writeFile(
      path.join(cwd, '.ai', 'config.json'),
      JSON.stringify({ projectName: 'project' })
    );
    const session = await createSession({ cwd });

    vi.mocked(searchAndFetchHisterPages).mockResolvedValue({
      ok: true,
      query: 'claude code',
      matchedCount: 1,
      pages: [
        {
          title: 'Claude Code Docs',
          url: 'https://example.com/claude',
          content: 'Agent teams and tool use.'
        }
      ]
    });

    const result = await histerCommand.run(
      {
        name: 'hister',
        args: ['search', 'claude code'],
        raw: '/hister search "claude code"'
      },
      {
        cwd,
        session,
        transcript: [],
        providerConfig: { provider: 'openrouter', model: 'openrouter/auto' },
        mode: 'General',
        globalConfig: {
          ...globalConfigSchema.parse({}),
          hister: { enabled: true, baseUrl: 'http://localhost:4433' },
          providers: { openrouter: {}, openai: {}, anthropic: {} }
        },
        projectConfig: null
      }
    );

    expect(result.entries[0]?.title).toBe('Hister Search Results');
    expect(result.entries[0]?.body).toContain('1. Claude Code Docs');
    expect(result.entries[0]?.body).toContain('/open-source 1');
  });

  it('runs hister reindex from the command surface', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-hister-command-'));
    process.env.HOME = tempDir;
    const cwd = path.join(tempDir, 'project');
    await mkdir(path.join(cwd, '.ai'), { recursive: true });
    await writeFile(
      path.join(cwd, '.ai', 'config.json'),
      JSON.stringify({ projectName: 'project' })
    );
    const session = await createSession({ cwd });

    vi.mocked(reindexHister).mockResolvedValue({ ok: true });

    const result = await histerCommand.run(
      {
        name: 'hister',
        args: ['reindex'],
        raw: '/hister reindex'
      },
      {
        cwd,
        session,
        transcript: [],
        providerConfig: { provider: 'openrouter', model: 'openrouter/auto' },
        mode: 'General',
        globalConfig: {
          ...globalConfigSchema.parse({}),
          hister: { enabled: true, baseUrl: 'http://localhost:4433' },
          providers: { openrouter: {}, openai: {}, anthropic: {} }
        },
        projectConfig: null
      }
    );

    expect(result.entries[0]?.title).toBe('Hister Reindex Started');
  });

  it('includes the shared app version in /status', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-hister-command-'));
    process.env.HOME = tempDir;
    const cwd = path.join(tempDir, 'project');
    await mkdir(path.join(cwd, '.ai'), { recursive: true });
    await writeFile(
      path.join(cwd, '.ai', 'config.json'),
      JSON.stringify({ projectName: 'project' })
    );
    const session = await createSession({ cwd });

    const result = await statusCommand.run(
      { name: 'status', args: [], raw: '/status' },
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

    expect(result.entries[0]?.body).toContain(`Version: ${APP_VERSION}`);
  });
});
