import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import type http from 'node:http';
import { parseRequestUrl, readJson, writeJson } from './http-utils.js';

function makeRequest(url: string | undefined, headers: Record<string, string> = {}): http.IncomingMessage {
  return { url, headers } as unknown as http.IncomingMessage;
}

function makeReadableStream(chunks: Buffer[] | string[], emitError?: Error): http.IncomingMessage {
  const emitter = new EventEmitter() as unknown as http.IncomingMessage;
  process.nextTick(() => {
    if (emitError) {
      emitter.emit('error', emitError);
      return;
    }
    for (const chunk of chunks) {
      emitter.emit('data', chunk);
    }
    emitter.emit('end');
  });
  return emitter;
}

describe('parseRequestUrl', () => {
  it('returns null when req.url is undefined', () => {
    const req = makeRequest(undefined);
    expect(parseRequestUrl(req)).toBeNull();
  });

  it('returns null when req.url is empty string', () => {
    const req = makeRequest('');
    expect(parseRequestUrl(req)).toBeNull();
  });

  it('returns URL with correct pathname', () => {
    const req = makeRequest('/foo/bar?q=1', { host: 'localhost' });
    const result = parseRequestUrl(req);
    expect(result).not.toBeNull();
    expect(result!.pathname).toBe('/foo/bar');
    expect(result!.searchParams.get('q')).toBe('1');
  });
});

describe('readJson', () => {
  it('resolves with parsed object for normal JSON body', async () => {
    const stream = makeReadableStream(['{"key":"value"}']);
    const result = await readJson(stream);
    expect(result).toEqual({ key: 'value' });
  });

  it('resolves with {} for empty body', async () => {
    const stream = makeReadableStream([]);
    const result = await readJson(stream);
    expect(result).toEqual({});
  });

  it('rejects on malformed JSON', async () => {
    const stream = makeReadableStream(['{invalid json}']);
    await expect(readJson(stream)).rejects.toThrow();
  });

  it('rejects with "Request body too large" when body exceeds 1 MB', async () => {
    const bigChunk = Buffer.alloc(1_048_577, 'a'); // 1 MB + 1 byte
    const stream = makeReadableStream([bigChunk]);
    await expect(readJson(stream)).rejects.toThrow('Request body too large');
  });

  it('rejects on stream error', async () => {
    const stream = makeReadableStream([], new Error('stream error'));
    await expect(readJson(stream)).rejects.toThrow('stream error');
  });
});

describe('writeJson', () => {
  it('sets statusCode, content-type, and ends with JSON body', () => {
    const headers: Record<string, string> = {};
    let endedWith: string | undefined;
    const res = {
      statusCode: 0,
      setHeader: (name: string, value: string) => { headers[name.toLowerCase()] = value; },
      end: (data: string) => { endedWith = data; }
    } as unknown as http.ServerResponse;

    writeJson(res, 200, { ok: true });
    expect(res.statusCode).toBe(200);
    expect(headers['content-type']).toBe('application/json');
    expect(endedWith).toBe(JSON.stringify({ ok: true }));
  });
});
