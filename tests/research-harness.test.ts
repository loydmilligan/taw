import { describe, expect, it } from 'vitest';
import { evaluateHarnessRun } from '../src/services/testing/research-harness.js';

describe('research harness evaluator', () => {
  it('fails when clarification questions and missing verification labels appear', () => {
    const evaluation = evaluateHarnessRun(
      [
        '# Political Research Brief',
        'Here are my follow-up questions',
        'Suggested Next Steps'
      ].join('\n'),
      {
        requiredSignals: ['confirmed', 'disputed', 'unsupported'],
        forbiddenSignals: ['Here are my follow-up questions']
      }
    );

    expect(evaluation.verdict).toBe('fail');
    expect(evaluation.findings.join('\n')).toContain('Missing required signal');
    expect(evaluation.findings.join('\n')).toContain('Hit forbidden signal');
  });

  it('fails when the assistant blocks on unnecessary setup language', () => {
    const evaluation = evaluateHarnessRun(
      [
        'Draft Response',
        'Before I begin the verification process, I need a bit more information.',
        'What is the URL of the article?',
        'Once I have the article, I will proceed.'
      ].join('\n'),
      {
        requiredSignals: ['confirmed', 'disputed', 'unsupported'],
        forbiddenSignals: ['What is the URL']
      }
    );

    expect(evaluation.verdict).toBe('fail');
    expect(evaluation.findings.join('\n')).toContain('blocking setup language');
    expect(evaluation.metrics.blockedResearchPhraseCount).toBeGreaterThan(0);
  });

  it('passes when verification labels are present and no forbidden signal appears', () => {
    const evaluation = evaluateHarnessRun(
      [
        'Working research notes',
        'confirmed: Reuters confirms a ceasefire announcement existed',
        'disputed: regional coverage differs on specific terms',
        'unsupported: no independent source confirmed the tabloid claim'
      ].join('\n'),
      {
        requiredSignals: ['confirmed', 'disputed', 'unsupported'],
        forbiddenSignals: ['Here are my follow-up questions']
      }
    );

    expect(evaluation.verdict).toBe('pass');
  });
});
