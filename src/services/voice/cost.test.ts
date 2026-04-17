import { beforeEach, describe, expect, it } from 'vitest';
import { addCost, getSpent, reset, isCapped } from './cost.js';

describe('voiceCost', () => {
  beforeEach(() => reset());

  it('addCost() accumulates spentUsd', () => {
    addCost(0.03);
    addCost(0.04);
    expect(getSpent()).toBeCloseTo(0.07, 5);
  });

  it('isCapped() returns false below cap', () => {
    addCost(0.05);
    expect(isCapped(0.10)).toBe(false);
  });

  it('isCapped() returns true at or above cap', () => {
    addCost(0.11);
    expect(isCapped(0.10)).toBe(true);
  });

  it('reset() zeroes spentUsd', () => {
    addCost(0.50);
    reset();
    expect(getSpent()).toBe(0);
  });

  it('rejects negative deltas', () => {
    expect(() => addCost(-1)).toThrow();
  });
});
