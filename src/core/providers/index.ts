import { AnthropicProvider } from './anthropic-provider.js';
import { OpenAiCompatibleProvider } from './openai-compatible-provider.js';
import type { ProviderAdapter, ProviderConfig } from '../../types/provider.js';

const openAiCompatibleProvider = new OpenAiCompatibleProvider();
const anthropicProvider = new AnthropicProvider();

export function getProviderAdapter(config: ProviderConfig): ProviderAdapter {
  if (config.provider === 'anthropic') {
    return anthropicProvider;
  }

  return openAiCompatibleProvider;
}
