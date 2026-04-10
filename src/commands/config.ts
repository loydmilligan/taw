import {
  getGlobalConfigPath,
  saveGlobalConfig,
  saveProjectConfig
} from '../services/config/loader.js';
import { saveProviderApiKeyToGlobalEnv } from '../services/config/env.js';
import type { GlobalConfig } from '../services/config/schema.js';
import {
  getDefaultSearxngComposeFile,
  resolveSearxngSettings
} from '../services/search/searxng-manager.js';
import { createId } from '../utils/ids.js';
import type { ProviderConfig } from '../types/provider.js';
import type { CommandDefinition } from './types.js';

const VALID_PROVIDERS: ProviderConfig['provider'][] = [
  'openrouter',
  'openai',
  'anthropic'
];

const MODEL_PRESETS: Record<ProviderConfig['provider'], string[]> = {
  openrouter: [
    'openrouter/auto',
    'openai/gpt-4o-mini',
    'openai/gpt-4.1',
    'anthropic/claude-3.5-sonnet',
    'anthropic/claude-3.7-sonnet',
    'google/gemini-2.5-flash'
  ],
  openai: ['gpt-4o-mini', 'gpt-4.1', 'gpt-4o'],
  anthropic: ['claude-3-5-haiku-latest', 'claude-3-5-sonnet-latest']
};

