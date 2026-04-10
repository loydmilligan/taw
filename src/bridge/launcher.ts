import { spawn, spawnSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export interface LaunchResult {
  launchMethod: 'tmux' | 'custom-terminal' | 'manual';
  command: string;
}

export async function launchResearchSession(
  payloadPath: string,
  cwd: string,
  windowName = 'taw research'
): Promise<LaunchResult> {
  const command = await buildResearchCommand(payloadPath);
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

async function buildResearchCommand(payloadPath: string): Promise<string> {
  const builtEntryPath = fileURLToPath(
    new URL('../../dist/cli/entry.js', import.meta.url)
  );

  try {
    await access(builtEntryPath);
    return `${shellEscape(process.execPath)} ${shellEscape(builtEntryPath)} --research-from-browser ${shellEscape(payloadPath)}`;
  } catch {
    const tsxEntryPath = fileURLToPath(
      new URL('../cli/entry.tsx', import.meta.url)
    );
    return `tsx ${shellEscape(tsxEntryPath)} --research-from-browser ${shellEscape(payloadPath)}`;
  }
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
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/sh', ['-lc', command], {
      cwd,
      stdio: 'ignore',
      detached: true
    });

    child.unref();
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
