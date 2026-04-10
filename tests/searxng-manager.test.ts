import { describe, expect, it, vi } from 'vitest';
import { globalConfigSchema } from '../src/services/config/schema.js';
import {
  SearxngManager,
  resolveSearxngSettings
} from '../src/services/search/searxng-manager.js';

describe('searxng manager', () => {
  it('resolves defaults from global config', () => {
    const settings = resolveSearxngSettings(globalConfigSchema.parse({}));

    expect(settings.enabled).toBe(true);
    expect(settings.autoStart).toBe(true);
    expect(settings.baseUrl).toBe('http://127.0.0.1:8080');
    expect(settings.serviceName).toBe('searxng');
    expect(settings.idleMinutes).toBe(45);
    expect(settings.composeFile).toContain('infra/docker-compose.yml');
  });

  it('starts the compose service and schedules idle shutdown metadata', async () => {
    const runCommand = vi.fn<
      (
        command: string,
        args: string[],
        cwd: string
      ) => Promise<{ stdout: string; stderr: string }>
    >(async (_command, args) => {
      if (args.join(' ') === 'compose version') {
        return { stdout: 'Docker Compose version', stderr: '' };
      }

      if (args.includes('up')) {
        return { stdout: '', stderr: '' };
      }

      if (args.includes('stop')) {
        return { stdout: '', stderr: '' };
      }

      if (args.includes('ps')) {
        return { stdout: 'searxng\n', stderr: '' };
      }

      throw new Error(`Unexpected docker args: ${args.join(' ')}`);
    });

    const manager = new SearxngManager(
      {
        enabled: true,
        autoStart: true,
        baseUrl: 'http://127.0.0.1:8080',
        composeFile: '/tmp/docker-compose.yml',
        serviceName: 'searxng',
        idleMinutes: 45
      },
      {
        runCommand,
        checkHealth: async () => true
      }
    );

    const status = await manager.start();

    expect(runCommand).toHaveBeenCalledWith(
      'docker',
      ['compose', 'version'],
      expect.any(String)
    );
    expect(runCommand).toHaveBeenCalledWith(
      'docker',
      ['compose', '-f', '/tmp/docker-compose.yml', 'up', '-d', 'searxng'],
      '/tmp'
    );
    expect(status.running).toBe(true);
    expect(status.healthy).toBe(true);
    expect(status.autoStopAt).not.toBeNull();

    await manager.stop();
  });
});
