import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { getWikiInfo, resolveWikiPath, writeWikiPage } from './manager.js';
import {
  ensureOperationalFrontmatter,
  isOperationalWikiNotePath,
  readFrontmatterScalar
} from './frontmatter.js';
import type { PendingLinkReview, PendingLinkReviewProposal } from './pending-link-review.js';

interface WikiNote {
  relativePath: string;
  absolutePath: string;
  slug: string;
  title: string;
  aliases: string[];
  type: string | null;
  content: string;
  existingLinks: Set<string>;
}

const MAX_CANDIDATES_PER_NEW_NOTE = 8;

export async function buildPendingLinkReview(
  topic: string
): Promise<PendingLinkReview> {
  const notes = await loadTopicNotes(topic);
  const newNotes = notes.filter(
    (note) => readFrontmatterScalar(note.content, 'link_review_status') === 'pending'
  );
  const newPathSet = new Set(newNotes.map((note) => note.relativePath));
  const oldNotes = notes.filter((note) => !newPathSet.has(note.relativePath));
  const proposals: PendingLinkReviewProposal[] = [];
  const plannedFiles = new Map<string, string>();

  for (const newNote of newNotes) {
    const candidates = rankCandidateOldNotes(newNote, oldNotes).slice(
      0,
      MAX_CANDIDATES_PER_NEW_NOTE
    );

    for (const candidate of candidates) {
      const nextNewContent = plannedFiles.get(newNote.relativePath) ?? newNote.content;
      const inlineProposal = proposeInlineLink(newNote, candidate, nextNewContent);

      if (inlineProposal) {
        plannedFiles.set(newNote.relativePath, inlineProposal.updatedContent);
        proposals.push(inlineProposal);
        const nextOldContent =
          plannedFiles.get(candidate.relativePath) ?? candidate.content;
        const seeAlsoProposal = proposeReciprocalSeeAlsoLink(
          candidate,
          newNote,
          nextOldContent
        );

        if (seeAlsoProposal) {
          plannedFiles.set(candidate.relativePath, seeAlsoProposal.updatedContent);
          proposals.push(seeAlsoProposal);
        }
      }
    }
  }

  return {
    kind: 'link-review',
    topic,
    scope: 'recent',
    createdAt: new Date().toISOString(),
    newNotes: newNotes.map((note) => note.relativePath),
    proposals
  };
}

