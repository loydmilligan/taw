import type { AssertStep } from './schema.js';

/**
 * Pure predicate — checks pane text against an assert step.
 * No tmux, no I/O — testable directly with Vitest.
 */
export function checkPane(pane: string, step: AssertStep): { ok: boolean; reason?: string } {
  let target = pane;
  if (step.row !== undefined) {
    target = pane.split('\n')[step.row] ?? '';
  }

  // contains check
  if (step.contains !== undefined) {
    const found = target.includes(step.contains);
    const pass = step.not ? !found : found;
    if (!pass) {
      return {
        ok: false,
        reason: `pane ${step.not ? 'contains' : 'does not contain'} "${step.contains}"`
      };
    }
  }

  // matches (regex string) check
  if (step.matches !== undefined) {
    const re = new RegExp(step.matches);
    const found = re.test(target);
    const pass = step.not ? !found : found;
    if (!pass) {
      return {
        ok: false,
        reason: `pane ${step.not ? 'matches' : 'does not match'} /${step.matches}/`
      };
    }
  }

  return { ok: true };
}

/**
 * Convenience wrapper: throws Error with capture snippet on failure.
 */
export function assertPane(pane: string, step: AssertStep): void {
  const result = checkPane(pane, step);
  if (!result.ok) {
    throw new Error(`Assertion failed: ${result.reason}\nCapture:\n${pane.slice(-600)}`);
  }
}
