import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { createId } from '../utils/ids.js';
import { readMapFile, mapDataToBrainstormMap } from './map-file.js';
import type { MapPickerItem } from '../types/app.js';
import type { CommandDefinition } from './types.js';

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
          const mapData = await readMapFile(filePath);
          const item: MapPickerItem = {
            filePath,
            topic: mapData.topic,
            sessionType: mapData.sessionType,
            created: mapData.created,
            openItems: mapData.openItems
          };
          maps.push(item);
        } catch {
          // skip files that fail to parse
        }
      }
    } catch {
      // no artifacts dir
    }
  }

  return maps;
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

      let mapData;
      try {
        mapData = await readMapFile(mapFilePath);
      } catch {
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

      const brainstormMap = mapDataToBrainstormMap(mapData);
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
      let brainstormMap;
      try {
        const mapData = await readMapFile(map.filePath);
        brainstormMap = mapDataToBrainstormMap(mapData);
      } catch {
        // parse failed — open picker without pre-loaded map
      }
      return {
        brainstormMap,
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
