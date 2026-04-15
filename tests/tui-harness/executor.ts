import type { Step } from './schema.js';
import {
  sendKeys,
  sendText,
  sendKeyRaw,
  waitForText,
  capturePane,
  buildTawLaunchCommand
} from './session.js';
import { assertPane } from './assertions.js';

export async function executeStep(
  sessionId: string,
  step: Step,
  fixture?: string
): Promise<void> {
  switch (step.action) {
    case 'launch': {
      const tawCmd = await buildTawLaunchCommand();
      const cwd = step.cwd ?? fixture ?? process.cwd();
      const extra = (step.args ?? []).map((a) => ` ${a}`).join('');
      sendKeys(sessionId, `cd '${cwd.replaceAll("'", "'\\''")}' && ${tawCmd}${extra}`);
      return;
    }
    case 'type': {
      sendText(sessionId, step.text);
      await new Promise((r) => setTimeout(r, 75));
      sendKeyRaw(sessionId, 'Enter');
      return;
    }
    case 'key': {
      sendKeyRaw(sessionId, step.key);
      return;
    }
    case 'wait': {
      const timeout = step.timeout ?? 10_000;
      const pat =
        step.for.startsWith('/') && step.for.endsWith('/') && step.for.length > 2
          ? new RegExp(step.for.slice(1, -1))
          : step.for;
      await waitForText(sessionId, pat, timeout);
      return;
    }
    case 'assert': {
      const pane = capturePane(sessionId);
      assertPane(pane, step);
      return;
    }
    case 'sleep': {
      await new Promise((r) => setTimeout(r, step.ms));
      return;
    }
    default: {
      const _exhaustive: never = step;
      throw new Error(`Unknown step action: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