export const configCommand: CommandDefinition = {
  name: 'config',
  description: 'Show or update provider/model configuration.',
  usage:
    '/config [show|provider <name>|models [provider]|model <name|index>|api-key <provider> <key>|max-tokens <count>|search <...>|budget <show|high-turn <amount>|high-session <amount>>]',
  async run(input, context) {
    const action = input.args[0] ?? 'show';

    if (action === 'show') {
      const searxng = resolveSearxngSettings(context.globalConfig);
      const location =
        context.projectConfig && context.session.storageMode === 'project'
          ? `${context.cwd}/.ai/config.json`
          : getGlobalConfigPath();

      return {
        entries: [
          {
            id: createId('config-show'),
            kind: 'notice',
            title: 'Effective Config',
            body: [
              `Provider: ${context.providerConfig.provider}`,
              `Model: ${context.providerConfig.model}`,
              `API Key Configured: ${context.providerConfig.apiKey ? 'yes' : 'no'}`,
              `Max Completion Tokens: ${context.providerConfig.maxCompletionTokens ?? 'default'}`,
              `SearXNG Enabled: ${searxng.enabled ? 'yes' : 'no'}`,
              `SearXNG Auto-Start: ${searxng.autoStart ? 'yes' : 'no'}`,
              `SearXNG URL: ${searxng.baseUrl}`,
              `SearXNG Idle Minutes: ${searxng.idleMinutes}`,
              `SearXNG Compose File: ${searxng.composeFile}`,
              `OpenRouter Search Fallback: ${context.globalConfig.searchBackend.openrouterFallback.enabled ? 'yes' : 'no'}`,
              `High Turn Cost Warning: $${context.globalConfig.budget.highTurnCostWarning.toFixed(4)}`,
              `High Session Cost Warning: $${context.globalConfig.budget.highSessionCostWarning.toFixed(4)}`,
              `Source Ratings DB: ${context.globalConfig.sourceRatings.dbPath ?? '~/.config/taw/sources.db'}`,
              `Config Scope: ${context.session.storageMode === 'project' ? 'project override available' : 'global only'}`,
              `Writes To: ${location}`
            ].join('\n')
          }
        ]
      };
    }

    if (action === 'provider') {
      const provider = input.args[1] as ProviderConfig['provider'] | undefined;

      if (!provider || !VALID_PROVIDERS.includes(provider)) {
        return {
          entries: [
            {
              id: createId('config-provider-error'),
              kind: 'error',
              title: 'Invalid Provider',
              body: 'Usage: /config provider <openrouter|openai|anthropic>'
            }
          ]
        };
      }

      const nextModel = defaultModelForProvider(provider);
      const result = await persistConfig(context, {
        provider,
        model: nextModel
      });

      return {
        globalConfig: result.globalConfig,
        projectConfig: result.projectConfig,
        providerConfig: result,
        provider: result.provider,
        model: result.model,
        entries: [
          {
            id: createId('config-provider'),
            kind: 'notice',
            title: 'Provider Updated',
            body: `Provider set to ${provider}. Model reset to ${nextModel}.`
          }
        ]
      };
    }

    if (action === 'model') {
      const rawModel = input.args.slice(1).join(' ').trim();
      const model = resolveModelSelection(
        context.providerConfig.provider,
        rawModel
      );

      if (!rawModel || !model) {
        return {
          entries: [
            {
              id: createId('config-model-error'),
              kind: 'error',
              title: 'Missing Model',
              body: 'Usage: /config model <model-name|index>'
            }
          ]
        };
      }

      const result = await persistConfig(context, {
        provider: context.providerConfig.provider,
        model
      });

      return {
        globalConfig: result.globalConfig,
        projectConfig: result.projectConfig,
        providerConfig: result,
        provider: result.provider,
        model: result.model,
        entries: [
          {
            id: createId('config-model'),
            kind: 'notice',
            title: 'Model Updated',
            body: `Model set to ${model}.`
          }
        ]
      };
    }

    if (action === 'models') {
      const provider =
        (input.args[1] as ProviderConfig['provider'] | undefined) ??
        context.providerConfig.provider;

      if (!VALID_PROVIDERS.includes(provider)) {
        return {
          entries: [
            {
              id: createId('config-models-error'),
              kind: 'error',
              title: 'Invalid Provider',
              body: 'Usage: /config models [openrouter|openai|anthropic]'
            }
          ]
        };
      }

      const models = MODEL_PRESETS[provider];

      return {
        entries: [
          {
            id: createId('config-models'),
            kind: 'notice',
            title: `${provider} Models`,
            body: models
              .map((model, index) => `${index + 1}. ${model}`)
              .join('\n')
          }
        ]
      };
    }

    if (action === 'api-key') {
      const provider = input.args[1] as ProviderConfig['provider'] | undefined;
      const apiKey = input.args.slice(2).join(' ').trim();

      if (!provider || !VALID_PROVIDERS.includes(provider) || !apiKey) {
        return {
          entries: [
            {
              id: createId('config-api-key-error'),
              kind: 'error',
              title: 'API Key Usage',
              body: 'Usage: /config api-key <openrouter|openai|anthropic> <key>'
            }
          ]
        };
      }

      const nextGlobalConfig: GlobalConfig = {
        ...context.globalConfig,
        providers: {
          ...context.globalConfig.providers,
          [provider]: {
            ...context.globalConfig.providers[provider],
            apiKey
          }
        }
      };

      await saveGlobalConfig(nextGlobalConfig);
      await saveProviderApiKeyToGlobalEnv(provider, apiKey);

      const nextProviderConfig =
        context.providerConfig.provider === provider
          ? { ...context.providerConfig, apiKey }
          : context.providerConfig;

      return {
        globalConfig: nextGlobalConfig,
        providerConfig: nextProviderConfig,
        entries: [
          {
            id: createId('config-api-key'),
            kind: 'notice',
            title: 'API Key Updated',
            body: `Saved ${provider} API key to ${getGlobalConfigPath()} and ~/.config/taw/.env.`
          }
        ]
      };
    }

    if (action === 'max-tokens') {
      const rawValue = input.args[1];
      const value = Number(rawValue);

      if (!rawValue || !Number.isInteger(value) || value <= 0 || value > 8192) {
        return {
          entries: [
            {
              id: createId('config-max-tokens-error'),
              kind: 'error',
              title: 'Invalid Max Tokens',
              body: 'Usage: /config max-tokens <1-8192>'
            }
          ]
        };
      }

      const result = await persistConfig(context, {
        provider: context.providerConfig.provider,
        model: context.providerConfig.model,
        maxCompletionTokens: value
      });

      return {
        globalConfig: result.globalConfig,
        projectConfig: result.projectConfig,
        providerConfig: result,
        provider: result.provider,
        model: result.model,
        entries: [
          {
            id: createId('config-max-tokens'),
            kind: 'notice',
            title: 'Max Tokens Updated',
            body: `Per-request completion limit set to ${value} tokens.`
          }
        ]
      };
    }

    if (action === 'search') {
      const subaction = input.args[1] ?? 'show';
      const current = context.globalConfig.searchBackend.searxng;

      if (subaction === 'show') {
        const resolved = resolveSearxngSettings(context.globalConfig);

        return {
          entries: [
            {
              id: createId('config-search-show'),
              kind: 'notice',
              title: 'Search Backend',
              body: [
                `Enabled: ${resolved.enabled ? 'yes' : 'no'}`,
                `Auto-Start: ${resolved.autoStart ? 'yes' : 'no'}`,
                `Base URL: ${resolved.baseUrl}`,
                `Idle Minutes: ${resolved.idleMinutes}`,
                `Compose File: ${resolved.composeFile}`,
                `Service Name: ${resolved.serviceName}`,
                `OpenRouter Fallback: ${context.globalConfig.searchBackend.openrouterFallback.enabled ? 'yes' : 'no'}`,
                `OpenRouter Fallback Max Results: ${context.globalConfig.searchBackend.openrouterFallback.maxResults}`
              ].join('\n')
            }
          ]
        };
      }

      if (subaction === 'idle-minutes') {
        const rawValue = input.args[2];
        const value = Number(rawValue);

        if (
          !rawValue ||
          !Number.isInteger(value) ||
          value < 0 ||
          value > 1440
        ) {
          return searchConfigError(
            'Usage: /config search idle-minutes <0-1440>'
          );
        }

        const nextGlobalConfig: GlobalConfig = {
          ...context.globalConfig,
          searchBackend: {
            ...context.globalConfig.searchBackend,
            searxng: {
              ...current,
              idleMinutes: value
            }
          }
        };
        await saveGlobalConfig(nextGlobalConfig);

        return searchConfigNotice(
          'Search Backend Updated',
          `SearXNG idle timeout set to ${value} minutes.`,
          nextGlobalConfig
        );
      }

      if (subaction === 'base-url') {
        const value = input.args.slice(2).join(' ').trim();
        if (!value) {
          return searchConfigError('Usage: /config search base-url <url>');
        }

        const nextGlobalConfig: GlobalConfig = {
          ...context.globalConfig,
          searchBackend: {
            ...context.globalConfig.searchBackend,
            searxng: {
              ...current,
              baseUrl: value
            }
          }
        };
        await saveGlobalConfig(nextGlobalConfig);

        return searchConfigNotice(
          'Search Backend Updated',
          `SearXNG base URL set to ${value}.`,
          nextGlobalConfig
        );
      }

      if (subaction === 'compose-file') {
        const value =
          input.args.slice(2).join(' ').trim() ||
          getDefaultSearxngComposeFile();

        const nextGlobalConfig: GlobalConfig = {
          ...context.globalConfig,
          searchBackend: {
            ...context.globalConfig.searchBackend,
            searxng: {
              ...current,
              composeFile: value
            }
          }
        };
        await saveGlobalConfig(nextGlobalConfig);

        return searchConfigNotice(
          'Search Backend Updated',
          `SearXNG compose file set to ${value}.`,
          nextGlobalConfig
        );
      }

      if (subaction === 'service-name') {
        const value = input.args.slice(2).join(' ').trim();
        if (!value) {
          return searchConfigError('Usage: /config search service-name <name>');
        }

        const nextGlobalConfig: GlobalConfig = {
          ...context.globalConfig,
          searchBackend: {
            ...context.globalConfig.searchBackend,
            searxng: {
              ...current,
              serviceName: value
            }
          }
        };
        await saveGlobalConfig(nextGlobalConfig);

        return searchConfigNotice(
          'Search Backend Updated',
          `SearXNG service name set to ${value}.`,
          nextGlobalConfig
        );
      }

      if (subaction === 'auto-start' || subaction === 'enabled') {
        const rawValue = input.args[2];
        const value = parseToggle(rawValue);

        if (value == null) {
          return searchConfigError(
            `Usage: /config search ${subaction} <on|off>`
          );
        }

        const nextGlobalConfig: GlobalConfig = {
          ...context.globalConfig,
          searchBackend: {
            ...context.globalConfig.searchBackend,
            searxng: {
              ...current,
              [subaction === 'auto-start' ? 'autoStart' : 'enabled']: value
            }
          }
        };
        await saveGlobalConfig(nextGlobalConfig);

        return searchConfigNotice(
          'Search Backend Updated',
          `SearXNG ${subaction} set to ${value ? 'on' : 'off'}.`,
          nextGlobalConfig
        );
      }

      if (subaction === 'hosted-fallback') {
        const rawValue = input.args[2];
        const value = parseToggle(rawValue);

        if (value == null) {
          return searchConfigError(
            'Usage: /config search hosted-fallback <on|off>'
          );
        }

        const nextGlobalConfig: GlobalConfig = {
          ...context.globalConfig,
          searchBackend: {
            ...context.globalConfig.searchBackend,
            openrouterFallback: {
              ...context.globalConfig.searchBackend.openrouterFallback,
              enabled: value
            }
          }
        };
        await saveGlobalConfig(nextGlobalConfig);

        return searchConfigNotice(
          'Search Backend Updated',
          `OpenRouter hosted search fallback set to ${value ? 'on' : 'off'}.`,
          nextGlobalConfig
        );
      }

      if (subaction === 'hosted-fallback-max-results') {
        const rawValue = input.args[2];
        const value = Number(rawValue);

        if (!rawValue || !Number.isInteger(value) || value <= 0 || value > 10) {
          return searchConfigError(
            'Usage: /config search hosted-fallback-max-results <1-10>'
          );
        }

        const nextGlobalConfig: GlobalConfig = {
          ...context.globalConfig,
          searchBackend: {
            ...context.globalConfig.searchBackend,
            openrouterFallback: {
              ...context.globalConfig.searchBackend.openrouterFallback,
              maxResults: value
            }
          }
        };
        await saveGlobalConfig(nextGlobalConfig);

        return searchConfigNotice(
          'Search Backend Updated',
          `OpenRouter hosted search fallback max results set to ${value}.`,
          nextGlobalConfig
        );
      }

      return searchConfigError(
        'Usage: /config search <show|idle-minutes <n>|base-url <url>|compose-file <path>|service-name <name>|auto-start <on|off>|enabled <on|off>|hosted-fallback <on|off>|hosted-fallback-max-results <1-10>>'
      );
    }

    if (action === 'budget') {
      const subaction = input.args[1] ?? 'show';

      if (subaction === 'show') {
        return {
          entries: [
            {
              id: createId('config-budget-show'),
              kind: 'notice',
              title: 'Budget Settings',
              body: [
                `High Turn Cost Warning: $${context.globalConfig.budget.highTurnCostWarning.toFixed(4)}`,
                `High Session Cost Warning: $${context.globalConfig.budget.highSessionCostWarning.toFixed(4)}`
              ].join('\n')
            }
          ]
        };
      }

      if (subaction === 'high-turn' || subaction === 'high-session') {
        const rawValue = input.args[2];
        const value = Number(rawValue);

        if (!rawValue || Number.isNaN(value) || value < 0) {
          return {
            entries: [
              {
                id: createId('config-budget-error'),
                kind: 'error',
                title: 'Budget Config Usage',
                body: `Usage: /config budget ${subaction} <amount>`
              }
            ]
          };
        }

        const nextGlobalConfig: GlobalConfig = {
          ...context.globalConfig,
          budget: {
            ...context.globalConfig.budget,
            [subaction === 'high-turn'
              ? 'highTurnCostWarning'
              : 'highSessionCostWarning']: value
          }
        };
        await saveGlobalConfig(nextGlobalConfig);

        return {
          globalConfig: nextGlobalConfig,
          entries: [
            {
              id: createId('config-budget'),
              kind: 'notice',
              title: 'Budget Updated',
              body: `${subaction} warning set to $${value.toFixed(4)}.`
            }
          ]
        };
      }

      return {
        entries: [
          {
            id: createId('config-budget-usage'),
            kind: 'error',
            title: 'Budget Config Usage',
            body: '/config budget <show|high-turn <amount>|high-session <amount>>'
          }
        ]
      };
    }

    return {
      entries: [
        {
          id: createId('config-usage'),
          kind: 'error',
          title: 'Config Usage',
          body: '/config [show|provider <name>|models [provider]|model <name|index>|api-key <provider> <key>|max-tokens <count>|search <...>|budget <show|high-turn <amount>|high-session <amount>>]'
        }
      ]
    };
  }
};

