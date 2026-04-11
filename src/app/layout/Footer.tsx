import React from 'react';
import { Box, Text } from 'ink';
import type { AppState } from '../../types/app.js';
import { theme } from '../theme.js';
import { readResearchSources } from '../../core/research/store.js';

interface FooterProps {
  state: AppState;
  workingDirectory: string;
  showStreamingDraft: boolean;
  commandPaletteOpen: boolean;
}

export function Footer({
  state,
  workingDirectory,
  showStreamingDraft,
  commandPaletteOpen
}: FooterProps): React.JSX.Element {
  const [sourceCount, setSourceCount] = React.useState<number | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    if (!state.mode.startsWith('Research ')) {
      setSourceCount(null);
      return;
    }

    void readResearchSources(state.session).then((sources) => {
      if (!cancelled) {
        setSourceCount(sources.length);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [state.mode, state.session]);

  const nextAction = state.isStreaming
    ? `Streaming response. Press Esc to interrupt.${showStreamingDraft ? '' : ' Press Ctrl+T to view the live draft.'}`
    : state.mode !== 'General'
      ? 'Review the draft, then use /finalize to save it or /exit-mode to leave the mode.'
      : state.session.storageMode === 'project'
        ? 'Type a message or try /help, /status, /config, /attach-dir, or /init.'
        : 'Type a message, run /init to make this directory project-aware, or use /help for commands.';

  const lastRequest = state.usage.lastRequest;
  const lastCost = lastRequest?.total_cost ?? null;
  const highTurnCost =
    lastCost !== null &&
    state.globalConfig.budget.highTurnCostWarning > 0 &&
    lastCost >= state.globalConfig.budget.highTurnCostWarning;
  const highSessionCost =
    state.globalConfig.budget.highSessionCostWarning > 0 &&
    state.usage.session.totalCost >=
      state.globalConfig.budget.highSessionCostWarning;
  const highPromptTokens =
    (lastRequest?.prompt_tokens ?? 0) >=
      state.globalConfig.budget.highPromptTokensWarning &&
    state.globalConfig.budget.highPromptTokensWarning > 0;
  const highContextChars =
    (lastRequest?.prompt_context_length_chars ?? 0) >=
      state.globalConfig.budget.highContextCharsWarning &&
    state.globalConfig.budget.highContextCharsWarning > 0;
  const highSourceCount =
    state.mode.startsWith('Research ') && (sourceCount ?? 0) >= 12;
  const warnings = [
    highTurnCost ? `last turn $${formatCost(lastCost)}` : null,
    highSessionCost
      ? `session $${state.usage.session.totalCost.toFixed(6)}`
      : null,
    highPromptTokens
      ? `prompt ${lastRequest?.prompt_tokens ?? 0} tokens`
      : null,
    highContextChars
      ? `context ${lastRequest?.prompt_context_length_chars ?? 0} chars`
      : null,
    highSourceCount ? `${sourceCount ?? 0} stored sources` : null
  ].filter(Boolean);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={theme.accent}>{nextAction}</Text>
      {warnings.length > 0 ? (
        <Text color={theme.warning}>
          Research warning: {warnings.join(' | ')}
        </Text>
      ) : null}
      <Text color={theme.muted}>WD {workingDirectory}</Text>
      <Text color={theme.muted}>
        Last: ${formatCost(lastCost)} prompt {lastRequest?.prompt_tokens ?? 0}{' '}
        completion {lastRequest?.completion_tokens ?? 0} reasoning{' '}
        {lastRequest?.reasoning_tokens ?? 0}
      </Text>
      <Text color={theme.muted}>
        Session: ${state.usage.session.totalCost.toFixed(6)} requests{' '}
        {state.usage.session.requests} prompt {state.usage.session.promptTokens}{' '}
        completion {state.usage.session.completionTokens} reasoning{' '}
        {state.usage.session.reasoningTokens}
      </Text>
      {state.mode.startsWith('Research ') ? (
        <Text color={theme.muted}>
          Research: sources {sourceCount ?? 0} context{' '}
          {lastRequest?.prompt_context_length_chars ?? 0} chars
        </Text>
      ) : null}
      <Text color={theme.muted}>
        Left/Right move Tab complete Up/Down suggestions/menu Esc
        interrupt/close Ctrl+P menu Ctrl+T live-draft{' '}
        {commandPaletteOpen ? ' Menu open' : ''} Ctrl+C exit
      </Text>
    </Box>
  );
}

function formatCost(value: number | null): string {
  return value === null ? 'n/a' : value.toFixed(6);
}
