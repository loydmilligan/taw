import React from 'react';
import { Box, Text } from 'ink';
import type { AppState } from '../../types/app.js';
import { theme } from '../theme.js';

interface FooterProps {
  state: AppState;
}

export function Footer({ state }: FooterProps): React.JSX.Element {
  const nextAction = state.isStreaming
    ? 'Streaming response. Press Esc to interrupt.'
    : state.session.storageMode === 'project'
      ? 'Type a message or try /help, /status, /config, /attach-dir, or /init.'
      : 'Type a message, run /init to make this directory project-aware, or use /help for commands.';

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={theme.accent}>{nextAction}</Text>
      <Text color={theme.muted}>Tab complete  Up/Down suggestions  Esc interrupt  Ctrl+C exit</Text>
    </Box>
  );
}
