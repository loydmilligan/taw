import os from 'node:os';
import path from 'node:path';

export function getAppConfigDir(): string {
  return path.join(os.homedir(), '.config', 'taw');
}

export function getProjectConfigPath(cwd: string): string {
  return path.join(cwd, '.ai', 'config.json');
}

export function getProjectSessionsRoot(cwd: string): string {
  return path.join(cwd, '.ai', 'sessions');
}

export function getProjectAssistantDir(cwd: string): string {
  return path.join(cwd, '.ai', 'assistant');
}

export function getGeneralSessionsRoot(): string {
  return path.join(getAppConfigDir(), 'sessions');
}

export function getGlobalAssistantDir(): string {
  return path.join(getAppConfigDir(), 'assistant');
}

export function getGlobalEnvPath(): string {
  return path.join(getAppConfigDir(), '.env');
}

export function getProjectEnvPath(cwd: string): string {
  return path.join(cwd, '.env');
}

export function getLogsDir(): string {
  return path.join(getAppConfigDir(), 'logs');
}

export function getCacheDir(): string {
  return path.join(getAppConfigDir(), 'cache');
}

export function getOpenRouterKeysRegistryPath(): string {
  return path.join(getAppConfigDir(), 'openrouter-keys.json');
}
