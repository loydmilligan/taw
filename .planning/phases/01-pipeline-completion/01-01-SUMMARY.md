---
phase: 01-pipeline-completion
plan: "01"
subsystem: map-file-parsing
tags: [refactor, parser-consolidation, map-commands]
dependency_graph:
  requires: []
  provides: [canonical-map-parser-in-load-map, canonical-map-parser-in-app]
  affects: [src/commands/load-map.ts, src/app/App.tsx]
tech_stack:
  added: []
  patterns: [shared-parser, readMapFile, mapDataToBrainstormMap]
key_files:
  modified:
    - src/commands/load-map.ts
    - src/app/App.tsx
decisions:
  - "Use static import for readMapFile in App.tsx rather than dynamic import — avoids async module loading overhead and follows project import conventions"
  - "Keep scanAllMaps function in load-map.ts rather than delegating to findMapFilePath from map-file.ts — scanAllMaps returns MapPickerItem[] (list) while findMapFilePath returns a single path; different semantics"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-15"
  tasks_completed: 2
  files_modified: 2
requirements: [MAP-06]
---

# Phase 01 Plan 01: Parser Consolidation — readMapFile Only Summary

One-liner: Consolidated map file parsing so readMapFile from map-file.ts is the single canonical parser, replacing broken private parsers in load-map.ts and the inline regex parser in App.tsx selectPickerMap.

## What Was Built

Two files were modified to eliminate duplicate/broken map file parsers:

1. **src/commands/load-map.ts** — Removed `parseMapFile` and `parseMapPickerItem` private functions (which missed optional `wikiArtifact` and `spawnedFrom` fields). All call sites now use `readMapFile` + `mapDataToBrainstormMap` from `map-file.ts`. The direct-path load, single-map auto-load, and picker scan all use the canonical parser.

2. **src/app/App.tsx** — Removed inline regex YAML parser (with `fmMatch`, `itemRegex`) from `selectPickerMap`. Added static import of `readMapFile` and `mapDataToBrainstormMap` from `../commands/map-file.js`. The function body is now 5 lines instead of 26.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Replace private parsers in load-map.ts | d3e5742 | src/commands/load-map.ts |
| 2 | Replace inline parser in App.tsx selectPickerMap | 7c73f77 | src/app/App.tsx |

## Deviations from Plan

### Setup: Copied in-progress files to worktree

**Found during:** Task 1 setup (worktree base reset)

**Issue:** The worktree was reset to commit 92713c5 (the planning initialization commit), but the target files (`load-map.ts`, `map-file.ts`, `App.tsx` with MapPicker support, etc.) only existed as unstaged working-tree modifications and untracked files in the main repo. The worktree had neither the new files nor the in-progress modifications.

**Fix:** Copied all in-progress files from the main repo working tree into the worktree before beginning task execution. This included: `map-file.ts`, `load-map.ts`, the modified `App.tsx`, `MapPanel.tsx`, `MapPicker.tsx`, all wiki commands, modified `registry.ts`, `types.ts`, `bootstrap.ts`, and `app.ts`. These were staged and committed as part of Task 1 so the TypeScript build would pass.

**Files modified:** All files listed in `key_files.modified` plus 13 supporting files staged to establish baseline

**Commit:** d3e5742 (includes baseline files in the first task commit)

None — plan executed as specified once baseline was established.

## Verification Results

- `pnpm tsc --noEmit` (via `npx tsc --noEmit`): PASSED — 0 errors
- `grep -c "parseMapFile|parseMapPickerItem" src/commands/load-map.ts`: 0
- `grep -c "readMapFile" src/commands/load-map.ts`: 4 (import + 3 call sites)
- `grep -c "readMapFile" src/app/App.tsx`: 2 (import + call in selectPickerMap)
- `grep -c "fmMatch|itemRegex" src/app/App.tsx`: 0 — inline parser fully removed
- No parsing logic outside `map-file.ts` confirmed

## Known Stubs

None — no placeholder data or stub patterns introduced.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries introduced. All `readMapFile` calls are wrapped in try/catch per the threat model (T-01-01).

## Self-Check: PASSED

- src/commands/load-map.ts: FOUND
- src/app/App.tsx: FOUND
- Commit d3e5742: FOUND
- Commit 7c73f77: FOUND
