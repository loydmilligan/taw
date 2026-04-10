import {
  searchWebAndStoreSources,
  searchWebArgumentsSchema
} from '../core/research/search.js';
import { createId } from '../utils/ids.js';
import type { CommandDefinition } from './types.js';

export const searchSourceCommand: CommandDefinition = {
  name: 'search-source',
  description: 'Search the web and save results as research sources.',
  usage: '/search-source <query>',
  async run(input, context) {
    const rawQuery = input.args.join(' ').trim();

    if (!rawQuery) {
      return {
        entries: [
          {
            id: createId('search-source-usage'),
            kind: 'error',
            title: 'Search Source Usage',
            body: 'Usage: /search-source <query>'
          }
        ]
      };
    }

    const args = searchWebArgumentsSchema.parse({
      query: rawQuery,
      max_results: 5
    });
    const result = await searchWebAndStoreSources({
      session: context.session,
      globalConfig: context.globalConfig,
      query: args.query,
      maxResults: args.max_results,
      allowedDomains: args.allowed_domains
    });

    if (!result.ok) {
      return {
        entries: [
          {
            id: createId('search-source-error'),
            kind: 'error',
            title: 'Search Source Failed',
            body: result.error ?? 'Unknown search-source error.'
          }
        ]
      };
    }

    return {
      entries: [
        {
          id: createId('search-source'),
          kind: 'notice',
          title: 'Search Sources Added',
          body:
            result.stored.length > 0
              ? result.stored
                  .map(
                    (source, index) =>
                      `${index + 1}. ${source.title}${source.url ? `\n   ${source.url}` : ''}`
                  )
                  .join('\n')
              : 'Search completed, but no new sources were added. Existing URLs were skipped.'
        }
      ]
    };
  }
};
