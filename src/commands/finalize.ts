import { readFile } from 'node:fs/promises';
import { createModeArtifact } from '../core/artifacts/writer.js';
import {
  getModeDefinition,
  isWikiStageMode
} from '../core/modes/definitions.js';
import { buildWikiMode, parseWikiMode } from '../services/wiki/manager.js';
import { readResearchSources } from '../core/research/store.js';
import { updateSessionMetadata } from '../core/sessions/session-manager.js';
import { createId } from '../utils/ids.js';
import type { CommandDefinition } from './types.js';

const BRAINSTORM_FINALIZE_QUEUE: string[] = [
  // Job 2: Tag assignment
  [
    'The brainstorm map has been saved. Now review the Key Questions / Open Items section.',
    '',
    'For each item in that section:',
    '1. Determine if it is a genuine open item (the user does not yet know what to do — needs more information or work before the path is clear).',
    '   OR a recommendation (path is clear, just needs doing) — state it plainly.',
    '   OR resolved (already answered in the conversation) — note it as resolved.',
    '2. For each genuine open item, assign exactly one tag:',
    '   [RESEARCH] — an answer exists in the world, findable via search or reading',
    '   [VALIDATE] — a hypothesis needing real-world signal to confirm or deny (market, behavior, people, or self)',
    '   [DESIGN] — multiple viable approaches exist; needs design thinking to choose or invent a path',
    '   [DECIDE] — options are clear; needs a judgment call and commitment',
    '',
    'Output the tagged Key Questions / Open Items section only. Do not reprint the full map.'
  ].join('\n'),

  // Job 3: Research transition suggestion
  [
    'Now list any [RESEARCH] items from the tagging above as a numbered list.',
    'Then add exactly one line:',
    '"To take these into Research, run: /research tech <topic>"',
    'Replace <topic> with a 2–4 word description of the brainstorm subject.',
    'If there are no [RESEARCH] items, skip this step entirely — output nothing.'
  ].join('\n'),

  // Job 8: Save the map file with YAML frontmatter and parsed open items
  '/save-map'
];

export const finalizeCommand: CommandDefinition = {
  name: 'finalize',
  description:
    'Save the latest draft as a mode artifact and return to General mode.',
  usage: '/finalize',
  async run(_input, context) {
    // Wiki Stage → Wiki Ingest transition
    if (isWikiStageMode(context.mode)) {
      const parsed = parseWikiMode(context.mode);
      if (parsed) {
        const ingestMode = buildWikiMode('Ingest', parsed.topic);
        return {
          mode: ingestMode,
          phase: 'idle' as const,
          queuedInputs: [
            'The plan has been approved. Execute it now using write_wiki_page for each page. Start writing.'
          ],
          entries: [
            {
              id: createId('wiki-stage-approved'),
              kind: 'notice',
              title: 'Wiki Plan Approved',
              body: `Executing wiki updates for ${parsed.topic}...`
            }
          ]
        };
      }
    }

    const definition = getModeDefinition(context.mode);

    if (!definition.artifactType) {
      return {
        entries: [
          {
            id: createId('finalize-invalid'),
            kind: 'error',
            title: 'Nothing To Finalize',
            body: 'Finalize is only available in a structured mode like /brainstorm, /workflow, or /research.'
          }
        ]
      };
    }

    const latestAssistant = [...context.transcript]
      .reverse()
      .find(
        (entry) =>
          entry.kind === 'assistant' &&
          entry.title === 'Draft Response' &&
          entry.draftState === 'complete' &&
          entry.body.trim().length > 0
      );

    if (!latestAssistant) {
      return {
        entries: [
          {
            id: createId('finalize-missing'),
            kind: 'error',
            title: 'No Draft Available',
            body: context.mode.startsWith('Research ')
              ? 'There is no completed research draft to save yet.\nAsk another question or tell TAW to produce the draft first.\nIf you want TAW to generate a draft and finalize it automatically, use /finalize-gen.'
              : 'There is no completed assistant draft to save yet.\nAsk TAW for the draft first, then run /finalize.\nIf you want TAW to generate a draft and finalize it automatically, use /finalize-gen.'
          }
        ]
      };
    }

    const isBrainstormPhase2 = context.mode === 'Brainstorm Phase 2';

    const artifactContent = context.mode.startsWith('Research ')
      ? await buildResearchFinalizeContent(context, latestAssistant.body)
      : isBrainstormPhase2
        ? cleanPhase2Artifact(latestAssistant.body)
        : latestAssistant.body;
    const artifact = await createModeArtifact(
      context.session,
      context.mode,
      artifactContent
    );
    context.session.metadata.modeHistory.push('general');
    await updateSessionMetadata(context.session);

    return {
      session: context.session,
      mode: 'General',
      phase: 'idle',
      entries: [
        {
          id: createId('finalize'),
          kind: 'notice',
          title: 'Artifact Saved',
          body: artifact
            ? `✓ Artifact saved\n→ ${artifact.path}`
            : 'No artifact was saved.'
        },
        {
          id: createId('finalize-exit'),
          kind: 'notice',
          title: 'Mode Exited',
          body: isBrainstormPhase2
            ? 'Returned to General mode. Running tag assignment on the saved map...'
            : 'Returned to General mode after saving the artifact.'
        }
      ],
      ...(isBrainstormPhase2 ? { queuedInputs: BRAINSTORM_FINALIZE_QUEUE } : {})
    };
  }
};

