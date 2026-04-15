import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createId } from '../utils/ids.js';
import type { BrainstormMap, BrainstormOpenItem, MapPickerItem, OpenItemTag } from '../types/app.js';
import type { CommandDefinition } from './types.js';

// ─── Parser (kept here for direct-load path) ─────────────────────────────────

function parseMapFile(content: string): BrainstormMap | null {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;

  const fm = fmMatch[1];
  const topic = fm.match(/^topic:\s*"([^"]*)"/m)?.[1] ?? '';
  const sessionType = fm.match(/^session_type:\s*(\S+)/m)?.[1] ?? '';
  const artifactPath = fm.match(/^map_artifact:\s*"([^"]*)"/m)?.[1] ?? '';
  const savedAt = fm.match(/^created:\s*(\S+)/m)?.[1] ?? '';

  const openItems: BrainstormOpenItem[] = [];
  const itemRegex =
    /-\s+id:\s*(\S+)\s*\n\s*text:\s*"([^"]*)"\s*\n\s*tag:\s*(\S+)\s*\n\s*status:\s*(\S+)/g;
  let match;
  while ((match = itemRegex.exec(fm)) !== null) {
    openItems.push({
      id: match[1],
      text: match[2],
      tag: match[3] as OpenItemTag,
      status: match[4] as 'open' | 'in-progress' | 'resolved'
    });
  }

  if (!topic) return null;
  return { topic, sessionType, openItems, artifactPath, savedAt };
}

function parseMapPickerItem(content: string, filePath: string): MapPickerItem | null {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;

  const fm = fmMatch[1];
  const topic = fm.match(/^topic:\s*"([^"]*)"/m)?.[1] ?? '';
  const sessionType = fm.match(/^session_type:\s*(\S+)/m)?.[1] ?? '';
  const created = fm.match(/^created:\s*(\S+)/m)?.[1] ?? '';

  const openItems: BrainstormOpenItem[] = [];
  const itemRegex =
    /-\s+id:\s*(\S+)\s*\n\s*text:\s*"([^"]*)"\s*\n\s*tag:\s*(\S+)\s*\n\s*status:\s*(\S+)/g;
  let match;
  while ((match = itemRegex.exec(fm)) !== null) {
    openItems.push({
      id: match[1],
      text: match[2],
      tag: match[3] as OpenItemTag,
      status: match[4] as 'open' | 'in-progress' | 'resolved'
    });
  }

  if (!topic) return null;
  return { filePath, topic, sessionType, created, openItems };
}

// ─── Session scanning ─────────────────────────────────────────────────────────

async function scanAllMaps(sessionDir: string): Promise<MapPickerItem[]> {
  const maps: MapPickerItem[] = [];
  const searchDirs: string[] = [sessionDir];

  try {
    const sessionsRoot = path.dirname(sessionDir);
    const siblings = await readdir(sessionsRoot);
    for (const sibling of siblings.sort().reverse()) {
      const siblingPath = path.join(sessionsRoot, sibling);
      if (siblingPath !== sessionDir) searchDirs.push(siblingPath);
    }
  } catch {
    // no siblings
  }

  for (const dir of searchDirs) {
    try {
      const artifactsDir = path.join(dir, 'artifacts');
      const files = await readdir(artifactsDir);
      const mapFiles = files.filter((f) => f.endsWith('-data.md')).sort().reverse();
      for (const file of mapFiles) {
        const filePath = path.join(artifactsDir, file);
        try {
          const content = await readFile(filePath, 'utf8');
          const item = parseMapPickerItem(content, filePath);
          if (item) maps.push(item);
        } catch {
          // skip unreadable file
        }
      }
    } catch {
      // no artifacts dir
    }
  }

  return maps;
}

async function findLatestMapFile(sessionDir: string): Promise<string | null> {
  const maps = await scanAllMaps(sessionDir);
  return maps[0]?.filePath ?? null;
}

// ─── Command ──────────────────────────────────────────────────────────────────

export const loadMapCommand: CommandDefinition = {
  name: 'load-map',
  description:
    'Browse and load an exploration map. No args opens the map picker. Provide a path to load directly.',
  usage: '/load-map [path/to/exploration-map-data.md]',

  async run(input, context) {
    // ── Direct path load ──────────────────────────────────────────────────────
    if (input.args.length > 0) {
      let mapFilePath = input.args.join(' ').trim();
      if (!path.isAbsolute(mapFilePath)) {
        mapFilePath = path.resolve(process.cwd(), mapFilePath);
      }

      let content: string;
      try {
        content = await readFile(mapFilePath, 'utf8');
      } catch {
        return {
          entries: [
            {
              id: createId('load-map-error'),
              kind: 'error',
              title: 'File Not Found',
              body: `Could not read: ${mapFilePath}`
            }
          ]
        };
      }

      const brainstormMap = parseMapFile(content);
      if (!brainstormMap) {
        return {
          entries: [
            {
              id: createId('load-map-error'),
              kind: 'error',
              title: 'Invalid Map File',
              body: `Could not parse frontmatter from: ${mapFilePath}`
            }
          ]
        };
      }

      const resolvedCount = brainstormMap.openItems.filter((i) => i.status === 'resolved').length;
      return {
        brainstormMap,
        entries: [
          {
            id: createId('load-map'),
            kind: 'notice',
            title: 'Map Loaded',
            body: [
              `✓ "${brainstormMap.topic}"`,
              `→ ${mapFilePath}`,
              `${brainstormMap.openItems.length} items · ${resolvedCount} resolved`
            ].join('\n')
          }
        ]
      };
    }

    // ── No-arg: open picker ───────────────────────────────────────────────────
    const maps = await scanAllMaps(context.session.sessionDir);

    if (maps.length === 0) {
      return {
        entries: [
          {
            id: createId('load-map-none'),
            kind: 'error',
            title: 'No Maps Found',
            body: [
              'No exploration map files found in any session.',
              'Run /brainstorm and /finalize to create one.'
            ].join('\n')
          }
        ]
      };
    }

    if (maps.length === 1) {
      // Only one map — load it directly and open picker action phase
      const map = maps[0]!;
      const content = await readFile(map.filePath, 'utf8');
      const brainstormMap = parseMapFile(content);
      return {
        brainstormMap: brainstormMap ?? undefined,
        openMapPicker: maps,
        entries: []
      };
    }

    // Multiple maps — open the picker for selection
    return {
      openMapPicker: maps,
      entries: []
    };
  }
};
