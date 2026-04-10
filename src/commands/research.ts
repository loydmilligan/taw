import { updateSessionMetadata } from '../core/sessions/session-manager.js';
import { createId } from '../utils/ids.js';
import type { CommandDefinition } from './types.js';

const researchModeMap = {
  politics: 'Research Politics',
  tech: 'Research Tech',
  repo: 'Research Repo',
  video: 'Research Video'
} as const;

export const researchCommand: CommandDefinition = {
  name: 'research',
  description:
    'Enter typed research mode for politics, tech, repos, or videos.',
  usage: '/research <politics|tech|repo|video> [question]',
  async run(input, context) {
    const type = input.args[0] as keyof typeof researchModeMap | undefined;

    if (!type || !(type in researchModeMap)) {
      return {
        entries: [
          {
            id: createId('research-usage'),
            kind: 'error',
            title: 'Research Mode Usage',
            body: 'Usage: /research <politics|tech|repo|video> [question]'
          }
        ]
      };
    }

    const mode = researchModeMap[type];
    context.session.metadata.modeHistory.push(`research-${type}`);
    await updateSessionMetadata(context.session);

    const question = input.args.slice(1).join(' ').trim();

    return {
      session: context.session,
      mode,
      phase: 'idle',
      entries: [
        {
          id: createId('research'),
          kind: 'notice',
          title: mode,
          body: question
            ? `${mode} is active. Initial research focus: ${question}\nUse /finalize when you want to save the research artifact.`
            : `${mode} is active. Add sources or ask a question, then use /finalize when you want to save the research artifact.`
        }
      ]
    };
  }
};
