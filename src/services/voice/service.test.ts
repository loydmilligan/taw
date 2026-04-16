import { describe, it, expect } from 'vitest';
// RED: ./index.js does not yet exist — Wave 1 will implement it.
import { listen, speakAsync, interruptSpeak } from './index.js';

describe('VoiceService', () => {
  it('listen() resolves { ok: true, transcript } on exit code 0', () => {
    expect(listen).toBeDefined();
    expect(true).toBe(false);
  });

  it('listen() resolves { ok: false, reason: "hardware" } on exit code 2', () => {
    expect(listen).toBeDefined();
    expect(true).toBe(false);
  });

  it('listen() resolves { ok: false, reason: "api" } on exit code 3', () => {
    expect(listen).toBeDefined();
    expect(true).toBe(false);
  });

  it('listen() resolves { ok: false, reason: "empty" } on exit code 4', () => {
    expect(listen).toBeDefined();
    expect(true).toBe(false);
  });

  it('speakAsync() spawns subprocess with args array (never shell string)', () => {
    expect(speakAsync).toBeDefined();
    expect(true).toBe(false);
  });

  it('interruptSpeak() sends SIGTERM', () => {
    expect(interruptSpeak).toBeDefined();
    expect(true).toBe(false);
  });

  it('interruptSpeak() sends SIGKILL after 500ms if still alive', () => {
    expect(interruptSpeak).toBeDefined();
    expect(true).toBe(false);
  });

  it('listen() passes --duration flag from argument', () => {
    expect(listen).toBeDefined();
    expect(true).toBe(false);
  });
});
