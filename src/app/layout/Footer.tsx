import React from 'react';
import { Box, Text } from 'ink';
import type { AppState } from '../../types/app.js';
import { theme } from '../theme.js';

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

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={theme.accent}>{nextAction}</Text>
      {highTurnCost || highSessionCost ? (
        <Text color={theme.warning}>
          Cost warning:{' '}
          {highTurnCost
            ? `last turn $${formatCost(lastCost)}`
            : `session $${state.usage.session.totalCost.toFixed(6)}`}
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