async function persistConfig(
  context: Parameters<CommandDefinition['run']>[1],
  next: Pick<ProviderConfig, 'provider' | 'model'> & {
    maxCompletionTokens?: number;
  }
): Promise<
  ProviderConfig & {
    globalConfig: GlobalConfig;
    projectConfig: Parameters<CommandDefinition['run']>[1]['projectConfig'];
  }
> {
  let nextGlobalConfig = context.globalConfig;
  let nextProjectConfig = context.projectConfig;

  if (context.session.storageMode === 'project') {
    const projectConfig = {
      ...(context.projectConfig ?? {
        projectName: '',
        defaultAttachedDirs: [],
        preferredArtifactOutputs: ['artifacts'],
        promptOverrides: {}
      }),
      provider: next.provider,
      model: next.model,
      maxCompletionTokens:
        next.maxCompletionTokens ?? context.projectConfig?.maxCompletionTokens
    };

    await saveProjectConfig(context.cwd, projectConfig);
    nextProjectConfig = projectConfig;
  } else {
    const globalConfig = {
      ...context.globalConfig,
      defaultProvider: next.provider,
      defaultModel: next.model,
      maxCompletionTokens:
        next.maxCompletionTokens ?? context.globalConfig.maxCompletionTokens
    };

    await saveGlobalConfig(globalConfig);
    nextGlobalConfig = globalConfig;
  }

  return {
    ...context.providerConfig,
    provider: next.provider,
    model: next.model,
    maxCompletionTokens:
      next.maxCompletionTokens ?? context.providerConfig.maxCompletionTokens,
    globalConfig: nextGlobalConfig,
    projectConfig: nextProjectConfig
  };
}

