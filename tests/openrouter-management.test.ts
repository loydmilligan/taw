import { describe, expect, it, vi } from 'vitest';
import {
  createOpenRouterApiKey,
  fetchOpenRouterCredits,
  getOpenRouterApiKey,
  listOpenRouterApiKeys,
  updateOpenRouterApiKey
} from '../src/services/openrouter/management.js';

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

  it('parses key list and key mutation responses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              hash: 'hash-1',
              label: 'sk-or-v1-abc...123',
              name: 'App 1',
              disabled: false,
              limit: 5,
              limit_remaining: 4.5,
              limit_reset: 'monthly',
              include_byok_in_limit: false,
              usage: 0.5,
              usage_daily: 0.1,
              usage_weekly: 0.2,
              usage_monthly: 0.5,
              created_at: '2026-04-10T00:00:00Z',
              updated_at: null,
              expires_at: null
            }
          ]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            hash: 'hash-2',
            label: 'sk-or-v1-def...456',
            name: 'App 2',
            disabled: false,
            limit: 3,
            limit_remaining: 3,
            limit_reset: 'weekly',
            include_byok_in_limit: false,
            usage: 0,
            usage_daily: 0,
            usage_weekly: 0,
            usage_monthly: 0,
            created_at: '2026-04-10T00:00:00Z',
            updated_at: null,
            expires_at: null
          },
          key: 'sk-or-v1-secret'
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            hash: 'hash-2',
            label: 'sk-or-v1-def...456',
            name: 'App 2',
            disabled: true,
            limit: 3,
            limit_remaining: 2.5,
            limit_reset: 'weekly',
            include_byok_in_limit: false,
            usage: 0.5,
            usage_daily: 0.5,
            usage_weekly: 0.5,
            usage_monthly: 0.5,
            created_at: '2026-04-10T00:00:00Z',
            updated_at: '2026-04-10T01:00:00Z',
            expires_at: null
          }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            hash: 'hash-2',
            label: 'sk-or-v1-def...456',
            name: 'App 2',
            disabled: true,
            limit: 3,
            limit_remaining: 2.5,
            limit_reset: 'weekly',
            include_byok_in_limit: false,
            usage: 0.5,
            usage_daily: 0.5,
            usage_weekly: 0.5,
            usage_monthly: 0.5,
            created_at: '2026-04-10T00:00:00Z',
            updated_at: '2026-04-10T01:00:00Z',
            expires_at: null
          }
        })
      });
    vi.stubGlobal('fetch', fetchMock);

    const keys = await listOpenRouterApiKeys('mgmt-key');
    const created = await createOpenRouterApiKey('mgmt-key', {
      name: 'App 2',
      limit: 3,
      limitReset: 'weekly'
    });
    const updated = await updateOpenRouterApiKey('mgmt-key', 'hash-2', {
      disabled: true
    });
    const fetched = await getOpenRouterApiKey('mgmt-key', 'hash-2');

    expect(keys[0]?.limitRemaining).toBe(4.5);
    expect(created.key).toBe('sk-or-v1-secret');
    expect(created.record.hash).toBe('hash-2');
    expect(updated.disabled).toBe(true);
    expect(fetched.usage).toBe(0.5);

    vi.unstubAllGlobals();
  });
});
