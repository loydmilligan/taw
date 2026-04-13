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
      launch: async (input, cwd, windowName) => {
        launchedWindowName = windowName;
        return {
          launchMethod: 'manual',
          command: `${cwd}:${input.researchPayloadPath ?? input.queuedInputsPath}`
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

  it('lists wiki topics and launches a wiki ingest session', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-bridge-wiki-'));
    process.env.HOME = tempDir;
    let queuedInputsPath = '';
    let runQueuedAndExit = false;

    await import('node:fs/promises').then(({ mkdir, writeFile }) =>
      mkdir(path.join(tempDir, '.config', 'taw', 'wiki', 'vibecoding'), {
        recursive: true
      }).then(() =>
        writeFile(
          path.join(tempDir, '.config', 'taw', 'wiki', 'vibecoding', 'index.md'),
          '# index\n'
        )
      )
    );

    const server = createBridgeServer({
      token: 'test-token',
      defaultCwd: tempDir,
      launch: async (input) => {
        queuedInputsPath = input.queuedInputsPath ?? '';
        runQueuedAndExit = input.runQueuedAndExit === true;
        return {
          launchMethod: input.runQueuedAndExit ? 'background' : 'manual',
          command: input.queuedInputsPath ?? ''
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

    const topicsResponse = await fetch(
      `http://127.0.0.1:${address.port}/wiki/topics`,
      {
        headers: {
          'x-taw-token': 'test-token'
        }
      }
    );
    expect(topicsResponse.status).toBe(200);
    const topicsBody = (await topicsResponse.json()) as { topics: string[] };
    expect(topicsBody.topics).toContain('vibecoding');

    const ingestResponse = await fetch(
      `http://127.0.0.1:${address.port}/session/new-wiki-ingest`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-taw-token': 'test-token'
        },
        body: JSON.stringify({
          topic: 'vibecoding',
          pageTitle: 'Claude Code Docs',
          pageUrl: 'https://example.com',
          pageTextExcerpt: 'excerpt',
          selectedText: null,
          userNote: 'note',
          autoRun: true
        })
      }
    );
    expect(ingestResponse.status).toBe(200);
    expect(queuedInputsPath).toBeTruthy();
    expect(runQueuedAndExit).toBe(true);
    expect(await readFile(queuedInputsPath, 'utf8')).toContain(
      '/wiki ingest vibecoding'
    );

    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  });

  it('serves the mobile ingest page when the token is provided in the URL', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-bridge-mobile-'));
    process.env.HOME = tempDir;

    const server = createBridgeServer({
      token: 'test-token',
      defaultCwd: tempDir
    });

    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve)
    );
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected TCP bridge server address.');
    }

    const response = await fetch(
      `http://127.0.0.1:${address.port}/mobile?token=test-token`
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('TAW Mobile Ingest');

    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  });

  it('serves a manifest with android share target metadata', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-bridge-app-'));
    process.env.HOME = tempDir;

    const server = createBridgeServer({
      token: 'test-token',
      defaultCwd: tempDir
    });

    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve)
    );
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected TCP bridge server address.');
    }

    const response = await fetch(
      `http://127.0.0.1:${address.port}/app/manifest.webmanifest`
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      id: string;
      share_target?: { action: string; method: string };
      icons: Array<{ src: string; sizes: string; purpose: string }>;
    };
    expect(body.id).toBe('/app');
    expect(body.share_target?.action).toBe('/app/share');
    expect(body.share_target?.method).toBe('GET');
    expect(body.icons.some((icon) => icon.src === '/app/icon-192.png' && icon.sizes === '192x192')).toBe(true);
    expect(body.icons.some((icon) => icon.src === '/app/icon-512.png' && icon.sizes === '512x512')).toBe(true);
    expect(body.icons.some((icon) => icon.purpose.includes('maskable'))).toBe(true);

    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  });

  it('serves PNG app icons for android install metadata', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-bridge-app-'));
    process.env.HOME = tempDir;

    const server = createBridgeServer({
      token: 'test-token',
      defaultCwd: tempDir
    });

    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve)
    );
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected TCP bridge server address.');
    }

    const response = await fetch(
      `http://127.0.0.1:${address.port}/app/icon-192.png`
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  });

  it('redirects app share payloads into the app route', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-bridge-app-'));
    process.env.HOME = tempDir;

    const server = createBridgeServer({
      token: 'test-token',
      defaultCwd: tempDir
    });

    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve)
    );
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected TCP bridge server address.');
    }

    const response = await fetch(
      `http://127.0.0.1:${address.port}/app/share?url=https%3A%2F%2Fexample.com%2Fshared&text=hello`,
      { redirect: 'manual' }
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      '/app?text=hello&url=https%3A%2F%2Fexample.com%2Fshared'
    );

    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  });

  it('queues a mobile wiki ingest after capturing the pasted URL', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-bridge-mobile-'));
    process.env.HOME = tempDir;
    let queuedInputsPath = '';

    await import('node:fs/promises').then(({ mkdir, writeFile }) =>
      mkdir(path.join(tempDir, '.config', 'taw', 'wiki', 'vibecoding'), {
        recursive: true
      }).then(() =>
        writeFile(
          path.join(tempDir, '.config', 'taw', 'wiki', 'vibecoding', 'index.md'),
          '# index\n'
        )
      )
    );

    const server = createBridgeServer({
      token: 'test-token',
      defaultCwd: tempDir,
      capturePage: async (url) => ({
        pageTitle: `Captured ${url}`,
        pageTextExcerpt: 'Readable content from mobile capture.'
      }),
      launch: async (input) => {
        queuedInputsPath = input.queuedInputsPath ?? '';
        return {
          launchMethod: 'manual',
          command: input.queuedInputsPath ?? ''
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
      `http://127.0.0.1:${address.port}/session/new-mobile-wiki-ingest`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-taw-token': 'test-token'
        },
        body: JSON.stringify({
          topic: 'vibecoding',
          url: 'https://example.com/mobile',
          userNote: 'from phone',
          autoRun: false
        })
      }
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      pageTitle: string;
      sourceFilePath: string;
    };
    expect(body.pageTitle).toBe('Captured https://example.com/mobile');
    expect(await readFile(body.sourceFilePath, 'utf8')).toContain(
      'Readable content from mobile capture.'
    );
    expect(await readFile(queuedInputsPath, 'utf8')).toContain(
      '/wiki ingest vibecoding'
    );

    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  });

  it('bootstraps an app session and serves app state', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-bridge-app-'));
    process.env.HOME = tempDir;

    await import('node:fs/promises').then(({ mkdir, writeFile }) =>
      mkdir(path.join(tempDir, '.config', 'taw', 'wiki', 'vibecoding'), {
        recursive: true
      }).then(() =>
        writeFile(
          path.join(tempDir, '.config', 'taw', 'wiki', 'vibecoding', 'index.md'),
          '# index\n'
        )
      )
    );

    const server = createBridgeServer({
      token: 'test-token',
      defaultCwd: tempDir
    });

    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve)
    );
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected TCP bridge server address.');
    }

    const bootstrapResponse = await fetch(
      `http://127.0.0.1:${address.port}/app/api/bootstrap`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: 'test-token' })
      }
    );
    expect(bootstrapResponse.status).toBe(200);
    const cookie = bootstrapResponse.headers.get('set-cookie');
    expect(cookie).toContain('taw_app_session=');

    const stateResponse = await fetch(
      `http://127.0.0.1:${address.port}/app/api/state`,
      {
        headers: { cookie: cookie ?? '' }
      }
    );
    expect(stateResponse.status).toBe(200);
    const stateBody = (await stateResponse.json()) as {
      topics: string[];
    };
    expect(stateBody.topics).toContain('vibecoding');

    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  });

  it('submits a research inbox capture through the app api', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-bridge-app-'));
    process.env.HOME = tempDir;
    let researchPayloadPath = '';

    const server = createBridgeServer({
      token: 'test-token',
      defaultCwd: tempDir,
      capturePage: async (url) => ({
        pageTitle: `Captured ${url}`,
        pageTextExcerpt: 'Readable research capture.'
      }),
      launch: async (input) => {
        researchPayloadPath = input.researchPayloadPath ?? '';
        return {
          launchMethod: 'manual',
          command: input.researchPayloadPath ?? ''
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

    const bootstrapResponse = await fetch(
      `http://127.0.0.1:${address.port}/app/api/bootstrap`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: 'test-token' })
      }
    );
    const cookie = bootstrapResponse.headers.get('set-cookie') ?? '';

    const captureResponse = await fetch(
      `http://127.0.0.1:${address.port}/app/api/capture-url`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie
        },
        body: JSON.stringify({ url: 'https://example.com/research' })
      }
    );
    expect(captureResponse.status).toBe(200);
    const captureBody = (await captureResponse.json()) as {
      pageTitle: string;
      pageTextExcerpt: string;
    };

    const ingestResponse = await fetch(
      `http://127.0.0.1:${address.port}/app/api/research-ingest`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie
        },
        body: JSON.stringify({
          url: 'https://example.com/research',
          pageTitle: captureBody.pageTitle,
          pageTextExcerpt: captureBody.pageTextExcerpt,
          userNote: 'from app',
          initialQuestion: 'What matters here?'
        })
      }
    );
    expect(ingestResponse.status).toBe(200);
    expect(researchPayloadPath).toBeTruthy();
    expect(await readFile(researchPayloadPath, 'utf8')).toContain(
      '"researchType": "tech"'
    );

    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  });

  it('reports app actions and recent status for pending wiki maintenance', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-bridge-app-'));
    process.env.HOME = tempDir;

    await import('node:fs/promises').then(({ mkdir, writeFile }) =>
      mkdir(
        path.join(
          tempDir,
          '.config',
          'taw',
          'wiki',
          'vibecoding',
          'pages',
          'concepts'
        ),
        {
          recursive: true
        }
      ).then(async () => {
        await writeFile(
          path.join(tempDir, '.config', 'taw', 'wiki', 'vibecoding', 'index.md'),
          '# index\n'
        );
        await writeFile(
          path.join(
            tempDir,
            '.config',
            'taw',
            'wiki',
            'vibecoding',
            'pages',
            'concepts',
            'agentic-loops.md'
          ),
          [
            '---',
            'title: Agentic Loops',
            'type: concept',
            'link_review_status: pending',
            'index_status: pending',
            '---',
            '',
            '# Agentic Loops'
          ].join('\n')
        );
      })
    );

    const server = createBridgeServer({
      token: 'test-token',
      defaultCwd: tempDir
    });

    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve)
    );
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected TCP bridge server address.');
    }

    const bootstrapResponse = await fetch(
      `http://127.0.0.1:${address.port}/app/api/bootstrap`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: 'test-token' })
      }
    );
    const cookie = bootstrapResponse.headers.get('set-cookie') ?? '';

    const stateResponse = await fetch(
      `http://127.0.0.1:${address.port}/app/api/state`,
      {
        headers: { cookie }
      }
    );
    expect(stateResponse.status).toBe(200);
    const stateBody = (await stateResponse.json()) as {
      actions: {
        categories: Array<{ id: string; items: Array<{ title: string }> }>;
      };
      recentStatus: { sessionDir: string; queuedInputs: number };
    };

    const reviewCategory = stateBody.actions.categories.find(
      (category) => category.id === 'pending-review'
    );
    expect(reviewCategory?.items.some((item) => item.title.includes('Review links'))).toBe(true);
    expect(reviewCategory?.items.some((item) => item.title.includes('Rebuild index'))).toBe(true);
    expect(stateBody.recentStatus.sessionDir).toContain('.config/taw/sessions');
    expect(stateBody.recentStatus.queuedInputs).toBe(0);

    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  });
});
