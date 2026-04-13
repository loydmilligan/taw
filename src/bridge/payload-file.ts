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

export async function writeQueuedInputsFile(
  queuedInputs: string[]
): Promise<string> {
  const payloadDir = path.join(getCacheDir(), 'browser-bridge');
  await mkdir(payloadDir, { recursive: true });
  const filePath = filePathBase(payloadDir, 'queued-inputs');
  await writeFile(filePath, `${JSON.stringify(queuedInputs, null, 2)}\n`, 'utf8');
  return filePath;
}

export async function writeBridgeMarkdownFile(
  prefix: string,
  content: string
): Promise<string> {
  const payloadDir = path.join(getCacheDir(), 'browser-bridge');
  await mkdir(payloadDir, { recursive: true });
  const filePath = filePathBase(payloadDir, prefix.replace(/[^a-z0-9-]/gi, '-'));
  const markdownPath = filePath.replace(/\.json$/, '.md');
  await writeFile(markdownPath, `${content}\n`, 'utf8');
  return markdownPath;
}

function filePathBase(dir: string, prefix: string): string {
  return path.join(dir, `${Date.now()}-${prefix}.json`);
}
