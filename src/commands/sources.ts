import {
  readResearchSources,
  readResearchSourceViews
} from '../core/research/store.js';
import { createId } from '../utils/ids.js';
import type { CommandDefinition } from './types.js';

export const sourcesCommand: CommandDefinition = {
  name: 'sources',
  description: 'List research sources saved in the current session.',
  usage: '/sources',
  async run(_input, context) {
    const sources = await readResearchSources(context.session);
    const openViews = process.env.TMUX
      ? await readResearchSourceViews(context.session)
      : [];
    const openSourceIds = new Set(openViews.map((view) => view.sourceId));

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
                      `${index + 1}. [${source.researchType}] ${source.title}${openSourceIds.has(source.id) ? ' [open]' : ''}${source.url ? `\n   ${source.url}` : ''}${source.snapshotPath ? `\n   snapshot: ${source.snapshotPath}` : ''}`
                  )
                  .join('\n') +
                (openViews.length > 0
                  ? '\n\nOpen views: use /source-views to list or jump.'
                  : '')
              : 'No research sources are saved in this session yet.'
        }
      ]
    };
  }
};
