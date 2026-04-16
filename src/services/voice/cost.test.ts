import { describe, it, expect } from 'vitest';
// RED: ./cost.js does not yet exist — Wave 1 will implement it.
import { addCost, getSpent, reset, isCapped } from './cost.js';

describe('voiceCost', () => {
  it('addCost() accumulates spentUsd', () => {
    expect(addCost).toBeDefined();
    expect(getSpent).toBeDefined();
    expect(true).toBe(false);
  });

  it('isCapped() returns true at or above cap', () => {
    expect(isCapped).toBeDefined();
    expect(true).toBe(false);
  });

  it('isCapped() returns false below cap', () => {
    expect(isCapped).toBeDefined();
    expect(true).toBe(false);
  });

  it('reset() zeroes spentUsd', () => {
    expect(reset).toBeDefined();
    expect(true).toBe(false);
  });
});
