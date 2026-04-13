import { mkdir, readFile, writeFile, access, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { getGlobalWikiRoot, getWikiTopicDir } from '../filesystem/paths.js';

export interface WikiInfo {
  topic: string;
  topicDir: string;
  schemaPath: string;
  indexPath: string;
  logsDir: string;
  pagesDir: string;
}

export function getWikiInfo(topic: string): WikiInfo {
  const topicDir = getWikiTopicDir(topic);
  return {
    topic,
    topicDir,
    schemaPath: path.join(topicDir, 'schema.md'),
    indexPath: path.join(topicDir, 'index.md'),
    logsDir: path.join(topicDir, 'logs'),
    pagesDir: path.join(topicDir, 'pages')
  };
}

export async function wikiExists(topic: string): Promise<boolean> {
  try {
    await access(getWikiTopicDir(topic));
    return true;
  } catch {
    return false;
  }
}

export async function listWikiTopics(): Promise<string[]> {
  try {
    const root = getGlobalWikiRoot();
    const entries = await readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

export async function initWiki(topic: string): Promise<WikiInfo> {
  const info = getWikiInfo(topic);
  await mkdir(path.join(info.pagesDir, 'concepts'), { recursive: true });
  await mkdir(path.join(info.pagesDir, 'entities'), { recursive: true });
  await mkdir(path.join(info.pagesDir, 'sources'), { recursive: true });
  await mkdir(path.join(info.pagesDir, 'analyses'), { recursive: true });
  await mkdir(info.logsDir, { recursive: true });
  await writeIfAbsent(info.indexPath, buildIndexStub(topic));
  return info;
}

export async function writeWikiPage(
  topic: string,
  relativePath: string,
  content: string,
  options: { overwrite?: boolean } = {}
): Promise<string> {
  const info = getWikiInfo(topic);
  const resolved = path.resolve(info.topicDir, relativePath);

  // Sandbox: path must stay within the topic directory
  const topicDirWithSep = info.topicDir.endsWith(path.sep)
    ? info.topicDir
    : info.topicDir + path.sep;
  if (!resolved.startsWith(topicDirWithSep) && resolved !== info.topicDir) {
    throw new Error(
      `Wiki page path escapes topic directory: ${relativePath}`
    );
  }

  const exists = await fileExists(resolved);
  if (exists && !options.overwrite) {
    throw new Error(
      `Wiki page already exists: ${relativePath}. Pass overwrite=true only when intentionally updating an existing page.`
    );
  }

  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, content, 'utf8');
  return resolved;
}

export async function wikiFileExists(
  topic: string,
  relativePath: string
): Promise<boolean> {
  const info = getWikiInfo(topic);
  const resolved = path.resolve(info.topicDir, relativePath);
  const topicDirWithSep = info.topicDir.endsWith(path.sep)
    ? info.topicDir
    : info.topicDir + path.sep;
  if (!resolved.startsWith(topicDirWithSep) && resolved !== info.topicDir) {
    return false;
  }
  return fileExists(resolved);
}

export function resolveWikiPath(topic: string, relativePath: string): string {
  const info = getWikiInfo(topic);
  return path.resolve(info.topicDir, relativePath);
}

export async function readWikiFile(
  topic: string,
  relativePath: string
): Promise<string | null> {
  const info = getWikiInfo(topic);
  const resolved = path.resolve(info.topicDir, relativePath);
  const topicDirWithSep = info.topicDir.endsWith(path.sep)
    ? info.topicDir
    : info.topicDir + path.sep;
  if (!resolved.startsWith(topicDirWithSep) && resolved !== info.topicDir) {
    return null;
  }
  try {
    return await readFile(resolved, 'utf8');
  } catch {
    return null;
  }
}

/** Append a section to today's daily log file (logs/YYYY-MM-DD.md). */
export async function appendWikiDailyLog(
  topic: string,
  section: string
): Promise<void> {
  const info = getWikiInfo(topic);
  const date = new Date().toISOString().slice(0, 10);
  const logFilePath = path.join(info.logsDir, `${date}.md`);

  await mkdir(info.logsDir, { recursive: true });

  let existing = '';
  try {
    existing = await readFile(logFilePath, 'utf8');
  } catch {
    existing = `# ${topic} Wiki Log — ${date}\n`;
  }

  const separator = existing.trimEnd().length > 0 ? '\n\n' : '\n';
  await writeFile(logFilePath, existing.trimEnd() + separator + section + '\n', 'utf8');
}

/** Read the most recent daily log entries (last N log files combined). */
export async function readRecentWikiLogs(
  topic: string,
  maxFiles = 2
): Promise<string | null> {
  const info = getWikiInfo(topic);
  try {
    const files = (await readdir(info.logsDir))
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort()
      .slice(-maxFiles);

    const contents = await Promise.all(
      files.map((f) => readFile(path.join(info.logsDir, f), 'utf8').catch(() => ''))
    );
    const combined = contents.filter(Boolean).join('\n\n');
    return combined || null;
  } catch {
    return null;
  }
}

// Parses "Wiki Ingest:vibecoding" → { type: "Ingest", topic: "vibecoding" }
export function parseWikiMode(
  mode: string
): { type: string; topic: string } | null {
  if (!mode.startsWith('Wiki ')) {
    return null;
  }
  const rest = mode.slice(5);
  const colonIdx = rest.indexOf(':');
  if (colonIdx === -1) {
    return null;
  }
  return { type: rest.slice(0, colonIdx), topic: rest.slice(colonIdx + 1) };
}

export function buildWikiMode(
  type: 'Setup' | 'Ingest' | 'Stage' | 'Query' | 'Lint',
  topic: string
): string {
  return `Wiki ${type}:${topic}`;
}

async function writeIfAbsent(filePath: string, content: string): Promise<void> {
  try {
    await access(filePath);
  } catch {
    await writeFile(filePath, content, 'utf8');
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const result = await stat(filePath);
    return result.isFile();
  } catch {
    return false;
  }
}

function buildIndexStub(topic: string): string {
  return [
    `# Wiki Index: ${topic}`,
    '',
    'Maintained by TAW. Each entry: link, one-line summary, page type.',
    '',
    '## Overview',
    '',
    '## Concepts',
    '',
    '## Entities',
    '',
    '## Sources',
    '',
    '## Analyses',
    ''
  ].join('\n');
}
