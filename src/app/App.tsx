import React from 'react';
import { Box, useApp, useInput } from 'ink';
import { bootstrapApp } from '../cli/bootstrap.js';
import type { AppState, TranscriptEntry } from '../types/app.js';
import { Header } from './layout/Header.js';
import { Transcript } from './layout/Transcript.js';
import { Footer } from './layout/Footer.js';
import {
  CommandPalette,
  type CommandPaletteItem
} from './layout/CommandPalette.js';
import { InputBar } from './components/InputBar.js';
import { commandRegistry, getCommandDefinition } from '../commands/registry.js';
import { isSlashCommand, parseCommand } from '../commands/parser.js';
import { summarizeSessionUsage } from '../core/telemetry/derivation.js';
import { readTelemetrySummaries } from '../core/telemetry/store.js';
import { createId } from '../utils/ids.js';
import { logError } from '../services/logging/logger.js';
import { executeChatTurn } from '../core/chat/engine.js';
import {
  currentDraftTitle,
  deleteBackward,
  insertInputText,
  moveCursor,
  moveCursorToEnd,
  moveCursorToStart,
  resolvePhaseAfterCommand,
  toDisplayCursor,
  toDisplayValue,
  type InputState
} from './state.js';

interface AppProps {
  state: AppState;
}