export async function applyPendingLinkReview(
  pending: PendingLinkReview
): Promise<void> {
  for (const proposal of pending.proposals) {
    await writeWikiPage(pending.topic, proposal.filePath, proposal.updatedContent, {
      overwrite: true
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  for (const relativePath of pending.newNotes) {
    const existing = await readFile(resolveWikiPath(pending.topic, relativePath), 'utf8');
    const updated = ensureOperationalFrontmatter(existing, relativePath, {
      today,
      linkReviewStatus: 'reviewed',
      linkReviewedAt: today
    });
    await writeWikiPage(pending.topic, relativePath, updated, { overwrite: true });
  }
}

export function formatPendingLinkReviewSummary(
  pending: PendingLinkReview
): string {
  if (pending.newNotes.length === 0) {
    return 'No notes with `link_review_status: pending` were available for link review.';
  }

  if (pending.proposals.length === 0) {
    return [
      `Reviewed ${pending.newNotes.length} pending note${pending.newNotes.length === 1 ? '' : 's'}.`,
      'No high-confidence link updates were proposed.'
    ].join('\n');
  }

  const lines = [
    `Reviewed ${pending.newNotes.length} pending note${pending.newNotes.length === 1 ? '' : 's'}.`,
    `Proposed ${pending.proposals.length} link update${pending.proposals.length === 1 ? '' : 's'}:`
  ];

  for (const proposal of pending.proposals.slice(0, 12)) {
    lines.push(`- ${proposal.filePath}: ${proposal.summary}`);
  }

  if (pending.proposals.length > 12) {
    lines.push(`- ...and ${pending.proposals.length - 12} more`);
  }

  lines.push('Run /confirm to apply these edits or /cancel to discard them.');
  return lines.join('\n');
}

export async function appendLinkReviewLog(
  topic: string,
  pending: PendingLinkReview
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
    `## ${pending.createdAt} | link-review`,
    '',
    `Reviewed pending notes: ${pending.newNotes.join(', ') || 'none'}`,
    pending.proposals.length > 0
      ? `Applied proposals:\n${pending.proposals.map((proposal) => `- ${proposal.filePath}: ${proposal.summary}`).join('\n')}`
      : 'Applied proposals: none'
  ].join('\n');

  const separator = existing.trimEnd().length > 0 ? '\n\n' : '';
  await writeWikiPage(topic, `logs/${new Date().toISOString().slice(0, 10)}.md`, `${existing.trimEnd()}${separator}${section}\n`, {
    overwrite: true
  });
}

export async function backfillOperationalFrontmatter(
  topic: string,
  options: {
    defaultLinkReviewStatus?: 'pending' | 'reviewed';
    defaultIndexStatus?: 'pending' | 'indexed';
  } = {}
): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const notes = await loadTopicNotes(topic);
  let changed = 0;
  const defaultLinkReviewStatus = options.defaultLinkReviewStatus ?? 'reviewed';
  const defaultIndexStatus = options.defaultIndexStatus ?? 'indexed';

  for (const note of notes) {
    const currentLinkReviewStatus = readFrontmatterScalar(
      note.content,
      'link_review_status'
    ) as 'pending' | 'reviewed' | null;
    const currentIndexStatus = readFrontmatterScalar(
      note.content,
      'index_status'
    ) as 'pending' | 'indexed' | null;
    const next = ensureOperationalFrontmatter(note.content, note.relativePath, {
      today,
      linkReviewStatus: currentLinkReviewStatus ?? defaultLinkReviewStatus,
      linkReviewedAt:
        readFrontmatterScalar(note.content, 'link_reviewed_at') ??
        ((currentLinkReviewStatus ?? defaultLinkReviewStatus) === 'reviewed'
          ? today
          : null),
      indexStatus: currentIndexStatus ?? defaultIndexStatus,
      indexedAt:
        readFrontmatterScalar(note.content, 'indexed_at') ??
        ((currentIndexStatus ?? defaultIndexStatus) === 'indexed' ? today : null)
    });

    if (next !== note.content) {
      await writeWikiPage(topic, note.relativePath, next, { overwrite: true });
      changed += 1;
    }
  }

  return changed;
}

function rankCandidateOldNotes(newNote: WikiNote, oldNotes: WikiNote[]): WikiNote[] {
  return oldNotes
    .map((note) => ({ note, score: scoreCandidate(newNote, note) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.note);
}

function scoreCandidate(newNote: WikiNote, oldNote: WikiNote): number {
  if (newNote.relativePath === oldNote.relativePath) {
    return 0;
  }

  if (newNote.existingLinks.has(oldNote.slug) || oldNote.existingLinks.has(newNote.slug)) {
    return 0;
  }

  let score = 0;
  const searchBody = stripFrontmatter(newNote.content);
  const oldNames = [oldNote.title, ...oldNote.aliases].filter(Boolean);

  for (const name of oldNames) {
    const mentionCount = countPhraseMatches(searchBody, name);
    if (mentionCount > 0) {
      score += 10 + mentionCount * 4;
    }
  }

  const overlap = countOverlapTokens(
    tokenizeTitle(newNote.title),
    tokenizeTitle(oldNote.title)
  );
  score += overlap * 2;

  if (newNote.type === 'source' && oldNote.type === 'entity') {
    score += 3;
  }

  if (newNote.type === 'source' && oldNote.type === 'concept') {
    score += 2;
  }

  return score;
}

function proposeInlineLink(
  newNote: WikiNote,
  oldNote: WikiNote,
  currentContent: string
): PendingLinkReviewProposal | null {
  if (extractExistingLinks(currentContent).has(oldNote.slug)) {
    return null;
  }

  const oldNames = [oldNote.title, ...oldNote.aliases]
    .filter((name) => name.trim().length >= 4)
    .sort((left, right) => right.length - left.length);

  for (const name of oldNames) {
    const linked = `[[${oldNote.slug}|${name}]]`;
    const updated = replaceFirstPlainMention(currentContent, name, linked);
    if (updated && updated !== currentContent) {
      return {
        filePath: newNote.relativePath,
        kind: 'new-to-old-inline-link',
        reason: `${newNote.title} directly references ${oldNote.title}.`,
        confidence: 'high',
        updatedContent: updated,
        summary: `link ${newNote.slug} -> ${oldNote.slug} inline`
      };
    }
  }

  return null;
}

function proposeReciprocalSeeAlsoLink(
  oldNote: WikiNote,
  newNote: WikiNote,
  currentContent: string
): PendingLinkReviewProposal | null {
  if (extractExistingLinks(currentContent).has(newNote.slug)) {
    return null;
  }

  const appended = appendSeeAlsoLink(currentContent, `[[${newNote.slug}|${newNote.title}]]`);
  if (!appended || appended === currentContent) {
    return null;
  }

  return {
    filePath: oldNote.relativePath,
    kind: 'old-to-new-see-also',
    reason: `${newNote.title} materially extends ${oldNote.title}.`,
    confidence: 'medium',
    updatedContent: appended,
    summary: `add See also link ${oldNote.slug} -> ${newNote.slug}`
  };
}

async function loadTopicNotes(topic: string): Promise<WikiNote[]> {
  const info = getWikiInfo(topic);
  const paths = await collectMarkdownFiles(info.topicDir);
  const reviewable = paths.filter((item) => isOperationalWikiNotePath(item));

  const notes = await Promise.all(
    reviewable.map(async (relativePath) => {
      const absolutePath = path.join(info.topicDir, relativePath);
      const content = await readFile(absolutePath, 'utf8');
      return parseWikiNote(relativePath, absolutePath, content);
    })
  );

  return notes;
}

async function collectMarkdownFiles(
  rootDir: string,
  relativeDir = ''
): Promise<string[]> {
  const absoluteDir = path.join(rootDir, relativeDir);
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }

    const nextRelative = relativeDir
      ? path.join(relativeDir, entry.name)
      : entry.name;

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

function parseWikiNote(
  relativePath: string,
  absolutePath: string,
  content: string
): WikiNote {
  const frontmatter = extractFrontmatter(content);
  const title =
    frontmatter.title ??
    extractFirstHeading(content) ??
    humanizeSlug(path.basename(relativePath, '.md'));
  const aliases = parseAliases(frontmatter.aliases);
  return {
    relativePath,
    absolutePath,
    slug: path.basename(relativePath, '.md'),
    title,
    aliases,
    type: frontmatter.type ?? null,
    content,
    existingLinks: extractExistingLinks(content)
  };
}

function extractFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return {};
  }

  const result: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex <= 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    result[key] = value;
  }
  return result;
}

