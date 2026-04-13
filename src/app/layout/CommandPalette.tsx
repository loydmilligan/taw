import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../theme.js';

export interface CommandPaletteItem {
  label: string;
  description: string;
  usage?: string;
  disabled?: boolean;
}

interface CommandPaletteProps {
  items: CommandPaletteItem[];
  selectedIndex: number;
  query: string;
}

export function CommandPalette({
  items,
  selectedIndex,
  query
}: CommandPaletteProps): React.JSX.Element {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.accent}
      paddingX={1}
      paddingY={1}
      marginTop={1}
    >
      <Text color={theme.accent}>Command Palette</Text>
      <Text color={theme.muted}>
        Type to filter. Enter inserts a command. Esc closes. Up/Down move.
      </Text>
      <Text>
        <Text color={theme.muted}>Search </Text>
        <Text inverse>{query || ' '}</Text>
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {items.map((item, index) => (
          <Box key={`${item.label}-${index}`} flexDirection="column">
            <Text
              color={
                item.disabled
                  ? theme.muted
                  : index === selectedIndex
                    ? theme.accent
                    : theme.success
              }
            >
              {index === selectedIndex ? '› ' : '  '}
              {item.label}
            </Text>
            <Text color={theme.muted}>
              {'   '}
              {item.description}
              {item.usage ? `  ${item.usage}` : ''}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
