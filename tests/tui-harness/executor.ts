import type { Step, StepTrace } from './schema.js';
import {
  sendKeys,
  sendText,
  sendKeyRaw,
  waitForText,
  capturePane,
  buildTawLaunchCommand
} from './session.js';
import { assertPane } from './assertions.js';

function stepInputSummary(step: Step): string {
  switch (step.action) {
    case 'launch': return `launch${step.cwd ? ` cwd=${step.cwd}` : ''}${step.args?.length ? ` args=${step.args.join(' ')}` : ''}`;
    case 'type':   return `type: ${JSON.stringify(step.text)}`;
    case 'key':    return `key: ${step.key}`;
    case 'wait':   return `wait for: ${step.for}${step.timeout ? ` (${step.timeout}ms)` : ''}`;
    case 'assert': {
      const parts: string[] = [];
      if (step.not) parts.push('not');
      if (step.contains !== undefined) parts.push(`contains: ${JSON.stringify(step.contains)}`);
      if (step.matches !== undefined)  parts.push(`matches: /${step.matches}/`);
      if (step.row !== undefined)      parts.push(`row: ${step.row}`);
      return `assert ${parts.join(', ')}`;
    }
    case 'sleep':  return `sleep ${step.ms}ms`;
    default: {
      const _exhaustive: never = step;
      return `unknown: ${JSON.stringify(_exhaustive)}`;
    }
  }
}

// Attach a StepTrace to an error so the runner can recover it after catching.
export interface TracedError extends Error {
  stepTrace: StepTrace;
}

function safeCapture(sessionId: string): string {
  try { return capturePane(sessionId) ?? ''; } catch { return ''; }
}

export async function executeStep(
  sessionId: string,
  step: Step,
  fixture: string | undefined,
  stepIndex: number
): Promise<StepTrace> {
  const start = Date.now();
  const input = stepInputSummary(step);

  try {
    switch (step.action) {
      case 'launch': {
        const tawCmd = await buildTawLaunchCommand();
        const cwd = step.cwd ?? fixture ?? process.cwd();
        const extra = (step.args ?? []).map((a) => ` ${a}`).join('');
        sendKeys(sessionId, `cd '${cwd.replaceAll("'", "'\\''")}' && ${tawCmd}${extra}`);
        break;
      }
      case 'type': {
        sendText(sessionId, step.text);
        await new Promise((r) => setTimeout(r, 75));
        sendKeyRaw(sessionId, 'Enter');
        break;
      }
      case 'key': {
        sendKeyRaw(sessionId, step.key);
        break;
      }
      case 'wait': {
        const timeout = step.timeout ?? 10_000;
        const pat =
          step.for.startsWith('/') && step.for.endsWith('/') && step.for.length > 2
            ? new RegExp(step.for.slice(1, -1))
            : step.for;
        await waitForText(sessionId, pat, timeout);
        break;
      }
      case 'assert': {
        const pane = capturePane(sessionId);
        assertPane(pane, step);
        break;
      }
      case 'sleep': {
        await new Promise((r) => setTimeout(r, step.ms));
        break;
      }
      default: {
        const _exhaustive: never = step;
        throw new Error(`Unknown step action: ${JSON.stringify(_exhaustive)}`);
      }
    }
  } catch (e) {
    // Capture pane at point of failure, attach trace to error so runner can use it.
    const paneAfter = safeCapture(sessionId);
    const errorMsg = e instanceof Error ? e.message : String(e);
    const trace: StepTrace = { stepIndex, action: step.action, input, paneAfter, durationMs: Date.now() - start, error: errorMsg };
    const err = e instanceof Error ? e : new Error(errorMsg);
    (err as TracedError).stepTrace = trace;
    throw err;
  }

  // Step passed — capture final pane state.
  const paneAfter = safeCapture(sessionId);
  return { stepIndex, action: step.action, input, paneAfter, durationMs: Date.now() - start };
}
