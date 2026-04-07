import { appendTelemetryRecord } from './store.js';
import {
  countActionableItems,
  countFollowUpQuestions,
  deriveComplexityScore,
  deriveRequiresFollowup,
  deriveTaskType,
  deriveWorkflowStage,
  expectedArtifactType
} from './derivation.js';
import { fetchOpenRouterGenerationMetadata } from './openrouter-metadata.js';
import type {
  OpenRouterGenerationMetadata,
  RequestCompletedEvent,
  RequestStartedEvent,
  TelemetryRequestSummary
} from './types.js';
import type { ProviderConfig, ProviderStreamFinalInfo, ProviderStreamStartInfo } from '../../types/provider.js';
import type { SessionRecord } from '../../types/session.js';

export interface TelemetryTurn {
  turnId: string;
  requestGroupId: string;
  startedAt: string;
  mode: string;
  phaseAtSend: string;
  latestUserInput: string;
  promptContextLengthChars: number;
  conversationDepth: number;
  projectScoped: boolean;
  attachedDirsCount: number;
  userMessageLengthChars: number;
  contextSummaryPresent: boolean;
  recentArtifactCount: number;
  streamInfo: ProviderStreamStartInfo;
  finalInfo: ProviderStreamFinalInfo;
  firstTokenAt: string | null;
}

export async function recordRequestStarted(
  session: SessionRecord,
  turn: TelemetryTurn,
  providerConfig: ProviderConfig
): Promise<void> {
  const event: RequestStartedEvent = {
    event_type: 'request_started',
    event_at: turn.startedAt,
    session_id: session.metadata.id,
    turn_id: turn.turnId,
    request_group_id: turn.requestGroupId,
    mode: turn.mode,
    provider: providerConfig.provider,
    model_requested: providerConfig.model,
    conversation_depth: turn.conversationDepth,
    project_scoped: turn.projectScoped,
    prompt_context_length_chars: turn.promptContextLengthChars
  };

  await appendTelemetryRecord(session, event);
}

export async function recordRequestCompleted(
  session: SessionRecord,
  turn: TelemetryTurn,
  interruptedByUser: boolean,
  errorKind: string | null,
  errorMessage: string | null
): Promise<void> {
  const event: RequestCompletedEvent = {
    event_type: 'request_completed',
    event_at: new Date().toISOString(),
    session_id: session.metadata.id,
    turn_id: turn.turnId,
    request_group_id: turn.requestGroupId,
    completed_at: new Date().toISOString(),
    interrupted_by_user: interruptedByUser,
    error_kind: errorKind,
    error_message: errorMessage
  };

  await appendTelemetryRecord(session, event);
}

