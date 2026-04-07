import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/services/config/loader.js';

const originalHome = process.env.HOME;

describe('config loader', () => {
  let tempDir = '';

  afterEach(async () => {
    process.env.HOME = originalHome;

    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('loads global config and lets project config override provider and model', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-config-'));
    process.env.HOME = tempDir;
    const cwd = path.join(tempDir, 'project');
    await mkdir(path.join(tempDir, '.config', 'taw'), { recursive: true });
    await mkdir(path.join(cwd, '.ai'), { recursive: true });
    await writeFile(
      path.join(tempDir, '.config', 'taw', 'config.json'),
      JSON.stringify({
        defaultProvider: 'openrouter',
        defaultModel: 'openrouter/auto',
        providers: {
          openrouter: { apiKey: 'router-key' },
          openai: {},
          anthropic: {}
        }
      })
    );
    await writeFile(
      path.join(cwd, '.ai', 'config.json'),
      JSON.stringify({
        projectName: 'project',
        provider: 'openai',
        model: 'gpt-4o-mini'
      })
    );

    const config = await loadConfig(cwd);

    expect(config.providerConfig.provider).toBe('openai');
    expect(config.providerConfig.model).toBe('gpt-4o-mini');
  });
});
