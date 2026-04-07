import { describe, expect, it } from 'vitest';
import { getProviderAdapter } from '../src/core/providers/index.js';

describe('provider adapter smoke tests', () => {
  it('returns an adapter with config validation for openrouter-compatible providers', () => {
    const adapter = getProviderAdapter({
      provider: 'openrouter',
      model: 'openrouter/auto'
    });

    expect(() =>
      adapter.validateConfig({
        provider: 'openrouter',
        model: 'openrouter/auto'
      })
    ).toThrow(/OPENROUTER_API_KEY/);
  });
});
