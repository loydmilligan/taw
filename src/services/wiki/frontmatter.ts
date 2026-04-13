import path from 'node:path';

export type LinkReviewStatus = 'pending' | 'reviewed';
export type IndexStatus = 'pending' | 'indexed';

const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---\n?/;

export function isOperationalWikiNotePath(relativePath: string): boolean {
  if (!relativePath.endsWith('.md')) {
    return false;
  }

  if (relativePath === 'index.md' || relativePath === 'schema.md') {
    return false;
  }

  if (relativePath.startsWith('logs/') || relativePath.startsWith('pages/logs/')) {
    return false;
  }

  if (!relativePath.startsWith('pages/')) {
    return false;
  }

  return path.basename(relativePath) !== 'overview.md';
}

export function readFrontmatterScalar(
  content: string,
  key: string
): string | null {
  const match = content.match(FRONTMATTER_PATTERN);
  if (!match) {
    return null;
  }

  const line = match[1]
    .split('\n')
    .find((entry) => entry.startsWith(`${key}:`));

  if (!line) {
    return null;
  }

  const value = line
    .slice(key.length + 1)
    .trim()
    .replace(/^['"]|['"]$/g, '');

  return value === 'null' ? null : value;
}

export function ensureOperationalFrontmatter(
  content: string,
  relativePath: string,
  options: {
    today: string;
    linkReviewStatus?: LinkReviewStatus;
    indexStatus?: IndexStatus;
    linkReviewedAt?: string | null;
    indexedAt?: string | null;
  }
): string {
  const headingTitle =
    stripFrontmatter(content).match(/^#\s+(.+)$/m)?.[1]?.trim() ??
    humanizeSlug(path.basename(relativePath, '.md'));
  const frontmatterMatch = content.match(FRONTMATTER_PATTERN);

  if (!frontmatterMatch) {
    const frontmatterLines = [
      '---',
      `title: ${quoteYaml(headingTitle)}`,
      'aliases: []',
      'type: note',
      `created: ${options.today}`,
      `updated: ${options.today}`,
      `link_review_status: ${options.linkReviewStatus ?? 'pending'}`,
      options.linkReviewedAt
        ? `link_reviewed_at: ${options.linkReviewedAt}`
        : 'link_reviewed_at: null',
      `index_status: ${options.indexStatus ?? 'pending'}`,
      options.indexedAt ? `indexed_at: ${options.indexedAt}` : 'indexed_at: null',
      '---',
      ''
    ];
    return `${frontmatterLines.join('\n')}${content.replace(/^\n+/, '')}`;
  }

  const prefix = frontmatterMatch[0];
  let next = content;

  next = upsertFrontmatterLine(next, 'updated', options.today);

  if (options.linkReviewStatus) {
    next = upsertFrontmatterLine(next, 'link_review_status', options.linkReviewStatus);
  }
  if (options.linkReviewedAt !== undefined) {
    next = upsertFrontmatterLine(
      next,
      'link_reviewed_at',
      options.linkReviewedAt ?? 'null'
    );
  }
  if (options.indexStatus) {
    next = upsertFrontmatterLine(next, 'index_status', options.indexStatus);
  }
  if (options.indexedAt !== undefined) {
    next = upsertFrontmatterLine(next, 'indexed_at', options.indexedAt ?? 'null');
  }
  return next;
}

export function stripFrontmatter(content: string): string {
  return content.replace(FRONTMATTER_PATTERN, '');
}

function upsertFrontmatterLine(
  content: string,
  key: string,
  value: string
): string {
  const match = content.match(FRONTMATTER_PATTERN);
  if (!match) {
    return content;
  }

  const lines = match[1].split('\n');
  const nextLine = `${key}: ${value}`;
  const existingIndex = lines.findIndex((line) => line.startsWith(`${key}:`));

  if (existingIndex >= 0) {
    lines[existingIndex] = nextLine;
  } else {
    lines.push(nextLine);
  }

  const rebuilt = `---\n${lines.join('\n')}\n---\n`;
  return `${rebuilt}${content.slice(match[0].length)}`;
}

function humanizeSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function quoteYaml(value: string): string {
  return JSON.stringify(value);
}
