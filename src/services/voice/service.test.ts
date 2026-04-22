import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVoiceService } from './index.js';
import type { VoiceServiceOptions } from './index.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function fakeChild(exitCode: number, stdout = '', stderr = ''): ChildProcess {
  const proc = new EventEmitter() as ChildProcess & EventEmitter;
  proc.stdout = new EventEmitter() as ChildProcess['stdout'];
  proc.stderr = new EventEmitter() as ChildProcess['stderr'];
  proc.kill = vi.fn() as ChildProcess['kill'];
  proc.killed = false;
  setTimeout(() => {
    if (stdout) proc.stdout.emit('data', Buffer.from(stdout));
    if (stderr) proc.stderr.emit('data', Buffer.from(stderr));
    proc.emit('close', exitCode);
  }, 0);
  return proc;
}

describe('VoiceService', () => {
  it('listen() resolves { ok: true, transcript } on exit code 0', async () => {
    const spawn = vi.fn<VoiceServiceOptions['spawn']>().mockImplementation(() => fakeChild(0, 'hello world\n'));
    const svc = createVoiceService({ spawn, pythonPath: '/x/python3' });
    const result = await svc.listen(5);
    expect(result).toEqual({ ok: true, transcript: 'hello world' });
    expect(spawn).toHaveBeenCalledWith(
      '/x/python3',
      ['-m', 'voice_coding.cli', 'listen', '--duration', '5'],
      expect.any(Object)
    );
  });

  it('listen() resolves { ok: false, reason: "hardware" } on exit code 2', async () => {
    const spawn = vi.fn<VoiceServiceOptions['spawn']>().mockImplementation(() => fakeChild(2, '', 'hardware: mic not found'));
    const svc = createVoiceService({ spawn, pythonPath: '/x/python3' });
    const result = await svc.listen(5);
    expect(result).toMatchObject({ ok: false, reason: 'hardware' });
  });

  it('listen() resolves { ok: false, reason: "api" } on exit code 3', async () => {
    const spawn = vi.fn<VoiceServiceOptions['spawn']>().mockImplementation(() => fakeChild(3, '', 'api: auth failed'));
    const svc = createVoiceService({ spawn, pythonPath: '/x/python3' });
    const result = await svc.listen(5);
    expect(result).toMatchObject({ ok: false, reason: 'api' });
  });

  it('listen() resolves { ok: false, reason: "empty" } on exit code 4', async () => {
    const spawn = vi.fn<VoiceServiceOptions['spawn']>().mockImplementation(() => fakeChild(4));
    const svc = createVoiceService({ spawn, pythonPath: '/x/python3' });
    const result = await svc.listen(5);
    expect(result).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('speakAsync() spawns subprocess with args array (never shell string)', () => {
    const spawn = vi.fn<VoiceServiceOptions['spawn']>().mockImplementation(() => fakeChild(0));
    const svc = createVoiceService({ spawn, pythonPath: '/x/python3' });
    svc.speakAsync('hello');
    expect(spawn).toHaveBeenCalledWith(
      '/x/python3',
      ['-m', 'voice_coding.cli', 'speak', 'hello'],
      expect.any(Object)
    );
    // Verify args[1] is an array (not a shell string)
    const call = spawn.mock.calls[0];
    expect(Array.isArray(call[1])).toBe(true);
  });

  it('interruptSpeak() sends SIGTERM', () => {
    const proc = new EventEmitter() as ChildProcess & EventEmitter;
    proc.kill = vi.fn() as ChildProcess['kill'];
    proc.killed = false;
    const { interruptSpeak } = createVoiceService({ spawn: vi.fn<VoiceServiceOptions['spawn']>() });
    interruptSpeak(proc);
    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('interruptSpeak() sends SIGKILL after 500ms if still alive', () => {
    vi.useFakeTimers();
    const proc = new EventEmitter() as ChildProcess & EventEmitter;
    proc.kill = vi.fn() as ChildProcess['kill'];
    proc.killed = false;
    const { interruptSpeak } = createVoiceService({ spawn: vi.fn<VoiceServiceOptions['spawn']>() });
    interruptSpeak(proc);
    vi.advanceTimersByTime(500);
    expect(proc.kill).toHaveBeenCalledWith('SIGKILL');
    vi.useRealTimers();
  });

  it('listen() passes --duration flag from argument', async () => {
    const spawn = vi.fn<VoiceServiceOptions['spawn']>().mockImplementation(() => fakeChild(0, 'x'));
    const svc = createVoiceService({ spawn, pythonPath: '/p' });
    await svc.listen(12);
    expect(spawn).toHaveBeenCalledWith(
      '/p',
      expect.arrayContaining(['--duration', '12']),
      expect.any(Object)
    );
  });

  it('never imports exec or execSync', () => {
    const src = readFileSync(join(__dirname, 'index.ts'), 'utf8');
    expect(src).not.toMatch(/\bexecSync\b/);
    expect(src).not.toMatch(/\bexec\s*\(/);
  });
});
