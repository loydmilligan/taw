import path from 'node:path';
import { getAppConfigDir } from '../services/filesystem/paths.js';
import { readResearchSources } from '../core/research/store.js';
import { rateSourceUrl } from '../core/research/source-rating.js';
import { createId } from '../utils/ids.js';
import type { CommandDefinition } from './types.js';

export const rateSourceCommand: CommandDefinition = {
  name: 'rate-source',
  description:
    'Show source bias and quality metadata for a saved source or URL.',
  usage: '/rate-source <index|url>',
  async run(input, context) {
    const target = input.args.join(' ').trim();

    if (!target) {
      return usageError();
    }

    const url = await resolveSourceUrl(target, context.session);
    if (!url) {
      return {
        entries: [
          {
            id: createId('rate-source-missing-url'),
            kind: 'error',
            title: 'Source Not Rateable',
            body: 'The selected source does not have a URL. Usage: /rate-source <index|url>'
          }
        ]
      };
    }

    const dbPath =
      context.globalConfig.sourceRatings.dbPath ??
      path.join(getAppConfigDir(), 'sources.db');

    try {
      const rating = await rateSourceUrl(url, dbPath);

      return {
        entries: [
          {
            id: createId('rate-source'),
            kind: 'notice',
            title: 'Source Rating',
            body: rating
              ? [
                  `URL: ${url}`,
                  `Domain: ${rating.domain}`,
                  `Name: ${rating.name ?? 'n/a'}`,
                  `Quality Score: ${rating.newsguardScore ?? 'n/a'}`,
                  `Political Lean: ${rating.politicalLeanLabel ?? 'n/a'}`,
                  `Source Type: ${rating.sourceType ?? 'n/a'}`,
                  rating.criteria
                    ? `Criteria: ${JSON.stringify(rating.criteria)}`
                    : ''
                ]
                  .filter(Boolean)
                  .join('\n')
              : `Source not found in ${dbPath}.\nURL: ${url}`
          }
        ]
      };
    } catch (error) {
      return {
        entries: [
          {
            id: createId('rate-source-error'),
            kind: 'error',
            title: 'Source Rating Unavailable',
            body: [
              `Could not read source ratings from ${dbPath}.`,
              'Build the SourceInfo database and place it there, or set sourceRatings.dbPath in ~/.config/taw/config.json.',
              `Details: ${error instanceof Error ? error.message : 'Unknown rating error.'}`
            ].join('\n')
          }
        ]
      };
    }
  }
};

async function resolveSourceUrl(
  target: string,
  session: Parameters<CommandDefinition['run']>[1]['session']
): Promise<string | null> {
  const index = Number(target);

  if (Number.isInteger(index)) {
    const sources = await readResearchSources(session);
    return sources[index - 1]?.url ?? null;
  }

  if (target.startsWith('http://') || target.startsWith('https://')) {
    return target;
  }

  return null;
}

function usageError() {
  return {
    entries: [
      {
        id: createId('rate-source-usage'),
        kind: 'error' as const,
        title: 'Rate Source Usage',
        body: 'Usage: /rate-source <index|url>'
      }
    ]
  };
}
