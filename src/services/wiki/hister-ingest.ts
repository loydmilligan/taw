import type { HisterConfig, HisterSearchResult } from '../hister/client.js';
import { searchHister } from '../hister/client.js';

const DEFAULT_MAX_HISTORY_RESULTS = 5;
const MAX_PAGE_TEXT_CHARS = 12000;
const MAX_TOTAL_MATERIAL_CHARS = 60_000;

export interface HisterIngestResult {
  ok: boolean;
  material: string;
  sourceLabel: string;
  matchedCount: number;
  fetchedCount: number;
  wasTruncated: boolean;
  error?: string;
}

export interface HisterFetchedPage {
  title: string;
  url: string;
  content: string;
}

export async function buildHisterIngestMaterial(
  query: string,
  config: HisterConfig,
  maxResults = DEFAULT_MAX_HISTORY_RESULTS
): Promise<HisterIngestResult> {
  const fetched = await searchAndFetchHisterPages(query, config, maxResults);

  if (!fetched.ok) {
    return {
      ok: false,
      material: '',
      sourceLabel: '',
      matchedCount: fetched.matchedCount,
      fetchedCount: 0,
      wasTruncated: false,
      error: fetched.error
    };
  }

  const parts = [
    `## Hister Query\n\n${query}`,
    `## Hister Matches\n\nMatched ${fetched.matchedCount} history entr${fetched.matchedCount === 1 ? 'y' : 'ies'} and fetched readable content for ${fetched.pages.length}.`
  ];

  let wasTruncated = false;
  for (let index = 0; index < fetched.pages.length; index += 1) {
    const page = fetched.pages[index];
    const section = [
      `## History Source ${index + 1}: ${page.title}`,
      `URL: ${page.url}`,
      '',
      page.content
    ].join('\n');

    const projectedLength = parts.join('\n\n').length + 2 + section.length;
    if (projectedLength > MAX_TOTAL_MATERIAL_CHARS) {
      const remaining =
        MAX_TOTAL_MATERIAL_CHARS - parts.join('\n\n').length - 2;
      if (remaining > 500) {
        parts.push(
          `${section.slice(0, remaining)}\n\n[Source truncated to fit context window. Additional pages were omitted.]`
        );
      }
      wasTruncated = true;
      break;
    }
    parts.push(section);
  }

  const material = parts.join('\n\n');

  return {
    ok: true,
    material,
    sourceLabel: `Hister query "${query}" (${fetched.pages.length}/${fetched.matchedCount} pages fetched${wasTruncated ? ', material truncated' : ''})`,
    matchedCount: fetched.matchedCount,
    fetchedCount: fetched.pages.length,
    wasTruncated
  };
}

export async function buildHisterIngestMaterialFromResults(
  query: string,
  results: HisterSearchResult[],
  config: HisterConfig
): Promise<HisterIngestResult> {
  if (results.length === 0) {
    return {
      ok: false,
      material: '',
      sourceLabel: '',
      matchedCount: 0,
      fetchedCount: 0,
      wasTruncated: false,
      error: `No browser history results matched "${query}".`
    };
  }

  const fetchedPages = await Promise.all(
    results.map((result) => fetchHistoryPage(result, config))
  );
  const pages = fetchedPages
    .filter((page): page is FetchedHistoryPage & { ok: true } => page.ok)
    .map((page) => ({
      title: page.title,
      url: page.url,
      content: page.content
    }));

  if (pages.length === 0) {
    return {
      ok: false,
      material: '',
      sourceLabel: '',
      matchedCount: results.length,
      fetchedCount: 0,
      wasTruncated: false,
      error:
        fetchedPages
          .map((page) => page.error)
          .filter(Boolean)
          .join(' | ') ||
        'Matched history entries, but could not fetch readable page content.'
    };
  }

  const parts = [
    `## Hister Query\n\n${query}`,
    `## Hister Matches\n\nMatched ${results.length} history entr${results.length === 1 ? 'y' : 'ies'} and fetched readable content for ${pages.length}.`
  ];

  let wasTruncated = false;
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    const section = [
      `## History Source ${index + 1}: ${page.title}`,
      `URL: ${page.url}`,
      '',
      page.content
    ].join('\n');

    const projectedLength = parts.join('\n\n').length + 2 + section.length;
    if (projectedLength > MAX_TOTAL_MATERIAL_CHARS) {
      const remaining =
        MAX_TOTAL_MATERIAL_CHARS - parts.join('\n\n').length - 2;
      if (remaining > 500) {
        parts.push(
          `${section.slice(0, remaining)}\n\n[Source truncated to fit context window. Additional pages were omitted.]`
        );
      }
      wasTruncated = true;
      break;
    }
    parts.push(section);
  }

  const material = parts.join('\n\n');

  return {
    ok: true,
    material,
    sourceLabel: `Hister query "${query}" (${pages.length}/${results.length} pages fetched${wasTruncated ? ', material truncated' : ''})`,
    matchedCount: results.length,
    fetchedCount: pages.length,
    wasTruncated
  };
}

