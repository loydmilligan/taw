import { readFile } from 'node:fs/promises';
import { browserResearchPayloadSchema } from './schema.js';
import type { BrowserResearchPayload } from './types.js';

export async function readBrowserResearchPayload(
  filePath: string
): Promise<BrowserResearchPayload> {
  const content = await readFile(filePath, 'utf8');
  return browserResearchPayloadSchema.parse(JSON.parse(content));
}
