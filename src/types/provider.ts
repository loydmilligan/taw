export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
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
    }
  ): AsyncGenerator<string, void, void>;
  validateConfig(config: ProviderConfig): void;
  normalizeError(error: unknown): Error;
}
