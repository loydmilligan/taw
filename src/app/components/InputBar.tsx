import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../theme.js';

interface InputBarProps {
  value: string;
  cursor: number;
  suggestions: Array<{ name: string; description: string }>;
  selectedSuggestion: number;
  locked: boolean;
}

export function InputBar({
  value,
  cursor,
  suggestions,
  selectedSuggestion,
  locked
}: InputBarProps): React.JSX.Element {
  const hasValue = value.length > 0;
  const cursorAtEnd = cursor >= value.length;
  const currentChar = hasValue && !cursorAtEnd ? value[cursor] : ' ';

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
      {suggestions.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.muted}>Commands</Text>
          {suggestions.map((suggestion, index) => (
            <Text
              key={suggestion.name}
              color={index === selectedSuggestion ? theme.accent : theme.muted}
            >
              {index === selectedSuggestion ? '› ' : '  '}/{suggestion.name}{' '}
              {suggestion.description}
            </Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
