import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createBridgeServer } from '../src/bridge/server.js';
import { ensureBridgeToken } from '../src/bridge/token.js';

const originalHome = process.env.HOME;

describe('bridge server', () => {
  let tempDir = '';

  afterEach(async () => {
    process.env.HOME = originalHome;

    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('creates a stable token file', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-bridge-token-'));
    process.env.HOME = tempDir;

    const tokenA = await ensureBridgeToken();
    const tokenB = await ensureBridgeToken();

    expect(tokenA).toBe(tokenB);
    expect(
      (
        await readFile(
          path.join(tempDir, '.config', 'taw', 'bridge-token'),
          'utf8'
        )
      ).trim()
    ).toBe(tokenA);
  });

  it('accepts authenticated new-research requests and writes a payload file', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-bridge-server-'));
    process.env.HOME = tempDir;
    let launchedWindowName = '';

    const server = createBridgeServer({
      token: 'test-token',
      defaultCwd: tempDir,
      launch: async (payloadPath, cwd, windowName) => {
        launchedWindowName = windowName;
        return {
          launchMethod: 'manual',
          command: `${cwd}:${payloadPath}`
        };
      }
    });

    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve)
    );
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected TCP bridge server address.');
    }

    const response = await fetch(
      `http://127.0.0.1:${address.port}/session/new-research`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-taw-token': 'test-token'
        },
        body: JSON.stringify({
          payload: {
            kind: 'article',
            researchType: 'politics',
            url: 'https://example.com',
            title: 'Example',
            selectedText: 'selected',
            pageTextExcerpt: 'excerpt',
            userNote: 'note',
            sentAt: new Date().toISOString(),
            initialQuestion: 'why'
          }
        })
      }
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      payloadPath: string;
      launchMethod: string;
    };
    expect(body.launchMethod).toBe('manual');
    expect(await readFile(body.payloadPath, 'utf8')).toContain(
      '"title": "Example"'
    );
    expect(launchedWindowName).toBe('taw: Example');

    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  });

  it('returns search-backend status and start responses', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-bridge-search-'));
    process.env.HOME = tempDir;

    const searchBackend = {
      async getStatus() {
        return {
          enabled: true,
          dockerAvailable: true,
          running: false,
          healthy: false,
          autoStart: true,
          baseUrl: 'http://127.0.0.1:8080',
          composeFile: '/tmp/docker-compose.yml',
          serviceName: 'searxng',
          idleMinutes: 45,
          autoStopAt: null,
          lastError: null
        };
      },
      async start() {
        return {
          enabled: true,
          dockerAvailable: true,
          running: true,
          healthy: true,
          autoStart: true,
          baseUrl: 'http://127.0.0.1:8080',
          composeFile: '/tmp/docker-compose.yml',
          serviceName: 'searxng',
          idleMinutes: 45,
          autoStopAt: '2026-01-01T00:00:00.000Z',
          lastError: null
        };
      },
      async stop() {
        return this.getStatus();
      },
      async touch() {
        return this.start();
      }
    };

    const server = createBridgeServer({
      token: 'test-token',
      defaultCwd: tempDir,
      searchBackend
    });

    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve)
    );
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected TCP bridge server address.');
    }

    const statusResponse = await fetch(
      `http://127.0.0.1:${address.port}/search-backend/status`,
      {
        headers: {
          'x-taw-token': 'test-token'
        }
      }
    );
    expect(statusResponse.status).toBe(200);
    const statusBody = (await statusResponse.json()) as {
      status: { running: boolean };
    };
    expect(statusBody.status.running).toBe(false);

    const startResponse = await fetch(
      `http://127.0.0.1:${address.port}/search-backend/start`,
      {
        method: 'POST',
        headers: {
          'x-taw-token': 'test-token'
        }
      }
    );
    expect(startResponse.status).toBe(200);
    const startBody = (await startResponse.json()) as {
      status: { healthy: boolean };
    };
    expect(startBody.status.healthy).toBe(true);

    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  });
});
