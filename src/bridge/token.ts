import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { getAppConfigDir } from '../services/filesystem/paths.js';

export function getBridgeTokenPath(): string {
  return path.join(getAppConfigDir(), 'bridge-token');
}

export async function ensureBridgeToken(): Promise<string> {
  const tokenPath = getBridgeTokenPath();

  try {
    const existing = (await readFile(tokenPath, 'utf8')).trim();
    if (existing) {
      return existing;
    }
  } catch {
    // create below
  }

  await mkdir(path.dirname(tokenPath), { recursive: true });
  const token = randomBytes(24).toString('hex');
  await writeFile(tokenPath, `${token}\n`, 'utf8');
  return token;
}
