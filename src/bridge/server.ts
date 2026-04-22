import http from 'node:http';
import { createBridgeCoreHandler, type BridgeCoreOptions } from './bridge-core.js';
import { createAppServerHandler } from './app-server.js';
import { migrateLegacyWikiLayout } from '../services/wiki/manager.js';

// BridgeServerOptions aliases BridgeCoreOptions — both modules accept the same shape
export type BridgeServerOptions = BridgeCoreOptions;

export function createBridgeServer(options: BridgeServerOptions): http.Server {
  const bridgeCore = createBridgeCoreHandler(options);
  const appServer = createAppServerHandler(options);
  const wikiLayoutReady = Promise.resolve([] as string[]); // migrateLegacyWikiLayout().catch(() => []); // DISABLED 2026-04-22: was moving non-TAW folders into topics/

  return http.createServer(async (request, response) => {
    try {
      await wikiLayoutReady;
      const url = request.url ?? '/';
      if (
        url === '/app' ||
        url.startsWith('/app/') ||
        url === '/mobile' ||
        url.startsWith('/mobile?')
      ) {
        await appServer(request, response);
      } else {
        await bridgeCore(request, response);
      }
    } catch {
      response.statusCode = 500;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ error: 'Internal bridge error.' }));
    }
  });
}
