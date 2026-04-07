import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../theme.js';

export interface CommandPaletteItem {
  label: string;
  description: string;
  disabled?: boolean;
}

interface CommandPaletteProps {
  items: CommandPaletteItem[];
  selectedIndex: number;
  mode: string;
  phase: string;
  streaming: boolean;
  artifacts: string[];
}

export function CommandPalette({
  items,
  selectedIndex,
  mode,
  phase,
  streaming,
  artifacts
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
      <Text color={theme.accent}>Session Menu</Text>
      <Text color={theme.muted}>
        Mode {mode} Phase {phase} Streaming {streaming ? 'yes' : 'no'}
      </Text>
      <Text color={theme.muted}>Enter run Esc close Up/Down move</Text>
      <Box flexDirection="column" marginTop={1}>
        {items.map((item, index) => (
          <Text
            key={item.label}
            color={
              item.disabled
                ? theme.muted
                : index === selectedIndex
                  ? theme.accent
                  : theme.success
            }
          >
            {index === selectedIndex ? '› ' : '  '}
            {item.label} {item.description}
          </Text>
        ))}
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.muted}>Artifacts</Text>
        {artifacts.length > 0 ? (
          artifacts.slice(-5).map((artifact) => (
            <Text key={artifact} color={theme.muted}>
              - {artifact}
            </Text>
          ))
        ) : (
          <Text color={theme.muted}>- none yet</Text>
        )}
      </Box>
    </Box>
  );
}
