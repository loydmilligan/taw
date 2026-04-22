import { describe, it, expect, beforeEach, vi } from 'vitest';
import type http from 'node:http';
import {
  authorize,
  authorizeApp,
  parseCookies,
  createAppSession,
  setAppSessionCookie,
  getAppSessionRecord,
  cleanupOldAppSessions,
  appSessions
} from './auth.js';

function makeRequest(headers: Record<string, string>): http.IncomingMessage {
  return { headers } as unknown as http.IncomingMessage;
}

describe('authorize', () => {
  it('returns false when x-taw-token header is missing', () => {
    const req = makeRequest({});
    expect(authorize(req, 'secret')).toBe(false);
  });

  it('returns false when header does not match token', () => {
    const req = makeRequest({ 'x-taw-token': 'wrong' });
    expect(authorize(req, 'secret')).toBe(false);
  });

  it('returns true when header exactly matches token', () => {
    const req = makeRequest({ 'x-taw-token': 'secret' });
    expect(authorize(req, 'secret')).toBe(true);
  });
});

describe('parseCookies', () => {
  it('parses multiple cookies', () => {
    expect(parseCookies('a=1; b=2')).toEqual({ a: '1', b: '2' });
  });

  it('returns empty object for undefined', () => {
    expect(parseCookies(undefined)).toEqual({});
  });

  it('returns empty object for empty string', () => {
    expect(parseCookies('')).toEqual({});
  });
});

describe('authorizeApp', () => {
  beforeEach(() => {
    appSessions.clear();
  });

  it('returns false when taw_app_session cookie is absent', () => {
    const req = makeRequest({});
    expect(authorizeApp(req)).toBe(false);
  });

  it('returns false when sessionId not found in appSessions Map', () => {
    const req = makeRequest({ cookie: 'taw_app_session=nonexistent' });
    expect(authorizeApp(req)).toBe(false);
  });

  it('returns true and updates lastSeenAt when valid session found', () => {
    const sessionId = createAppSession();
    const req = makeRequest({ cookie: `taw_app_session=${sessionId}` });
    const oldLastSeen = appSessions.get(sessionId)!.lastSeenAt;
    // Advance time slightly
    vi.useFakeTimers();
    vi.advanceTimersByTime(1000);
    const result = authorizeApp(req);
    vi.useRealTimers();
    expect(result).toBe(true);
    // lastSeenAt should have been updated
    const record = appSessions.get(sessionId)!;
    expect(record.lastSeenAt).not.toBe(oldLastSeen);
  });
});

describe('setAppSessionCookie', () => {
  it('sets HttpOnly; SameSite=Lax; Max-Age=604800; Path=/', () => {
    const sessionId = 'test-session-id';
    const headers: Record<string, string> = {};
    const res = {
      setHeader: (name: string, value: string) => { headers[name.toLowerCase()] = value; }
    } as unknown as http.ServerResponse;
    setAppSessionCookie(res, sessionId);
    const cookie = headers['set-cookie'];
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Max-Age=604800');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain(sessionId);
  });
});

describe('getAppSessionRecord', () => {
  beforeEach(() => {
    appSessions.clear();
  });

  it('returns null when no session cookie', () => {
    const req = makeRequest({});
    expect(getAppSessionRecord(req)).toBeNull();
  });

  it('returns session record when valid', () => {
    const sessionId = createAppSession();
    const req = makeRequest({ cookie: `taw_app_session=${sessionId}` });
    const record = getAppSessionRecord(req);
    expect(record).not.toBeNull();
    expect(record!.appState).toBeNull();
  });
});

describe('cleanupOldAppSessions', () => {
  beforeEach(() => {
    appSessions.clear();
  });

  it('removes entries older than 7 days', () => {
    const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    appSessions.set('old-session', { createdAt: oldDate, lastSeenAt: oldDate, appState: null });
    const recentDate = new Date().toISOString();
    appSessions.set('new-session', { createdAt: recentDate, lastSeenAt: recentDate, appState: null });
    cleanupOldAppSessions();
    expect(appSessions.has('old-session')).toBe(false);
    expect(appSessions.has('new-session')).toBe(true);
  });
});
