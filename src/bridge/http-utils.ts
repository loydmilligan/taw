import type http from 'node:http';

const MAX_BODY_BYTES = 1_048_576; // 1 MB

export function parseRequestUrl(request: http.IncomingMessage): URL | null {
  if (!request.url) {
    return null;
  }
  const host = request.headers.host ?? '127.0.0.1';
  return new URL(request.url, `http://${host}`);
}

export function readJson(request: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    request.on('data', (chunk: Buffer | string) => {
      const chunkBuf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += chunkBuf.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        return;
      }
      data += String(chunk);
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

export function writeJson(
  response: http.ServerResponse,
  statusCode: number,
  body: unknown
): void {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(body));
}
