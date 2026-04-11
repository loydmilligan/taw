import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSession } from '../src/core/sessions/session-manager.js';
import { openRouterKeyCommand } from '../src/commands/or-key.js';
import { globalConfigSchema } from '../src/services/config/schema.js';

const originalHome = process.env.HOME;
const originalManagementKey = process.env.OPENROUTER_MANAGEMENT_KEY;

describe('or-key command', () => {
  let tempDir = '';

  afterEach(async () => {
    process.env.HOME = originalHome;
    if (originalManagementKey == null) {
      delete process.env.OPENROUTER_MANAGEMENT_KEY;
    } else {
      process.env.OPENROUTER_MANAGEMENT_KEY = originalManagementKey;
    }
    vi.unstubAllGlobals();

    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('creates a managed key and writes it to the target env file', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-or-key-'));
    process.env.HOME = tempDir;
    process.env.OPENROUTER_MANAGEMENT_KEY = 'mgmt-key';
    const cwd = path.join(tempDir, 'project');
    await mkdir(path.join(cwd, '.ai'), { recursive: true });
    await writeFile(
      path.join(cwd, '.ai', 'config.json'),
      JSON.stringify({ projectName: 'project' })
    );
    const session = await createSession({ cwd });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          hash: 'hash-1234567890',
          label: 'sk-or-v1-abc...123',
          name: 'My App',
          disabled: false,
          limit: 5,
          limit_remaining: 5,
          limit_reset: 'monthly',
          usage: 0,
          created_at: '2026-04-10T00:00:00Z',
          updated_at: null,
          expires_at: null
        },
        key: 'sk-or-v1-secret'
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    const envPath = path.join(tempDir, 'apps', 'my-app', '.env');
    const result = await openRouterKeyCommand.run(
      {
        name: 'or-key',
        args: [
          'setup',
          'My App',
          envPath,
          'OPENROUTER_API_KEY',
          '5',
          'monthly'
        ],
        raw: `/or-key setup "My App" "${envPath}" OPENROUTER_API_KEY 5 monthly`
      },
      {
        cwd,
        session,
        transcript: [],
        providerConfig: { provider: 'openrouter', model: 'openrouter/auto' },
        mode: 'General',
        globalConfig: globalConfigSchema.parse({}),
        projectConfig: null
      }
    );

    expect(result.entries[0]?.title).toBe('OpenRouter Key Installed');
    expect(await readFile(envPath, 'utf8')).toContain(
      'OPENROUTER_API_KEY=sk-or-v1-secret'
    );
    expect(
      await readFile(
        path.join(tempDir, '.config', 'taw', 'openrouter-keys.json'),
        'utf8'
      )
    ).toContain('"appName": "My App"');
  });

  it('reports key status from registry and remote metadata', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-or-key-'));
    process.env.HOME = tempDir;
    process.env.OPENROUTER_MANAGEMENT_KEY = 'mgmt-key';
    const cwd = path.join(tempDir, 'project');
    await mkdir(path.join(cwd, '.ai'), { recursive: true });
    await writeFile(
      path.join(cwd, '.ai', 'config.json'),
      JSON.stringify({ projectName: 'project' })
    );
    const session = await createSession({ cwd });
    const envPath = path.join(tempDir, 'apps', 'my-app', '.env');
    await mkdir(path.dirname(envPath), { recursive: true });
    await writeFile(envPath, 'OPENROUTER_API_KEY=sk-or-v1-secret\n');
    await mkdir(path.join(tempDir, '.config', 'taw'), { recursive: true });
    await writeFile(
      path.join(tempDir, '.config', 'taw', 'openrouter-keys.json'),
      JSON.stringify([
        {
          appName: 'My App',
          targetEnvPath: envPath,
          envVarName: 'OPENROUTER_API_KEY',
          keyHash: 'hash-1234567890',
          keyLabel: 'sk-or-v1-abc...123',
          remoteName: 'My App',
          disabled: false,
          limit: 5,
          limitRemaining: 4.5,
          limitReset: 'monthly',
          usage: 0.5,
          createdAt: '2026-04-10T00:00:00Z',
          updatedAt: null,
          expiresAt: null,
          lastRotatedAt: null
        }
      ])
    );

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          hash: 'hash-1234567890',
          label: 'sk-or-v1-abc...123',
          name: 'My App',
          disabled: false,
          limit: 5,
          limit_remaining: 4.25,
          limit_reset: 'monthly',
          usage: 0.75,
          created_at: '2026-04-10T00:00:00Z',
          updated_at: '2026-04-10T01:00:00Z',
          expires_at: null
        }
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await openRouterKeyCommand.run(
      {
        name: 'or-key',
        args: ['status', 'My App'],
        raw: '/or-key status "My App"'
      },
      {
        cwd,
        session,
        transcript: [],
        providerConfig: { provider: 'openrouter', model: 'openrouter/auto' },
        mode: 'General',
        globalConfig: globalConfigSchema.parse({}),
        projectConfig: null
      }
    );

    expect(result.entries[0]?.title).toBe('OpenRouter Key Status');
    expect(result.entries[0]?.body).toContain('Limit Remaining: $4.250000');
    expect(result.entries[0]?.body).toContain('Env Present: yes');
  });
});
