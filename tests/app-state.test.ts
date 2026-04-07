import { describe, expect, it } from 'vitest';
import {
  currentDraftTitle,
  deleteBackward,
  deleteForward,
  insertInputText,
  moveCursor,
  resolvePhaseAfterCommand
} from '../src/app/state.js';

describe('app state helpers', () => {
  it('uses draft titles for structured modes only', () => {
    expect(currentDraftTitle('General')).toBe('Assistant');
    expect(currentDraftTitle('Brainstorm')).toBe('Draft Response');
  });

  it('preserves idle phase when entering a structured mode and resets on general mode', () => {
    expect(resolvePhaseAfterCommand('Brainstorm', 'idle')).toBe('idle');
    expect(resolvePhaseAfterCommand('Workflow Review', 'draft-ready')).toBe(
      'draft-ready'
    );
    expect(resolvePhaseAfterCommand('General', 'draft-ready')).toBe('idle');
  });

  it('inserts pasted multiline content as one buffer edit instead of multiple submissions', () => {
    const next = insertInputText(
      { value: 'abc', cursor: 3 },
      ' one\r\ntwo\nthree'
    );

    expect(next.value).toBe('abc one two three');
    expect(next.cursor).toBe(next.value.length);
  });

  it('supports cursor movement and backspace/delete editing', () => {
    const moved = moveCursor({ value: 'hello', cursor: 5 }, -2);
    expect(moved.cursor).toBe(3);

    const backspaced = deleteBackward(moved);
    expect(backspaced.value).toBe('helo');
    expect(backspaced.cursor).toBe(2);

    const deleted = deleteForward({ value: 'world', cursor: 1 });
    expect(deleted.value).toBe('wrld');
    expect(deleted.cursor).toBe(1);
  });
});
