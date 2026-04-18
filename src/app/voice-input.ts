import type { ChildProcess } from 'node:child_process';

export type InterruptFn = (proc: ChildProcess) => void;
export type ProcRef = { current: ChildProcess | null };

export interface KeyEvent {
  value: string;
  key: {
    escape?: boolean;
    return?: boolean;
    backspace?: boolean;
    delete?: boolean;
    upArrow?: boolean;
    downArrow?: boolean;
    leftArrow?: boolean;
    rightArrow?: boolean;
    ctrl?: boolean;
    meta?: boolean;
    shift?: boolean;
    tab?: boolean;
    [k: string]: unknown;
  };
}

/**
 * Returns true if this keypress represents intentional user input that should
 * interrupt TTS — i.e. printable characters, Enter, Backspace, or Escape.
 * Pure navigation (arrow keys, Tab alone) and bare modifier keys do not count.
 */
function isInterruptingKey(ev: KeyEvent): boolean {
  const { value, key } = ev;
  if (key.escape || key.return || key.backspace || key.delete) return true;
  // Printable character (length 1, not a bare modifier)
  if (value.length === 1 && !key.ctrl && !key.meta) return true;
  return false;
}

/**
 * D-10 contract: intentional keypresses during TTS (a) interrupt playback if active
 * AND (b) fall through to the default input handler so the key types into the input box.
 * Pure navigation keys (arrows, Tab) pass through without interrupting TTS.
 */
export function handleKeyWithInterrupt(
  ev: KeyEvent,
  activeSpeakProcRef: ProcRef,
  interruptSpeak: InterruptFn,
  defaultHandler: () => void,
): void {
  const proc = activeSpeakProcRef.current;
  if (proc && !proc.killed && isInterruptingKey(ev)) {
    interruptSpeak(proc);
    activeSpeakProcRef.current = null;
  }
  // INTENTIONAL: no early-return. defaultHandler ALWAYS runs (D-10 fallthrough).
  defaultHandler();
}
