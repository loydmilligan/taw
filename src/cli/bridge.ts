#!/usr/bin/env node
import { createBridgeServer } from '../bridge/server.js';
import { ensureBridgeToken, getBridgeTokenPath } from '../bridge/token.js';
import { loadConfig } from '../services/config/loader.js';
import { SearxngManager } from '../services/search/searxng-manager.js';

const token = await ensureBridgeToken();
const port = Number(process.env.TAW_BRIDGE_PORT ?? '4317');
const host = '127.0.0.1';
const { globalConfig } = await loadConfig(process.cwd());
const searchBackend = SearxngManager.fromGlobalConfig(globalConfig);
const server = createBridgeServer({
  token,
  defaultCwd: process.cwd(),
  searchBackend
});

server.listen(port, host, () => {
  process.stdout.write(
    `TAW bridge listening on http://${host}:${port}\nToken path: ${getBridgeTokenPath()}\n`
  );
});
