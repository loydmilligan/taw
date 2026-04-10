import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSession } from '../src/core/sessions/session-manager.js';
import { configCommand } from '../src/commands/config.js';
import { globalConfigSchema } from '../src/services/config/schema.js';

const originalHome = process.env.HOME;

describe('config command', () => {
  let tempDir = '';

  afterEach(async () => {
    process.env.HOME = originalHome;

    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('stores provider api keys in global config', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-config-command-'));
    process.env.HOME = tempDir;
    const cwd = path.join(tempDir, 'project');
    await mkdir(path.join(cwd, '.ai'), { recursive: true });
    await writeFile(
      path.join(cwd, '.ai', 'config.json'),
      JSON.stringify({ projectName: 'project' })
    );
    const session = await createSession({ cwd });

    await configCommand.run(
      {
        name: 'config',
        args: ['api-key', 'openrouter', 'sk-test'],
        raw: '/config api-key openrouter sk-test'
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

    const saved = await readFile(
      path.join(tempDir, '.config', 'taw', 'config.json'),
      'utf8'
    );
    expect(saved).toContain('"apiKey": "sk-test"');
    expect(
      await readFile(path.join(tempDir, '.config', 'taw', '.env'), 'utf8')
    ).toContain('OPENROUTER_API_KEY=sk-test');
  });

  it('resolves model indexes from provider presets', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-config-command-'));
    process.env.HOME = tempDir;
    const cwd = path.join(tempDir, 'project');
    await mkdir(path.join(cwd, '.ai'), { recursive: true });
    await writeFile(
      path.join(cwd, '.ai', 'config.json'),
      JSON.stringify({ projectName: 'project' })
    );
    const session = await createSession({ cwd });

    const result = await configCommand.run(
      {
        name: 'config',
        args: ['model', '2'],
        raw: '/config model 2'
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

    expect(result.model).toBe('openai/gpt-4o-mini');
  });

  it('stores search backend idle timeout in global config', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-config-command-'));
    process.env.HOME = tempDir;
    const cwd = path.join(tempDir, 'project');
    await mkdir(path.join(cwd, '.ai'), { recursive: true });
    await writeFile(
      path.join(cwd, '.ai', 'config.json'),
      JSON.stringify({ projectName: 'project' })
    );
    const session = await createSession({ cwd });

    await configCommand.run(
      {
        name: 'config',
        args: ['search', 'idle-minutes', '90'],
        raw: '/config search idle-minutes 90'
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

    const saved = await readFile(
      path.join(tempDir, '.config', 'taw', 'config.json'),
      'utf8'
    );
    expect(saved).toContain('"idleMinutes": 90');
  });

  it('stores hosted search fallback setting in global config', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-config-command-'));
    process.env.HOME = tempDir;
    const cwd = path.join(tempDir, 'project');
    await mkdir(path.join(cwd, '.ai'), { recursive: true });
    await writeFile(
      path.join(cwd, '.ai', 'config.json'),
      JSON.stringify({ projectName: 'project' })
    );
    const session = await createSession({ cwd });

    await configCommand.run(
      {
        name: 'config',
        args: ['search', 'hosted-fallback', 'on'],
        raw: '/config search hosted-fallback on'
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

    const saved = await readFile(
      path.join(tempDir, '.config', 'taw', 'config.json'),
      'utf8'
    );
    expect(saved).toContain('"enabled": true');
  });

  it('stores budget warning thresholds in global config', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-config-command-'));
    process.env.HOME = tempDir;
    const cwd = path.join(tempDir, 'project');
    await mkdir(path.join(cwd, '.ai'), { recursive: true });
    await writeFile(
      path.join(cwd, '.ai', 'config.json'),
      JSON.stringify({ projectName: 'project' })
    );
    const session = await createSession({ cwd });

    await configCommand.run(
      {
        name: 'config',
        args: ['budget', 'high-turn', '0.02'],
        raw: '/config budget high-turn 0.02'
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

    const saved = await readFile(
      path.join(tempDir, '.config', 'taw', 'config.json'),
      'utf8'
    );
    expect(saved).toContain('"highTurnCostWarning": 0.02');
  });
});
