import { spawn } from 'node:child_process';

export interface HisterConfig {
  enabled: boolean;
  baseUrl: string;
  token?: string;
}

export interface HisterSearchResult {
  title: string;
  url: string;
}

interface HisterAuthContext {
  csrfToken: string;
  sessionCookie: string;
}

/**
 * Search Hister browser history using the CLI.
 * Returns up to maxResults matching entries.
 */
export async function searchHister(
  query: string,
  config: HisterConfig,
  maxResults = 10
): Promise<{ ok: boolean; results: HisterSearchResult[]; error?: string }> {
  return new Promise((resolve) => {
    const args = ['search', query];
    if (config.token) {
      args.push('--token', config.token);
    }
    if (config.baseUrl !== 'http://localhost:4433') {
      args.push('--server-url', config.baseUrl);
    }

    let stdout = '';
    let stderr = '';

    const proc = spawn('hister', args, { timeout: 10000 });

    proc.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0 && stdout.trim().length === 0) {
        resolve({
          ok: false,
          results: [],
          error: stderr.trim() || `hister exited with code ${code}`
        });
        return;
      }

      const results = parseHisterSearchOutput(stdout, maxResults);
      resolve({ ok: true, results });
    });

    proc.on('error', (err) => {
      resolve({ ok: false, results: [], error: err.message });
    });
  });
}

/**
 * Add a URL to the Hister index via the HTTP API.
 * Handles the CSRF cookie + token flow automatically.
 */
export async function addToHister(
  url: string,
  title: string,
  config: HisterConfig
): Promise<{ ok: boolean; error?: string }> {
  try {
    const auth = await getHisterAuthContext(config);
    if (!auth.ok) {
      return { ok: false, error: auth.error };
    }

    // Step 2: POST /api/add with cookie + CSRF header
    const body = new URLSearchParams({ url, title });
    const addRes = await fetch(`${config.baseUrl}/api/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Csrf-Token': auth.context.csrfToken,
        Cookie: auth.context.sessionCookie,
        ...(config.token ? { Authorization: `Bearer ${config.token}` } : {})
      },
      body: body.toString()
    });

    if (!addRes.ok) {
      const text = await addRes.text().catch(() => '');
      return { ok: false, error: `Add failed (${addRes.status}): ${text}` };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    };
  }
}

export async function reindexHister(
  config: HisterConfig,
  options: { skipSensitive?: boolean; detectLanguages?: boolean } = {}
): Promise<{ ok: boolean; error?: string }> {
  try {
    const auth = await getHisterAuthContext(config);
    if (!auth.ok) {
      return { ok: false, error: auth.error };
    }

    const body = new URLSearchParams();
    if (options.skipSensitive !== undefined) {
      body.set('skipSensitive', String(options.skipSensitive));
    }
    if (options.detectLanguages !== undefined) {
      body.set('detectLanguages', String(options.detectLanguages));
    }

    const response = await fetch(`${config.baseUrl}/api/reindex`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Csrf-Token': auth.context.csrfToken,
        Cookie: auth.context.sessionCookie,
        ...(config.token ? { Authorization: `Bearer ${config.token}` } : {})
      },
      body: body.toString()
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return {
        ok: false,
        error: `Reindex failed (${response.status}): ${text}`
      };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    };
  }
}

/**
 * Parse the text output of `hister search <query>`.
 * Format is: title\nurl\n\ntitle\nurl\n...
 */
function parseHisterSearchOutput(
  raw: string,
  maxResults: number
): HisterSearchResult[] {
  const results: HisterSearchResult[] = [];
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);

  // Lines alternate: title, url, title, url...
  // Skip any debug/log lines that come before (they contain ' | ')
  const contentLines = lines.filter((l) => !l.includes(' | DEBUG ') && !l.includes(' | INFO '));

  for (let i = 0; i + 1 < contentLines.length; i += 2) {
    const title = contentLines[i].trim();
    const url = contentLines[i + 1].trim();
    if (url.startsWith('http://') || url.startsWith('https://')) {
      results.push({ title, url });
      if (results.length >= maxResults) break;
    }
  }

  return results;
}

async function getHisterAuthContext(
  config: HisterConfig
): Promise<
  { ok: true; context: HisterAuthContext } | { ok: false; error: string }
> {
  const configRes = await fetch(`${config.baseUrl}/api/config`, {
    headers: config.token ? { Authorization: `Bearer ${config.token}` } : {}
  });

  if (!configRes.ok) {
    return { ok: false, error: `Config fetch failed: ${configRes.status}` };
  }

  const csrfToken = configRes.headers.get('x-csrf-token');
  const setCookie = configRes.headers.get('set-cookie');
  const sessionCookie = setCookie
    ?.split(';')
    .find((p) => p.trim().startsWith('hister='))
    ?.trim();

  if (!csrfToken || !sessionCookie) {
    return { ok: false, error: 'Could not obtain CSRF token from Hister.' };
  }

  return { ok: true, context: { csrfToken, sessionCookie } };
}
