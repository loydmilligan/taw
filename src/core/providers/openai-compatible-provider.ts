import OpenAI from 'openai';
import type {
  ChatMessage,
  ChatToolCall,
  ProviderCompletionResult,
  ProviderAdapter,
  ProviderConfig,
  ProviderStreamFinalInfo,
  ProviderStreamStartInfo,
  ProviderTool
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
      tools?: ProviderTool[];
    }
  ): AsyncGenerator<string, void, void> {
    this.validateConfig(config);

    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl
    });
    const createCompletion = client.chat.completions.create.bind(
      client.chat.completions
    ) as unknown as (body: unknown, options?: unknown) => Promise<unknown>;

    const stream = (await createCompletion(
      {
        model: config.model,
        messages: messages.map(toOpenAiMessageParam),
        max_tokens: config.maxCompletionTokens,
        stream: true,
        ...(options?.tools ? { tools: options.tools } : {})
      },
      {
        signal: options?.signal
      }
    )) as unknown as AsyncIterable<{
      id?: string | null;
      model?: string | null;
      usage?: {
        prompt_tokens?: number | null;
        completion_tokens?: number | null;
        cost?: number | null;
        cost_details?: {
          upstream_inference_cost?: number | null;
        } | null;
        completion_tokens_details?: {
          reasoning_tokens?: number | null;
        } | null;
        prompt_tokens_details?: {
          cached_tokens?: number | null;
        } | null;
      } | null;
      choices?: Array<{
        finish_reason?: string | null;
        delta?: {
          content?: string | null;
        };
      }>;
    }>;

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

      const finishReason = chunk.choices?.[0]?.finish_reason;
      const usage = chunk.usage
        ? {
            promptTokens: chunk.usage.prompt_tokens ?? null,
            completionTokens: chunk.usage.completion_tokens ?? null,
            reasoningTokens:
              chunk.usage.completion_tokens_details?.reasoning_tokens ?? null,
            cachedTokens:
              chunk.usage.prompt_tokens_details?.cached_tokens ?? null,
            totalCost: chunk.usage.cost ?? null,
            upstreamInferenceCost:
              chunk.usage.cost_details?.upstream_inference_cost ?? null
          }
        : undefined;

      if (finishReason || usage) {
        options?.onFinal?.({
          finishReason,
          usage
        });
      }

      const content = chunk.choices?.[0]?.delta?.content;

      if (content) {
        yield content;
      }
    }
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
    this.validateConfig(config);

    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl
    });
    const createCompletion = client.chat.completions.create.bind(
      client.chat.completions
    ) as unknown as (body: unknown, options?: unknown) => Promise<unknown>;

    const completion = (await createCompletion(
      {
        model: config.model,
        messages: messages.map(toOpenAiMessageParam),
        max_tokens: config.maxCompletionTokens,
        stream: false,
        ...(options?.tools ? { tools: options.tools } : {})
      },
      {
        signal: options?.signal
      }
    )) as unknown as {
      id?: string | null;
      model?: string | null;
      usage?: {
        prompt_tokens?: number | null;
        completion_tokens?: number | null;
        cost?: number | null;
        cost_details?: {
          upstream_inference_cost?: number | null;
        } | null;
        completion_tokens_details?: {
          reasoning_tokens?: number | null;
        } | null;
        prompt_tokens_details?: {
          cached_tokens?: number | null;
        } | null;
      } | null;
      choices?: Array<{
        finish_reason?: string | null;
        message?: {
          content?: string | Array<{ type?: string; text?: string }> | null;
          tool_calls?: unknown[];
        };
      }>;
    };

    options?.onStart?.({
      generationId: completion.id ?? null,
      modelResolved: completion.model ?? null
    });

    const choice = completion.choices?.[0];
    options?.onFinal?.({
      finishReason: choice?.finish_reason ?? null,
      usage: completion.usage
        ? {
            promptTokens: completion.usage.prompt_tokens ?? null,
            completionTokens: completion.usage.completion_tokens ?? null,
            reasoningTokens:
              completion.usage.completion_tokens_details?.reasoning_tokens ??
              null,
            cachedTokens:
              completion.usage.prompt_tokens_details?.cached_tokens ?? null,
            totalCost: completion.usage.cost ?? null,
            upstreamInferenceCost:
              completion.usage.cost_details?.upstream_inference_cost ?? null
          }
        : undefined
    });

    return {
      text: extractCompletionText(choice?.message?.content),
      toolCalls: (choice?.message?.tool_calls ?? [])
        .filter(
          (
            toolCall: unknown
          ): toolCall is {
            id?: string;
            type: 'function';
            function: { name: string; arguments: string };
          } => isFunctionToolCall(toolCall)
        )
        .map(
          (toolCall: {
            id?: string;
            function: { name: string; arguments: string };
          }) =>
            normalizeToolCall(
              toolCall.id,
              toolCall.function.name,
              toolCall.function.arguments
            )
        )
    };
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

function isFunctionToolCall(toolCall: unknown): toolCall is {
  id?: string;
  type: 'function';
  function: { name: string; arguments: string };
} {
  if (!toolCall || typeof toolCall !== 'object') {
    return false;
  }

  const candidate = toolCall as {
    type?: unknown;
    function?: { name?: unknown; arguments?: unknown };
  };

  return (
    candidate.type === 'function' &&
    typeof candidate.function?.name === 'string' &&
    typeof candidate.function?.arguments === 'string'
  );
}

function toOpenAiMessageParam(message: ChatMessage) {
  if (message.role === 'tool') {
    return {
      role: 'tool' as const,
      content: message.content,
      tool_call_id: message.toolCallId ?? ''
    };
  }

  if (message.role === 'assistant') {
    return {
      role: 'assistant' as const,
      content: message.content,
      ...(message.toolCalls ? { tool_calls: message.toolCalls } : {})
    };
  }

  if (message.role === 'system') {
    return {
      role: 'system' as const,
      content: message.content
    };
  }

  return {
    role: 'user' as const,
    content: message.content
  };
}

function extractCompletionText(
  content: string | Array<{ type?: string; text?: string }> | null | undefined
): string {
  if (!content) {
    return '';
  }

  if (typeof content === 'string') {
    return content;
  }

  return content
    .map((item) =>
      'text' in item && typeof item.text === 'string' ? item.text : ''
    )
    .join('');
}

function normalizeToolCall(
  id: string | undefined,
  name: string | undefined,
  args: string | undefined
): ChatToolCall {
  return {
    id: id ?? globalThis.crypto.randomUUID(),
    type: 'function',
    function: {
      name: name ?? 'unknown_tool',
      arguments: args ?? '{}'
    }
  };
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
