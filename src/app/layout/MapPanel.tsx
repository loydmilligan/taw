import React from 'react';
import { Box, Text } from 'ink';
import type { BrainstormMap, BrainstormOpenItem } from '../../types/app.js';
import { theme } from '../theme.js';

const PANEL_WIDTH = 38;
const CONTENT_WIDTH = PANEL_WIDTH - 4; // 2 border + 2 padding

// Tag abbreviations for display
const TAG_ABBREV: Record<string, string> = {
  RESEARCH: 'R',
  VALIDATE: 'V',
  DESIGN: 'D',
  DECIDE: 'J'
};

// Only RESEARCH items are currently actionable; others are grayed out
const TAG_ACTIVE: Record<string, boolean> = {
  RESEARCH: true,
  VALIDATE: false,
  DESIGN: false,
  DECIDE: false
};

const BRAINSTORM_COLOR = '#d946ef';
const DIVIDER = '─'.repeat(CONTENT_WIDTH);

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '…';
}

function ItemRow({ item }: { item: BrainstormOpenItem }): React.JSX.Element {
  const resolved = item.status === 'resolved';
  const active = TAG_ACTIVE[item.tag] ?? false;
  const abbrev = TAG_ABBREV[item.tag] ?? item.tag[0];

  // Prefix: ✓ for resolved, · for open/in-progress. Include item ID.
  const glyph = resolved ? '✓' : item.status === 'in-progress' ? '›' : '·';
  const prefix = `${glyph} ${item.id} [${abbrev}] `;
  const maxTextLen = CONTENT_WIDTH - prefix.length;
  const displayText = truncate(item.text, maxTextLen);

  const color = resolved ? theme.success : active ? BRAINSTORM_COLOR : theme.muted;

  return (
    <Box>
      <Text color={color} dimColor={!active && !resolved}>
        {prefix}{displayText}
      </Text>
    </Box>
  );
}

interface MapPanelProps {
  map: BrainstormMap;
}

export function MapPanel({ map }: MapPanelProps): React.JSX.Element {
  const resolvedCount = map.openItems.filter((i) => i.status === 'resolved').length;
  const totalCount = map.openItems.length;
  const progressPct = totalCount > 0 ? Math.round((resolvedCount / totalCount) * 100) : 0;

  const displayTopic = truncate(map.topic, CONTENT_WIDTH);
  const displayType = truncate(map.sessionType, CONTENT_WIDTH);
  const progressLine = `${resolvedCount}/${totalCount} resolved (${progressPct}%)`;

  // Group items: RESEARCH first (active), then others (grayed)
  const researchItems = map.openItems.filter((i) => i.tag === 'RESEARCH');
  const otherItems = map.openItems.filter((i) => i.tag !== 'RESEARCH');
  const orderedItems = [...researchItems, ...otherItems];

  // Legend: only show tags that are present
  const presentTags = [...new Set(map.openItems.map((i) => i.tag))];
  const legendLines = presentTags.map((tag) => {
    const abbrev = TAG_ABBREV[tag] ?? tag[0];
    const active = TAG_ACTIVE[tag] ?? false;
    const hint =
      tag === 'RESEARCH'
        ? '/research'
        : tag === 'VALIDATE'
          ? 'validate offline'
          : tag === 'DESIGN'
            ? 'design session'
            : 'commit choice';
    return { abbrev, hint, active };
  });

  return (
    <Box
      flexDirection="column"
      width={PANEL_WIDTH}
      flexShrink={0}
      borderStyle="round"
      borderColor={BRAINSTORM_COLOR}
      paddingX={1}
    >
      {/* Header */}
      <Text color={BRAINSTORM_COLOR} bold>
        Exploration Map
      </Text>
      <Text color={theme.muted}>{DIVIDER}</Text>

      {/* Metadata */}
      <Text color={theme.muted} wrap="truncate">
        {displayTopic}
      </Text>
      <Text color={theme.muted} wrap="truncate">
        {displayType}
      </Text>
      <Text color={totalCount > 0 ? BRAINSTORM_COLOR : theme.muted}>
        {progressLine}
      </Text>
      <Text color={theme.muted}>{DIVIDER}</Text>

      {/* Open items */}
      {orderedItems.length === 0 ? (
        <Text color={theme.muted}>No items tagged yet.</Text>
      ) : (
        orderedItems.map((item) => <ItemRow key={item.id} item={item} />)
      )}

      {/* Legend */}
      {legendLines.length > 0 ? (
        <>
          <Text color={theme.muted}>{DIVIDER}</Text>
          {legendLines.map(({ abbrev, hint, active }) => (
            <Text
              key={abbrev}
              color={active ? BRAINSTORM_COLOR : theme.muted}
              dimColor={!active}
            >
              {`[${abbrev}]→ ${truncate(hint, CONTENT_WIDTH - 5)}`}
            </Text>
          ))}
        </>
      ) : null}

      {/* Toggle hint */}
      <Text color={theme.muted}>{DIVIDER}</Text>
      <Text color={theme.muted}>Ctrl+P to hide</Text>
    </Box>
  );
}
