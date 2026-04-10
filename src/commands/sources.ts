import { readResearchSources } from '../core/research/store.js';
import { createId } from '../utils/ids.js';
import type { CommandDefinition } from './types.js';

export const sourcesCommand: CommandDefinition = {
  name: 'sources',
  description: 'List research sources saved in the current session.',
  usage: '/sources',
  async run(_input, context) {
    const sources = await readResearchSources(context.session);

    return {
      entries: [
        {
          id: createId('sources'),
          kind: 'notice',
          title: 'Research Sources',
          body:
            sources.length > 0
              ? sources
                  .map(
                    (source, index) =>
                      `${index + 1}. [${source.researchType}] ${source.title}${source.url ? `\n   ${source.url}` : ''}${source.snapshotPath ? `\n   snapshot: ${source.snapshotPath}` : ''}`
                  )
                  .join('\n')
              : 'No research sources are saved in this session yet.'
        }
      ]
    };
  }
};
