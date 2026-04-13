import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { addFetchedSource, readResearchSources } from '../core/research/store.js';
import { reindexHister } from '../services/hister/client.js';
import { searchAndFetchHisterPages } from '../services/wiki/hister-ingest.js';
import { createId } from '../utils/ids.js';
import { openSourceCommand } from './open-source.js';
import type { CommandDefinition } from './types.js';

const histerSearchArgsSchema = z.object({
  max_results: z.number().int().positive().max(20).optional()
});

export const histerCommand: CommandDefinition = {
  name: 'hister',
  description: 'Search, inspect, and reindex your Hister browser-history index.',
  usage:
    '/hister <search <query> [--max-results N]|show <index>|open <index>|reindex>',
  async run(input, context) {
    const action = input.args[0];

    if (!context.globalConfig.hister.enabled) {
      return {
        entries: [
          {
            id: createId('hister-disabled'),
            kind: 'error' as const,
            title: 'Hister Disabled',
            body: 'Enable Hister first with /config hister enabled on.'
          }
        ]
      };
    }

    if (!action || action === 'search') {
      return runSearch(input.args.slice(1), context);
    }

    if (action === 'show') {
      return runShow(input.args[1], context);
    }

    if (action === 'open') {
      return openSourceCommand.run(
        {
          name: 'open-source',
          args: [input.args[1] ?? ''],
          raw: `/open-source ${input.args[1] ?? ''}`.trim()
        },
        context
      );
    }

    if (action === 'reindex') {
      return runReindex(context);
    }

    return {
      entries: [
        {
          id: createId('hister-usage'),
          kind: 'error' as const,
          title: 'Hister Usage',
          body:
            '/hister <search <query> [--max-results N]|show <index>|open <index>|reindex>'
        }
      ]
    };
  }
};

async function runSearch(
  rawArgs: string[],
  context: Parameters<CommandDefinition['run']>[1]
) {
  const { query, maxResults, usageError } = parseSearchArgs(rawArgs);

  if (usageError || !query) {
    return {
      entries: [
        {
          id: createId('hister-search-usage'),
          kind: 'error' as const,
          title: 'Hister Search Usage',
          body:
            '/hister search <query> [--max-results N]\nExamples:\n  /hister search "claude code documentation"\n  /hister search site:docs.anthropic.com claude --max-results 3'
        }
      ]
    };
  }

  const fetched = await searchAndFetchHisterPages(
    query,
    context.globalConfig.hister,
    maxResults
  );

  if (!fetched.ok) {
    return {
      entries: [
        {
          id: createId('hister-search-error'),
          kind: 'error' as const,
          title: 'Hister Search Failed',
          body: fetched.error ?? 'Search failed.'
        }
      ]
    };
  }

  const sources = [];
  for (const page of fetched.pages) {
    const source = await addFetchedSource(context.session, {
      title: page.title,
      url: page.url,
      content: page.content,
      researchType: inferResearchType(context.mode),
      note: `Imported from Hister search: ${query}`
    });
    sources.push(source);
  }

  const allSources = await readResearchSources(context.session);
  const indexById = new Map(
    allSources.map((source, index) => [source.id, index + 1] as const)
  );

  return {
    entries: [
      {
        id: createId('hister-search'),
        kind: 'notice' as const,
        title: 'Hister Search Results',
        body: [
          `Query: ${query}`,
          `Matched ${fetched.matchedCount} history entr${fetched.matchedCount === 1 ? 'y' : 'ies'} and imported ${sources.length} source${sources.length === 1 ? '' : 's'}.`,
          '',
          ...sources.map((source) => {
            const index = indexById.get(source.id) ?? '?';
            return [
              `${index}. ${source.title}`,
              `   ${source.url ?? ''}`,
              `   /hister show ${index}  |  /hister open ${index}  |  /open-source ${index}`
            ].join('\n');
          }),
          '',
          'Use /sources to see all saved sources in this session.'
        ]
          .filter(Boolean)
          .join('\n')
      }
    ]
  };
}

async function runShow(
  rawIndex: string | undefined,
  context: Parameters<CommandDefinition['run']>[1]
) {
  const index = Number(rawIndex ?? '');
  const sources = await readResearchSources(context.session);

  if (!Number.isInteger(index) || index < 1 || index > sources.length) {
    return {
      entries: [
        {
          id: createId('hister-show-usage'),
          kind: 'error' as const,
          title: 'Hister Show Usage',
          body: 'Usage: /hister show <index>'
        }
      ]
    };
  }

  const source = sources[index - 1];
  if (!source) {
    return {
      entries: [
        {
          id: createId('hister-show-missing'),
          kind: 'error' as const,
          title: 'Source Not Found',
          body: `No saved source exists at index ${index}.`
        }
      ]
    };
  }

  const snapshot = source.snapshotPath
    ? await readFile(source.snapshotPath, 'utf8').catch(() => null)
    : null;

  return {
    entries: [
      {
        id: createId('hister-show'),
        kind: 'notice' as const,
        title: `Hister Source ${index}`,
        body: [
          source.title,
          source.url ?? '(no url)',
          '',
          (snapshot ?? source.excerpt ?? '(No saved content.)').slice(0, 6000),
          '',
          `/hister open ${index}`
        ].join('\n')
      }
    ]
  };
}

async function runReindex(
  context: Parameters<CommandDefinition['run']>[1]
) {
  const result = await reindexHister(context.globalConfig.hister, {
    skipSensitive: true
  });

  return {
    entries: [
      result.ok
        ? {
            id: createId('hister-reindex'),
            kind: 'notice' as const,
            title: 'Hister Reindex Started',
            body:
              'Requested a full Hister reindex. After it finishes, rerun /hister search or /wiki ingest-hister.'
          }
        : {
            id: createId('hister-reindex-error'),
            kind: 'error' as const,
            title: 'Hister Reindex Failed',
            body: result.error ?? 'Reindex failed.'
          }
    ]
  };
}

function parseSearchArgs(rawArgs: string[]): {
  query: string;
  maxResults: number | undefined;
  usageError: boolean;
} {
  const queryParts: string[] = [];
  let maxResults: number | undefined;

  for (let index = 0; index < rawArgs.length; index += 1) {
    const value = rawArgs[index];

    if (value === '--max-results') {
      const nextValue = rawArgs[index + 1];
      if (!nextValue) {
        return { query: '', maxResults: undefined, usageError: true };
      }

      const parsed = histerSearchArgsSchema.safeParse({
        max_results: Number(nextValue)
      });

      if (!parsed.success) {
        return { query: '', maxResults: undefined, usageError: true };
      }

      maxResults = parsed.data.max_results;
      index += 1;
      continue;
    }

    queryParts.push(value);
  }

  return {
    query: queryParts.join(' ').trim(),
    maxResults,
    usageError: false
  };
}

function inferResearchType(mode: string) {
  if (mode === 'Research Tech') {
    return 'tech' as const;
  }

  if (mode === 'Research Repo') {
    return 'repo' as const;
  }

  if (mode === 'Research Video') {
    return 'video' as const;
  }

  return 'tech' as const;
}
