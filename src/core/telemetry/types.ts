export type TelemetryEventType =
  | 'request_started'
  | 'request_completed'
  | 'generation_metadata_fetched'
  | 'request_summary';

export interface TelemetryEventBase {
  event_type: TelemetryEventType;
  event_at: string;
  session_id: string;
  turn_id: string;
  request_group_id: string;
}

export interface RequestStartedEvent extends TelemetryEventBase {
  event_type: 'request_started';
  mode: string;
  provider: string;
  model_requested: string;
  conversation_depth: number;
  project_scoped: boolean;
  prompt_context_length_chars: number;
}

export interface RequestCompletedEvent extends TelemetryEventBase {
  event_type: 'request_completed';
  completed_at: string;
  interrupted_by_user: boolean;
  error_kind: string | null;
  error_message: string | null;
}

export interface GenerationMetadataFetchedEvent extends TelemetryEventBase {
  event_type: 'generation_metadata_fetched';
  generation_id: string | null;
  metadata_fetch_status: 'success' | 'failed';
}

export interface TelemetryRequestSummary {
  event_type: 'request_summary';
  session_id: string;
  turn_id: string;
  request_group_id: string;
  created_at: string;
  started_at: string;
  completed_at: string | null;
  provider: 'openrouter' | 'openai' | 'anthropic';
  model_requested: string;
  model_resolved: string | null;
  router: string | null;
  generation_id: string | null;
  provider_request_id: string | null;
  upstream_id: string | null;
  request_id: string | null;
  provider_name: string | null;
  provider_responses: unknown[] | null;
  streamed: boolean;
  cancelled: boolean;
  interrupted_by_user: boolean;
  metadata_fetch_status: 'pending' | 'success' | 'failed' | 'not_supported';
  finish_reason: string | null;
  native_finish_reason: string | null;
  latency_ms: number | null;
  generation_time_ms: number | null;
  moderation_latency_ms: number | null;
  time_to_first_token_ms: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  reasoning_tokens: number | null;
  cached_tokens: number | null;
  native_tokens_prompt: number | null;
  native_tokens_completion: number | null;
  native_tokens_reasoning: number | null;
  native_tokens_cached: number | null;
  total_cost: number | null;
  upstream_inference_cost: number | null;
  cache_discount: number | null;
  task_type: string | null;
  workflow_stage: string | null;
  mode: string;
  phase_at_send: string;
  conversation_depth: number;
  project_scoped: boolean;
  attached_dirs_count: number;
  artifact_generated: boolean;
  artifact_type: string | null;
  artifact_path: string | null;
  user_message_length_chars: number;
  assistant_response_length_chars: number;
  follow_up_questions: number | null;
  actionable_items_count: number | null;
  complexity_score: number | null;
  requires_followup: boolean | null;
  context_summary_present: boolean;
  recent_artifact_count: number;
  prompt_context_length_chars: number;
  error_kind: string | null;
  error_message: string | null;
}

export type TelemetryRecord =
  | RequestStartedEvent
  | RequestCompletedEvent
  | GenerationMetadataFetchedEvent
  | TelemetryRequestSummary;

export interface OpenRouterGenerationMetadata {
  id: string | null;
  upstream_id: string | null;
  total_cost: number | null;
  cache_discount: number | null;
  upstream_inference_cost: number | null;
  created_at: string | null;
  model: string | null;
  streamed: boolean;
  cancelled: boolean;
  provider_name: string | null;
  latency: number | null;
  moderation_latency: number | null;
  generation_time: number | null;
  finish_reason: string | null;
  tokens_prompt: number | null;
  tokens_completion: number | null;
  native_tokens_prompt: number | null;
  native_tokens_completion: number | null;
  native_tokens_reasoning: number | null;
  native_tokens_cached: number | null;
  router: string | null;
  provider_responses: unknown[] | null;
  request_id: string | null;
  native_finish_reason: string | null;
}

export interface TelemetrySessionSummary {
  requests: number;
  totalCost: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  averageLatencyMs: number | null;
  artifactsGenerated: number;
}
