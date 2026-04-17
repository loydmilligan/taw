import {
  spawn as realSpawn,
  type ChildProcess,
  type SpawnOptions,
} from 'node:child_process';

const DEFAULT_PYTHON =
  '/home/loydmilligan/Projects/ttstt/venv/bin/python3';
const CLI_MODULE = ['-m', 'voice_coding.cli'] as const;

export type ListenResult =
  | { ok: true; transcript: string }
  | { ok: false; reason: 'hardware' | 'api' | 'empty' | 'other'; detail: string };

type SpawnFn = (
  cmd: string,
  args: readonly string[],
  opts?: SpawnOptions
) => ChildProcess;

export interface VoiceServiceOptions {
  spawn?: SpawnFn;
  pythonPath?: string;
}

export function createVoiceService(opts: VoiceServiceOptions = {}) {
  const spawnFn: SpawnFn = opts.spawn ?? (realSpawn as SpawnFn);
  const pythonPath = opts.pythonPath ?? DEFAULT_PYTHON;

  function listen(durationSecs = 5): Promise<ListenResult> {
    return new Promise((resolve) => {
      const proc = spawnFn(
        pythonPath,
        [...CLI_MODULE, 'listen', '--duration', String(durationSecs)],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      );
      let stdout = '';
      let stderr = '';
      proc.stdout?.on('data', (c: Buffer) => {
        stdout += c.toString();
      });
      proc.stderr?.on('data', (c: Buffer) => {
        stderr += c.toString();
      });
      proc.on('close', (code) => {
        if (code === 0) return resolve({ ok: true, transcript: stdout.trim() });
        if (code === 4)
          return resolve({ ok: false, reason: 'empty', detail: 'No speech detected' });
        if (stderr.startsWith('hardware:') || code === 2)
          return resolve({ ok: false, reason: 'hardware', detail: stderr });
        if (stderr.startsWith('api:') || code === 3)
          return resolve({ ok: false, reason: 'api', detail: stderr });
        resolve({ ok: false, reason: 'other', detail: stderr || `exit ${code}` });
      });
    });
  }

  function speakAsync(text: string): ChildProcess {
    return spawnFn(pythonPath, [...CLI_MODULE, 'speak', text], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
  }

  function interruptSpeak(proc: ChildProcess): void {
    proc.kill('SIGTERM');
    const killTimer = globalThis.setTimeout(() => {
      if (!proc.killed) proc.kill('SIGKILL');
    }, 500);
    proc.on('close', () => globalThis.clearTimeout(killTimer));
  }

  return { listen, speakAsync, interruptSpeak };
}

// Module-level default exports (convenience)
const _default = createVoiceService();
export const listen = _default.listen;
export const speakAsync = _default.speakAsync;
export const interruptSpeak = _default.interruptSpeak;
