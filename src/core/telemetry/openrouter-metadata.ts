import type { OpenRouterGenerationMetadata } from './types.js';

export async function fetchOpenRouterGenerationMetadata(
  apiKey: string,
  generationId: string
): Promise<OpenRouterGenerationMetadata> {
  const response = await fetch(
    `https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(generationId)}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    }
  );

  if (!response.ok) {
    throw new Error(`OpenRouter metadata fetch failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as { data?: Record<string, unknown> };
  const data = payload.data ?? {};

  return {
    id: stringOrNull(data.id),
    upstream_id: stringOrNull(data.upstream_id),
    total_cost: numberOrNull(data.total_cost),
    cache_discount: numberOrNull(data.cache_discount),
    upstream_inference_cost: numberOrNull(data.upstream_inference_cost),
    created_at: stringOrNull(data.created_at),
    model: stringOrNull(data.model),
    streamed: booleanOrFalse(data.streamed),
    cancelled: booleanOrFalse(data.cancelled),
    provider_name: stringOrNull(data.provider_name),
    latency: numberOrNull(data.latency),
    moderation_latency: numberOrNull(data.moderation_latency),
    generation_time: numberOrNull(data.generation_time),
    finish_reason: stringOrNull(data.finish_reason),
    tokens_prompt: numberOrNull(data.tokens_prompt),
    tokens_completion: numberOrNull(data.tokens_completion),
    native_tokens_prompt: numberOrNull(data.native_tokens_prompt),
    native_tokens_completion: numberOrNull(data.native_tokens_completion),
    native_tokens_reasoning: numberOrNull(data.native_tokens_reasoning),
    native_tokens_cached: numberOrNull(data.native_tokens_cached),
    router: stringOrNull(data.router),
    provider_responses: arrayOrNull(data.provider_responses),
    request_id: stringOrNull(data.request_id),
    native_finish_reason: stringOrNull(data.native_finish_reason)
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function booleanOrFalse(value: unknown): boolean {
  return typeof value === 'boolean' ? value : false;
}

function arrayOrNull(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}
