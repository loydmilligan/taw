import React from 'react';
import { Box, Text } from 'ink';
import type { AppState } from '../../types/app.js';
import { theme, getModeColor } from '../theme.js';
import { APP_VERSION } from '../../version.js';

interface HeaderProps {
  state: AppState;
}

export function Header({ state }: HeaderProps): React.JSX.Element {
  const sessionLabel =
    state.session.storageMode === 'project' ? 'Project' : 'General';
  const statusColor =
    state.session.storageMode === 'project' ? theme.success : theme.warning;
  const phaseColor =
    state.phase === 'thinking'
      ? theme.warning
      : state.phase === 'draft-ready'
        ? theme.success
        : theme.accent;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box justifyContent="space-between">
        <Text color={theme.accent}>TAW {APP_VERSION}</Text>
        {state.globalConfig.ui.showHeaderDetails ? (
          <Text color={theme.muted}>{state.session.metadata.slug}</Text>
        ) : null}
      </Box>
      <Box justifyContent="space-between">
        <Text>
          Mode <Text color={getModeColor(state.mode)}>{state.mode}</Text>
          {'  '}State <Text color={statusColor}>{sessionLabel}</Text>
          {'  '}Phase <Text color={phaseColor}>{state.phase}</Text>
        </Text>
        {state.globalConfig.ui.showHeaderDetails ? (
          <Text color={theme.muted}>
            {state.provider} / {state.model}
          </Text>
        ) : null}
      </Box>
      {state.globalConfig.ui.showHeaderDetails ? (
        <Text color={theme.muted}>Session: {state.session.sessionDir}</Text>
      ) : null}
      {state.globalConfig.ui.showHeaderDetails && state.openrouterAccount ? (
        <Text
          color={state.openrouterAccount.error ? theme.warning : theme.muted}
        >
          OpenRouter Credits:{' '}
          {state.openrouterAccount.remainingCredits !== null
            ? `$${state.openrouterAccount.remainingCredits.toFixed(2)}`
            : 'unavailable'}
          {state.openrouterAccount.error
            ? ` (${state.openrouterAccount.error})`
            : ''}
        </Text>
      ) : null}
    </Box>
  );
}
