import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

function shellEscape(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function hasTmux(): boolean {
  if (process.env.TMUX) {
    return true;
  }
  const result = spawnSync('tmux', ['-V'], { stdio: 'ignore' });
  return result.status === 0;
}

export async function createSession(sessionId: string): Promise<void> {
  await execFileAsync('tmux', [
    'new-session',
    '-d',
    '-s',
    sessionId,
    '-x',
    '220',
    '-y',
    '50'
  ]);
}

export async function killSession(sessionId: string): Promise<void> {
  try {
    await execFileAsync('tmux', ['kill-session', '-t', sessionId]);
  } catch {
    // The session may already have exited after a harness failure or user action.
  }
}

export function sendKeys(sessionId: string, text: string): void {
  execFileSync('tmux', ['send-keys', '-t', sessionId, text, 'Enter']);
}

export function sendKeyRaw(sessionId: string, keyName: string): void {
  execFileSync('tmux', ['send-keys', '-t', sessionId, keyName]);
}

export function capturePane(sessionId: string): string {
  return execFileSync(
    'tmux',
    ['capture-pane', '-t', sessionId, '-p', '-J', '-S', '-200'],
    { encoding: 'utf8' }
  );
}

export async function waitForText(
  sessionId: string,
  pattern: string | RegExp,
  timeoutMs = 10_000,
  intervalMs = 300
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const output = capturePane(sessionId);
    const matched =
      typeof pattern === 'string' ? output.includes(pattern) : pattern.test(output);
    if (matched) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  const output = capturePane(sessionId);
  throw new Error(
    `waitForText timeout (${timeoutMs}ms): "${String(pattern)}" not found.\nLast capture:\n${output.slice(-800)}`
  );
}

export async function buildTawLaunchCommand(): Promise<string> {
  const builtEntryPath = fileURLToPath(
    new URL('../../dist/cli/entry.js', import.meta.url)
  );

  try {
    await access(builtEntryPath);
    return `${shellEscape(process.execPath)} ${shellEscape(builtEntryPath)}`;
  } catch {
    const tsxEntryPath = fileURLToPath(
      new URL('../../src/cli/entry.tsx', import.meta.url)
    );
    return `tsx ${shellEscape(tsxEntryPath)}`;
  }
}
