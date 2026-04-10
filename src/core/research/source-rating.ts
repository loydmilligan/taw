import { access } from 'node:fs/promises';
import { constants } from 'node:fs';

export interface SourceRating {
  domain: string;
  name: string | null;
  newsguardScore: number | string | null;
  politicalLeanLabel: string | null;
  sourceType: string | null;
  criteria: unknown | null;
}

interface SqliteModule {
  DatabaseSync: new (
    path: string,
    options?: { readOnly?: boolean }
  ) => {
    prepare: (sql: string) => {
      get: (...args: unknown[]) => unknown;
    };
    close: () => void;
  };
}

export async function rateSourceUrl(
  url: string,
  dbPath: string
): Promise<SourceRating | null> {
  await access(dbPath, constants.R_OK);
  const sqlite = (await import('node:sqlite')) as SqliteModule;
  const domain = extractRootDomain(url);
  const database = new sqlite.DatabaseSync(dbPath, {
    readOnly: true
  });

  try {
    const row =
      getRatingRow(database, domain, '= ?') ??
      getRatingRow(database, `%${domain}`, 'LIKE ?');

    if (!row) {
      return null;
    }

    return {
      domain,
      name: row.name,
      newsguardScore: row.newsguard_score,
      politicalLeanLabel: row.political_lean_label,
      sourceType: row.source_type,
      criteria: parseCriteria(row.criteria_json)
    };
  } finally {
    database.close();
  }
}

export function extractRootDomain(value: string): string {
  const url =
    value.startsWith('http://') || value.startsWith('https://')
      ? new URL(value)
      : new URL(`https://${value}`);
  const parts = url.hostname
    .toLowerCase()
    .replace(/^www\./, '')
    .split('.');

  if (parts.length <= 2) {
    return parts.join('.');
  }

  const suffix = parts.slice(-2).join('.');
  const secondLevelSuffixes = new Set([
    'co.uk',
    'org.uk',
    'ac.uk',
    'com.au',
    'net.au',
    'co.nz'
  ]);

  return secondLevelSuffixes.has(suffix)
    ? parts.slice(-3).join('.')
    : parts.slice(-2).join('.');
}

function getRatingRow(
  database: {
    prepare: (sql: string) => {
      get: (...args: unknown[]) => unknown;
    };
  },
  value: string,
  operator: '= ?' | 'LIKE ?'
): {
  name: string | null;
  newsguard_score: number | string | null;
  political_lean_label: string | null;
  source_type: string | null;
  criteria_json: string | null;
} | null {
  const row = database
    .prepare(
      `SELECT name, newsguard_score, political_lean_label, source_type, criteria_json FROM sources WHERE domain ${operator} LIMIT 1`
    )
    .get(value);

  return row && typeof row === 'object'
    ? (row as {
        name: string | null;
        newsguard_score: number | string | null;
        political_lean_label: string | null;
        source_type: string | null;
        criteria_json: string | null;
      })
    : null;
}

function parseCriteria(value: string | null): unknown | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
