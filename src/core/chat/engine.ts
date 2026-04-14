import { appendConversationTurn } from '../notes/notes-writer.js';
import { getProviderAdapter } from '../providers/index.js';
import { buildModeSystemPrompt } from '../prompts/modes.js';
import {
  buildAndStoreTelemetrySummary,
  recordRequestCompleted,
  recordRequestStarted,
  type TelemetryTurn
} from '../telemetry/collector.js';
import type { TranscriptEntry } from '../../types/app.js';
import type {
  ChatMessage,
  ChatToolCall,
  ProviderConfig,
  ProviderTool
} from '../../types/provider.js';
import type {
  GlobalConfig,
  ProjectConfig
} from '../../services/config/schema.js';
import type { SessionRecord } from '../../types/session.js';
import { buildPromptContext } from '../context/prompt-context.js';
import { createId } from '../../utils/ids.js';
import { createToolRuntime } from '../tools/runtime.js';
import { isWikiWriteMode } from '../modes/definitions.js';

// Wiki page content is embedded inside tool call JSON arguments, so the LLM
// needs substantially more room than the default 1200-token limit. A single
// wiki page can be 1000–2000 tokens of markdown plus JSON framing; 4096
// gives enough room for one page per iteration of the tool loop.
const WIKI_WRITE_MIN_TOKENS = 4096;

export interface ChatExecutionContext {
  transcript: TranscriptEntry[];
  latestUserInput: string;
  mode: string;
  providerConfig: ProviderConfig;
  globalConfig: GlobalConfig;
  commandReference: string;
  session: SessionRecord;
  projectConfig: ProjectConfig | null;
  signal?: AbortSignal;
  onChunk: (value: string) => void;
}

export interface ChatExecutionResult {
  assistantText: string;
  interrupted: boolean;
  telemetryTurnId: string;
}

export async function executeChatTurn(
  context: ChatExecutionContext
): Promise<ChatExecutionResult> {
  const promptContext = await buildPromptContext(
    context.session,
    context.projectConfig,
    context.latestUserInput,
    context.mode
  );
  const messages = buildChatMessages(
    context.transcript,
    context.latestUserInput,
    context.mode,
    context.commandReference,
    promptContext
  );
  const adapter = getProviderAdapter(context.providerConfig);
  const toolRuntime = createToolRuntime(context);
  const hasLocalTools = toolRuntime.localToolNames.size > 0;

  // Wiki write modes embed full page content inside tool call JSON arguments.
  // The default 1200-token limit truncates these mid-call → empty/blank response.
  // Bump to WIKI_WRITE_MIN_TOKENS (4096) minimum so page writes can complete.
  const effectiveProviderConfig =
    hasLocalTools && isWikiWriteMode(context.mode)
      ? {
          ...context.providerConfig,
          maxCompletionTokens: Math.max(
            context.providerConfig.maxCompletionTokens ?? 0,
            WIKI_WRITE_MIN_TOKENS
          )
        }
      : context.providerConfig;
  const telemetryTurn: TelemetryTurn = {
    turnId: createId('turn'),
    requestGroupId: createId('request-group'),
    startedAt: new Date().toISOString(),
    mode: context.mode,
    phaseAtSend: context.mode === 'General' ? 'idle' : 'draft-ready',
    latestUserInput: context.latestUserInput,
    promptContextLengthChars: promptContext.length,
    conversationDepth:
      context.transcript.filter(
        (entry) => entry.kind === 'user' || entry.kind === 'assistant'
      ).length + 1,
    projectScoped: context.session.storageMode === 'project',
    attachedDirsCount: context.session.metadata.attachedDirs.length,
    userMessageLengthChars: context.latestUserInput.length,
    contextSummaryPresent: promptContext.includes('## Session Summary'),
    recentArtifactCount: context.session.metadata.artifacts.slice(-3).length,
    streamInfo: {},
    finalInfo: {},
    firstTokenAt: null
  };

  adapter.validateConfig(context.providerConfig);
  await recordRequestStarted(
    context.session,
    telemetryTurn,
    context.providerConfig
  );
  await appendConversationTurn(
    context.session,
    'user',
    context.latestUserInput
  );

  let assistantText = '';

  try {
    if (hasLocalTools) {
      assistantText = await executeToolAwareTurn(
        messages,
        adapter,
        effectiveProviderConfig,
        toolRuntime.tools,
        toolRuntime.localToolNames,
        toolRuntime.executeToolCall,
        context.signal,
        context.mode,
        (info) => {
          telemetryTurn.streamInfo = info;
        },
        (info) => {
          telemetryTurn.finalInfo = info;
        }
      );
      telemetryTurn.firstTokenAt ??= new Date().toISOString();
      context.onChunk(assistantText);
    } else {
      for await (const chunk of adapter.streamMessage(
        messages,
        context.providerConfig,
        {
          signal: context.signal,
          tools: toolRuntime.tools,
          onStart: (info) => {
            telemetryTurn.streamInfo = info;
          },
          onFinal: (info) => {
            telemetryTurn.finalInfo = info;
          }
        }
      )) {
        assistantText += chunk;
        telemetryTurn.firstTokenAt ??= new Date().toISOString();
        context.onChunk(assistantText);
      }
    }
  } catch (error) {
    await recordRequestCompleted(
      context.session,
      telemetryTurn,
      context.signal?.aborted ?? false,
      'provider_error',
      error instanceof Error ? error.message : 'Unknown provider error.'
    );
    await buildAndStoreTelemetrySummary({
      session: context.session,
      turn: telemetryTurn,
      providerConfig: context.providerConfig,
      assistantText,
      interruptedByUser: context.signal?.aborted ?? false,
      errorKind: 'provider_error',
      errorMessage:
        error instanceof Error ? error.message : 'Unknown provider error.',
      artifactGenerated: false,
      artifactPath: null
    });
    throw error;
  }

  await appendConversationTurn(context.session, 'assistant', assistantText);
  await recordRequestCompleted(
    context.session,
    telemetryTurn,
    context.signal?.aborted ?? false,
    null,
    null
  );
  await buildAndStoreTelemetrySummary({
    session: context.session,
    turn: telemetryTurn,
    providerConfig: context.providerConfig,
    assistantText,
    interruptedByUser: context.signal?.aborted ?? false,
    errorKind: null,
    errorMessage: null,
    artifactGenerated: false,
    artifactPath: null
  });

  return {
    assistantText,
    interrupted: context.signal?.aborted ?? false,
    telemetryTurnId: telemetryTurn.turnId
  };
}

