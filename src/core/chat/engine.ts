import { appendConversationTurn } from '../notes/notes-writer.js';
import { getProviderAdapter } from '../providers/index.js';
import { buildModeSystemPrompt } from '../prompts/modes.js';
import type { TranscriptEntry } from '../../types/app.js';
import type { ChatMessage, ProviderConfig } from '../../types/provider.js';
import type { ProjectConfig } from '../../services/config/schema.js';
import type { SessionRecord } from '../../types/session.js';
import { buildPromptContext } from '../context/prompt-context.js';

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
}

export async function executeChatTurn(context: ChatExecutionContext): Promise<ChatExecutionResult> {
  const promptContext = await buildPromptContext(context.session, context.projectConfig);
  const messages = buildChatMessages(
    context.transcript,
    context.latestUserInput,
    context.mode,
    context.commandReference,
    promptContext
  );
  const adapter = getProviderAdapter(context.providerConfig);

  adapter.validateConfig(context.providerConfig);
  await appendConversationTurn(context.session, 'user', context.latestUserInput);

  let assistantText = '';

  for await (const chunk of adapter.streamMessage(messages, context.providerConfig, {
    signal: context.signal
  })) {
    assistantText += chunk;
    context.onChunk(assistantText);
  }

  await appendConversationTurn(context.session, 'assistant', assistantText);

  return {
    assistantText,
    interrupted: context.signal?.aborted ?? false
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