export function App({ state }: AppProps): React.JSX.Element {
  const { exit } = useApp();
  const workingDirectory = process.cwd();
  const [inputState, setInputState] = React.useState<InputState>({
    value: '',
    cursor: 0
  });
  const [appState, setAppState] = React.useState(state);
  const [selectedSuggestion, setSelectedSuggestion] = React.useState(0);
  const [showStreamingDraft, setShowStreamingDraft] = React.useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false);
  const [selectedPaletteIndex, setSelectedPaletteIndex] = React.useState(0);
  const inputRef = React.useRef(inputState);
  const appStateRef = React.useRef(appState);
  const streamAbortRef = React.useRef<AbortController | null>(null);
  const activeAssistantIdRef = React.useRef<string | null>(null);
  const streamedAssistantTextRef = React.useRef('');
  const flushTimerRef = React.useRef<ReturnType<
    typeof globalThis.setTimeout
  > | null>(null);
  const suggestions = React.useMemo(
    () => getSuggestions(inputState.value),
    [inputState.value]
  );

  React.useEffect(() => {
    inputRef.current = inputState;
  }, [inputState]);

  React.useEffect(() => {
    appStateRef.current = appState;
  }, [appState]);

  React.useEffect(
    () => () => {
      if (flushTimerRef.current) {
        globalThis.clearTimeout(flushTimerRef.current);
      }
    },
    []
  );

  useInput((value, key) => {
    if (key.ctrl && value.toLowerCase() === 'p') {
      setCommandPaletteOpen((current) => !current);
      return;
    }

    if (key.ctrl && value.toLowerCase() === 't') {
      setShowStreamingDraft((current) => {
        const next = !current;
        if (next) {
          flushAssistantText(true);
        }
        return next;
      });
      return;
    }

    if (commandPaletteOpen) {
      if (key.escape) {
        setCommandPaletteOpen(false);
        return;
      }

      if (key.upArrow) {
        setSelectedPaletteIndex(
          (current) =>
            (current -
              1 +
              getPaletteItems(appStateRef.current.isStreaming).length) %
            getPaletteItems(appStateRef.current.isStreaming).length
        );
        return;
      }

      if (key.downArrow) {
        setSelectedPaletteIndex(
          (current) =>
            (current + 1) %
            getPaletteItems(appStateRef.current.isStreaming).length
        );
        return;
      }

      if (key.return) {
        void runPaletteAction();
        return;
      }

      return;
    }

    if (key.escape && appStateRef.current.isStreaming) {
      streamAbortRef.current?.abort();
      return;
    }

    if (appStateRef.current.isStreaming) {
      return;
    }

    if (key.return) {
      void submitInput();
      return;
    }

    if (key.leftArrow) {
      updateInputState((current) => moveCursor(current, -1));
      return;
    }

    if (key.rightArrow) {
      updateInputState((current) => moveCursor(current, 1));
      return;
    }

    if (key.ctrl && value.toLowerCase() === 'a') {
      updateInputState(moveCursorToStart);
      return;
    }

    if (key.ctrl && value.toLowerCase() === 'e') {
      updateInputState(moveCursorToEnd);
      return;
    }

    if (key.backspace || key.delete) {
      updateInputState(deleteBackward);
      return;
    }

    if (key.tab && suggestions.length > 0) {
      const suggestion = suggestions[selectedSuggestion] ?? suggestions[0];
      const nextValue = `/${suggestion.name} `;
      setInputState({
        value: nextValue,
        cursor: nextValue.length
      });
      return;
    }

    if (key.upArrow && suggestions.length > 0) {
      setSelectedSuggestion(
        (current) => (current - 1 + suggestions.length) % suggestions.length
      );
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

    if (value) {
      updateInputState((current) => insertInputText(current, value));
    }
  });

  React.useEffect(() => {
    setSelectedSuggestion(0);
  }, [inputState.value]);

  React.useEffect(() => {
    if (!commandPaletteOpen) {
      flushAssistantText(true);
    }
  }, [commandPaletteOpen]);

  React.useEffect(() => {
    if (
      appState.queuedInputs.length > 0 &&
      !appState.isStreaming &&
      inputState.value.length === 0
    ) {
      const nextInput = appState.queuedInputs[0];
      setAppState((current) => ({
        ...current,
        queuedInputs: current.queuedInputs.slice(1)
      }));
      globalThis.queueMicrotask(() => {
        void submitQueuedInput(nextInput);
      });
    }
  }, [appState.queuedInputs, appState.isStreaming, inputState.value.length]);

  async function submitInput(): Promise<void> {
    if (appStateRef.current.isStreaming) {
      return;
    }

    const trimmed = inputRef.current.value.trim();

    if (!trimmed) {
      return;
    }

    setInputState({ value: '', cursor: 0 });

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
      await runCommand(trimmed);
      return;
    }

    const assistantId = createId('assistant');
    const abortController = new AbortController();
    const modeAtStart = appStateRef.current.mode;
    streamAbortRef.current = abortController;
    activeAssistantIdRef.current = assistantId;
    streamedAssistantTextRef.current = '';
    setShowStreamingDraft(false);

    setAppState((current) => ({
      ...current,
      isStreaming: true,
      phase: 'thinking',
      transcript: [
        ...current.transcript,
        {
          id: assistantId,
          kind: 'assistant',
          title: currentDraftTitle(modeAtStart),
          body: '',
          draftState: modeAtStart === 'General' ? undefined : 'pending'
        }
      ]
    }));

    try {
      await executeChatTurn({
        transcript: appStateRef.current.transcript,
        latestUserInput: trimmed,
        mode: modeAtStart,
        providerConfig: appStateRef.current.providerConfig,
        globalConfig: appStateRef.current.globalConfig,
        commandReference: appStateRef.current.commandReference,
        session: appStateRef.current.session,
        projectConfig: appStateRef.current.projectConfig,
        signal: abortController.signal,
        onChunk: (assistantText) => {
          streamedAssistantTextRef.current = assistantText;
          flushAssistantText(false);
        }
      });
      streamAbortRef.current = null;
      flushAssistantText(true);
      setAppState((current) => ({
        ...current,
        isStreaming: false,
        phase: current.mode === 'General' ? 'idle' : 'draft-ready',
        session: appStateRef.current.session,
        transcript: current.transcript.map((entry) =>
          entry.id === assistantId
            ? {
                ...entry,
                body: streamedAssistantTextRef.current,
                draftState: current.mode === 'General' ? undefined : 'complete'
              }
            : entry
        )
      }));
      await refreshUsage(appStateRef.current.session);
      activeAssistantIdRef.current = null;
    } catch (error) {
      const interrupted = abortController.signal.aborted;
      streamAbortRef.current = null;
      const message =
        error instanceof Error ? error.message : 'Unknown provider error.';
      void logError('provider', message);
      const providerErrorEntry: TranscriptEntry = {
        id: createId(interrupted ? 'provider-interrupt' : 'provider-error'),
        kind: interrupted ? 'notice' : 'error',
        title: interrupted ? 'Response Interrupted' : 'Provider Error',
        body: interrupted
          ? 'Streaming stopped by user.'
          : `${message} Next step: set the provider API key and try again.`
      };

      setAppState((current) => {
        const nextDraftState: TranscriptEntry['draftState'] =
          current.mode === 'General'
            ? undefined
            : interrupted
              ? 'interrupted'
              : 'failed';

        return {
          ...current,
          isStreaming: false,
          phase: 'idle',
          transcript: [
            current.transcript.map((entry) =>
              entry.id === assistantId
                ? {
                    ...entry,
                    body:
                      streamedAssistantTextRef.current ||
                      entry.body ||
                      '[No assistant response saved due to provider error.]',
                    draftState: nextDraftState
                  }
                : entry
            ),
            providerErrorEntry
          ].flat()
        };
      });
      await refreshUsage(appStateRef.current.session);
      activeAssistantIdRef.current = null;
    }
  }

  async function submitQueuedInput(value: string): Promise<void> {
    setInputState({ value, cursor: value.length });
    inputRef.current = { value, cursor: value.length };
    await submitInput();
  }

  async function runCommand(raw: string): Promise<void> {
    try {
      const parsed = parseCommand(raw);
      const command = getCommandDefinition(parsed.name);

      if (!command) {
        throw new Error(`Unknown command: /${parsed.name}. Try /help.`);
      }

      const result = await command.run(parsed, {
        cwd: workingDirectory,
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
        phase:
          result.phase ??
          resolvePhaseAfterCommand(result.mode ?? current.mode, current.phase),
        provider: result.provider ?? current.provider,
        model: result.model ?? current.model,
        providerConfig: result.providerConfig ?? current.providerConfig,
        commandReference: current.commandReference,
        globalConfig: result.globalConfig ?? current.globalConfig,
        projectConfig:
          result.projectConfig === undefined
            ? current.projectConfig
            : result.projectConfig,
        session: result.session ?? current.session,
        transcript: [...current.transcript, ...result.entries]
      }));

      await refreshUsage(result.session ?? appStateRef.current.session);

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
            body:
              error instanceof Error ? error.message : 'Unknown command error.'
          }
        ]
      }));
    }
  }

  function flushAssistantText(force: boolean): void {
    const assistantId = activeAssistantIdRef.current;

    if (!assistantId) {
      return;
    }

    if (flushTimerRef.current) {
      globalThis.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }

    if (!force) {
      flushTimerRef.current = globalThis.setTimeout(() => {
        flushAssistantText(true);
      }, 75);
      return;
    }

    if (!showStreamingDraft || commandPaletteOpen) {
      return;
    }

    setAppState((current) => ({
      ...current,
      transcript: current.transcript.map((entry) =>
        entry.id === assistantId
          ? { ...entry, body: streamedAssistantTextRef.current }
          : entry
      )
    }));
  }

  async function refreshUsage(session: AppState['session']): Promise<void> {
    const summaries = await readTelemetrySummaries(session);

    setAppState((current) => ({
      ...current,
      usage: {
        session: summarizeSessionUsage(summaries),
        lastRequest: summaries.at(-1) ?? null
      }
    }));
  }

  async function runPaletteAction(): Promise<void> {
    const item = getPaletteItems(appStateRef.current.isStreaming)[
      selectedPaletteIndex
    ];

    if (!item || item.disabled) {
      return;
    }

    if (item.label === 'Resume / Close Menu') {
      setCommandPaletteOpen(false);
      return;
    }

    if (item.label === 'Interrupt Current Response') {
      streamAbortRef.current?.abort();
      setCommandPaletteOpen(false);
      return;
    }

    if (item.label === 'Summarize Session So Far') {
      setCommandPaletteOpen(false);
      setAppState((current) => ({
        ...current,
        transcript: [
          ...current.transcript,
          {
            id: createId('user'),
            kind: 'user',
            body: '/summarize-session'
          }
        ]
      }));
      await runCommand('/summarize-session');
      return;
    }

    if (item.label === 'Start New Session Here') {
      const nextState = await bootstrapApp(workingDirectory);
      setAppState(nextState);
      setInputState({ value: '', cursor: 0 });
      setSelectedSuggestion(0);
      setSelectedPaletteIndex(0);
      setShowStreamingDraft(false);
      setCommandPaletteOpen(false);
      activeAssistantIdRef.current = null;
      streamedAssistantTextRef.current = '';
      streamAbortRef.current = null;
      return;
    }

    if (item.label === 'Toggle Live Draft View') {
      setShowStreamingDraft((current) => {
        const next = !current;
        if (next) {
          flushAssistantText(true);
        }
        return next;
      });
      setCommandPaletteOpen(false);
      return;
    }

    if (item.label === 'Exit TAW (Session Stays Saved)') {
      exit();
    }
  }

  function updateInputState(
    updater: (current: InputState) => InputState
  ): void {
    setInputState((current) => updater(current));
  }

  const displayValue = toDisplayValue(inputState.value);
  const displayCursor = toDisplayCursor(inputState.value, inputState.cursor);
  const paletteItems = getPaletteItems(appState.isStreaming);

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Header state={appState} />
      <Transcript
        items={appState.transcript}
        streamingAssistantId={activeAssistantIdRef.current}
        showStreamingDraft={showStreamingDraft}
      />
      {commandPaletteOpen ? (
        <CommandPalette
          items={paletteItems}
          selectedIndex={selectedPaletteIndex}
          mode={appState.mode}
          phase={appState.phase}
          streaming={appState.isStreaming}
          artifacts={appState.session.metadata.artifacts.map(
            (artifact) => artifact.path
          )}
        />
      ) : null}
      <InputBar
        value={displayValue}
        cursor={displayCursor}
        suggestions={suggestions}
        selectedSuggestion={selectedSuggestion}
        locked={appState.isStreaming}
      />
      <Footer
        state={appState}
        workingDirectory={workingDirectory}
        showStreamingDraft={showStreamingDraft}
        commandPaletteOpen={commandPaletteOpen}
      />
    </Box>
  );
}

function getSuggestions(
  value: string
): Array<{ name: string; description: string }> {
  if (!value.startsWith('/')) {
    return [];
  }

  const query = value.slice(1).trim();
  return commandRegistry
    .filter((command) => command.name.startsWith(query))
    .map((command) => ({
      name: command.name,
      description: command.description
    }));
}

function getPaletteItems(streaming: boolean): CommandPaletteItem[] {
  return [
    {
      label: 'Resume / Close Menu',
      description: 'Return to the transcript and input.'
    },
    {
      label: 'Interrupt Current Response',
      description: 'Abort the active provider request.',
      disabled: !streaming
    },
    {
      label: 'Toggle Live Draft View',
      description: 'Reveal or hide the in-progress assistant text.'
    },
    {
      label: 'Summarize Session So Far',
      description: 'Run /summarize-session for the current session.',
      disabled: streaming
    },
    {
      label: 'Start New Session Here',
      description: 'Create a fresh session in the current working directory.',
      disabled: streaming
    },
    {
      label: 'Exit TAW (Session Stays Saved)',
      description: 'Leave the app. Session files remain on disk.'
    }
  ];
}
