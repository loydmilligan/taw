import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createId } from '../utils/ids.js';
import type { BrainstormMap, BrainstormOpenItem, OpenItemTag } from '../types/app.js';
import type { CommandDefinition } from './types.js';

const SESSION_TYPES = [
  'product-idea',
  'technical-decision',
  'business-strategy',
  'learning-concept',
  'problem-diagnosis'
] as const;

function parseTaggedItems(text: string): BrainstormOpenItem[] {
  const tagRegex = /\[(RESEARCH|VALIDATE|DESIGN|DECIDE)\]\s+(.+)/g;
  const items: BrainstormOpenItem[] = [];
  let match;
  let index = 1;

  while ((match = tagRegex.exec(text)) !== null) {
    const tag = match[1] as OpenItemTag;
    const itemText = match[2].trim();
    if (itemText) {
      items.push({
        id: `oi-${String(index).padStart(3, '0')}`,
        text: itemText,
        tag,
        status: 'open'
      });
      index++;
    }
  }

  return items;
}

function detectSessionType(bodies: string[]): string {
  for (const body of bodies) {
    for (const type of SESSION_TYPES) {
      if (body.includes(type)) return type;
    }
  }
  return 'unknown';
}

function extractTopic(assistantBodies: string[], firstUserBody: string): string {
  // The research transition response contains a line like:
  // "To take these into Research, run: /research tech <topic>"
  const researchLineRegex = /\/research\s+tech\s+([^`\n]+)/i;
  for (const body of [...assistantBodies].reverse()) {
    const match = body.match(researchLineRegex);
    if (match?.[1]) return match[1].trim().replace(/`+$/, '').trim();
  }
  // Fallback: first 60 chars of first user message
  return firstUserBody.slice(0, 60).replace(/\n/g, ' ').trim() || 'brainstorm';
}

function buildFrontmatter(map: BrainstormMap): string {
  const lines = [
    '---',
    `topic: "${map.topic.replace(/"/g, '\\"')}"`,
    `session_type: ${map.sessionType}`,
    'phase: tagged',
    `created: ${map.savedAt}`,
    `map_artifact: "${map.artifactPath}"`,
    'open_items:'
  ];

  if (map.openItems.length === 0) {
    lines.push('  []');
  } else {
    for (const item of map.openItems) {
      lines.push(`  - id: ${item.id}`);
      lines.push(`    text: "${item.text.replace(/"/g, '\\"')}"`);
      lines.push(`    tag: ${item.tag}`);
      lines.push(`    status: ${item.status}`);
    }
  }

  lines.push('---');
  return lines.join('\n');
}

export const saveMapCommand: CommandDefinition = {
  name: 'save-map',
  description:
    'Save the exploration map file with YAML frontmatter and tagged open items. Runs automatically after /finalize in Brainstorm Phase 2.',
  usage: '/save-map',
  async run(_input, context) {
    // Find the most recent exploration-map artifact (just written by /finalize)
    const mapArtifact = [...context.session.metadata.artifacts]
      .reverse()
      .find((a) => a.type === 'exploration-map');

    if (!mapArtifact) {
      return {
        entries: [
          {
            id: createId('save-map-error'),
            kind: 'error',
            title: 'No Map Artifact',
            body: 'No exploration map artifact found in this session. Run /brainstorm and /finalize first.'
          }
        ]
      };
    }

    // Read the artifact content for the body section of the map file
    let artifactBody = '';
    try {
      artifactBody = await readFile(mapArtifact.path, 'utf8');
    } catch {
      artifactBody = '';
    }

    // Collect transcript bodies
    const assistantBodies = context.transcript
      .filter((e) => e.kind === 'assistant')
      .map((e) => e.body ?? '');
    const firstUserBody =
      context.transcript.find((e) => e.kind === 'user')?.body ?? '';

    // Find tagged items from the most recent assistant message with tags
    const taggedBody = [...assistantBodies]
      .reverse()
      .find((body) => /\[(RESEARCH|VALIDATE|DESIGN|DECIDE)\]/.test(body));

    const openItems = taggedBody ? parseTaggedItems(taggedBody) : [];
    const topic = extractTopic(assistantBodies, firstUserBody);
    const sessionType = detectSessionType(assistantBodies);
    const savedAt = new Date().toISOString().slice(0, 10);

    const brainstormMap: BrainstormMap = {
      topic,
      sessionType,
      openItems,
      artifactPath: mapArtifact.path,
      savedAt
    };

    // Write the map file alongside the artifact
    const artifactDir = path.dirname(mapArtifact.path);
    const artifactBasename = path.basename(mapArtifact.path, '.md');
    const mapFilePath = path.join(artifactDir, `${artifactBasename}-data.md`);
    const mapContent = [buildFrontmatter(brainstormMap), '', artifactBody.trim()].join('\n');
    await writeFile(mapFilePath, `${mapContent}\n`, 'utf8');

    const tagCounts = openItems.reduce<Record<string, number>>(
      (acc, item) => ({ ...acc, [item.tag]: (acc[item.tag] ?? 0) + 1 }),
      {}
    );
    const tagSummary = Object.entries(tagCounts)
      .map(([tag, count]) => `${count} ${tag}`)
      .join(' · ');

    const resolvedCount = openItems.filter((i) => i.status === 'resolved').length;
    const itemSummary =
      openItems.length > 0
        ? `${openItems.length} item${openItems.length === 1 ? '' : 's'}: ${tagSummary} · ${resolvedCount}/${openItems.length} resolved`
        : 'No tagged open items found — check tag assignment output above.';

    return {
      brainstormMap,
      entries: [
        {
          id: createId('save-map'),
          kind: 'notice',
          title: 'Map File Saved',
          body: [`✓ Map file written`, `→ ${mapFilePath}`, itemSummary].join('\n')
        }
      ]
    };
  }
};
