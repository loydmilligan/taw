import http from 'node:http';
import { browserResearchPayloadSchema } from '../core/research/schema.js';
import type { BrowserResearchPayload } from '../core/research/types.js';
import { writeBridgePayloadFile } from './payload-file.js';
import { launchResearchSession, type LaunchResult } from './launcher.js';
import type { SearchBackendStatus } from '../services/search/searxng-manager.js';

interface BridgeServerOptions {
  token: string;
  defaultCwd: string;
  launch?: (
    payloadPath: string,
    cwd: string,
    windowName: string
  ) => Promise<LaunchResult>;
  searchBackend?: {
    getStatus: () => Promise<SearchBackendStatus>;
    start: () => Promise<SearchBackendStatus>;
    stop: () => Promise<SearchBackendStatus>;
    touch: () => Promise<SearchBackendStatus>;
  };
}

interface NewResearchRequestBody {
  cwd?: string;
  payload: BrowserResearchPayload;
}

export function createBridgeServer(options: BridgeServerOptions): http.Server {
  return http.createServer(async (request, response) => {
    try {
      if (!authorize(request, options.token)) {
        writeJson(response, 401, { error: 'Unauthorized' });
        return;
      }

      if (request.method === 'GET' && request.url === '/health') {
        writeJson(response, 200, { ok: true });
        return;
      }

      if (
        options.searchBackend &&
        request.method === 'GET' &&
        request.url === '/search-backend/status'
      ) {
        writeJson(response, 200, {
          ok: true,
          status: await options.searchBackend.getStatus()
        });
        return;
      }

      if (
        options.searchBackend &&
        request.method === 'POST' &&
        request.url === '/search-backend/start'
      ) {
        writeJson(response, 200, {
          ok: true,
          status: await options.searchBackend.start()
        });
        return;
      }

      if (
        options.searchBackend &&
        request.method === 'POST' &&
        request.url === '/search-backend/stop'
      ) {
        writeJson(response, 200, {
          ok: true,
          status: await options.searchBackend.stop()
        });
        return;
      }

      if (
        options.searchBackend &&
        request.method === 'POST' &&
        request.url === '/search-backend/touch'
      ) {
        writeJson(response, 200, {
          ok: true,
          status: await options.searchBackend.touch()
        });
        return;
      }

      if (
        request.method === 'POST' &&
        request.url === '/session/new-research'
      ) {
        const body = (await readJson(request)) as NewResearchRequestBody;
        const payload = browserResearchPayloadSchema.parse(body.payload);
        const payloadPath = await writeBridgePayloadFile(payload);
        const cwd = body.cwd ?? options.defaultCwd;
        const launch = options.launch ?? launchResearchSession;
        const launchResult = await launch(
          payloadPath,
          cwd,
          buildResearchWindowName(payload.title)
        );

        writeJson(response, 200, {
          ok: true,
          payloadPath,
          cwd,
          launchMethod: launchResult.launchMethod,
          command: launchResult.command
        });
        return;
      }

      if (
        request.method === 'POST' &&
        request.url === '/session/append-context'
      ) {
        writeJson(response, 501, {
          ok: false,
          error: 'Append-context targeting is not implemented yet.'
        });
        return;
      }

      writeJson(response, 404, { error: 'Not found' });
    } catch (error) {
      writeJson(response, 400, {
        error: error instanceof Error ? error.message : 'Unknown bridge error.'
      });
    }
  });
}

function authorize(request: http.IncomingMessage, token: string): boolean {
  const requestToken = request.headers['x-taw-token'];

  if (typeof requestToken !== 'string') {
    return false;
  }

  return requestToken === token;
}

function readJson(request: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = '';
    request.on('data', (chunk) => {
      data += String(chunk);
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function writeJson(
  response: http.ServerResponse,
  statusCode: number,
  body: unknown
): void {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(body));
}

function buildResearchWindowName(title: string): string {
  const normalized = stripControlCharacters(title).replace(/\s+/g, ' ').trim();

  return normalized ? `taw: ${normalized}` : 'taw research';
}

function stripControlCharacters(value: string): string {
  return Array.from(value)
    .map((char) => {
      const code = char.charCodeAt(0);
      return code < 32 || code === 127 ? ' ' : char;
    })
    .join('');
}
