import { describe, expect, it, vi } from 'vitest';
import { fetchOpenRouterCredits } from '../src/services/openrouter/management.js';

describe('openrouter management client', () => {
  it('parses total and remaining credits', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          total_credits: 25,
          total_usage: 3.5
        }
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    const credits = await fetchOpenRouterCredits('mgmt-key');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/credits',
      expect.objectContaining({
        headers: { Authorization: 'Bearer mgmt-key' }
      })
    );
    expect(credits.totalCredits).toBe(25);
    expect(credits.totalUsage).toBe(3.5);
    expect(credits.remainingCredits).toBe(21.5);

    vi.unstubAllGlobals();
  });
});
