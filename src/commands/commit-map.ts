import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createId } from '../utils/ids.js';
import {
  findMapFilePath,
  readMapFile
} from './map-file.js';
import { initWiki, writeWikiPage } from '../services/wiki/manager.js';
import type { CommandDefinition } from './types.js';

export const commitMapCommand: CommandDefinition = {
  name: 'commit-map',
  description: 'Commit the completed brainstorm map to the Obsidian vault as a wiki topic.',
  usage: '/commit-map',
  async run(_input, context) {
    // Step 1: find current map file
    const mapFilePath = await findMapFilePath(context.session);
    if (!mapFilePath) {
      return {
        entries: [
          {
            id: createId('commit-map-no-map'),
            kind: 'error',
            title: 'No Map Found',
            body: 'No exploration map file found in this session.'
          }
        ]
      };
    }

    // Step 2: read map file
    let mapData;
    try {
      mapData = await readMapFile(mapFilePath);
    } catch (err) {
      return {
        entries: [
          {
            id: createId('commit-map-read-err'),
            kind: 'error',
            title: 'Map Read Error',
            body: `Could not read map file: ${err instanceof Error ? err.message : String(err)}`
          }
        ]
      };
    }

    // Step 3: validate topic exists
    if (!mapData.topic || mapData.topic.trim() === '') {
      return {
        entries: [
          {
            id: createId('commit-map-no-topic'),
            kind: 'error',
            title: 'Map Missing Topic',
            body: 'Map file has no topic; run /save-map first.'
          }
        ]
      };
    }

    // Step 4: read map artifact body (the full brainstorm markdown)
    let artifactBody = '';
    try {
      artifactBody = await readFile(mapData.mapArtifact, 'utf8');
    } catch {
      artifactBody = '';
    }

    // Step 5: init wiki topic folder (idempotent; creates dir if absent)
    const info = await initWiki(mapData.topic);

    // Step 6: build [[wikilinks]] to each resolved item's wiki_artifact in creation order
    const resolvedItems = mapData.openItems.filter(
      (i) => i.wikiArtifact && i.status === 'resolved'
    );
    const wikilinks = resolvedItems
      .map((i) => {
        const name = path.basename(i.wikiArtifact!, '.md');
        return `- [[${name}]] — ${i.tag.toLowerCase()}: ${i.text}`;
      })
      .join('\n');

    // Step 7: build YAML frontmatter for the vault node (satisfies MAP-05).
    // Upstream /wiki-save-item and /wiki-finalize-item do NOT emit frontmatter
    // on per-item artifacts, so the vault-node frontmatter is produced here.
    // Escape any embedded double quotes in string values to keep YAML valid.
    const yamlEscape = (s: string) => s.replace(/"/g, '\\"');
    const tags = Array.from(
      new Set(resolvedItems.map((i) => i.tag.toLowerCase()))
    );
    const frontmatterLines = [
      '---',
      `topic: "${yamlEscape(mapData.topic)}"`,
      `created: "${yamlEscape(mapData.created)}"`,
      `source_session: "${yamlEscape(context.session.metadata.id ?? '')}"`,
      `source_map: "${yamlEscape(mapData.filePath)}"`,
      `resolved_count: ${resolvedItems.length}`,
      `total_items: ${mapData.openItems.length}`,
      `tags: [${tags.map((t) => `"${yamlEscape(t)}"`).join(', ')}]`,
      '---',
      ''
    ];

    // Step 8: assemble index.md content (frontmatter FIRST, then body)
    const indexContent = [
      ...frontmatterLines,
      `# ${mapData.topic}`,
      '',
      `> Committed from brainstorm session on ${mapData.created}`,
      '',
      '## Map',
      '',
      artifactBody.trim() || '_(map artifact empty)_',
      '',
      '## Derived Artifacts',
      '',
      wikilinks || '_(no resolved items with artifacts)_',
      ''
    ].join('\n');

    // Step 9: write index.md (overwrite existing per D-07 disposition)
    let resolvedPath: string;
    try {
      resolvedPath = await writeWikiPage(
        mapData.topic,
        'index.md',
        indexContent,
        { overwrite: true }
      );
    } catch (err) {
      return {
        entries: [
          {
            id: createId('commit-map-write-err'),
            kind: 'error',
            title: 'Vault Write Failed',
            body: err instanceof Error ? err.message : String(err)
          }
        ]
      };
    }

    // Step 10: success notice
    return {
      entries: [
        {
          id: createId('commit-map-done'),
          kind: 'notice',
          title: 'Map Committed to Vault',
          body: [
            `✓ "${mapData.topic}"`,
            `→ ${info.topicDir}`,
            `  index: ${resolvedPath}`,
            `${resolvedItems.length}/${mapData.openItems.length} items resolved`
          ].join('\n')
        }
      ]
    };
  }
};
