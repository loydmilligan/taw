import type {
  TelemetryRequestSummary,
  TelemetrySessionSummary
} from '../core/telemetry/types.js';

export type AppPhase = 'idle' | 'thinking' | 'draft-ready';

export interface InputState {
  value: string;
  cursor: number;
}

export interface UsageSnapshot {
  session: TelemetrySessionSummary;
  lastRequest: TelemetryRequestSummary | null;
}

export const emptyUsageSnapshot: UsageSnapshot = {
  session: {
    requests: 0,
    totalCost: 0,
    promptTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    cachedTokens: 0,
    averageLatencyMs: null,
    artifactsGenerated: 0
  },
  lastRequest: null
};

export function currentDraftTitle(mode: string): string {
  return mode === 'General' ? 'Assistant' : 'Draft Response';
}

export function resolvePhaseAfterCommand(
  nextMode: string,
  currentPhase: AppPhase
): AppPhase {
  return nextMode === 'General' ? 'idle' : currentPhase;
}

export function insertInputText(
  state: InputState,
  rawChunk: string
): InputState {
  const chunk = normalizeChunk(rawChunk);
  if (!chunk) {
    return state;
  }

  return {
    value:
      state.value.slice(0, state.cursor) +
      chunk +
      state.value.slice(state.cursor),
    cursor: state.cursor + chunk.length
  };
}

export function deleteBackward(state: InputState): InputState {
  if (state.cursor === 0) {
    return state;
  }

  return {
    value:
      state.value.slice(0, state.cursor - 1) + state.value.slice(state.cursor),
    cursor: state.cursor - 1
  };
}

export function deleteForward(state: InputState): InputState {
  if (state.cursor >= state.value.length) {
    return state;
  }

  return {
    value:
      state.value.slice(0, state.cursor) + state.value.slice(state.cursor + 1),
    cursor: state.cursor
  };
}

export function moveCursor(state: InputState, delta: number): InputState {
  return {
    ...state,
    cursor: Math.max(0, Math.min(state.value.length, state.cursor + delta))
  };
}

export function moveCursorToStart(state: InputState): InputState {
  return {
    ...state,
    cursor: 0
  };
}

export function moveCursorToEnd(state: InputState): InputState {
  return {
    ...state,
    cursor: state.value.length
  };
}

export function toDisplayValue(value: string): string {
  return normalizeChunk(value);
}

export function toDisplayCursor(value: string, cursor: number): number {
  return normalizeChunk(value.slice(0, cursor)).length;
}

function normalizeChunk(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, ' ');
}
