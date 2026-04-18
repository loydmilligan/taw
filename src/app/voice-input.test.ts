import { describe, expect, it, vi } from 'vitest';
import { handleKeyWithInterrupt } from './voice-input.js';

function makeProc(killed = false): any {
  return { killed, kill: vi.fn() };
}

describe('handleKeyWithInterrupt (D-10 fallthrough contract)', () => {
  it('calls interruptSpeak AND defaultHandler when a speak proc is active', () => {
    const proc = makeProc(false);
    const ref = { current: proc };
    const interruptSpeak = vi.fn();
    const defaultHandler = vi.fn();
    handleKeyWithInterrupt('a', ref, interruptSpeak, defaultHandler);
    expect(interruptSpeak).toHaveBeenCalledWith(proc);
    expect(defaultHandler).toHaveBeenCalledTimes(1); // CRITICAL: fallthrough
    expect(ref.current).toBeNull(); // ref cleared
  });

  it('calls defaultHandler only (no interrupt) when no speak proc is active', () => {
    const ref: { current: any } = { current: null };
    const interruptSpeak = vi.fn();
    const defaultHandler = vi.fn();
    handleKeyWithInterrupt('a', ref, interruptSpeak, defaultHandler);
    expect(interruptSpeak).not.toHaveBeenCalled();
    expect(defaultHandler).toHaveBeenCalledTimes(1);
  });

  it('skips interrupt when proc is already killed, still calls defaultHandler', () => {
    const proc = makeProc(true);
    const ref = { current: proc };
    const interruptSpeak = vi.fn();
    const defaultHandler = vi.fn();
    handleKeyWithInterrupt('a', ref, interruptSpeak, defaultHandler);
    expect(interruptSpeak).not.toHaveBeenCalled();
    expect(defaultHandler).toHaveBeenCalledTimes(1);
  });

  it('does NOT swallow the key — defaultHandler always receives control (D-10)', () => {
    const proc = makeProc(false);
    const ref = { current: proc };
    let defaultRan = false;
    handleKeyWithInterrupt('x', ref, vi.fn(), () => { defaultRan = true; });
    expect(defaultRan).toBe(true);
  });
});
