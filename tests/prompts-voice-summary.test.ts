import { describe, expect, it } from 'vitest';
import { buildModeSystemPrompt } from '../src/core/prompts/modes.js';

describe('Brainstorm prompts include VOICE SUMMARY directive', () => {
  it('Phase 1 prompt contains [VOICE SUMMARY]: instruction', () => {
    const p = buildModeSystemPrompt('Brainstorm');
    expect(p).toContain('[VOICE SUMMARY]:');
    expect(p).toMatch(/first line/i);
  });

  it('Phase 2 prompt contains [VOICE SUMMARY]: instruction', () => {
    const p = buildModeSystemPrompt('Brainstorm Phase 2');
    expect(p).toContain('[VOICE SUMMARY]:');
  });
});
