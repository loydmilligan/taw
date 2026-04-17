// In-session voice cost tracker (NOT persisted, NOT shared with chat telemetry).
// Source: CONTEXT.md D-Claude-Discretion guardrails; RESEARCH.md cost cap $0.10/session.

let spentUsd = 0;

export function addCost(delta: number): void {
  if (!Number.isFinite(delta) || delta < 0) {
    throw new Error(`voiceCost: invalid delta ${delta}`);
  }
  spentUsd += delta;
}

export function getSpent(): number {
  return spentUsd;
}

export function reset(): void {
  spentUsd = 0;
}

export function isCapped(capUsd: number): boolean {
  return spentUsd >= capUsd;
}
