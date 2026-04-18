import type { ChildProcess } from 'node:child_process';

export type InterruptFn = (proc: ChildProcess) => void;
export type ProcRef = { current: ChildProcess | null };

/**
 * D-10 contract: any keypress during TTS must (a) interrupt playback if active
 * AND (b) still fall through to the default input handler so the key types into
 * the input box. This helper factors that logic out of App.tsx's useInput so it
 * is directly unit-testable (per Pitfall #6: no `return` after interruptSpeak).
 */
export function handleKeyWithInterrupt(
  _key: unknown,
  activeSpeakProcRef: ProcRef,
  interruptSpeak: InterruptFn,
  defaultHandler: () => void,
): void {
  const proc = activeSpeakProcRef.current;
  if (proc && !proc.killed) {
    interruptSpeak(proc);
    activeSpeakProcRef.current = null;
  }
  // INTENTIONAL: no early-return. defaultHandler ALWAYS runs (D-10 fallthrough).
  defaultHandler();
}
