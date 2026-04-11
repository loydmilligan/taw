import { readFile } from 'node:fs/promises';
import { createModeArtifact } from '../core/artifacts/writer.js';
import { getModeDefinition } from '../core/modes/definitions.js';
import { readResearchSources } from '../core/research/store.js';
import { updateSessionMetadata } from '../core/sessions/session-manager.js';
import { createId } from '../utils/ids.js';
import type { CommandDefinition } from './types.js';

export const finalizeCommand: CommandDefinition = {
  name: 'finalize',
  description:
    'Save the latest draft as a mode artifact and return to General mode.',
  usage: '/finalize',
  async run(_input, context) {
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

    const artifactContent = context.mode.startsWith('Research ')
      ? await buildResearchFinalizeContent(context, latestAssistant.body)
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
          body: 'Returned to General mode after saving the artifact.'
        }
      ]
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

async function readSessionNotes(notesPath: string): Promise<string> {
  try {
    return await readFile(notesPath, 'utf8');
  } catch {
    return '';
  }
}
