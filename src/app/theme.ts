export const theme = {
  accent: 'cyan',
  success: 'green',
  warning: 'yellow',
  error: 'red',
  muted: 'gray'
} as const;

// Mode-specific color tokens — applied to headers, chat borders, and footers
export const modeColors: Record<string, string> = {
  Brainstorm: '#d946ef',
  'Brainstorm Phase 2': '#f0abfc',
  'Research Politics': '#14b8a6',
  'Research Tech': '#14b8a6',
  'Research Repo': '#14b8a6',
  'Research Video': '#14b8a6'
};

export function getModeColor(mode: string): string {
  if (modeColors[mode]) return modeColors[mode];
  if (mode.startsWith('Wiki')) return '#ea580c';
  return theme.accent;
}
