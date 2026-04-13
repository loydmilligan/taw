import { z } from 'zod';
import type {
  ChatToolCall,
  ProviderFunctionTool,
  ProviderServerTool,
  ProviderTool
} from '../../types/provider.js';
import type { ChatExecutionContext } from '../chat/engine.js';
import {
  searchWebAndStoreSources,
  searchWebArgumentsSchema
} from '../research/search.js';
import { isWikiWriteMode } from '../modes/definitions.js';
import {
  parseWikiMode,
  wikiFileExists,
  writeWikiPage
} from '../../services/wiki/manager.js';
import {
  ensureOperationalFrontmatter,
  isOperationalWikiNotePath
} from '../../services/wiki/frontmatter.js';
import { searchHister } from '../../services/hister/client.js';

const writeWikiPageArgumentsSchema = z.object({
  path: z.string(),
  content: z.string(),
  overwrite: z.boolean().optional()
});

const searchHistoryArgumentsSchema = z.object({
  query: z.string(),
  max_results: z.number().int().positive().max(20).optional()
});

interface ToolRuntime {
  tools: ProviderTool[];
  localToolNames: Set<string>;
  executeToolCall: (toolCall: ChatToolCall) => Promise<string>;
}

export function createToolRuntime(
  context: Pick<
    ChatExecutionContext,
    'mode' | 'providerConfig' | 'globalConfig' | 'session'
  >
): ToolRuntime {
  const tools: ProviderTool[] = [];
  const localToolNames = new Set<string>();
  const canUseHostedServerTools =
    context.providerConfig.provider === 'openrouter';
  const isResearchMode = context.mode.startsWith('Research ');
  const histerEnabled = context.globalConfig.hister?.enabled === true;

  if (canUseHostedServerTools) {
    tools.push({
      type: 'openrouter:datetime',
      parameters: {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }
    } satisfies ProviderServerTool);
  }

  if (isWikiWriteMode(context.mode)) {
    tools.push(buildWriteWikiPageTool());
    localToolNames.add('write_wiki_page');
  }

  if (histerEnabled && (isResearchMode || isWikiWriteMode(context.mode))) {
    tools.push(buildSearchHistoryTool());
    localToolNames.add('search_history');
  }

  if (isResearchMode) {
    tools.push(buildSearchWebTool());
    localToolNames.add('search_web');

    if (
      canUseHostedServerTools &&
      context.globalConfig.searchBackend.openrouterFallback.enabled
    ) {
      tools.push({
        type: 'openrouter:web_search',
        parameters: {
          max_results:
            context.globalConfig.searchBackend.openrouterFallback.maxResults
        }
      } satisfies ProviderServerTool);
    }
  }

  return {
    tools,
    localToolNames,
    executeToolCall: async (toolCall) => {
      if (toolCall.function.name === 'search_web') {
        return executeSearchWebTool(context, toolCall.function.arguments);
      }

      if (toolCall.function.name === 'write_wiki_page') {
        return executeWriteWikiPageTool(context, toolCall.function.arguments);
      }

      if (toolCall.function.name === 'search_history') {
        return executeSearchHistoryTool(context, toolCall.function.arguments);
      }

      return JSON.stringify({
        ok: false,
        error: `Unknown tool: ${toolCall.function.name}`
      });
    }
  };
}

function buildSearchWebTool(): ProviderFunctionTool {
  return {
    type: 'function',
    function: {
      name: 'search_web',
      description:
        'Search the web for current sources. Prefer this local tool over hosted web search when available.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Search query for finding recent or corroborating sources.'
          },
          max_results: {
            type: 'integer',
            description: 'Maximum number of results to return, from 1 to 8.'
          },
          allowed_domains: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional domain allowlist for narrowing results.'
          }
        },
        required: ['query']
      }
    }
  };
}

