import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BrowserResearchPayload } from '../core/research/types.js';
import { getCacheDir } from '../services/filesystem/paths.js';

export async function writeBridgePayloadFile(
  payload: BrowserResearchPayload
): Promise<string> {
  const payloadDir = path.join(getCacheDir(), 'browser-bridge');
  await mkdir(payloadDir, { recursive: true });
  const filePath = path.join(payloadDir, `${Date.now()}-research-payload.json`);
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return filePath;
}
