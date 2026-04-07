import { getModeDefinition } from '../modes/definitions.js';
import type { TelemetryRequestSummary, TelemetrySessionSummary } from './types.js';

export function deriveTaskType(mode: string): string | null {
  if (mode === 'Brainstorm') {
    return 'planning';
  }

  if (mode === 'Workflow Review') {
    return 'process_review';
  }

  if (mode === 'Workflow Generate') {
    return 'workflow_design';
  }

  return 'chat';
}

export function deriveWorkflowStage(mode: string): string | null {
  if (mode === 'Brainstorm') {
    return 'exploration';
  }

  if (mode === 'Workflow Review') {
    return 'review';
  }

  if (mode === 'Workflow Generate') {
    return 'design';
  }

  return null;
}

export function countFollowUpQuestions(content: string): number {
  return (content.match(/\?/g) ?? []).length;
}

export function countActionableItems(content: string): number {
  const bulletCount = content
    .split('\n')
    .filter((line) => /^[-*]\s+/.test(line.trim())).length;
  return bulletCount;
}

export function deriveComplexityScore(
  userMessage: string,
  mode: string,
  attachedDirsCount: number
): number {
  let score = 1;

  if (userMessage.length > 120) {
    score += 1;
  }

  if (attachedDirsCount > 0) {
    score += 1;
  }

  if (mode !== 'General') {
    score += 1;
  }

  if (/\b(and|or|because|constraints?|review|workflow|plan)\b/i.test(userMessage)) {
    score += 1;
  }

  return Math.min(score, 5);
}

export function deriveRequiresFollowup(content: string): boolean {
  return /\b(unclear|missing|need more|before finalizing|clarify|questions?)\b/i.test(content);
}

export function summarizeSessionUsage(
  summaries: TelemetryRequestSummary[]
): TelemetrySessionSummary {
  const requests = summaries.length;
  const totalCost = summaries.reduce((sum, item) => sum + (item.total_cost ?? 0), 0);
  const promptTokens = summaries.reduce((sum, item) => sum + (item.prompt_tokens ?? 0), 0);
  const completionTokens = summaries.reduce((sum, item) => sum + (item.completion_tokens ?? 0), 0);
  const reasoningTokens = summaries.reduce((sum, item) => sum + (item.reasoning_tokens ?? 0), 0);
  const cachedTokens = summaries.reduce((sum, item) => sum + (item.cached_tokens ?? 0), 0);
  const latencyValues = summaries.map((item) => item.latency_ms).filter((value): value is number => value !== null);
  const averageLatencyMs =
    latencyValues.length > 0
      ? Math.round(latencyValues.reduce((sum, value) => sum + value, 0) / latencyValues.length)
      : null;
  const artifactsGenerated = summaries.filter((item) => item.artifact_generated).length;

  return {
    requests,
    totalCost,
    promptTokens,
    completionTokens,
    reasoningTokens,
    cachedTokens,
    averageLatencyMs,
    artifactsGenerated
  };
}

export function expectedArtifactType(mode: string): string | null {
  return getModeDefinition(mode).artifactType;
}
