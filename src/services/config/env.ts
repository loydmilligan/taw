import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getGlobalEnvPath, getProjectEnvPath } from '../filesystem/paths.js';
import type { ProviderConfig } from '../../types/provider.js';

const PROVIDER_ENV_KEYS: Record<ProviderConfig['provider'], string> = {
  openrouter: 'OPENROUTER_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY'
};

export async function loadTawEnvFiles(cwd: string): Promise<void> {
  const candidates = [
    getGlobalEnvPath(),
    getProjectEnvPath(cwd),
    path.join(cwd, '.env.local')
  ];

  for (const filePath of candidates) {
    await loadEnvFile(filePath);
  }
}

export async function saveProviderApiKeyToGlobalEnv(
  provider: ProviderConfig['provider'],
  apiKey: string
): Promise<void> {
  await saveEnvVar(getGlobalEnvPath(), PROVIDER_ENV_KEYS[provider], apiKey);
  process.env[PROVIDER_ENV_KEYS[provider]] = apiKey;
}

export async function saveEnvVar(
  envPath: string,
  key: string,
  value: string
): Promise<void> {
  await mkdir(path.dirname(envPath), { recursive: true });

  const existing = await readOptionalFile(envPath);
  const next = upsertEnvVar(existing ?? '', key, value);

  await writeFile(envPath, next, 'utf8');
}

export async function readEnvVar(
  envPath: string,
  key: string
): Promise<string | null> {
  const content = await readOptionalFile(envPath);

  if (!content) {
    return null;
  }

  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (parsed?.key === key) {
      return parsed.value;
    }
  }

  return null;
}

async function loadEnvFile(filePath: string): Promise<void> {
  const content = await readOptionalFile(filePath);

  if (!content) {
    return;
  }

  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) {
      continue;
    }

    if (process.env[parsed.key] == null || process.env[parsed.key] === '') {
      process.env[parsed.key] = parsed.value;
    }
  }
}

function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  const equalsIndex = trimmed.indexOf('=');
  if (equalsIndex <= 0) {
    return null;
  }

  const key = trimmed.slice(0, equalsIndex).trim();
  let value = trimmed.slice(equalsIndex + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

function upsertEnvVar(content: string, key: string, value: string): string {
  const lines = content.length > 0 ? content.split(/\r?\n/) : [];
  let updated = false;

  const nextLines = lines.map((line) => {
    const parsed = parseEnvLine(line);
    if (parsed?.key === key) {
      updated = true;
      return `${key}=${escapeEnvValue(value)}`;
    }

    return line;
  });

  if (!updated) {
    nextLines.push(`${key}=${escapeEnvValue(value)}`);
  }

  return `${nextLines.filter((line, index, list) => !(index === list.length - 1 && line === '')).join('\n')}\n`;
}

function escapeEnvValue(value: string): string {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
    return value;
  }

  return JSON.stringify(value);
}

async function readOptionalFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}
