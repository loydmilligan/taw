import Anthropic from '@anthropic-ai/sdk';
import type {
  ChatMessage,
  ProviderCompletionResult,
  ProviderAdapter,
  ProviderConfig,
  ProviderStreamFinalInfo,
  ProviderStreamStartInfo,
  ProviderTool
} from '../../types/provider.js';

export class AnthropicProvider implements ProviderAdapter {
  sendMessage(
    messages: ChatMessage[],
    config: ProviderConfig
  ): Promise<string> {
    return collectStream(this.streamMessage(messages, config));
  }

  async *streamMessage(
    messages: ChatMessage[],
    config: ProviderConfig,
    options?: {
      signal?: AbortSignal;
      onStart?: (info: ProviderStreamStartInfo) => void;
      onFinal?: (info: ProviderStreamFinalInfo) => void;
      tools?: ProviderTool[];
    }
  ): AsyncGenerator<string, void, void> {
    this.validateConfig(config);

    const system = messages.find(
      (message) => message.role === 'system'
    )?.content;
    const conversation = messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        role: (message.role === 'assistant' ? 'assistant' : 'user') as
          | 'assistant'
          | 'user',
        content: message.content
      }));

    const client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl
    });

    options?.onStart?.({});

    const stream = client.messages.stream({
      model: config.model,
      system,
      max_tokens: config.maxCompletionTokens ?? 1200,
      messages: conversation
    });

    if (options?.signal) {
      options.signal.addEventListener(
        'abort',
        () => {
          stream.abort();
        },
        { once: true }
      );
    }

    const finalText = await stream.finalText();
    options?.onFinal?.({});
    yield finalText;
  }

  async completeMessage(
    messages: ChatMessage[],
    config: ProviderConfig,
    options?: {
      signal?: AbortSignal;
      onStart?: (info: ProviderStreamStartInfo) => void;
      onFinal?: (info: ProviderStreamFinalInfo) => void;
      tools?: ProviderTool[];
    }
  ): Promise<ProviderCompletionResult> {
    return {
      text: await collectStream(this.streamMessage(messages, config, options)),
      toolCalls: []
    };
  }

  validateConfig(config: ProviderConfig): void {
    if (!config.apiKey) {
      throw new Error(
        'Missing API key. Set ANTHROPIC_API_KEY or configure the provider in ~/.config/taw/config.json.'
      );
    }
  }

  normalizeError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }

    return new Error('Anthropic request failed.');
  }
}

async function collectStream(
  stream: AsyncGenerator<string, void, void>
): Promise<string> {
  let output = '';

  for await (const chunk of stream) {
    output += chunk;
  }

  return output;
}
