import React from 'react';
import { Box, useApp, useInput } from 'ink';
import type { AppState } from '../types/app.js';
import { Header } from './layout/Header.js';
import { Transcript } from './layout/Transcript.js';
import { Footer } from './layout/Footer.js';
import { InputBar } from './components/InputBar.js';
import { commandRegistry, getCommandDefinition } from '../commands/registry.js';
import { isSlashCommand, parseCommand } from '../commands/parser.js';
import type { TranscriptEntry } from '../types/app.js';
import { createId } from '../utils/ids.js';
import { getProviderAdapter } from '../core/providers/index.js';
import { buildModeSystemPrompt } from '../core/prompts/modes.js';
import type { ChatMessage } from '../types/provider.js';
import { appendConversationTurn } from '../core/notes/notes-writer.js';
import { createModeArtifact } from '../core/artifacts/writer.js';
import { logError } from '../services/logging/logger.js';

interface AppProps {
  state: AppState;
}

export function App({ state }: AppProps): React.JSX.Element {
  const { exit } = useApp();
  const [input, setInput] = React.useState('');
  const [appState, setAppState] = React.useState(state);
  const [selectedSuggestion, setSelectedSuggestion] = React.useState(0);
  const inputRef = React.useRef(input);
  const appStateRef = React.useRef(appState);
  const streamAbortRef = React.useRef<AbortController | null>(null);
  const suggestions = React.useMemo(() => getSuggestions(input), [input]);

  React.useEffect(() => {
    inputRef.current = input;
  }, [input]);

  React.useEffect(() => {
    appStateRef.current = appState;
  }, [appState]);

  useInput((value, key) => {
    if (key.escape && appStateRef.current.isStreaming) {
      streamAbortRef.current?.abort();
      return;
    }

    if (value.includes('\n') || value.includes('\r')) {
      void handleChunkInput(value);
      return;
    }

    if (key.return) {
      void submitInput();
      return;
    }

    if (key.backspace || key.delete) {
      setInput((current) => {
        const nextValue = current.slice(0, -1);
        inputRef.current = nextValue;
        return nextValue;
      });
      return;
    }

    if (key.tab && suggestions.length > 0) {
      const suggestion = suggestions[selectedSuggestion] ?? suggestions[0];
      const nextValue = `/${suggestion.name} `;
      inputRef.current = nextValue;
      setInput(nextValue);
      return;
    }

    if (key.upArrow && suggestions.length > 0) {
      setSelectedSuggestion((current) => (current - 1 + suggestions.length) % suggestions.length);
      return;
    }

    if (key.downArrow && suggestions.length > 0) {
      setSelectedSuggestion((current) => (current + 1) % suggestions.length);
      return;
    }

    if (key.escape) {
      setSelectedSuggestion(0);
      return;
    }

    if (!key.ctrl && value && value >= ' ' && value !== '\u0003') {
      setInput((current) => {
        const nextValue = current + value;
        inputRef.current = nextValue;
        return nextValue;
      });
    }
  });

  React.useEffect(() => {
    setSelectedSuggestion(0);
  }, [input]);

  async function submitInput(): Promise<void> {
    const trimmed = inputRef.current.trim();

    if (!trimmed) {
      return;
    }

    setInput('');
    inputRef.current = '';

    const userEntry: TranscriptEntry = {
      id: createId('user'),
      kind: 'user',
      body: trimmed
    };

    setAppState((current) => ({
      ...current,
      transcript: [...current.transcript, userEntry]
    }));

    if (isSlashCommand(trimmed)) {
      try {
        const parsed = parseCommand(trimmed);
        const command = getCommandDefinition(parsed.name);

        if (!command) {
          throw new Error(`Unknown command: /${parsed.name}. Try /help.`);
        }

        const result = await command.run(parsed, {
          cwd: process.cwd(),
          session: appStateRef.current.session,
          transcript: appStateRef.current.transcript,
          providerConfig: appStateRef.current.providerConfig,
          mode: appStateRef.current.mode,
          globalConfig: appStateRef.current.globalConfig,
          projectConfig: appStateRef.current.projectConfig
        });

        setAppState((current) => ({
          ...current,
          mode: result.mode ?? current.mode,
          provider: result.provider ?? current.provider,
          model: result.model ?? current.model,
          providerConfig: result.providerConfig ?? current.providerConfig,
          commandReference: current.commandReference,
          globalConfig: current.globalConfig,
          projectConfig: current.projectConfig,
          session: result.session ?? current.session,
          transcript: [...current.transcript, ...result.entries]
        }));

        if (result.shouldExit) {
          exit();
        }
      } catch (error) {
        void logError('command', error);
        setAppState((current) => ({
          ...current,
          transcript: [
            ...current.transcript,
            {
              id: createId('command-error'),
              kind: 'error',
              title: 'Command Error',
              body: error instanceof Error ? error.message : 'Unknown command error.'
            }
          ]
        }));
      }

      return;
    }

    const assistantId = createId('assistant');
    const messages = buildChatMessages(
      appStateRef.current.transcript,
      trimmed,
      appStateRef.current.mode,
      appStateRef.current.commandReference
    );
    const adapter = getProviderAdapter(appStateRef.current.providerConfig);
    let assistantText = '';
    const abortController = new AbortController();
    streamAbortRef.current = abortController;

    setAppState((current) => ({
      ...current,
      isStreaming: true,
      transcript: [
        ...current.transcript,
        {
          id: assistantId,
          kind: 'assistant',
          title: 'Assistant',
          body: ''
        }
      ]
    }));

    try {
      adapter.validateConfig(appStateRef.current.providerConfig);
      await appendConversationTurn(appStateRef.current.session, 'user', trimmed);

      for await (const chunk of adapter.streamMessage(messages, appStateRef.current.providerConfig, {
        signal: abortController.signal
      })) {
        assistantText += chunk;
        setAppState((current) => ({
          ...current,
          transcript: current.transcript.map((entry) =>
            entry.id === assistantId ? { ...entry, body: assistantText } : entry
          )
        }));
      }

      await appendConversationTurn(appStateRef.current.session, 'assistant', assistantText);
      const artifact = await createModeArtifact(
        appStateRef.current.session,
        appStateRef.current.mode,
        assistantText
      );
      streamAbortRef.current = null;
      setAppState((current) => ({
        ...current,
        isStreaming: false,
        session: appStateRef.current.session,
        transcript: artifact
          ? [
              ...current.transcript,
              {
                id: createId('artifact-notice'),
                kind: 'notice',
                title: 'Artifact Saved',
                body: artifact.path
              }
            ]
          : current.transcript
      }));
    } catch (error) {
      const normalizedError = adapter.normalizeError(error);
      const interrupted = abortController.signal.aborted;
      streamAbortRef.current = null;
      void logError('provider', normalizedError);
      const providerErrorEntry: TranscriptEntry = {
        id: createId(interrupted ? 'provider-interrupt' : 'provider-error'),
        kind: interrupted ? 'notice' : 'error',
        title: interrupted ? 'Response Interrupted' : 'Provider Error',
        body: interrupted
          ? 'Streaming stopped by user.'
          : `${normalizedError.message} Next step: set the provider API key and try again.`
      };

      setAppState((current) => ({
        ...current,
        isStreaming: false,
        transcript: [
          current.transcript.map((entry) =>
            entry.id === assistantId
              ? {
                  ...entry,
                  body: assistantText || '[No assistant response saved due to provider error.]'
                }
              : entry
          ),
          providerErrorEntry
        ].flat()
      }));
    }
  }

  async function handleChunkInput(chunk: string): Promise<void> {
    const normalized = chunk.replaceAll('\r', '\n');
    const parts = normalized.split('\n');

    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];

      if (part) {
        const nextValue = inputRef.current + part;
        inputRef.current = nextValue;
        setInput(nextValue);
      }

      if (index < parts.length - 1) {
        await submitInput();
      }
    }
  }

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Header state={appState} />
      <Transcript items={appState.transcript} />
      <InputBar
        value={input}
        suggestions={suggestions}
        selectedSuggestion={selectedSuggestion}
      />
      <Footer state={appState} />
    </Box>
  );
}

function buildChatMessages(
  transcript: TranscriptEntry[],
  latestUserInput: string,
  mode: string,
  commandReference: string
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
      content: buildModeSystemPrompt(mode, commandReference)
    },
    ...priorMessages,
    {
      role: 'user',
      content: latestUserInput
    }
  ];
}

function getSuggestions(value: string): Array<{ name: string; description: string }> {
  if (!value.startsWith('/')) {
    return [];
  }

  const query = value.slice(1).trim();
  return commandRegistry
    .filter((command) => command.name.startsWith(query))
    .map((command) => ({ name: command.name, description: command.description }));
}
