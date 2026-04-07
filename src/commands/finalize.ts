import { createModeArtifact } from '../core/artifacts/writer.js';
import { getModeDefinition } from '../core/modes/definitions.js';
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
            body: 'Finalize is only available in a structured mode like /brainstorm or /workflow.'
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
            body: 'There is no completed assistant draft to save yet.'
          }
        ]
      };
    }

    const artifact = await createModeArtifact(
      context.session,
      context.mode,
      latestAssistant.body
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