export const finalizeGenerateCommand: CommandDefinition = {
  name: 'finalize-gen',
  description:
    'Ask TAW to generate a final draft now and then finalize it automatically.',
  usage: '/finalize-gen',
  async run(_input, context) {
    const definition = getModeDefinition(context.mode);

    if (!definition.artifactType) {
      return {
        entries: [
          {
            id: createId('finalize-gen-invalid'),
            kind: 'error',
            title: 'Nothing To Finalize',
            body: 'Finalize generation is only available in a structured mode like /brainstorm, /workflow, or /research.'
          }
        ]
      };
    }

    const latestAssistant = [...context.transcript]
      .reverse()
      .find(
        (entry) =>
          entry.kind === 'assistant' &&
          entry.title === 'Draft Response' &&
          entry.draftState === 'complete' &&
          entry.body.trim().length > 0
      );

    if (latestAssistant) {
      return finalizeCommand.run(
        { name: 'finalize', args: [], raw: '/finalize' },
        context
      );
    }

    return {
      queuedInputs: [buildFinalizeGenerationPrompt(context.mode), '/finalize'],
      entries: [
        {
          id: createId('finalize-gen'),
          kind: 'notice',
          title: 'Draft Requested',
          body: [
            `TAW will generate a final draft for ${context.mode} now.`,
            'When that draft completes, TAW will run /finalize automatically.'
          ].join('\n')
        }
      ]
    };
  }
};

async function buildResearchFinalizeContent(
  context: Parameters<CommandDefinition['run']>[1],
  latestDraft: string
): Promise<string> {
  const sources = await readResearchSources(context.session);
  const notes = await readSessionNotes(context.session.notesPath);

  return [
    `# ${context.mode} Dossier`,
    '',
    '## Final Draft',
    '',
    latestDraft.trim(),
    '',
    '## Sources Captured',
    '',
    sources.length > 0
      ? sources
          .map((source, index) =>
            [
              `${index + 1}. ${source.title}`,
              `   - Origin: ${source.origin}`,
              `   - Status: ${source.status}`,
              source.url ? `   - URL: ${source.url}` : null,
              source.snapshotPath
                ? `   - Snapshot: ${source.snapshotPath}`
                : null,
              source.note
                ? `   - Note: ${source.note.replace(/\n/g, '\n     ')}`
                : null,
              source.excerpt ? `   - Excerpt: ${source.excerpt}` : null
            ]
              .filter(Boolean)
              .join('\n')
          )
          .join('\n')
      : 'No sources were captured.',
    '',
    '## Session Notes',
    '',
    notes.trim() || 'No session notes were captured.'
  ].join('\n');
}

function buildFinalizeGenerationPrompt(mode: string): string {
  if (mode.startsWith('Research ')) {
    return 'Produce the complete final research draft now using the current discussion, saved sources, and any source notes. Make it ready to save as the artifact.';
  }

  if (mode === 'Brainstorm') {
    return 'Produce the complete final brainstorm draft now. Make it ready to save as the artifact.';
  }

  if (mode.startsWith('Workflow ')) {
    return 'Produce the complete final workflow draft now. Make it ready to save as the artifact.';
  }

  return 'Produce the complete final draft now. Make it ready to save as the artifact.';
}

function cleanPhase2Artifact(body: string): string {
  // Strip the mode footer (─── divider and everything after it)
  const footerDivider = '─────────────────────────────────────────';
  const footerIndex = body.indexOf(footerDivider);
  const withoutFooter = footerIndex !== -1
    ? body.slice(0, footerIndex).trimEnd()
    : body;

  // Strip conversational preamble before the first ## heading
  const headingMatch = withoutFooter.match(/\n(##\s)/);
  if (headingMatch?.index !== undefined) {
    return withoutFooter.slice(headingMatch.index).trimStart();
  }

  // Heading at very start
  if (withoutFooter.trimStart().startsWith('##')) {
    return withoutFooter.trimStart();
  }

  return withoutFooter.trim();
}

async function readSessionNotes(notesPath: string): Promise<string> {
  try {
    return await readFile(notesPath, 'utf8');
  } catch {
    return '';
  }
}
