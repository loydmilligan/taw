/**
 * /wiki-resolve-item <id>
 *
 * Marks an open item in the brainstorm map as resolved.
 * For RESEARCH items: call this when research is done.
 * For VALIDATE items: call this when validation is complete and you have signal.
 * For DECIDE/DESIGN items: these are resolved automatically by /wiki-save-item.
 */

import { createId } from '../utils/ids.js';
import {
  findMapFilePath,
  readMapFile,
  updateMapItem,
  mapDataToBrainstormMap
} from './map-file.js';
import type { CommandDefinition } from './types.js';

export const wikiResolveItemCommand: CommandDefinition = {
  name: 'wiki-resolve-item',
  description: 'Mark an open item as resolved in the brainstorm map.',
  usage: '/wiki-resolve-item <item-id>',

  async run(input, context) {
    const itemId = input.args[0];

    if (!itemId) {
      return {
        entries: [
          {
            id: createId('wiki-ri-usage'),
            kind: 'error',
            title: 'Usage',
            body: 'Usage: /wiki-resolve-item <item-id>\nExample: /wiki-resolve-item oi-001'
          }
        ]
      };
    }

    const mapFilePath = await findMapFilePath(context.session);

    if (!mapFilePath) {
      return {
        entries: [
          {
            id: createId('wiki-ri-no-map'),
            kind: 'error',
            title: 'No Map Found',
            body: 'No exploration map file found in this session.'
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
            id: createId('wiki-ri-read-err'),
            kind: 'error',
            title: 'Map Read Error',
            body: `Could not read map file: ${err instanceof Error ? err.message : String(err)}`
          }
        ]
      };
    }

    const item = mapData.openItems.find((i) => i.id === itemId);

    if (!item) {
      const ids = mapData.openItems.map((i) => `${i.id} [${i.tag}] ${i.status}`).join('\n');
      return {
        entries: [
          {
            id: createId('wiki-ri-not-found'),
            kind: 'error',
            title: 'Item Not Found',
            body: `No item with ID "${itemId}" found.\n\nAvailable:\n${ids}`
          }
        ]
      };
    }

    if (item.status === 'resolved') {
      return {
        entries: [
          {
            id: createId('wiki-ri-already'),
            kind: 'notice',
            title: 'Already Resolved',
            body: `${itemId} is already resolved.`
          }
        ]
      };
    }

    const updatedData = await updateMapItem(mapFilePath, itemId, { status: 'resolved' });
    const updatedMap = mapDataToBrainstormMap(updatedData);

    const resolvedCount = updatedData.openItems.filter((i) => i.status === 'resolved').length;
    const totalCount = updatedData.openItems.length;

    // Check if there are parent items that were waiting on this one
    const waitingItems = updatedData.openItems.filter(
      (i) => i.spawnedFrom === itemId && i.status !== 'resolved'
    );
    const returnNote =
      waitingItems.length > 0
        ? `\n\nThis item was spawned from ${waitingItems.map((i) => i.spawnedFrom).filter((v, idx, arr) => arr.indexOf(v) === idx).join(', ')}.\nReturn with: /wiki-item ${waitingItems[0]?.spawnedFrom}`
        : '';

    return {
      brainstormMap: updatedMap,
      entries: [
        {
          id: createId('wiki-ri-done'),
          kind: 'notice',
          title: 'Item Resolved',
          body: [
            `✓ ${itemId} [${item.tag}] resolved`,
            `Progress: ${resolvedCount}/${totalCount} items complete`
          ].join('\n') + returnNote
        }
      ]
    };
  }
};
