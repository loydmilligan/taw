import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { researchSourceSchema, researchSourceViewSchema } from './schema.js';
import type {
  BrowserResearchPayload,
  ResearchSource,
  ResearchSourceView,
  ResearchType
} from './types.js';
import type { SessionRecord } from '../../types/session.js';
import { createId } from '../../utils/ids.js';

export async function readResearchSources(
  session: SessionRecord
): Promise<ResearchSource[]> {
  try {
    const content = await readFile(session.sourcesJsonPath, 'utf8');
    const parsed = JSON.parse(content) as unknown[];
    return parsed.map((item) => researchSourceSchema.parse(item));
  } catch {
    return [];
  }
}

export async function writeResearchSources(
  session: SessionRecord,
  sources: ResearchSource[]
): Promise<void> {
  await writeFile(
    session.sourcesJsonPath,
    `${JSON.stringify(sources, null, 2)}\n`,
    'utf8'
  );
}

export async function readResearchSourceViews(
  session: SessionRecord
): Promise<ResearchSourceView[]> {
  try {
    const content = await readFile(session.sourceViewsJsonPath, 'utf8');
    const parsed = JSON.parse(content) as unknown[];
    return parsed.map((item) => researchSourceViewSchema.parse(item));
  } catch {
    return [];
  }
}

export async function writeResearchSourceViews(
  session: SessionRecord,
  views: ResearchSourceView[]
): Promise<void> {
  await writeFile(
    session.sourceViewsJsonPath,
    `${JSON.stringify(views, null, 2)}\n`,
    'utf8'
  );
}

export async function appendResearchSource(
  session: SessionRecord,
  source: ResearchSource
): Promise<ResearchSource[]> {
  const existing = await readResearchSources(session);
  const next = [...existing, source];
  await writeResearchSources(session, next);
  return next;
}

export async function addBrowserPayloadAsSource(
  session: SessionRecord,
  payload: BrowserResearchPayload
): Promise<ResearchSource> {
  const snapshotPath = payload.pageTextExcerpt
    ? await writeSourceSnapshot(session, payload.title, payload.pageTextExcerpt)
    : null;

  const source: ResearchSource = {
    id: createId('source'),
    researchType: payload.researchType,
    kind: payload.kind,
    url: payload.url,
    title: payload.title,
    origin: 'browser-extension',
    selectedText: payload.selectedText,
    excerpt: payload.pageTextExcerpt,
    note: payload.userNote,
    snapshotPath,
    createdAt: payload.sentAt,
    status: 'new'
  };

  await appendResearchSource(session, source);
  return source;
}

export async function addFetchedSource(
  session: SessionRecord,
  input: {
    title: string;
    url: string;
    content: string;
    researchType: ResearchType;
    note?: string | null;
  }
): Promise<ResearchSource> {
  const existing = await readResearchSources(session);
  const existingMatch = existing.find((source) => source.url === input.url);

  if (existingMatch) {
    return existingMatch;
  }

  const snapshotPath = await writeSourceSnapshot(session, input.title, input.content);
  const excerpt = input.content.slice(0, 4000);
  const source: ResearchSource = {
    id: createId('source'),
    researchType: input.researchType,
    kind: 'article',
    url: input.url,
    title: input.title,
    origin: 'fetch',
    selectedText: null,
    excerpt,
    note: input.note ?? null,
    snapshotPath,
    createdAt: new Date().toISOString(),
    status: 'new'
  };

  await appendResearchSource(session, source);
  return source;
}

export async function updateResearchSource(
  session: SessionRecord,
  index: number,
  update: Partial<Pick<ResearchSource, 'note' | 'status'>>
): Promise<ResearchSource | null> {
  const sources = await readResearchSources(session);
  const existing = sources[index - 1];

  if (!existing) {
    return null;
  }

  const next: ResearchSource = {
    ...existing,
    ...update
  };
  sources[index - 1] = next;
  await writeResearchSources(session, sources);
  return next;
}

export async function upsertResearchSourceView(
  session: SessionRecord,
  view: ResearchSourceView
): Promise<ResearchSourceView[]> {
  const existing = await readResearchSourceViews(session);
  const next = [
    ...existing.filter((item) => item.sourceId !== view.sourceId),
    view
  ].sort((left, right) => left.sourceIndex - right.sourceIndex);
  await writeResearchSourceViews(session, next);
  return next;
}

export async function removeResearchSourceView(
  session: SessionRecord,
  sourceId: string
): Promise<ResearchSourceView[]> {
  const existing = await readResearchSourceViews(session);
  const next = existing.filter((item) => item.sourceId !== sourceId);
  await writeResearchSourceViews(session, next);
  return next;
}

async function writeSourceSnapshot(
  session: SessionRecord,
  title: string,
  content: string
): Promise<string> {
  await mkdir(session.sourcesDir, { recursive: true });
  const fileName = `${sanitizeFileName(title)}.txt`;
  const fullPath = path.join(session.sourcesDir, `${Date.now()}-${fileName}`);
  await writeFile(fullPath, `${content.trim()}\n`, 'utf8');
  return fullPath;
}

function sanitizeFileName(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'source'
  );
}