export async function buildAndStoreTelemetrySummary(input: {
  session: SessionRecord;
  turn: TelemetryTurn;
  providerConfig: ProviderConfig;
  assistantText: string;
  interruptedByUser: boolean;
  errorKind: string | null;
  errorMessage: string | null;
  artifactGenerated: boolean;
  artifactPath: string | null;
}): Promise<TelemetryRequestSummary> {
  let metadata: OpenRouterGenerationMetadata | null = null;
  let metadataFetchStatus: TelemetryRequestSummary['metadata_fetch_status'] =
    input.providerConfig.provider === 'openrouter' ? 'failed' : 'not_supported';

  if (
    input.providerConfig.provider === 'openrouter' &&
    input.providerConfig.apiKey &&
    input.turn.streamInfo.generationId
  ) {
    try {
      metadata = await fetchOpenRouterGenerationMetadata(
        input.providerConfig.apiKey,
        input.turn.streamInfo.generationId
      );
      metadataFetchStatus = 'success';
      await appendTelemetryRecord(input.session, {
        event_type: 'generation_metadata_fetched',
        event_at: new Date().toISOString(),
        session_id: input.session.metadata.id,
        turn_id: input.turn.turnId,
        request_group_id: input.turn.requestGroupId,
        generation_id: input.turn.streamInfo.generationId,
        metadata_fetch_status: 'success'
      });
    } catch {
      metadataFetchStatus = 'failed';
      await appendTelemetryRecord(input.session, {
        event_type: 'generation_metadata_fetched',
        event_at: new Date().toISOString(),
        session_id: input.session.metadata.id,
        turn_id: input.turn.turnId,
        request_group_id: input.turn.requestGroupId,
        generation_id: input.turn.streamInfo.generationId,
        metadata_fetch_status: 'failed'
      });
    }
  }

  const summary: TelemetryRequestSummary = {
    event_type: 'request_summary',
    session_id: input.session.metadata.id,
    turn_id: input.turn.turnId,
    request_group_id: input.turn.requestGroupId,
    created_at: new Date().toISOString(),
    started_at: input.turn.startedAt,
    completed_at: new Date().toISOString(),
    provider: input.providerConfig.provider,
    model_requested: input.providerConfig.model,
    model_resolved: input.turn.streamInfo.modelResolved ?? metadata?.model ?? null,
    router: metadata?.router ?? null,
    generation_id: input.turn.streamInfo.generationId ?? metadata?.id ?? null,
    provider_request_id: input.turn.streamInfo.providerRequestId ?? null,
    upstream_id: metadata?.upstream_id ?? null,
    request_id: metadata?.request_id ?? input.turn.streamInfo.requestId ?? null,
    provider_name: metadata?.provider_name ?? null,
    provider_responses: metadata?.provider_responses ?? null,
    streamed: true,
    cancelled: input.interruptedByUser || metadata?.cancelled === true,
    interrupted_by_user: input.interruptedByUser,
    metadata_fetch_status: metadataFetchStatus,
    finish_reason: input.turn.finalInfo.finishReason ?? metadata?.finish_reason ?? null,
    native_finish_reason: metadata?.native_finish_reason ?? null,
    latency_ms: metadata?.latency ?? null,
    generation_time_ms: metadata?.generation_time ?? null,
    moderation_latency_ms: metadata?.moderation_latency ?? null,
    time_to_first_token_ms: input.turn.firstTokenAt
      ? new Date(input.turn.firstTokenAt).getTime() - new Date(input.turn.startedAt).getTime()
      : null,
    prompt_tokens: metadata?.tokens_prompt ?? null,
    completion_tokens: metadata?.tokens_completion ?? null,
    reasoning_tokens: metadata?.native_tokens_reasoning ?? null,
    cached_tokens: metadata?.native_tokens_cached ?? null,
    native_tokens_prompt: metadata?.native_tokens_prompt ?? null,
    native_tokens_completion: metadata?.native_tokens_completion ?? null,
    native_tokens_reasoning: metadata?.native_tokens_reasoning ?? null,
    native_tokens_cached: metadata?.native_tokens_cached ?? null,
    total_cost: metadata?.total_cost ?? null,
    upstream_inference_cost: metadata?.upstream_inference_cost ?? null,
    cache_discount: metadata?.cache_discount ?? null,
    task_type: deriveTaskType(input.turn.mode),
    workflow_stage: deriveWorkflowStage(input.turn.mode),
    mode: input.turn.mode,
    phase_at_send: input.turn.phaseAtSend,
    conversation_depth: input.turn.conversationDepth,
    project_scoped: input.turn.projectScoped,
    attached_dirs_count: input.turn.attachedDirsCount,
    artifact_generated: input.artifactGenerated,
    artifact_type: input.artifactGenerated ? expectedArtifactType(input.turn.mode) : null,
    artifact_path: input.artifactPath,
    user_message_length_chars: input.turn.userMessageLengthChars,
    assistant_response_length_chars: input.assistantText.length,
    follow_up_questions: countFollowUpQuestions(input.assistantText),
    actionable_items_count: countActionableItems(input.assistantText),
    complexity_score: deriveComplexityScore(
      input.turn.latestUserInput,
      input.turn.mode,
      input.turn.attachedDirsCount
    ),
    requires_followup: deriveRequiresFollowup(input.assistantText),
    context_summary_present: input.turn.contextSummaryPresent,
    recent_artifact_count: input.turn.recentArtifactCount,
    prompt_context_length_chars: input.turn.promptContextLengthChars,
    error_kind: input.errorKind,
    error_message: input.errorMessage
  };

  await appendTelemetryRecord(input.session, summary);
  return summary;
}