function defaultModelForProvider(provider: ProviderConfig['provider']): string {
  if (provider === 'openai') {
    return 'gpt-4o-mini';
  }

  if (provider === 'anthropic') {
    return 'claude-3-5-haiku-latest';
  }

  return 'openrouter/auto';
}

function resolveModelSelection(
  provider: ProviderConfig['provider'],
  rawValue: string
): string | null {
  if (!rawValue) {
    return null;
  }

  const numericIndex = Number(rawValue);

  if (Number.isInteger(numericIndex)) {
    return MODEL_PRESETS[provider][numericIndex - 1] ?? null;
  }

  return rawValue;
}

function parseToggle(value: string | undefined): boolean | null {
  if (value === 'on') {
    return true;
  }

  if (value === 'off') {
    return false;
  }

  return null;
}

function searchConfigNotice(
  title: string,
  body: string,
  globalConfig?: GlobalConfig
) {
  return {
    ...(globalConfig ? { globalConfig } : {}),
    entries: [
      {
        id: createId('config-search-notice'),
        kind: 'notice' as const,
        title,
        body
      }
    ]
  };
}

function searchConfigError(body: string) {
  return {
    entries: [
      {
        id: createId('config-search-error'),
        kind: 'error' as const,
        title: 'Search Config Usage',
        body
      }
    ]
  };
}
