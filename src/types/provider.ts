export interface ChatToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: ChatToolCall[];
}

export interface ProviderConfig {
  provider: 'openrouter' | 'openai' | 'anthropic';
  model: string;
  apiKey?: string;
  baseUrl?: string;
  maxCompletionTokens?: number;
}

export interface ProviderStreamStartInfo {
  generationId?: string | null;
  requestId?: string | null;
  providerRequestId?: string | null;
  modelResolved?: string | null;
}

export interface ProviderStreamFinalInfo {
  finishReason?: string | null;
  usage?: {
    promptTokens?: number | null;
    completionTokens?: number | null;
    reasoningTokens?: number | null;
    cachedTokens?: number | null;
    totalCost?: number | null;
    upstreamInferenceCost?: number | null;
  };
}

export interface ProviderFunctionTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ProviderServerTool {
  type: 'openrouter:web_search' | 'openrouter:datetime';
  parameters?: Record<string, unknown>;
}

export type ProviderTool = ProviderFunctionTool | ProviderServerTool;

export interface ProviderCompletionResult {
  text: string;
  toolCalls: ChatToolCall[];
  startInfo?: ProviderStreamStartInfo;
  finalInfo?: ProviderStreamFinalInfo;
  finishReason?: string | null;
}

export interface ProviderAdapter {
  sendMessage(messages: ChatMessage[], config: ProviderConfig): Promise<string>;
  streamMessage(
    messages: ChatMessage[],
    config: ProviderConfig,
    options?: {
      signal?: AbortSignal;
      onStart?: (info: ProviderStreamStartInfo) => void;
      onFinal?: (info: ProviderStreamFinalInfo) => void;
      tools?: ProviderTool[];
    }
  ): AsyncGenerator<string, void, void>;
  completeMessage(
    messages: ChatMessage[],
    config: ProviderConfig,
    options?: {
      signal?: AbortSignal;
      onStart?: (info: ProviderStreamStartInfo) => void;
      onFinal?: (info: ProviderStreamFinalInfo) => void;
      tools?: ProviderTool[];
    }
  ): Promise<ProviderCompletionResult>;
  validateConfig(config: ProviderConfig): void;
  normalizeError(error: unknown): Error;
}
