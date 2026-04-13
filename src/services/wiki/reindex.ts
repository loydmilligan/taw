import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { getWikiInfo, resolveWikiPath, writeWikiPage } from './manager.js';
import {
  ensureOperationalFrontmatter,
  isOperationalWikiNotePath,
  readFrontmatterScalar,
  stripFrontmatter
} from './frontmatter.js';
import type { PendingIndexReview } from './pending-index-review.js';

interface IndexedWikiNote {
  relativePath: string;
  title: string;
  type: string | null;
  summary: string;
  content: string;
}

type SectionKey = 'concept' | 'entity' | 'source' | 'analysis' | 'other';

export async function buildPendingIndexReview(
  topic: string
): Promise<PendingIndexReview> {
  const notes = await loadOperationalNotes(topic);
  const pendingNotes = notes.filter(
    (note) => readFrontmatterScalar(note.content, 'index_status') === 'pending'
  );

  return {
    kind: 'index-review',
    topic,
    createdAt: new Date().toISOString(),
    pendingNotes: pendingNotes.map((note) => note.relativePath),
    updatedIndexContent: buildIndexContent(topic, notes),
    summaryLines: pendingNotes.map(
      (note) => `${note.relativePath}: add/update index entry for ${note.title}`
    )
  };
}

export function formatPendingIndexReviewSummary(
  pending: PendingIndexReview
): string {
  if (pending.pendingNotes.length === 0) {
    return 'No notes with `index_status: pending` were available for re-index.';
  }

  const lines = [
    `Reviewed ${pending.pendingNotes.length} pending note${pending.pendingNotes.length === 1 ? '' : 's'} for index rebuild.`,
    'Proposed index updates:'
  ];

  for (const summary of pending.summaryLines.slice(0, 12)) {
    lines.push(`- ${summary}`);
  }

  if (pending.summaryLines.length > 12) {
    lines.push(`- ...and ${pending.summaryLines.length - 12} more`);
  }

  lines.push('Run /confirm to write the rebuilt index or /cancel to discard it.');
  return lines.join('\n');
}

export async function applyPendingIndexReview(
  pending: PendingIndexReview
): Promise<void> {
  await writeWikiPage(pending.topic, 'index.md', pending.updatedIndexContent, {
    overwrite: true
  });

  const today = new Date().toISOString().slice(0, 10);
  for (const relativePath of pending.pendingNotes) {
    const existing = await readFile(resolveWikiPath(pending.topic, relativePath), 'utf8');
    const updated = ensureOperationalFrontmatter(existing, relativePath, {
      today,
      indexStatus: 'indexed',
      indexedAt: today
    });
    await writeWikiPage(pending.topic, relativePath, updated, { overwrite: true });
  }
}

export async function appendIndexReviewLog(
  topic: string,
  pending: PendingIndexReview
): Promise<void> {
  const logPath = resolveWikiPath(
    topic,
    `logs/${new Date().toISOString().slice(0, 10)}.md`
  );
  let existing = '';
  try {
    existing = await readFile(logPath, 'utf8');
  } catch {
    existing = `# ${topic} Wiki Log — ${new Date().toISOString().slice(0, 10)}\n`;
  }

  const section = [
    `## ${pending.createdAt} | reindex`,
    '',
    `Indexed pending notes: ${pending.pendingNotes.join(', ') || 'none'}`,
    'Rebuilt index.md from current note frontmatter.'
  ].join('\n');

  const separator = existing.trimEnd().length > 0 ? '\n\n' : '';
  await writeWikiPage(
    topic,
    `logs/${new Date().toISOString().slice(0, 10)}.md`,
    `${existing.trimEnd()}${separator}${section}\n`,
    { overwrite: true }
  );
}

async function loadOperationalNotes(topic: string): Promise<IndexedWikiNote[]> {
  const info = getWikiInfo(topic);
  const paths = await collectMarkdownFiles(info.topicDir);
  const notePaths = paths.filter((relativePath) => isOperationalWikiNotePath(relativePath));

  return Promise.all(
    notePaths.map(async (relativePath) => {
      const content = await readFile(path.join(info.topicDir, relativePath), 'utf8');
      return {
        relativePath,
        title:
          readFrontmatterScalar(content, 'title') ??
          extractHeading(content) ??
          path.basename(relativePath, '.md'),
        type: readFrontmatterScalar(content, 'type'),
        summary: extractSummary(content),
        content
      };
    })
  );
}

async function collectMarkdownFiles(rootDir: string, relativeDir = ''): Promise<string[]> {
  const absoluteDir = path.join(rootDir, relativeDir);
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    const nextRelative = relativeDir ? path.join(relativeDir, entry.name) : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(rootDir, nextRelative)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(nextRelative);
    }
  }

  return files.sort();
}

function buildIndexContent(topic: string, notes: IndexedWikiNote[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const buckets = new Map<SectionKey, IndexedWikiNote[]>([
    ['concept', []],
    ['entity', []],
    ['source', []],
    ['analysis', []],
    ['other', []]
  ]);

  for (const note of notes) {
    buckets.get(classifySection(note))?.push(note);
  }

  for (const bucket of buckets.values()) {
    bucket.sort((left, right) => left.title.localeCompare(right.title));
  }

  return [
    '---',
    'title: index',
    'aliases: []',
    'type: overview',
    'tags: []',
    'status: mature',
    `created: ${today}`,
    `updated: ${today}`,
    'domain: null',
    'related: []',
    'parent: null',
    '---',
    '',
    '# Index',
    '',
    `Generated from current wiki note frontmatter for ${topic}.`,
    '',
    '## Navigation',
    '- [**Schema**](schema.md): Wiki structure and maintenance rules.',
    '- [**Overview**](pages/overview.md): High-level introduction to this wiki.',
    '',
    '## Concepts',
    '',
    ...renderEntries(buckets.get('concept') ?? []),
    '',
    '## Entities',
    '',
    ...renderEntries(buckets.get('entity') ?? []),
    '',
    '## Sources',
    '',
    ...renderEntries(buckets.get('source') ?? []),
    '',
    '## Analyses',
    '',
    ...renderEntries(buckets.get('analysis') ?? []),
    '',
    '## Other',
    '',
    ...renderEntries(buckets.get('other') ?? [])
  ].join('\n');
}

function renderEntries(notes: IndexedWikiNote[]): string[] {
  if (notes.length === 0) {
    return ['- None yet.'];
  }

  return notes.map(
    (note) => `- [${note.title}](${note.relativePath}): ${note.summary || 'No summary yet.'}`
  );
}

function classifySection(note: IndexedWikiNote): SectionKey {
  switch (note.type) {
    case 'concept':
      return 'concept';
    case 'entity':
      return 'entity';
    case 'source':
      return 'source';
    case 'analysis':
      return 'analysis';
    default:
      return 'other';
  }
}

function extractHeading(content: string): string | null {
  const match = stripFrontmatter(content).match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

function extractSummary(content: string): string {
  const body = stripFrontmatter(content)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#') && !line.startsWith('- '))
    .find(Boolean);

  if (!body) {
    return '';
  }

  return body.length > 180 ? `${body.slice(0, 177)}...` : body;
}
