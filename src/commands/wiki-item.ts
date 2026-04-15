/**
 * /wiki-item <id>
 *
 * Opens a wiki work session for a specific open item from the brainstorm map.
 * Routes to the correct system prompt based on the item's tag:
 *   DECIDE  → present 2–3 options, guide to a commitment
 *   DESIGN  → map solution space, explore tradeoffs, land on approach
 *   VALIDATE → clarify hypothesis, design minimum viable validation
 *   RESEARCH → redirect to /research (already handled separately)
 */

import { createId } from '../utils/ids.js';
import {
  findMapFilePath,
  readMapFile,
  updateMapItem,
  mapDataToBrainstormMap
} from './map-file.js';
import type { CommandDefinition } from './types.js';

function buildDecidePrompt(itemText: string, itemId: string): string {
  return [
    `You are helping the user make a decision: "${itemText}"`,
    '',
    'Present exactly 2–3 options. Format each as:',
    '',
    '**Option N: [Short Name]**',
    '[One sentence describing the approach]',
    '*Tradeoff: [One sentence on the key cost or risk]*',
    '',
    'After presenting options, ask: "Which direction feels right, or would you like to explore any of these further?"',
    '',
    'Rules:',
    '- Do not recommend. Present all options neutrally.',
    '- If the user indicates they need more information before deciding, help them name exactly what is missing — a specific question that research could answer. Then suggest: `/wiki-add-research "<the question>" --from ' + itemId + '`',
    '- When the user commits to an option, say: "Run `/wiki-finalize-item ' + itemId + '` to save the decision record."'
  ].join('\n');
}

function buildDesignPrompt(itemText: string, itemId: string): string {
  return [
    `You are helping the user work through a design problem: "${itemText}"`,
    '',
    'Start by mapping the solution space:',
    '1. Identify 2–4 distinct approaches',
    '2. Name the key dimensions that separate them (e.g. build vs buy, sync vs async, centralized vs distributed)',
    '',
    'Then walk through the most important tradeoffs on those dimensions. Ask about constraints only if they would genuinely change the analysis.',
    '',
    'Guide the user toward a specific approach — explore first, converge when the user is ready. Do not recommend prematurely.',
    '',
    'When the user commits to an approach, say: "Run `/wiki-finalize-item ' + itemId + '` to save the design document."'
  ].join('\n');
}

function buildValidatePrompt(itemText: string, itemId: string): string {
  return [
    `You are helping the user design a validation for this hypothesis: "${itemText}"`,
    '',
    'Work through these steps:',
    '1. Clarify the hypothesis — what exactly is being claimed?',
    '2. What signal would confirm it? What would deny it?',
    '3. What is the fastest, cheapest way to get that signal? (user interviews, surveys, prototype test, market check, competitor analysis, etc.)',
    '4. What are the concrete steps? Be specific — "talk to users" is not a plan.',
    '',
    'When the plan is clear, say: "Run `/wiki-finalize-item ' + itemId + '` to save the validation plan."'
  ].join('\n');
}

export const wikiItemCommand: CommandDefinition = {
  name: 'wiki-item',
  description: 'Open a wiki work session for a specific open item (DECIDE, DESIGN, or VALIDATE).',
  usage: '/wiki-item <item-id>',

  async run(input, context) {
    const itemId = input.args[0];

    if (!itemId) {
      return {
        entries: [
          {
            id: createId('wiki-item-usage'),
            kind: 'error',
            title: 'Usage',
            body: 'Usage: /wiki-item <item-id>\nExample: /wiki-item oi-001\n\nFind item IDs in the map panel (Ctrl+P) or by running /load-map.'
          }
        ]
      };
    }

    const mapFilePath = await findMapFilePath(context.session);

    if (!mapFilePath) {
      return {
        entries: [
          {
            id: createId('wiki-item-no-map'),
            kind: 'error',
            title: 'No Map Found',
            body: 'No exploration map file found in this session.\nRun /brainstorm and /finalize first, or use /load-map to load an existing map.'
          }
        ]
      };
    }

    let mapData;
    try {
      mapData = await readMapFile(mapFilePath);
    } catch (err) {
      return {
        entries: [
          {
            id: createId('wiki-item-read-err'),
            kind: 'error',
            title: 'Map Read Error',
            body: `Could not read map file: ${err instanceof Error ? err.message : String(err)}`
          }
        ]
      };
    }

    const item = mapData.openItems.find((i) => i.id === itemId);

    if (!item) {
      const availableIds = mapData.openItems.map((i) => `${i.id} [${i.tag}] ${i.text.slice(0, 40)}`).join('\n');
      return {
        entries: [
          {
            id: createId('wiki-item-not-found'),
            kind: 'error',
            title: 'Item Not Found',
            body: `No item with ID "${itemId}" found in map.\n\nAvailable items:\n${availableIds}`
          }
        ]
      };
    }

    if (item.tag === 'RESEARCH') {
      // Still mark in-progress and give the exact command
      const updatedDataR = await updateMapItem(mapFilePath, itemId, { status: 'in-progress' });
      const updatedMapR = mapDataToBrainstormMap(updatedDataR);

      const topicSlug = mapData.topic
        .replace(/`/g, '')
        .trim()
        .split(' ')
        .slice(0, 4)
        .join(' ');

      return {
        brainstormMap: updatedMapR,
        entries: [
          {
            id: createId('wiki-item-research'),
            kind: 'notice',
            title: `Research — ${itemId}`,
            body: [
              `"${item.text}"`,
              '',
              `Marked in-progress. Start research with:`,
              `  /research tech ${topicSlug}`,
              '',
              `When you are satisfied with the research, run:`,
              `  /wiki-resolve-item ${itemId}`
            ].join('\n')
          }
        ]
      };
    }

    if (item.status === 'resolved') {
      return {
        entries: [
          {
            id: createId('wiki-item-resolved'),
            kind: 'notice',
            title: 'Already Resolved',
            body: `Item ${itemId} is already resolved.${item.wikiArtifact ? `\nArtifact: ${item.wikiArtifact}` : ''}`
          }
        ]
      };
    }

    // Update status to in-progress
    const updatedData = await updateMapItem(mapFilePath, itemId, { status: 'in-progress' });
    const updatedMap = mapDataToBrainstormMap(updatedData);

    // Build the appropriate system prompt
    const systemPrompt =
      item.tag === 'DECIDE'
        ? buildDecidePrompt(item.text, itemId)
        : item.tag === 'DESIGN'
          ? buildDesignPrompt(item.text, itemId)
          : buildValidatePrompt(item.text, itemId);

    const tagLabel =
      item.tag === 'DECIDE'
        ? 'Decision Session'
        : item.tag === 'DESIGN'
          ? 'Design Session'
          : 'Validation Planning';

    const tagInstruction =
      item.tag === 'DECIDE'
        ? 'Work through the options. When you commit, run /wiki-finalize-item to save the decision record.'
        : item.tag === 'DESIGN'
          ? 'Explore the solution space. When you have an approach, run /wiki-finalize-item to save the design doc.'
          : 'Design the validation plan. When it is ready, run /wiki-finalize-item to save it.';

    return {
      brainstormMap: updatedMap,
      queuedInputs: [systemPrompt],
      entries: [
        {
          id: createId('wiki-item-start'),
          kind: 'notice',
          title: `${tagLabel} — ${itemId}`,
          body: [
            `"${item.text}"`,
            '',
            tagInstruction
          ].join('\n')
        }
      ]
    };
  }
};
