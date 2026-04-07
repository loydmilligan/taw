import OpenAI from 'openai';
import type {
  ChatMessage,
  ProviderAdapter,
  ProviderConfig,
  ProviderStreamFinalInfo,
  ProviderStreamStartInfo
} from '../../types/provider.js';

export class OpenAiCompatibleProvider implements ProviderAdapter {
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
    }
  ): AsyncGenerator<string, void, void> {
    this.validateConfig(config);

    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl
    });

    const stream = await client.chat.completions.create(
      {
        model: config.model,
        messages: messages.map((message) => ({
          role: message.role,
          content: message.content
        })),
        max_tokens: config.maxCompletionTokens,
        stream: true
      },
      {
        signal: options?.signal
      }
    );

    let started = false;

    for await (const chunk of stream) {
      if (options?.signal?.aborted) {
        break;
      }

      if (!started) {
        started = true;
        options?.onStart?.({
          generationId: chunk.id ?? null,
          modelResolved: chunk.model ?? null
        });
      }

      const finishReason = chunk.choices[0]?.finish_reason;
      if (finishReason) {
        options?.onFinal?.({
          finishReason
        });
      }

      const content = chunk.choices[0]?.delta?.content;

      if (content) {
        yield content;
      }
    }
  }

  validateConfig(config: ProviderConfig): void {
    if (!config.apiKey) {
      const envName =
        config.provider === 'openai' ? 'OPENAI_API_KEY' : 'OPENROUTER_API_KEY';
      throw new Error(
        `Missing API key. Set ${envName} or configure the provider in ~/.config/taw/config.json.`
      );
    }
  }

  normalizeError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }

    return new Error('Provider request failed.');
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
