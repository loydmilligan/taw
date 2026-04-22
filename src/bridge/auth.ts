import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { bootstrapApp } from '../cli/bootstrap.js';
import type { AppState } from '../types/app.js';

export interface AppSessionRecord {
  createdAt: string;
  lastSeenAt: string;
  appState: AppState | null;
}

export interface AuthBridgeOptions {
  token: string;
  defaultCwd: string;
}

export const appSessions = new Map<string, AppSessionRecord>();

export function parseCookies(rawCookieHeader: string | undefined): Record<string, string> {
  if (!rawCookieHeader) {
    return {};
  }
  return rawCookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, part) => {
      const separator = part.indexOf('=');
      if (separator <= 0) {
        return acc;
      }
      acc[part.slice(0, separator)] = decodeURIComponent(part.slice(separator + 1));
      return acc;
    }, {});
}

export function authorize(request: http.IncomingMessage, token: string): boolean {
  const requestToken = request.headers['x-taw-token'];
  if (typeof requestToken !== 'string') {
    return false;
  }
  return requestToken === token;
}

export function getAppSessionId(request: http.IncomingMessage): string | null {
  return parseCookies(request.headers.cookie ?? '')['taw_app_session'] ?? null;
}

export function getAppSessionRecord(request: http.IncomingMessage): AppSessionRecord | null {
  const sessionId = getAppSessionId(request);
  if (!sessionId) {
    return null;
  }
  return appSessions.get(sessionId) ?? null;
}

export function authorizeApp(request: http.IncomingMessage): boolean {
  const session = getAppSessionRecord(request);
  if (!session) {
    return false;
  }
  session.lastSeenAt = new Date().toISOString();
  cleanupOldAppSessions();
  return true;
}

export function createAppSession(): string {
  const sessionId = randomUUID();
  const now = new Date().toISOString();
  appSessions.set(sessionId, { createdAt: now, lastSeenAt: now, appState: null });
  cleanupOldAppSessions();
  return sessionId;
}

export function setAppSessionCookie(
  response: http.ServerResponse,
  sessionId: string
): void {
  response.setHeader(
    'set-cookie',
    `taw_app_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`
  );
}

export async function ensureAppState(
  request: http.IncomingMessage,
  defaultCwd: string
): Promise<AppState> {
  const sessionId = getAppSessionId(request);
  if (!sessionId) {
    throw new Error('App session required.');
  }
  const record = appSessions.get(sessionId);
  if (!record) {
    throw new Error('App session not found.');
  }
  if (!record.appState) {
    record.appState = await bootstrapApp(defaultCwd);
  }
  record.lastSeenAt = new Date().toISOString();
  return record.appState;
}

export function cleanupOldAppSessions(): void {
  const cutoffMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const [id, session] of appSessions) {
    if (new Date(session.lastSeenAt).getTime() < cutoffMs) {
      appSessions.delete(id);
    }
  }
}
