export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ProviderConfig {
  provider: 'openrouter' | 'openai' | 'anthropic';
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface ProviderAdapter {
  sendMessage(messages: ChatMessage[], config: ProviderConfig): Promise<string>;
  streamMessage(
    messages: ChatMessage[],
    config: ProviderConfig,
    options?: { signal?: AbortSignal }
  ): AsyncGenerator<string, void, void>;
  validateConfig(config: ProviderConfig): void;
  normalizeError(error: unknown): Error;
}