async function executeSearchWebTool(
  context: Pick<
    ChatExecutionContext,
    'globalConfig' | 'providerConfig' | 'session'
  >,
  rawArguments: string
): Promise<string> {
  const args = searchWebArgumentsSchema.parse(JSON.parse(rawArguments || '{}'));
  const result = await searchWebAndStoreSources({
    session: context.session,
    globalConfig: context.globalConfig,
    query: args.query,
    maxResults: args.max_results,
    allowedDomains: args.allowed_domains
  });

  return JSON.stringify({
    ok: result.ok,
    query: args.query,
    error: result.error,
    results: result.stored.map((source) => ({
      id: source.id,
      title: source.title,
      url: source.url,
      snippet: source.excerpt
    }))
  });
}

function buildWriteWikiPageTool(): ProviderFunctionTool {
  return {
    type: 'function',
    function: {
      name: 'write_wiki_page',
      description:
        'Write or overwrite a wiki page. Use this to create or update pages in the personal knowledge wiki. The path is relative to the wiki topic root (e.g. "pages/concepts/context-management.md" or "index.md").',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description:
              'Relative path within the wiki topic directory. Examples: "pages/concepts/context-management.md", "pages/entities/claude-code.md", "pages/sources/2026-04-10-article-slug.md", "index.md", "log.md"'
          },
          content: {
            type: 'string',
            description: 'Full markdown content to write to the page.'
          },
          overwrite: {
            type: 'boolean',
            description:
              'Set to true only when intentionally updating an existing wiki page. Leave false or omit it for new pages so duplicate creates are rejected.'
          }
        },
        required: ['path', 'content']
      }
    }
  };
}

async function executeWriteWikiPageTool(
  context: Pick<ChatExecutionContext, 'mode' | 'session'>,
  rawArguments: string
): Promise<string> {
  const parsed = parseWikiMode(context.mode);
  if (!parsed) {
    return JSON.stringify({ ok: false, error: 'Not in a wiki mode.' });
  }

  try {
    const args = writeWikiPageArgumentsSchema.parse(
      JSON.parse(rawArguments || '{}')
    );
    const existed = await wikiFileExists(parsed.topic, args.path);
    const today = new Date().toISOString().slice(0, 10);
    const normalizedContent =
      parsed.type === 'Ingest' && isOperationalWikiNotePath(args.path)
        ? ensureOperationalFrontmatter(args.content, args.path, {
            today,
            linkReviewStatus: 'pending',
            linkReviewedAt: null,
            indexStatus: 'pending',
            indexedAt: null
          })
        : args.content;
    const resolvedPath = await writeWikiPage(
      parsed.topic,
      args.path,
      normalizedContent,
      {
        overwrite: args.overwrite === true
      }
    );
    return JSON.stringify({
      ok: true,
      path: resolvedPath,
      operation: existed ? 'updated' : 'created'
    });
  } catch (error) {
    return JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : 'Write failed.'
    });
  }
}

function buildSearchHistoryTool(): ProviderFunctionTool {
  return {
    type: 'function',
    function: {
      name: 'search_history',
      description:
        'Search your personal browser history index (Hister) for previously visited pages. Use this to find relevant pages you have already read, check if you visited a topic before, or retrieve URLs from your history.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query for browser history. Supports Hister query language (e.g. keywords, site: filters).'
          },
          max_results: {
            type: 'integer',
            description: 'Maximum number of results to return (1-20, default 10).'
          }
        },
        required: ['query']
      }
    }
  };
}

async function executeSearchHistoryTool(
  context: Pick<ChatExecutionContext, 'globalConfig'>,
  rawArguments: string
): Promise<string> {
  try {
    const args = searchHistoryArgumentsSchema.parse(JSON.parse(rawArguments || '{}'));
    const histerConfig = context.globalConfig.hister;
    const result = await searchHister(
      args.query,
      histerConfig,
      args.max_results ?? 10
    );

    return JSON.stringify({
      ok: result.ok,
      query: args.query,
      error: result.error,
      results: result.results
    });
  } catch (error) {
    return JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : 'Search failed.'
    });
  }
}
