import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../theme.js';

interface InputBarProps {
  value: string;
  suggestions: Array<{ name: string; description: string }>;
  selectedSuggestion: number;
}

export function InputBar({
  value,
  suggestions,
  selectedSuggestion
}: InputBarProps): React.JSX.Element {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box borderStyle="round" borderColor={theme.muted} paddingX={1}>
        <Text color={theme.accent}>{'> '}</Text>
        <Text>{value || 'Type a message or /help'}</Text>
      </Box>
      {suggestions.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.muted}>Commands</Text>
          {suggestions.map((suggestion, index) => (
            <Text
              key={suggestion.name}
              color={index === selectedSuggestion ? theme.accent : theme.muted}
            >
              {index === selectedSuggestion ? '› ' : '  '}
              /{suggestion.name}  {suggestion.description}
            </Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
