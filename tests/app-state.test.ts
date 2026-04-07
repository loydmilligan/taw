import { describe, expect, it } from 'vitest';
import {
  currentDraftTitle,
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
});
