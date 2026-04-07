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
import type { ChatMessage, ProviderConfig } from '../../types/provider.js';
import type { ProjectConfig } from '../../services/config/schema.js';
import type { SessionRecord } from '../../types/session.js';
import { buildPromptContext } from '../context/prompt-context.js';
import { createId } from '../../utils/ids.js';

export interface ChatExecutionContext {
  transcript: TranscriptEntry[];
  latestUserInput: string;
  mode: string;
  providerConfig: ProviderConfig;
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

export async function executeChatTurn(context: ChatExecutionContext): Promise<ChatExecutionResult> {
  const promptContext = await buildPromptContext(
    context.session,
    context.projectConfig,
    context.latestUserInput
  );
  const messages = buildChatMessages(
    context.transcript,
    context.latestUserInput,
    context.mode,
    context.commandReference,
    promptContext
  );
  const adapter = getProviderAdapter(context.providerConfig);
  const telemetryTurn: TelemetryTurn = {
    turnId: createId('turn'),
    requestGroupId: createId('request-group'),
    startedAt: new Date().toISOString(),
    mode: context.mode,
    phaseAtSend: context.mode === 'General' ? 'idle' : 'draft-ready',
    latestUserInput: context.latestUserInput,
    promptContextLengthChars: promptContext.length,
    conversationDepth:
      context.transcript.filter((entry) => entry.kind === 'user' || entry.kind === 'assistant')
        .length + 1,
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
  await recordRequestStarted(context.session, telemetryTurn, context.providerConfig);
  await appendConversationTurn(context.session, 'user', context.latestUserInput);

  let assistantText = '';

  try {
    for await (const chunk of adapter.streamMessage(messages, context.providerConfig, {
      signal: context.signal,
      onStart: (info) => {
        telemetryTurn.streamInfo = info;
      },
      onFinal: (info) => {
        telemetryTurn.finalInfo = info;
      }
    })) {
      assistantText += chunk;
      telemetryTurn.firstTokenAt ??= new Date().toISOString();
      context.onChunk(assistantText);
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
      errorMessage: error instanceof Error ? error.message : 'Unknown provider error.',
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
      content: [buildModeSystemPrompt(mode, commandReference), promptContext].filter(Boolean).join('\n\n')
    },
    ...priorMessages,
    {
      role: 'user',
      content: latestUserInput
    }
  ];
}
