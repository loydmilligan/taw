import { spawn, spawnSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export interface LaunchResult {
  launchMethod: 'tmux' | 'custom-terminal' | 'manual' | 'background';
  command: string;
}

export interface LaunchSessionInput {
  researchPayloadPath?: string;
  queuedInputsPath?: string;
  runQueuedAndExit?: boolean;
}

export async function launchResearchSession(
  payloadPath: string,
  cwd: string,
  windowName = 'taw research'
): Promise<LaunchResult> {
  return launchTawSession({ researchPayloadPath: payloadPath }, cwd, windowName);
}

export async function launchTawSessionBackground(
  input: LaunchSessionInput,
  cwd: string,
  onExit: (code: number | null) => void
): Promise<LaunchResult> {
  const command = await buildSessionCommand(input);
  await runBackgroundCommand(command, cwd, onExit);
  return { launchMethod: 'background', command };
}

export async function launchTawSession(
  input: LaunchSessionInput,
  cwd: string,
  windowName = 'taw'
): Promise<LaunchResult> {
  const command = await buildSessionCommand(input);

  if (input.runQueuedAndExit) {
    await runBackgroundCommand(command, cwd);
    return {
      launchMethod: 'background',
      command
    };
  }

  const customLauncher = process.env.TAW_BRIDGE_TERMINAL_CMD;

  if (customLauncher) {
    await runShellCommand(customLauncher.replace('{command}', command), cwd);
    return {
      launchMethod: 'custom-terminal',
      command
    };
  }

  if (hasTmux()) {
    await runTmuxWindow(command, cwd, windowName);
    return {
      launchMethod: 'tmux',
      command
    };
  }

  return {
    launchMethod: 'manual',
    command
  };
}

async function buildSessionCommand(input: LaunchSessionInput): Promise<string> {
  // When the bridge itself is running from source (tsx dev mode), launch the
  // research session from source too so both sessions share the same code.
  // When running from dist, prefer the built entry for consistency.
  const runningFromSource = import.meta.url.includes('/src/');
  const flags = buildCliFlags(input);

  if (!runningFromSource) {
    const builtEntryPath = fileURLToPath(
      new URL('../../dist/cli/entry.js', import.meta.url)
    );

    try {
      await access(builtEntryPath);
      return `${shellEscape(process.execPath)} ${shellEscape(builtEntryPath)}${flags}`;
    } catch {
      // dist not available, fall through to tsx
    }
  }

  const tsxEntryPath = fileURLToPath(
    new URL('../cli/entry.tsx', import.meta.url)
  );
  return `tsx ${shellEscape(tsxEntryPath)}${flags}`;
}

function buildCliFlags(input: LaunchSessionInput): string {
  const parts: string[] = [];

  if (input.researchPayloadPath) {
    parts.push(
      '--research-from-browser',
      shellEscape(input.researchPayloadPath)
    );
  }

  if (input.queuedInputsPath) {
    parts.push('--queued-inputs-file', shellEscape(input.queuedInputsPath));
  }

  if (input.runQueuedAndExit) {
    parts.push('--run-queued-and-exit');
  }

  return parts.length > 0 ? ` ${parts.join(' ')}` : '';
}

function hasTmux(): boolean {
  if (process.env.TMUX) {
    return true;
  }

  const result = spawnSync('tmux', ['-V'], { stdio: 'ignore' });
  return result.status === 0;
}

function runTmuxWindow(
  command: string,
  cwd: string,
  windowName: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'tmux',
      [
        'new-window',
        '-n',
        normalizeTmuxWindowName(windowName),
        `cd ${shellEscape(cwd)} && ${command}`
      ],
      { stdio: 'ignore' }
    );

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(`tmux new-window failed with exit code ${code ?? 'unknown'}.`)
      );
    });
    child.on('error', reject);
  });
}

function runShellCommand(command: string, cwd: string): Promise<void> {
  return runBackgroundCommand(command, cwd);
}

function runBackgroundCommand(
  command: string,
  cwd: string,
  onExit?: (code: number | null) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/sh', ['-lc', command], {
      cwd,
      stdio: 'ignore',
      detached: true
    });

    if (onExit) {
      child.on('exit', (code) => onExit(code));
    } else {
      child.unref();
    }

    child.on('error', reject);
    resolve();
  });
}

function shellEscape(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function normalizeTmuxWindowName(value: string): string {
  const normalized = stripControlCharacters(value).replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, 80) : 'taw research';
}

function stripControlCharacters(value: string): string {
  return Array.from(value)
    .map((char) => {
      const code = char.charCodeAt(0);
      return code < 32 || code === 127 ? ' ' : char;
    })
    .join('');
}
