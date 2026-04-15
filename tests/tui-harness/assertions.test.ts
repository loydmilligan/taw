import { describe, expect, it } from 'vitest';
import type { AssertStep } from './schema.js';
import { assertPane, checkPane } from './assertions.js';

describe('checkPane', () => {
  it('returns ok:true when pane contains the expected substring', () => {
    const result = checkPane('Mode General State Project', {
      action: 'assert',
      contains: 'Mode General'
    } as AssertStep);
    expect(result.ok).toBe(true);
  });

  it('returns ok:false with reason when pane does not contain expected substring', () => {
    const result = checkPane('Mode General', {
      action: 'assert',
      contains: 'Mode Brainstorm'
    } as AssertStep);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('does not contain "Mode Brainstorm"');
  });

  it('returns ok:true when not:true and pane does NOT contain the substring', () => {
    const result = checkPane('Mode General', {
      action: 'assert',
      contains: 'Mode Brainstorm',
      not: true
    } as AssertStep);
    expect(result.ok).toBe(true);
  });

  it('returns ok:false when not:true but pane DOES contain the substring', () => {
    const result = checkPane('Mode General', {
      action: 'assert',
      contains: 'Mode General',
      not: true
    } as AssertStep);
    expect(result.ok).toBe(false);
  });

  it('returns ok:true when pane matches the regex', () => {
    const result = checkPane('Phase idle', {
      action: 'assert',
      matches: 'Phase (idle|thinking)'
    } as AssertStep);
    expect(result.ok).toBe(true);
  });

  it('returns ok:false when pane does not match the anchored regex', () => {
    const result = checkPane('Phase ready', {
      action: 'assert',
      matches: '^Phase (idle|thinking)$'
    } as AssertStep);
    expect(result.ok).toBe(false);
  });

  it('with row:0, only checks first line — second line content returns ok:false', () => {
    const result = checkPane('first\nsecond', {
      action: 'assert',
      contains: 'second',
      row: 0
    } as AssertStep);
    expect(result.ok).toBe(false);
  });

  it('with row:1, checks second line — second line content returns ok:true', () => {
    const result = checkPane('first\nsecond', {
      action: 'assert',
      contains: 'second',
      row: 1
    } as AssertStep);
    expect(result.ok).toBe(true);
  });

  it('returns ok:true when neither contains nor matches is specified (no-op)', () => {
    const result = checkPane('anything', {
      action: 'assert'
    } as AssertStep);
    expect(result.ok).toBe(true);
  });
});

describe('assertPane', () => {
  it('throws an Error on failure with reason and Capture snippet', () => {
    expect(() =>
      assertPane('Mode General', {
        action: 'assert',
        contains: 'Mode Brainstorm'
      } as AssertStep)
    ).toThrow(/Assertion failed.*Capture:/s);
  });

  it('returns undefined on success', () => {
    const result = assertPane('Mode General', {
      action: 'assert',
      contains: 'Mode General'
    } as AssertStep);
    expect(result).toBeUndefined();
  });
});
