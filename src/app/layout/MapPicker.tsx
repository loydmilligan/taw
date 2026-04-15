import React from 'react';
import { Box, Text } from 'ink';
import type { BrainstormOpenItem, MapPickerItem } from '../../types/app.js';
import { theme } from '../theme.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MapPickerAction {
  label: string;
  description: string;
  commands: string[]; // queued in order when selected
  kind: 'research' | 'wiki' | 'brainstorm' | 'general';
}

export interface MapPickerState {
  maps: MapPickerItem[];
  selectedIndex: number;
  phase: 'selecting' | 'actions';
  selectedMap: MapPickerItem | null;
  actionIndex: number;
  actions: MapPickerAction[];
}

// ─── Action builder ───────────────────────────────────────────────────────────

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + '…';
}

function topicSlug(topic: string): string {
  return topic
    .replace(/`/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join(' ');
}

export function buildActionsForMap(map: MapPickerItem): MapPickerAction[] {
  const actions: MapPickerAction[] = [];
  const slug = topicSlug(map.topic);

  const actionable = map.openItems.filter((i) => i.status !== 'resolved');

  for (const item of actionable.filter((i) => i.tag === 'RESEARCH')) {
    actions.push({
      label: `Research ${item.id} — ${truncate(item.text, 48)}`,
      description: 'Start a research session focused on this question',
      commands: [`/wiki-item ${item.id}`, `/research tech ${slug}`],
      kind: 'research'
    });
  }

  for (const item of actionable.filter((i) => i.tag !== 'RESEARCH')) {
    const verb =
      item.tag === 'DECIDE'
        ? 'Decision'
        : item.tag === 'DESIGN'
          ? 'Design'
          : 'Validate';
    actions.push({
      label: `Wiki ${item.id} [${item.tag}] — ${truncate(item.text, 44)}`,
      description: `Work through this ${verb.toLowerCase()} session`,
      commands: [`/wiki-item ${item.id}`],
      kind: 'wiki'
    });
  }

  actions.push({
    label: 'Brainstorm a related idea',
    description: `Explore a new angle on this topic  ·  Unrelated? Start a fresh session with /brainstorm`,
    commands: ['/brainstorm'],
    kind: 'brainstorm'
  });

  actions.push({
    label: 'General chat',
    description: 'Start a conversation without a specific mode',
    commands: [],
    kind: 'general'
  });

  return actions;
}

// ─── Map summary line ─────────────────────────────────────────────────────────

function itemSummary(items: BrainstormOpenItem[]): string {
  const counts: Record<string, number> = {};
  let resolved = 0;
  for (const item of items) {
    if (item.status === 'resolved') {
      resolved++;
    } else {
      counts[item.tag] = (counts[item.tag] ?? 0) + 1;
    }
  }
  const parts = Object.entries(counts).map(([tag, n]) => `${n} ${tag}`);
  if (resolved > 0) parts.push(`${resolved} done`);
  return parts.join(' · ') || 'no items';
}

// ─── Phase 1: Map selection ───────────────────────────────────────────────────

function MapSelectionPhase({
  maps,
  selectedIndex
}: {
  maps: MapPickerItem[];
  selectedIndex: number;
}): React.JSX.Element {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.accent} paddingX={1} paddingY={1} marginTop={1}>
      <Text color={theme.accent} bold>Select an Exploration Map</Text>
      <Text color={theme.muted}>↑↓ navigate · Enter select · Esc cancel</Text>
      <Box flexDirection="column" marginTop={1}>
        {maps.map((map, index) => {
          const selected = index === selectedIndex;
          const hasOpen = map.openItems.some((i) => i.status !== 'resolved');
          return (
            <Box key={map.filePath} flexDirection="column" marginBottom={1}>
              <Text color={selected ? theme.accent : theme.success}>
                {selected ? '› ' : '  '}
                {truncate(map.topic, 55)}
              </Text>
              <Text color={theme.muted}>
                {'   '}
                {map.sessionType}
                {map.created ? `  ·  ${map.created}` : ''}
                {!hasOpen ? '  ·  complete' : ''}
              </Text>
              <Text color={selected ? theme.accent : theme.muted} dimColor={!selected}>
                {'   '}
                {itemSummary(map.openItems)}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

// ─── Phase 2: Action selection ────────────────────────────────────────────────

const KIND_COLOR: Record<string, string> = {
  research: '#14b8a6',
  wiki: '#d946ef',
  brainstorm: '#d946ef',
  general: ''
};

function ActionSelectionPhase({
  map,
  actions,
  actionIndex
}: {
  map: MapPickerItem;
  actions: MapPickerAction[];
  actionIndex: number;
}): React.JSX.Element {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.accent} paddingX={1} paddingY={1} marginTop={1}>
      <Text color={theme.accent} bold>{truncate(map.topic, 60)}</Text>
      <Text color={theme.muted}>What would you like to do?</Text>
      <Text color={theme.muted}>↑↓ navigate · Enter select · Esc back</Text>
      <Box flexDirection="column" marginTop={1}>
        {actions.map((action, index) => {
          const selected = index === actionIndex;
          const color = selected ? (KIND_COLOR[action.kind] || theme.success) : theme.success;
          return (
            <Box key={action.label} flexDirection="column" marginBottom={1}>
              <Text color={color} dimColor={!selected && action.kind === 'general'}>
                {selected ? '› ' : '  '}
                {action.label}
              </Text>
              <Text color={theme.muted}>
                {'   '}
                {action.description}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

// ─── Exported component ───────────────────────────────────────────────────────

interface MapPickerProps {
  state: MapPickerState;
}

export function MapPicker({ state }: MapPickerProps): React.JSX.Element {
  if (state.phase === 'actions' && state.selectedMap) {
    return (
      <ActionSelectionPhase
        map={state.selectedMap}
        actions={state.actions}
        actionIndex={state.actionIndex}
      />
    );
  }

  return (
    <MapSelectionPhase
      maps={state.maps}
      selectedIndex={state.selectedIndex}
    />
  );
}
