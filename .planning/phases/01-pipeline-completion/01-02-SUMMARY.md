---
phase: 01-pipeline-completion
plan: 02
subsystem: testing
tags: [vitest, wiki, map-file, brainstorm, commands]

# Dependency graph
requires:
  - phase: []
    provides: "Five wiki pipeline commands (wiki-add-research, wiki-finalize-item, wiki-resolve-item, wiki-save-item, wiki-item) plus map-file.ts shared utilities"
provides:
  - "Vitest test suite (23 tests) for all five wiki pipeline commands"
  - "Bug fix: map-file.ts itemBlockRegex now correctly parses multiple YAML list items"
  - "All new commands (wiki-*, map-file, load-map, save-map) committed to repo"
affects:
  - "01-pipeline-completion"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wiki command pattern: findMapFilePath → null guard → try/catch readMapFile → map-file helper mutation"
    - "Test pattern: mkdtemp + createSession + fixture map file + CommandContext construction"

key-files:
  created:
    - src/commands/wiki-add-research.ts
    - src/commands/wiki-finalize-item.ts
    - src/commands/wiki-resolve-item.ts
    - src/commands/wiki-save-item.ts
    - src/commands/wiki-item.ts
    - src/commands/map-file.ts
    - src/commands/load-map.ts
    - src/commands/save-map.ts
    - tests/wiki-pipeline-commands.test.ts
  modified:
    - src/types/app.ts
    - src/commands/types.ts
    - src/commands/registry.ts
    - src/cli/bootstrap.ts
    - src/commands/map-file.ts (bug fix to itemBlockRegex)

key-decisions:
  - "wiki-finalize-item queues inputs (generation prompt + wiki-save-item) rather than directly mutating the map — mutation happens when wiki-save-item runs"
  - "Tests use real createSession + temp filesystem rather than deep mocks, providing higher confidence in end-to-end behavior"
  - "Fixed itemBlockRegex lookahead bug in map-file.ts (\\n- id: → \\n\\s*- id:) to correctly parse indented YAML list items"

patterns-established:
  - "Wiki commands: all mutations go through map-file.ts helpers (updateMapItem, appendMapItem), never direct writeFile"
  - "Error handling: all expected failure paths return CommandResult with error entry, no thrown exceptions to caller"
  - "Test fixture: YAML frontmatter with open_items array, createSession to get real SessionRecord, map file placed in session.artifactsDir ending in -data.md"

requirements-completed: [WIKI-01, WIKI-02, WIKI-03, WIKI-04, WIKI-05, TEST-02]

# Metrics
duration: 35min
completed: 2026-04-14
---

# Phase 01 Plan 02: Wiki Pipeline Commands Audit and Test Coverage Summary

**23-test Vitest suite covering five wiki pipeline commands with a map-file.ts parser bug fix that silently dropped all items after the first**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-04-14T20:00:00Z
- **Completed:** 2026-04-14T20:07:00Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments

- Added all five wiki pipeline commands (wiki-add-research, wiki-finalize-item, wiki-resolve-item, wiki-save-item, wiki-item) and supporting map-file.ts utilities to the repo
- Created 23-test Vitest suite in `tests/wiki-pipeline-commands.test.ts` covering happy paths and error/not-found paths for every command
- Fixed a silent parsing bug in `map-file.ts` where `itemBlockRegex` used `\n- id:` as a lookahead but YAML uses `\n  - id:` (indented), causing all items after the first to be silently swallowed into the first item's block match

## Task Commits

1. **Task 1: Audit and fix five wiki commands** - `e74d04a` (feat)
2. **Task 2: Add Vitest suite for five wiki pipeline commands** - `2f3f41b` (test)

## Files Created/Modified

- `src/commands/wiki-add-research.ts` - Command to add RESEARCH items to map, with optional --from parent-id link
- `src/commands/wiki-finalize-item.ts` - Command to queue generation prompt + wiki-save-item for DECIDE/DESIGN/VALIDATE items
- `src/commands/wiki-resolve-item.ts` - Command to mark items resolved via updateMapItem
- `src/commands/wiki-save-item.ts` - Command to save last assistant message as artifact and mark item resolved
- `src/commands/wiki-item.ts` - Command to open a work session for a specific map item
- `src/commands/map-file.ts` - Shared read/write utilities: readMapFile, updateMapItem, appendMapItem, findMapFilePath, nextItemId (bug fix applied)
- `src/commands/load-map.ts` - Command to load/select a map file
- `src/commands/save-map.ts` - Command to save current brainstorm map to disk
- `src/types/app.ts` - Added BrainstormOpenItem, BrainstormMap, OpenItemTag, MapPickerItem types
- `src/commands/types.ts` - Updated CommandDefinition.run signature
- `src/commands/registry.ts` - Registered new map/wiki commands
- `src/cli/bootstrap.ts` - Added brainstormMap: null to initial AppState
- `tests/wiki-pipeline-commands.test.ts` - 23-test Vitest suite (new)

## Decisions Made

- wiki-finalize-item uses `queuedInputs` pattern (not direct map mutation) — the generation prompt runs first, then wiki-save-item does the actual artifact write and status update. Tests verified this by checking `queuedInputs[1] === '/wiki-save-item oi-001'`.
- Tests use real `createSession` and temp filesystem rather than deep mocks — this validates findMapFilePath search behavior (looking for `-data.md` in session.artifactsDir) and actual file write/read round-trips.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed map-file.ts itemBlockRegex silent multi-item parse failure**
- **Found during:** Task 2 (writing test suite, tests were failing with 1 item when fixture had 2)
- **Issue:** The regex lookahead `/- id:\s*(\S+)\n([\s\S]*?)(?=\n- id:|\n---|\n$|$)/g` used `\n- id:` as the boundary between items. But YAML list items are written as `\n  - id:` (with 2 leading spaces from indentation). The lookahead never matched, so item 1's lazy `[\s\S]*?` consumed everything including item 2, leaving item 2 unmatched.
- **Fix:** Changed lookahead from `\n- id:` to `\n\s*- id:` to handle any indentation level.
- **Files modified:** `src/commands/map-file.ts` (line 46)
- **Verification:** All 23 tests pass; `readMapFile` now correctly returns 2 items from the fixture that has 2 open_items entries.
- **Committed in:** `2f3f41b` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** Critical fix — without it, all wiki commands that read the map would silently see only the first item, causing "item not found" errors for all subsequent items. No scope creep.

## Issues Encountered

- The worktree was reset to base commit (92713c5 "docs: initialize project"), which didn't have the wiki command files. These existed only as untracked files in the main repo's working directory. All necessary files were copied from the main repo before auditing and testing.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None - all commands operate on real file system data via map-file.ts helpers.

## Next Phase Readiness

- All five wiki commands have automated test coverage (happy path + at least one failure path)
- map-file.ts parsing is now correct for multi-item maps
- TEST-02 requirement satisfied
- Ready for plan 01-03 (map finalization step / pipeline integration)

---
*Phase: 01-pipeline-completion*
*Completed: 2026-04-14*
