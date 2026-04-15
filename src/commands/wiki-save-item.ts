/**
 * /wiki-save-item <id>
 *
 * Reads the most recent completed assistant message, writes it as a session
 * artifact, and updates the map file to mark the item resolved.
 *
 * Runs automatically as a queued input after /wiki-finalize-item generates
 * the document. Can also be run manually.
 */

import { createId } from '../utils/ids.js';
import { createArtifact } from '../core/artifacts/writer.js';
import {
  findMapFilePath,
  readMapFile,
  updateMapItem,
  mapDataToBrainstormMap
} from './map-file.js';
import type { CommandDefinition } from './types.js';

const ARTIFACT_TYPE_MAP: Record<string, string> = {
  DECIDE: 'decision-record',
  DESIGN: 'design-document',
  VALIDATE: 'validation-plan'
};

export const wikiSaveItemCommand: CommandDefinition = {
  name: 'wiki-save-item',
  description: 'Save the last generated document as an artifact and mark the map item resolved.',
  usage: '/wiki-save-item <item-id>',

  async run(input, context) {
    const itemId = input.args[0];

    if (!itemId) {
      return {
        entries: [
          {
            id: createId('wiki-si-usage'),
            kind: 'error',
            title: 'Usage',
            body: 'Usage: /wiki-save-item <item-id>'
          }
        ]
      };
    }

    const mapFilePath = await findMapFilePath(context.session);

    if (!mapFilePath) {
      return {
        entries: [
          {
            id: createId('wiki-si-no-map'),
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
            id: createId('wiki-si-read-err'),
            kind: 'error',
            title: 'Map Read Error',
            body: `Could not read map file: ${err instanceof Error ? err.message : String(err)}`
          }
        ]
      };
    }

    const item = mapData.openItems.find((i) => i.id === itemId);

    if (!item) {
      return {
        entries: [
          {
            id: createId('wiki-si-not-found'),
            kind: 'error',
            title: 'Item Not Found',
            body: `No item with ID "${itemId}" found in map.`
          }
        ]
      };
    }

    // Find the most recent completed assistant message (the generated document)
    const lastAssistant = [...context.transcript]
      .reverse()
      .find((e) => e.kind === 'assistant' && e.body.trim().length > 0);

    if (!lastAssistant) {
      return {
        entries: [
          {
            id: createId('wiki-si-no-content'),
            kind: 'error',
            title: 'No Document Found',
            body: 'No assistant response found to save. Run /wiki-finalize-item first to generate the document.'
          }
        ]
      };
    }

    const artifactType = ARTIFACT_TYPE_MAP[item.tag] ?? 'wiki-item';
    const artifactTitle = `${item.tag.toLowerCase()}-${itemId}`;

    const artifact = await createArtifact(context.session, {
      type: artifactType,
      title: artifactTitle,
      content: lastAssistant.body
    });

    // VALIDATE items stay in-progress (user still needs to do the work)
    // DECIDE and DESIGN items are resolved
    const newStatus = item.tag === 'VALIDATE' ? 'in-progress' : 'resolved';

    const updatedData = await updateMapItem(mapFilePath, itemId, {
      status: newStatus,
      wikiArtifact: artifact.path
    });

    const updatedMap = mapDataToBrainstormMap(updatedData);

    const statusNote =
      item.tag === 'VALIDATE'
        ? 'Validation plan saved. Item stays in-progress — complete the validation and update when done.'
        : 'Item marked resolved.';

    return {
      brainstormMap: updatedMap,
      session: context.session,
      entries: [
        {
          id: createId('wiki-si-done'),
          kind: 'notice',
          title: 'Artifact Saved',
          body: [
            `✓ ${artifactType} saved`,
            `→ ${artifact.path}`,
            statusNote
          ].join('\n')
        }
      ]
    };
  }
};
