import { z } from 'zod';
import type { GlobalConfig } from '../../services/config/schema.js';
import {
  resolveSearxngSettings,
  SearxngManager
} from '../../services/search/searxng-manager.js';
import { createId } from '../../utils/ids.js';
import type { SessionRecord } from '../../types/session.js';
import { appendResearchSource, readResearchSources } from './store.js';
import type { ResearchSource } from './types.js';

export const searchWebArgumentsSchema = z.object({
  query: z.string().min(2),
  max_results: z.number().int().positive().max(8).optional(),
  allowed_domains: z.array(z.string()).max(8).optional()
});

export interface SearxngResult {
  url: string;
  title: string;
  content: string | null;
  engine: string | null;
}

export interface SearchWebInput {
  session: SessionRecord;
  globalConfig: GlobalConfig;
  query: string;
  maxResults?: number;
  allowedDomains?: string[];
}

export interface SearchWebResult {
  ok: boolean;
  query: string;
  stored: ResearchSource[];
  error: string | null;
}

export async function searchWebAndStoreSources(
  input: SearchWebInput
): Promise<SearchWebResult> {
  const manager = SearxngManager.fromGlobalConfig(input.globalConfig);
  const status = await manager.getStatus();

  if (!status.enabled) {
    return {
      ok: false,
      query: input.query,
      stored: [],
      error: 'SearXNG is disabled in TAW config.'
    };
  }

  if (!status.running) {
    if (!status.autoStart) {
      return {
        ok: false,
        query: input.query,
        stored: [],
        error:
          'SearXNG is not running and auto-start is disabled. Start it from the browser bridge or enable auto-start.'
      };
    }

    await manager.start();
  } else {
    await manager.touch();
  }

  const results = await querySearxng(
    resolveSearxngSettings(input.globalConfig).baseUrl,
    input.query,
    input.maxResults ?? 5,
    input.allowedDomains ?? []
  );

  const stored = await storeSearchResults(input.session, results);

  return {
    ok: true,
    query: input.query,
    stored,
    error: null
  };
}

export async function querySearxng(
  baseUrl: string,
  query: string,
  maxResults: number,
  allowedDomains: string[]
): Promise<SearxngResult[]> {
  const url = new URL('/search', baseUrl);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');

  if (allowedDomains.length > 0) {
    url.searchParams.set(
      'q',
      `${query} ${allowedDomains.map((domain) => `site:${domain}`).join(' ')}`
    );
  }

  const response = await fetch(url, {
    headers: {
      accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`SearXNG search failed with status ${response.status}.`);
  }

  const body = (await response.json()) as {
    results?: Array<{
      url?: string;
      title?: string;
      content?: string;
      engine?: string;
    }>;
  };

  return (body.results ?? [])
    .filter((result) => result.url && result.title)
    .slice(0, maxResults)
    .map((result) => ({
      url: result.url ?? '',
      title: result.title ?? 'Untitled result',
      content: result.content ?? null,
      engine: result.engine ?? null
    }));
}

export async function storeSearchResults(
  session: SessionRecord,
  results: SearxngResult[]
): Promise<ResearchSource[]> {
  const existing = await readResearchSources(session);
  const existingUrls = new Set(
    existing.map((source) => source.url).filter(Boolean)
  );
  const stored: ResearchSource[] = [];

  for (const result of results) {
    if (existingUrls.has(result.url)) {
      continue;
    }

    const source: ResearchSource = {
      id: createId('source'),
      researchType: inferResearchTypeFromMode(
        session.metadata.modeHistory.at(-1)
      ),
      kind: 'article',
      url: result.url,
      title: result.title,
      origin: 'search',
      selectedText: null,
      excerpt: result.content,
      note: result.engine ? `Search engine: ${result.engine}` : null,
      snapshotPath: null,
      createdAt: new Date().toISOString(),
      status: 'new'
    };

    await appendResearchSource(session, source);
    existingUrls.add(result.url);
    stored.push(source);
  }

  return stored;
}

function inferResearchTypeFromMode(modeHistoryEntry: string | undefined) {
  if (modeHistoryEntry === 'research-tech') {
    return 'tech';
  }

  if (modeHistoryEntry === 'research-repo') {
    return 'repo';
  }

  if (modeHistoryEntry === 'research-video') {
    return 'video';
  }

  return 'politics';
}