export async function searchAndFetchHisterPages(
  query: string,
  config: HisterConfig,
  maxResults = DEFAULT_MAX_HISTORY_RESULTS
): Promise<{
  ok: boolean;
  query: string;
  matchedCount: number;
  pages: HisterFetchedPage[];
  error?: string;
}> {
  const search = await searchHister(query, config, maxResults);

  if (!search.ok) {
    return {
      ok: false,
      query,
      matchedCount: 0,
      pages: [],
      error: search.error ?? 'Hister search failed.'
    };
  }

  const fetchedPages = await Promise.all(
    search.results.map((result) => fetchHistoryPage(result, config))
  );
  const pages = fetchedPages
    .filter((page): page is FetchedHistoryPage & { ok: true } => page.ok)
    .map((page) => ({
      title: page.title,
      url: page.url,
      content: page.content
    }));

  if (pages.length === 0) {
    return {
      ok: false,
      query,
      matchedCount: search.results.length,
      pages: [],
      error:
        fetchedPages
          .map((page) => page.error)
          .filter(Boolean)
          .join(' | ') ||
        'Matched history entries, but could not fetch readable page content.'
    };
  }

  return {
    ok: true,
    query,
    matchedCount: search.results.length,
    pages
  };
}

interface FetchedHistoryPage {
  ok: boolean;
  title: string;
  url: string;
  content: string;
  error?: string;
}

async function fetchHistoryPage(
  result: HisterSearchResult,
  config?: HisterConfig
): Promise<FetchedHistoryPage> {
  try {
    const indexedContent = config
      ? await fetchIndexedHistoryDocument(result.url, config)
      : null;

    if (indexedContent) {
      return {
        ok: true,
        title: result.title,
        url: result.url,
        content: indexedContent
      };
    }

    const response = await fetch(result.url, {
      redirect: 'follow',
      headers: {
        'user-agent': 'TAW/0.1 wiki-ingest',
        accept:
          'text/html,application/xhtml+xml,text/plain,text/markdown,application/json;q=0.8,*/*;q=0.5'
      }
    });

    if (!response.ok) {
      return {
        ok: false,
        title: result.title,
        url: result.url,
        content: '',
        error: `${result.url} returned ${response.status}`
      };
    }

    const raw = await response.text();
    const contentType = response.headers.get('content-type') ?? '';
    const extracted = extractReadableText(raw, contentType);

    if (!extracted) {
      return {
        ok: false,
        title: result.title,
        url: result.url,
        content: '',
        error: `${result.url} did not yield readable text`
      };
    }

    return {
      ok: true,
      title: extractTitle(raw) ?? result.title,
      url: result.url,
      content: extracted
    };
  } catch (error) {
    return {
      ok: false,
      title: result.title,
      url: result.url,
      content: '',
      error: error instanceof Error ? error.message : 'Fetch failed.'
    };
  }
}

async function fetchIndexedHistoryDocument(
  url: string,
  config: HisterConfig
): Promise<string | null> {
  try {
    const endpoint = new URL('/api/document', config.baseUrl);
    endpoint.searchParams.set('url', url);

    const response = await fetch(endpoint, {
      headers: config.token ? { Authorization: `Bearer ${config.token}` } : {}
    });

    if (!response.ok) {
      return null;
    }

    const body = await response.text();

    if (!body.trim()) {
      return null;
    }

    const normalized = normalizeIndexedDocumentBody(body);
    return normalized ? trimText(normalized) : null;
  } catch {
    return null;
  }
}

function normalizeIndexedDocumentBody(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const candidates = [
      parsed.content,
      parsed.text,
      parsed.body,
      parsed.description
    ].filter((value): value is string => typeof value === 'string');
    return candidates.find((value) => value.trim().length > 0) ?? null;
  } catch {
    return body;
  }
}

function extractReadableText(raw: string, contentType: string): string {
  const normalizedType = contentType.toLowerCase();

  if (
    normalizedType.includes('text/plain') ||
    normalizedType.includes('text/markdown') ||
    normalizedType.includes('application/json')
  ) {
    return trimText(raw);
  }

  if (
    normalizedType.includes('text/html') ||
    normalizedType.includes('application/xhtml+xml') ||
    /<html[\s>]|<body[\s>]|<article[\s>]/i.test(raw)
  ) {
    return extractHtmlText(raw);
  }

  return trimText(raw);
}

function extractHtmlText(raw: string): string {
  const withoutNoise = raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<template[\s\S]*?<\/template>/gi, ' ');

  const withBreaks = withoutNoise
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(
      /<\/(p|div|section|article|main|aside|li|ul|ol|h1|h2|h3|h4|h5|h6|blockquote|pre)>/gi,
      '\n\n'
    )
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<pre[^>]*>/gi, '\n\n')
    .replace(/<\/pre>/gi, '\n\n');

  const withoutTags = withBreaks.replace(/<[^>]+>/g, ' ');
  const decoded = decodeHtmlEntities(withoutTags);

  return trimText(decoded);
}

function trimText(value: string): string {
  const normalized = value
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  if (normalized.length <= MAX_PAGE_TEXT_CHARS) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_PAGE_TEXT_CHARS)}\n\n[truncated]`;
}

function extractTitle(raw: string): string | null {
  const match = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match?.[1]) {
    return null;
  }

  const title = decodeHtmlEntities(match[1]).replace(/\s+/g, ' ').trim();
  return title || null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&#(\d+);/g, (_, code: string) => {
      const parsed = Number.parseInt(code, 10);
      return Number.isNaN(parsed) ? _ : String.fromCharCode(parsed);
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => {
      const parsed = Number.parseInt(code, 16);
      return Number.isNaN(parsed) ? _ : String.fromCharCode(parsed);
    });
}
