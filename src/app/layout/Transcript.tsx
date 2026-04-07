import React from 'react';
import { Box, Text } from 'ink';
import type { TranscriptEntry } from '../../types/app.js';
import { theme } from '../theme.js';

interface TranscriptProps {
  items: TranscriptEntry[];
}

export function Transcript({ items }: TranscriptProps): React.JSX.Element {
  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor={theme.muted} paddingX={1}>
      {items.map((item) => (
        <Box key={item.id} flexDirection="column" marginTop={1} marginBottom={1}>
          <Text color={getColor(item.kind)}>
            {item.title ? `${item.title}` : item.kind.toUpperCase()}
          </Text>
          <Text wrap="wrap">{item.body}</Text>
        </Box>
      ))}
    </Box>
  );
}

function getColor(kind: TranscriptEntry['kind']): string {
  switch (kind) {
    case 'assistant':
      return theme.accent;
    case 'notice':
      return theme.success;
    case 'error':
      return theme.error;
    default:
      return theme.muted;
  }
}
