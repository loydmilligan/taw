import React from 'react';
import { Box, Text } from 'ink';
import type { TranscriptEntry } from '../../types/app.js';
import { theme } from '../theme.js';

interface TranscriptProps {
  items: TranscriptEntry[];
  streamingAssistantId?: string | null;
  showStreamingDraft: boolean;
}

export function Transcript({
  items,
  streamingAssistantId,
  showStreamingDraft
}: TranscriptProps): React.JSX.Element {
  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle="round"
      borderColor={theme.muted}
      paddingX={1}
    >
      {items.length <= 2 ? (
        <Box flexDirection="column" marginTop={1} marginBottom={1}>
          <Text color={theme.accent}>Welcome</Text>
          <Text wrap="wrap">
            Start with a message, or try `/brainstorm`, `/workflow generate`, or
            `/workflow review`.
          </Text>
        </Box>
      ) : null}
      {items.map((item) => (
        <Box
          key={item.id}
          flexDirection="column"
          marginTop={1}
          marginBottom={1}
        >
          <Text color={getColor(item.kind)}>
            {item.title ? `${item.title}` : item.kind.toUpperCase()}
          </Text>
          <Text wrap="wrap">
            {item.body ||
              placeholderBody(
                item,
                item.id === streamingAssistantId,
                showStreamingDraft
              )}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

function placeholderBody(
  item: TranscriptEntry,
  isStreamingAssistant: boolean,
  showStreamingDraft: boolean
): string {
  if (isStreamingAssistant && !showStreamingDraft) {
    return 'Assistant is thinking... Press Ctrl+T to reveal the live draft.';
  }

  if (item.kind === 'assistant' && item.title === 'Draft Response') {
    return 'Assistant is thinking...';
  }

  if (item.kind === 'assistant') {
    return 'Assistant is thinking...';
  }

  return '';
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
