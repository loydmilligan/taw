/**
 * Shared map file read/write utilities for wiki-mode commands.
 * The map file is a markdown + YAML frontmatter file written by /save-map.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BrainstormMap, BrainstormOpenItem, OpenItemTag } from '../types/app.js';
import type { SessionRecord } from '../types/session.js';

export interface MapFileData {
  topic: string;
  sessionType: string;
  phase: string;
  created: string;
  mapArtifact: string;
  openItems: BrainstormOpenItem[];
  body: string; // content below the closing ---
  filePath: string;
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

export async function readMapFile(filePath: string): Promise<MapFileData> {
  const raw = await readFile(filePath, 'utf8');
  return parseMapFileContent(raw, filePath);
}

function parseMapFileContent(content: string, filePath: string): MapFileData {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!fmMatch) {
    throw new Error(`No valid YAML frontmatter found in ${filePath}`);
  }

  const fm = fmMatch[1];
  const body = content.slice(fmMatch[0].length);

  const topic = fm.match(/^topic:\s*"([^"]*)"/m)?.[1] ?? '';
  const sessionType = fm.match(/^session_type:\s*(\S+)/m)?.[1] ?? '';
  const phase = fm.match(/^phase:\s*(\S+)/m)?.[1] ?? 'tagged';
  const created = fm.match(/^created:\s*(\S+)/m)?.[1] ?? '';
  const mapArtifact = fm.match(/^map_artifact:\s*"([^"]*)"/m)?.[1] ?? '';

  const openItems: BrainstormOpenItem[] = [];
  // Match each item block (handles optional fields)
  const itemBlockRegex = /- id:\s*(\S+)\n([\s\S]*?)(?=\n\s*- id:|\n---|\n$|$)/g;
  let blockMatch;
  while ((blockMatch = itemBlockRegex.exec(fm)) !== null) {
    const id = blockMatch[1];
    const block = blockMatch[2];

    const text = block.match(/text:\s*"([^"]*)"/)?.[1] ?? '';
    const tag = (block.match(/tag:\s*(\S+)/)?.[1] ?? 'RESEARCH') as OpenItemTag;
    const status = (block.match(/status:\s*(\S+)/)?.[1] ?? 'open') as BrainstormOpenItem['status'];
    const wikiArtifact = block.match(/wiki_artifact:\s*"([^"]*)"/)?.[1];
    const spawnedFrom = block.match(/spawned_from:\s*(\S+)/)?.[1];

    openItems.push({
      id,
      text,
      tag,
      status,
      ...(wikiArtifact ? { wikiArtifact } : {}),
      ...(spawnedFrom ? { spawnedFrom } : {})
    });
  }

  return { topic, sessionType, phase, created, mapArtifact, openItems, body, filePath };
}

// ─── Writing ──────────────────────────────────────────────────────────────────

export function buildFrontmatter(data: MapFileData): string {
  const lines = [
    '---',
    `topic: "${data.topic.replace(/"/g, '\\"')}"`,
    `session_type: ${data.sessionType}`,
    `phase: ${data.phase}`,
    `created: ${data.created}`,
    `map_artifact: "${data.mapArtifact}"`,
    'open_items:'
  ];

  if (data.openItems.length === 0) {
    lines.push('  []');
  } else {
    for (const item of data.openItems) {
      lines.push(`  - id: ${item.id}`);
      lines.push(`    text: "${item.text.replace(/"/g, '\\"')}"`);
      lines.push(`    tag: ${item.tag}`);
      lines.push(`    status: ${item.status}`);
      if (item.wikiArtifact) {
        lines.push(`    wiki_artifact: "${item.wikiArtifact.replace(/"/g, '\\"')}"`);
      }
      if (item.spawnedFrom) {
        lines.push(`    spawned_from: ${item.spawnedFrom}`);
      }
    }
  }

  lines.push('---');
  return lines.join('\n');
}

export async function writeMapFile(data: MapFileData): Promise<void> {
  const frontmatter = buildFrontmatter(data);
  const content = data.body.trim()
    ? `${frontmatter}\n\n${data.body.trim()}\n`
    : `${frontmatter}\n`;
  await writeFile(data.filePath, content, 'utf8');
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function updateMapItem(
  filePath: string,
  id: string,
  updates: Partial<BrainstormOpenItem>
): Promise<MapFileData> {
  const data = await readMapFile(filePath);
  data.openItems = data.openItems.map((item) =>
    item.id === id ? { ...item, ...updates } : item
  );
  await writeMapFile(data);
  return data;
}

export async function appendMapItem(
  filePath: string,
  item: BrainstormOpenItem
): Promise<MapFileData> {
  const data = await readMapFile(filePath);
  data.openItems = [...data.openItems, item];
  await writeMapFile(data);
  return data;
}

// ─── Lookup ───────────────────────────────────────────────────────────────────

export async function findMapFilePath(session: SessionRecord): Promise<string | null> {
  const { readdir } = await import('node:fs/promises');

  // Search current session first, then siblings (newest first)
  const searchDirs: string[] = [session.sessionDir];
  try {
    const sessionsRoot = path.dirname(session.sessionDir);
    const siblings = await readdir(sessionsRoot);
    for (const sibling of siblings.sort().reverse()) {
      const siblingPath = path.join(sessionsRoot, sibling);
      if (siblingPath !== session.sessionDir) searchDirs.push(siblingPath);
    }
  } catch {
    // no siblings
  }

  for (const dir of searchDirs) {
    try {
      const artifactsDir = path.join(dir, 'artifacts');
      const files = await readdir(artifactsDir);
      const mapFiles = files.filter((f) => f.endsWith('-data.md')).sort().reverse();
      if (mapFiles[0]) return path.join(artifactsDir, mapFiles[0]);
    } catch {
      // no artifacts dir
    }
  }

  return null;
}

// ─── BrainstormMap conversion ─────────────────────────────────────────────────

export function mapDataToBrainstormMap(data: MapFileData): BrainstormMap {
  return {
    topic: data.topic,
    sessionType: data.sessionType,
    openItems: data.openItems,
    artifactPath: data.mapArtifact,
    savedAt: data.created
  };
}

// ─── Next item ID ─────────────────────────────────────────────────────────────

export function nextItemId(items: BrainstormOpenItem[]): string {
  const maxNum = items.reduce((max, item) => {
    const match = item.id.match(/^oi-(\d+)$/);
    return match ? Math.max(max, parseInt(match[1], 10)) : max;
  }, 0);
  return `oi-${String(maxNum + 1).padStart(3, '0')}`;
}
