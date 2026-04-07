import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { getLogsDir } from '../filesystem/paths.js';

export async function logError(scope: string, error: unknown): Promise<void> {
  await writeLog('ERROR', scope, error instanceof Error ? error.message : String(error));
}

export async function logDebug(scope: string, message: string): Promise<void> {
  if (process.env.TAW_DEBUG !== '1') {
    return;
  }

  await writeLog('DEBUG', scope, message);
}

async function writeLog(level: string, scope: string, message: string): Promise<void> {
  const logsDir = getLogsDir();
  await mkdir(logsDir, { recursive: true });
  const filePath = path.join(logsDir, `${new Date().toISOString().slice(0, 10)}.log`);
  const line = `${new Date().toISOString()} ${level} [${scope}] ${redactSecrets(message)}\n`;
  await appendFile(filePath, line, 'utf8');
}

function redactSecrets(value: string): string {
  return value.replace(/(sk-[a-zA-Z0-9_-]+)/g, '[REDACTED]');
}
