/**
 * /wiki-add-research "<question text>" [--from <parent-item-id>]
 *
 * Creates a new RESEARCH item in the map file, optionally linking it to
 * the DECIDE or DESIGN item that triggered the need for more information.
 *
 * Use this when a decision or design session surfaces a factual gap that
 * needs to be resolved before the work can continue.
 *
 * After creating the item, the user can run /research tech <topic> to
 * investigate, then return with /wiki-item <parent-id> to continue.
 */

import { createId } from '../utils/ids.js';
import {
  findMapFilePath,
  readMapFile,
  appendMapItem,
  mapDataToBrainstormMap,
  nextItemId
} from './map-file.js';
import type { CommandDefinition } from './types.js';

export const wikiAddResearchCommand: CommandDefinition = {
  name: 'wiki-add-research',
  description: 'Add a new RESEARCH item to the map, optionally linked to a parent DECIDE or DESIGN item.',
  usage: '/wiki-add-research "<question>" [--from <parent-id>]',

  async run(input, context) {
    // Parse args: collect text until --from, then grab the parent id
    let questionParts: string[] = [];
    let spawnedFrom: string | undefined;

    const args = input.args;
    let i = 0;
    while (i < args.length) {
      if (args[i] === '--from' && args[i + 1]) {
        spawnedFrom = args[i + 1];
        i += 2;
      } else {
        questionParts.push(args[i]);
        i++;
      }
    }

    // Strip surrounding quotes if the whole text was quoted
    let questionText = questionParts.join(' ').trim().replace(/^["']|["']$/g, '');

    if (!questionText) {
      return {
        entries: [
          {
            id: createId('wiki-ar-usage'),
            kind: 'error',
            title: 'Usage',
            body: [
              'Usage: /wiki-add-research "<question>" [--from <parent-id>]',
              '',
              'Examples:',
              '  /wiki-add-research "What are the rate limits for the OpenRouter API?"',
              '  /wiki-add-research "Does FastAPI support background tasks natively?" --from oi-001'
            ].join('\n')
          }
        ]
      };
    }

    const mapFilePath = await findMapFilePath(context.session);

    if (!mapFilePath) {
      return {
        entries: [
          {
            id: createId('wiki-ar-no-map'),
            kind: 'error',
            title: 'No Map Found',
            body: 'No exploration map file found in this session.\nRun /brainstorm and /finalize first, or use /load-map.'
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
            id: createId('wiki-ar-read-err'),
            kind: 'error',
            title: 'Map Read Error',
            body: `Could not read map file: ${err instanceof Error ? err.message : String(err)}`
          }
        ]
      };
    }

    // Validate parent item exists if --from was provided
    if (spawnedFrom) {
      const parentExists = mapData.openItems.some((i) => i.id === spawnedFrom);
      if (!parentExists) {
        return {
          entries: [
            {
              id: createId('wiki-ar-parent-not-found'),
              kind: 'error',
              title: 'Parent Item Not Found',
              body: `No item with ID "${spawnedFrom}" found in map. Check the ID and try again.`
            }
          ]
        };
      }
    }

    const newId = nextItemId(mapData.openItems);
    const newItem = {
      id: newId,
      text: questionText,
      tag: 'RESEARCH' as const,
      status: 'open' as const,
      ...(spawnedFrom ? { spawnedFrom } : {})
    };

    const updatedData = await appendMapItem(mapFilePath, newItem);
    const updatedMap = mapDataToBrainstormMap(updatedData);

    const parentNote = spawnedFrom
      ? `\nLinked to: ${spawnedFrom} (return to that item after research is done)`
      : '';

    // Build the topic from the map for the research suggestion
    const researchTopic = mapData.topic
      .replace(/`/g, '')
      .trim()
      .split(' ')
      .slice(0, 4)
      .join(' ');

    return {
      brainstormMap: updatedMap,
      entries: [
        {
          id: createId('wiki-ar-done'),
          kind: 'notice',
          title: 'Research Item Added',
          body: [
            `✓ ${newId} [RESEARCH] ${questionText}${parentNote}`,
            '',
            `To investigate now: /research tech ${researchTopic}`,
            spawnedFrom ? `When done, return with: /wiki-item ${spawnedFrom}` : ''
          ]
            .filter(Boolean)
            .join('\n')
        }
      ]
    };
  }
};
