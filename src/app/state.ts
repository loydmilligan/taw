export type AppPhase = 'idle' | 'thinking' | 'draft-ready';

export function currentDraftTitle(mode: string): string {
  return mode === 'General' ? 'Assistant' : 'Draft Response';
}

export function resolvePhaseAfterCommand(
  nextMode: string,
  currentPhase: AppPhase
): AppPhase {
  return nextMode === 'General' ? 'idle' : currentPhase;
}
