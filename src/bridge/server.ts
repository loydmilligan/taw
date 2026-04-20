import http from 'node:http';
import { createBridgeCoreHandler, type BridgeCoreOptions } from './bridge-core.js';
import { createAppServerHandler } from './app-server.js';

// BridgeServerOptions aliases BridgeCoreOptions — both modules accept the same shape
export type BridgeServerOptions = BridgeCoreOptions;

export function createBridgeServer(options: BridgeServerOptions): http.Server {
  const bridgeCore = createBridgeCoreHandler(options);
  const appServer = createAppServerHandler(options);

  return http.createServer(async (request, response) => {
    try {
      const url = request.url ?? '/';
      if (url === '/app' || url.startsWith('/app/') || url === '/mobile') {
        await appServer(request, response);
      } else {
        await bridgeCore(request, response);
      }
    } catch (err) {
      response.statusCode = 500;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ error: 'Internal bridge error.' }));
    }
  });
}
