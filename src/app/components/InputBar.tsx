import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../theme.js';

interface InputBarProps {
  value: string;
  cursor: number;
  suggestions: Array<{ name: string; description: string }>;
  selectedSuggestion: number;
  locked: boolean;
  maxSuggestions?: number;
}

export function InputBar({
  value,
  cursor,
  suggestions,
  selectedSuggestion,
  locked,
  maxSuggestions = 6
}: InputBarProps): React.JSX.Element {
  const hasValue = value.length > 0;
  const cursorAtEnd = cursor >= value.length;
  const currentChar = hasValue && !cursorAtEnd ? value[cursor] : ' ';
  const visibleSuggestions = getVisibleSuggestions(
    suggestions,
    selectedSuggestion,
    maxSuggestions
  );
  const hiddenCount = Math.max(
    0,
    suggestions.length - visibleSuggestions.length
  );

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box borderStyle="round" borderColor={theme.muted} paddingX={1}>
        <Text color={theme.accent}>{'> '}</Text>
        {hasValue ? (
          <Text>
            {value.slice(0, cursor)}
            <Text inverse>{currentChar}</Text>
            {cursorAtEnd ? '' : value.slice(cursor + 1)}
          </Text>
        ) : (
          <Text color={locked ? theme.muted : undefined}>
            <Text inverse> </Text>
            {locked
              ? 'Input locked while a response is active.'
              : 'Type a message or /help'}
          </Text>
        )}
      </Box>
      {visibleSuggestions.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.muted}>Commands</Text>
          {visibleSuggestions.map(({ suggestion, index }) => (
            <Text
              key={suggestion.name}
              color={index === selectedSuggestion ? theme.accent : theme.muted}
            >
              {index === selectedSuggestion ? '› ' : '  '}/{suggestion.name}{' '}
              {suggestion.description}
            </Text>
          ))}
          {hiddenCount > 0 ? (
            <Text color={theme.muted}>… {hiddenCount} more</Text>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}

function getVisibleSuggestions(
  suggestions: Array<{ name: string; description: string }>,
  selectedSuggestion: number,
  maxSuggestions: number
): Array<{ suggestion: { name: string; description: string }; index: number }> {
  if (suggestions.length <= maxSuggestions) {
    return suggestions.map((suggestion, index) => ({ suggestion, index }));
  }

  const halfWindow = Math.floor(maxSuggestions / 2);
  let start = Math.max(0, selectedSuggestion - halfWindow);
  let end = start + maxSuggestions;

  if (end > suggestions.length) {
    end = suggestions.length;
    start = end - maxSuggestions;
  }

  return suggestions
    .slice(start, end)
    .map((suggestion, offset) => ({ suggestion, index: start + offset }));
}
