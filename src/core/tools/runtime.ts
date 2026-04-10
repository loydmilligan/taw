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

  if (canUseHostedServerTools) {
    tools.push({
      type: 'openrouter:datetime',
      parameters: {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }
    } satisfies ProviderServerTool);
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
