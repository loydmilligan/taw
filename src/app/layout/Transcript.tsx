import React from 'react';
import { Box, Text } from 'ink';
import type { TranscriptEntry } from '../../types/app.js';
import { theme, getModeColor } from '../theme.js';

interface TranscriptProps {
  items: TranscriptEntry[];
  streamingAssistantId?: string | null;
  showStreamingDraft: boolean;
  mode: string;
}

export function Transcript({
  items,
  streamingAssistantId,
  showStreamingDraft,
  mode
}: TranscriptProps): React.JSX.Element {
  const modeColor = getModeColor(mode);
  const borderColor = mode === 'General' ? theme.muted : modeColor;
  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle="round"
      borderColor={borderColor}
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
          <Text color={getColor(item.kind, modeColor)}>
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

function getColor(kind: TranscriptEntry['kind'], modeColor: string): string {
  switch (kind) {
    case 'assistant':
      return modeColor;
    case 'notice':
      return modeColor;
    case 'error':
      return theme.error;
    default:
      return theme.muted;
  }
}
