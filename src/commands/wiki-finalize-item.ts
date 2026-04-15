/**
 * /wiki-finalize-item <id>
 *
 * Closes out an open item from the brainstorm map by:
 * 1. Queuing a document generation prompt (produces the formatted artifact)
 * 2. Queuing /wiki-save-item <id> to write the artifact and mark resolved
 *
 * The document format depends on the item tag:
 *   DECIDE   → Decision record
 *   DESIGN   → Design document
 *   VALIDATE → Validation plan (stays in-progress — user must go do the work)
 */

import { createId } from '../utils/ids.js';
import { findMapFilePath, readMapFile } from './map-file.js';
import type { CommandDefinition } from './types.js';

function buildDecideGenerationPrompt(itemText: string): string {
  return [
    `Based on our decision conversation, produce the complete decision record document for: "${itemText}"`,
    '',
    'Use exactly this format — fill every section with real content from our conversation:',
    '',
    `# Decision: ${itemText}`,
    '',
    '**Decision:** [the chosen option name]',
    `**Date:** ${new Date().toISOString().slice(0, 10)}`,
    '',
    '## Context',
    '[1–2 sentences on why this decision needed to be made]',
    '',
    '## Options Considered',
    '',
    '### Option 1: [name]',
    '[summary]',
    '**Tradeoff:** [tradeoff]',
    '',
    '[repeat for each option presented]',
    '',
    '## Rationale',
    '[Why this option was chosen — derived from the conversation]',
    '',
    '## Next Steps',
    '[What to do now — be concrete]',
    '',
    '## Open Questions',
    '[Any remaining unknowns this decision surfaces, or "None."]',
    '',
    'Produce only the document. No preamble.'
  ].join('\n');
}

function buildDesignGenerationPrompt(itemText: string): string {
  return [
    `Based on our design conversation, produce the complete design document for: "${itemText}"`,
    '',
    'Use exactly this format — fill every section with real content from our conversation:',
    '',
    `# Design: ${itemText}`,
    '',
    `**Date:** ${new Date().toISOString().slice(0, 10)}`,
    '',
    '## Chosen Approach',
    '[Name and describe the approach that was decided on]',
    '',
    '## Solution Space',
    '[The 2–4 approaches that were considered and the key dimensions separating them]',
    '',
    '## Key Design Decisions',
    '',
    '### [Decision 1 title]',
    '**Choice:** [what was chosen]',
    '**Why:** [rationale]',
    '**Alternatives considered:** [what was ruled out and why]',
    '',
    '[repeat for each significant design decision]',
    '',
    '## Open Implementation Questions',
    '[Specific unknowns that remain — things to figure out during implementation, or "None."]',
    '',
    'Produce only the document. No preamble.'
  ].join('\n');
}

function buildValidateGenerationPrompt(itemText: string): string {
  return [
    `Based on our validation planning conversation, produce the complete validation plan for: "${itemText}"`,
    '',
    'Use exactly this format — fill every section with real content from our conversation:',
    '',
    `# Validation Plan: ${itemText}`,
    '',
    `**Date:** ${new Date().toISOString().slice(0, 10)}`,
    '',
    '## Hypothesis',
    '[The specific claim being tested]',
    '',
    '## Success Signal',
    '**Confirms:** [observable result that would confirm the hypothesis]',
    '**Denies:** [observable result that would deny it]',
    '',
    '## Validation Method',
    '[The specific approach — user interviews, prototype test, market check, etc.]',
    '',
    '## Steps',
    '1. [concrete action]',
    '2. [concrete action]',
    '[etc.]',
    '',
    '## Timeline',
    '[Realistic estimate in days]',
    '',
    '## What To Do With The Result',
    '**If confirmed:** [next step]',
    '**If denied:** [next step / pivot]',
    '',
    'Produce only the document. No preamble.'
  ].join('\n');
}

export const wikiFinalizeItemCommand: CommandDefinition = {
  name: 'wiki-finalize-item',
  description: 'Generate and save the artifact for a DECIDE, DESIGN, or VALIDATE item, then mark it resolved.',
  usage: '/wiki-finalize-item <item-id>',

  async run(input, context) {
    const itemId = input.args[0];

    if (!itemId) {
      return {
        entries: [
          {
            id: createId('wiki-fi-usage'),
            kind: 'error',
            title: 'Usage',
            body: 'Usage: /wiki-finalize-item <item-id>\nExample: /wiki-finalize-item oi-001'
          }
        ]
      };
    }

    const mapFilePath = await findMapFilePath(context.session);

    if (!mapFilePath) {
      return {
        entries: [
          {
            id: createId('wiki-fi-no-map'),
            kind: 'error',
            title: 'No Map Found',
            body: 'No exploration map file found. Run /wiki-item first to start a session.'
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
            id: createId('wiki-fi-read-err'),
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
            id: createId('wiki-fi-not-found'),
            kind: 'error',
            title: 'Item Not Found',
            body: `No item with ID "${itemId}" found in map.`
          }
        ]
      };
    }

    if (item.tag === 'RESEARCH') {
      return {
        entries: [
          {
            id: createId('wiki-fi-research'),
            kind: 'error',
            title: 'Wrong Command',
            body: 'RESEARCH items are closed via the Research reconciliation loop, not /wiki-finalize-item.'
          }
        ]
      };
    }

    if (item.status === 'resolved') {
      return {
        entries: [
          {
            id: createId('wiki-fi-already-done'),
            kind: 'notice',
            title: 'Already Resolved',
            body: `Item ${itemId} is already resolved.${item.wikiArtifact ? `\nArtifact: ${item.wikiArtifact}` : ''}`
          }
        ]
      };
    }

    const generationPrompt =
      item.tag === 'DECIDE'
        ? buildDecideGenerationPrompt(item.text)
        : item.tag === 'DESIGN'
          ? buildDesignGenerationPrompt(item.text)
          : buildValidateGenerationPrompt(item.text);

    const docType =
      item.tag === 'DECIDE'
        ? 'decision record'
        : item.tag === 'DESIGN'
          ? 'design document'
          : 'validation plan';

    return {
      queuedInputs: [
        generationPrompt,
        `/wiki-save-item ${itemId}`
      ],
      entries: [
        {
          id: createId('wiki-fi-start'),
          kind: 'notice',
          title: 'Generating Artifact',
          body: [
            `Generating ${docType} for: "${item.text}"`,
            'TAW will produce the document, then save it automatically.'
          ].join('\n')
        }
      ]
    };
  }
};
