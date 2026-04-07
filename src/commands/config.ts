import {
  getGlobalConfigPath,
  saveGlobalConfig,
  saveProjectConfig
} from '../services/config/loader.js';
import { createId } from '../utils/ids.js';
import type { ProviderConfig } from '../types/provider.js';
import type { CommandDefinition } from './types.js';

const VALID_PROVIDERS: ProviderConfig['provider'][] = ['openrouter', 'openai', 'anthropic'];

export const configCommand: CommandDefinition = {
  name: 'config',
  description: 'Show or update provider/model configuration.',
  usage: '/config [show|provider <name>|model <name>]',
  async run(input, context) {
    const action = input.args[0] ?? 'show';

    if (action === 'show') {
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
      const result = await persistConfig(context, { provider, model: nextModel });

      return {
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
      const model = input.args.slice(1).join(' ').trim();

      if (!model) {
        return {
          entries: [
            {
              id: createId('config-model-error'),
              kind: 'error',
              title: 'Missing Model',
              body: 'Usage: /config model <model-name>'
            }
          ]
        };
      }

      const result = await persistConfig(context, {
        provider: context.providerConfig.provider,
        model
      });

      return {
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

    return {
      entries: [
        {
          id: createId('config-usage'),
          kind: 'error',
          title: 'Config Usage',
          body: 'Usage: /config [show|provider <name>|model <name>]'
        }
      ]
    };
  }
};

async function persistConfig(
  context: Parameters<CommandDefinition['run']>[1],
  next: Pick<ProviderConfig, 'provider' | 'model'>
): Promise<ProviderConfig> {
  if (context.session.storageMode === 'project') {
    const projectConfig = {
      ...(context.projectConfig ?? {
        projectName: '',
        defaultAttachedDirs: [],
        preferredArtifactOutputs: ['artifacts'],
        promptOverrides: {}
      }),
      provider: next.provider,
      model: next.model
    };

    await saveProjectConfig(context.cwd, projectConfig);
  } else {
    const globalConfig = {
      ...context.globalConfig,
      defaultProvider: next.provider,
      defaultModel: next.model
    };

    await saveGlobalConfig(globalConfig);
  }

  return {
    ...context.providerConfig,
    provider: next.provider,
    model: next.model
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