async function executeToolAwareTurn(
  initialMessages: ChatMessage[],
  adapter: ReturnType<typeof getProviderAdapter>,
  providerConfig: ProviderConfig,
  tools: ProviderTool[],
  localToolNames: Set<string>,
  executeToolCall: (toolCall: ChatToolCall) => Promise<string>,
  signal: AbortSignal | undefined,
  mode: string,
  onStart: (info: {
    generationId?: string | null;
    requestId?: string | null;
    providerRequestId?: string | null;
    modelResolved?: string | null;
  }) => void,
  onFinal: (info: { finishReason?: string | null }) => void
): Promise<string> {
  const messages = [...initialMessages];

  // Server-side tools (e.g. openrouter:datetime, openrouter:web_search) must NOT
  // be sent in completeMessage calls — they are only valid in the streaming path
  // where the provider handles them before the model sees the prompt.
  // Mixing server tool types with function tools in the tools array causes
  // OpenRouter to silently drop all tools, producing an empty response.
  const functionToolsOnly = tools.filter((t) => t.type === 'function');

  for (let iteration = 0; iteration < 15; iteration += 1) {
    const completion = await adapter.completeMessage(messages, providerConfig, {
      signal,
      tools: functionToolsOnly,
      onStart,
      onFinal
    });

    const localToolCalls = completion.toolCalls.filter((toolCall) =>
      localToolNames.has(toolCall.function.name)
    );

    if (localToolCalls.length === 0) {
      // Empty response (no text, no tool calls) means something went wrong.
      if (!completion.text.trim()) {
        const limit = providerConfig.maxCompletionTokens;
        const reason = completion.finishReason;
        const reasonMsg = reason ? ` (finish_reason: ${reason})` : '';

        if (reason === 'length') {
          // Token-limit truncation: response cut off mid-call.
          // For wiki modes, return a helpful message instead of throwing.
          const isWikiMode = isWikiWriteMode(mode);
          if (isWikiMode) {
            return `Wiki ingest was interrupted because the response exceeded the token limit.${reasonMsg} Current limit: ${limit ?? 'default'} tokens. Try again with /config max-tokens <higher-number> (max 8192), or reduce the amount of source material being ingested.`;
          }
          const tokenMsg = limit
            ? ` Current limit: ${limit} tokens. Raise it with /config max-tokens <number> (max 8192).`
            : '';
          throw new Error(
            `LLM response was truncated before any tool calls or text were produced.${reasonMsg}${tokenMsg} ` +
              `The token limit is too low to fit the full response. Raise max-tokens and retry.`
          );
        }

        throw new Error(
          `LLM returned an empty response with no tool calls.${reasonMsg} ` +
            `This can happen when the provider receives an invalid tools payload or the ` +
            `model refuses to act. Check your provider config and model compatibility.`
        );
      }

      return completion.text;
    }

    messages.push({
      role: 'assistant',
      content: completion.text,
      toolCalls: completion.toolCalls
    });

    for (const toolCall of localToolCalls) {
      const toolResult = await executeToolCall(toolCall);
      messages.push({
        role: 'tool',
        toolCallId: toolCall.id,
        content: toolResult
      });
    }
  }

  throw new Error('Tool loop exceeded maximum iterations.');
}

function buildChatMessages(
  transcript: TranscriptEntry[],
  latestUserInput: string,
  mode: string,
  commandReference: string,
  promptContext: string
): ChatMessage[] {
  const priorMessages = transcript
    .filter((entry) => entry.kind === 'user' || entry.kind === 'assistant')
    .map((entry) => ({
      role: entry.kind === 'user' ? 'user' : 'assistant',
      content: entry.body
    })) satisfies ChatMessage[];

  return [
    {
      role: 'system',
      content: [buildModeSystemPrompt(mode, commandReference), promptContext]
        .filter(Boolean)
        .join('\n\n')
    },
    ...priorMessages,
    {
      role: 'user',
      content: latestUserInput
    }
  ];
}
