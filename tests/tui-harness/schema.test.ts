import { describe, expect, it } from 'vitest';
import { StepSchema, TestSuiteSchema } from './schema.js';

describe('TestSuiteSchema', () => {
  it('parses a minimal valid spec with empty tests array', () => {
    const result = TestSuiteSchema.parse({ suite: 'smoke', tests: [] });
    expect(result.suite).toBe('smoke');
    expect(result.tests).toEqual([]);
  });

  it('parses a full spec with all action types in steps', () => {
    const result = TestSuiteSchema.parse({
      suite: 'full',
      description: 'All step types',
      timeout: 15000,
      tests: [
        {
          name: 'all-actions',
          description: 'Exercise every action',
          fixture: 'qa-fixtures/workspace',
          steps: [
            { action: 'launch', cwd: '/tmp', args: ['--no-key'] },
            { action: 'type', text: '/help' },
            { action: 'wait', for: 'TAW ', timeout: 8000 },
            { action: 'assert', contains: 'Mode General', row: 0 },
            { action: 'key', key: 'C-c' },
            { action: 'sleep', ms: 500 }
          ]
        }
      ]
    });
    expect(result.suite).toBe('full');
    expect(result.tests[0]!.steps).toHaveLength(6);
  });

  it('rejects a spec with unknown action type', () => {
    expect(() =>
      TestSuiteSchema.parse({
        suite: 'bad',
        tests: [{ name: 't', steps: [{ action: 'unknown' }] }]
      })
    ).toThrow();
  });

  it('rejects a spec missing the required suite field', () => {
    expect(() =>
      TestSuiteSchema.parse({
        tests: []
      })
    ).toThrow();
  });

  it('rejects a type step missing the required text field', () => {
    expect(() =>
      StepSchema.parse({ action: 'type' })
    ).toThrow();
  });

  it('parses an assert step with contains, not, and optional row/matches', () => {
    const result = StepSchema.parse({ action: 'assert', contains: 'x', not: true });
    expect(result).toMatchObject({ action: 'assert', contains: 'x', not: true });
    // row and matches are optional — should be absent
    if (result.action === 'assert') {
      expect(result.row).toBeUndefined();
      expect(result.matches).toBeUndefined();
    }
  });

  it('parses a suite without a top-level timeout field', () => {
    const result = TestSuiteSchema.parse({ suite: 'no-timeout', tests: [] });
    expect(result.timeout).toBeUndefined();
  });
});