function parseAliases(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  const trimmed = raw.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    return [];
  }

  return trimmed
    .slice(1, -1)
    .split(',')
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function extractFirstHeading(content: string): string | null {
  const match = stripFrontmatter(content).match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

function stripFrontmatter(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, '');
}

function extractExistingLinks(content: string): Set<string> {
  const result = new Set<string>();
  const matches = content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g);
  for (const match of matches) {
    result.add(path.basename(match[1].trim()));
  }
  return result;
}

function humanizeSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function tokenizeTitle(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4);
}

function countOverlapTokens(left: string[], right: string[]): number {
  const rightSet = new Set(right);
  return left.filter((token) => rightSet.has(token)).length;
}

function countPhraseMatches(content: string, phrase: string): number {
  const normalizedPhrase = phrase.trim();
  if (normalizedPhrase.length < 4) {
    return 0;
  }

  const escaped = escapeRegExp(normalizedPhrase);
  const matches = content.match(new RegExp(`\\b${escaped}\\b`, 'gi'));
  return matches?.length ?? 0;
}

function replaceFirstPlainMention(
  content: string,
  phrase: string,
  replacement: string
): string | null {
  const frontmatterMatch = content.match(/^(---\n[\s\S]*?\n---\n?)/);
  const prefix = frontmatterMatch?.[1] ?? '';
  const body = content.slice(prefix.length);
  const lines = body.split('\n');
  let insideFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      insideFence = !insideFence;
      continue;
    }

    if (insideFence || trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }

    if (trimmed.includes(`[[`) || trimmed.includes(`](`)) {
      continue;
    }

    const escaped = escapeRegExp(phrase);
    const pattern = new RegExp(`\\b${escaped}\\b`);
    if (!pattern.test(line)) {
      continue;
    }

    const updatedLine = line.replace(pattern, replacement);
    if (updatedLine === line) {
      continue;
    }

    lines[index] = updatedLine;
    return `${prefix}${lines.join('\n')}`;
  }

  return null;
}

function appendSeeAlsoLink(content: string, linkMarkup: string): string | null {
  const lines = content.split('\n');
  let sectionIndex = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const normalized = lines[index].trim().toLowerCase();
    if (normalized === '## see also' || normalized === '## related') {
      sectionIndex = index;
      break;
    }
  }

  if (sectionIndex >= 0) {
    let insertIndex = sectionIndex + 1;
    while (insertIndex < lines.length && !lines[insertIndex].startsWith('## ')) {
      if (lines[insertIndex].includes(linkMarkup)) {
        return null;
      }
      insertIndex += 1;
    }

    const nextLines = [...lines];
    const bullet = `- ${linkMarkup}`;
    if (
      sectionIndex + 1 < nextLines.length &&
      nextLines[sectionIndex + 1].trim().length > 0
    ) {
      nextLines.splice(insertIndex, 0, bullet);
    } else {
      nextLines.splice(sectionIndex + 1, 0, bullet);
    }
    return nextLines.join('\n');
  }

  const trimmed = content.trimEnd();
  return `${trimmed}\n\n## See also\n- ${linkMarkup}\n`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
