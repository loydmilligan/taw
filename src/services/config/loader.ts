import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  globalConfigSchema,
  projectConfigSchema,
  type GlobalConfig,
  type ProjectConfig
} from './schema.js';
import { getAppConfigDir, getProjectConfigPath } from '../filesystem/paths.js';
import type { ProviderConfig } from '../../types/provider.js';
import { loadTawEnvFiles } from './env.js';

export interface LoadedConfig {
  globalConfig: GlobalConfig;
  projectConfig: ProjectConfig | null;
  providerConfig: ProviderConfig;
  openrouterManagementKey?: string;
}

export async function loadConfig(cwd: string): Promise<LoadedConfig> {
  await loadTawEnvFiles(cwd);
  const globalConfig = await loadGlobalConfig();
  const projectConfig = await loadProjectConfig(cwd);

  const provider = projectConfig?.provider ?? globalConfig.defaultProvider;
  const model =
    projectConfig?.model ??
    globalConfig.defaultModel ??
    getDefaultModelForProvider(provider);

  const providerSettings = globalConfig.providers[provider];

  return {
    globalConfig,
    projectConfig,
    providerConfig: {
      provider,
      model,
      apiKey: providerSettings.apiKey ?? getEnvApiKey(provider),
      baseUrl: providerSettings.baseUrl ?? getDefaultBaseUrl(provider),
      maxCompletionTokens:
        projectConfig?.maxCompletionTokens ?? globalConfig.maxCompletionTokens
    },
    openrouterManagementKey:
      globalConfig.providers.openrouter.managementApiKey ??
      process.env.OPENROUTER_MANAGEMENT_KEY
  };
}

async function loadGlobalConfig(): Promise<GlobalConfig> {
  const configPath = getGlobalConfigPath();

  try {
    const content = await readFile(configPath, 'utf8');
    return globalConfigSchema.parse(JSON.parse(content));
  } catch {
    return globalConfigSchema.parse({});
  }
}

async function loadProjectConfig(cwd: string): Promise<ProjectConfig | null> {
  try {
    const content = await readFile(getProjectConfigPath(cwd), 'utf8');
    return projectConfigSchema.parse(JSON.parse(content));
  } catch {
    return null;
  }
}

export async function saveGlobalConfig(config: GlobalConfig): Promise<void> {
  const configPath = getGlobalConfigPath();
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(
    configPath,
    `${JSON.stringify(globalConfigSchema.parse(config), null, 2)}\n`,
    'utf8'
  );
}

export async function saveProjectConfig(
  cwd: string,
  config: ProjectConfig
): Promise<void> {
  const configPath = getProjectConfigPath(cwd);
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(
    configPath,
    `${JSON.stringify(projectConfigSchema.parse(config), null, 2)}\n`,
    'utf8'
  );
}

export function getGlobalConfigPath(): string {
  return path.join(getAppConfigDir(), 'config.json');
}

function getEnvApiKey(
  provider: ProviderConfig['provider']
): string | undefined {
  if (provider === 'openrouter') {
    return process.env.OPENROUTER_API_KEY;
  }

  if (provider === 'openai') {
    return process.env.OPENAI_API_KEY;
  }

  return process.env.ANTHROPIC_API_KEY;
}

function getDefaultBaseUrl(
  provider: ProviderConfig['provider']
): string | undefined {
  if (provider === 'openrouter') {
    return 'https://openrouter.ai/api/v1';
  }

  if (provider === 'openai') {
    return process.env.OPENAI_BASE_URL;
  }

  return process.env.ANTHROPIC_BASE_URL;
}

function getDefaultModelForProvider(
  provider: ProviderConfig['provider']
): string {
  if (provider === 'openai') {
    return 'gpt-4o-mini';
  }

  if (provider === 'anthropic') {
    return 'claude-3-5-haiku-latest';
  }

  return 'openrouter/auto';
}
