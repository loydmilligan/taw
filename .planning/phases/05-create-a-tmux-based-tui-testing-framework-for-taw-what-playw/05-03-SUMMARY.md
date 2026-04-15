---
phase: 05
plan: 03
subsystem: tests/tui-specs, tests/tui-harness
tags: [testing, yaml, tui-harness, smoke, docs]
requires:
  - phase: 05-01
    provides: [tui-harness-schema, tui-harness-assertions]
  - phase: 05-02
    provides: [tui-harness-session, tui-harness-executor, tui-harness-reporter, tui-harness-runner]
provides:
  - tui-specs (smoke, commands, mode-transitions YAML specs)
  - tui-harness-docs (README with full contributor on-ramp)
affects:
  - tests/tui-specs/smoke.yaml
  - tests/tui-specs/commands.yaml
  - tests/tui-specs/mode-transitions.yaml
  - tests/tui-harness/README.md
tech_stack:
  added: []
  patterns:
    - header-anchor-assertions (TAW , Mode General, State General, Phase idle from Header.tsx)
    - keyless-specs (no provider key required; /brainstorm sets mode synchronously)
    - qa-fixtures/tui-harness-empty for non-project-mode launches
key_files:
  created:
    - qa-fixtures/tui-harness-empty/.gitkeep
    - tests/tui-specs/smoke.yaml
    - tests/tui-specs/commands.yaml
    - tests/tui-specs/mode-transitions.yaml
    - tests/tui-harness/README.md
  modified: []
decisions:
  - "smoke.yaml uses only Header.tsx anchors verified from source (TAW , Mode General, State General, Phase idle)"
  - "help.ts title string 'Command Help' used as /help assertion anchor — sourced directly from createHelpCommand return value"
  - "/brainstorm is keyless at mode-entry time (sets mode: Brainstorm synchronously; provider call only queued after user sends text)"
  - "dist/ remains gitignored; pnpm build run locally to populate dist/cli/entry.js for faster test execution"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-14"
  tasks_completed: 3
  files_created: 5
  files_modified: 0
status: CHECKPOINT-PENDING
---

# Phase 05 Plan 03: TUI Test Specs + README Summary

**STATUS: DRAFT — Tasks 1-3 complete; Task 4 (human-verify checkpoint) pending.**

**One-liner:** Three runnable YAML spec files (smoke/commands/mode-transitions) + harness README — Wave 3 closes the Phase 5 loop, pending live TAP verification.

## What Was Built

Wave 3 completes the TUI harness by providing real, runnable spec files and contributor documentation. The specs are authored against verified text anchors from `src/app/layout/Header.tsx` and `src/commands/help.ts` — no placeholder strings remain.

### Task 1: Build TAW + author smoke.yaml

- `pnpm build` (npm run build) compiled `dist/cli/entry.js` so runner takes the fast path
- Created `qa-fixtures/tui-harness-empty/.gitkeep` — sandboxed fixture dir for non-project-mode launches (State General)
- Created `tests/tui-specs/smoke.yaml` with two tests:
  - `launches in general mode` — waits for TAW header anchors (TAW , Mode General, State General, Phase idle), then /exit
  - `exits cleanly on /exit` — fresh session, launch, /exit, assert not thinking

### Task 2: Author commands.yaml and mode-transitions.yaml

- `tests/tui-specs/commands.yaml`: types `/help`, waits for `Command Help` (the title from `createHelpCommand` in help.ts), asserts it
- `tests/tui-specs/mode-transitions.yaml`: types `/brainstorm`, waits for `Mode Brainstorm`, asserts header updated — fully keyless because mode changes synchronously before any provider call

### Task 3: Author tests/tui-harness/README.md

- All 8 required headings present: Prerequisites, Running, Spec format, Adding a new spec, Relation to the headless runner, CI, Troubleshooting
- `pnpm test:tui` referenced 4 times; `tmux` referenced 11 times
- Documents exit codes (0=pass, 1=fail, 2=no tmux, 3=missing file)
- Explains `--keep-session` debug flag and tmux attach
- Distinguishes TUI layer vs logic layer (`--queued-inputs-file` headless runner)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | 3277570 | feat(05-03): build TAW + author smoke.yaml with two verified tests |
| Task 2 | 7609fdd | feat(05-03): author commands.yaml and mode-transitions.yaml specs |
| Task 3 | faf2430 | docs(05-03): add tests/tui-harness/README.md usage documentation |

## Verification (automated)

- `dist/cli/entry.js` exists (built, gitignored) — PASSED
- `qa-fixtures/tui-harness-empty/.gitkeep` exists — PASSED
- `tests/tui-specs/smoke.yaml` parses: suite=smoke, tests=2 — PASSED
- `tests/tui-specs/commands.yaml` parses: suite=commands, tests=1 — PASSED
- `tests/tui-specs/mode-transitions.yaml` parses: suite=mode-transitions, tests=1 — PASSED
- No OPENROUTER/ANTHROPIC_API_KEY/research keys in specs — PASSED
- `tests/tui-harness/README.md` contains all required headings — PASSED
- `pnpm test:tui` count >= 3: actual=4 — PASSED
- `tmux` count >= 5: actual=11 — PASSED

## Verification (pending — Task 4 human checkpoint)

Task 4 requires live tmux execution against real TAW. The following checks must pass:

1. `pnpm test:tui tests/tui-specs/smoke.yaml` → TAP 2/2 ok, exit 0
2. `tmux ls 2>&1 | grep -c taw-test-` → 0 (no orphans)
3. `pnpm test:tui tests/tui-specs/commands.yaml` → TAP 1/1 ok, exit 0
4. `pnpm test:tui tests/tui-specs/mode-transitions.yaml` → TAP 1/1 ok, exit 0

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] npm used instead of pnpm for build**

- **Found during:** Task 1
- **Issue:** `pnpm` is not installed in the worktree shell environment; `pnpm` command not found
- **Fix:** Used `npm run build` which invokes the same TypeScript compiler script
- **Files modified:** package-lock.json added (npm artifact, committed alongside qa-fixtures)
- **Impact:** None — same tsc compilation, same dist/cli/entry.js output

**2. [Rule 3 - Blocking] node_modules missing yaml in worktree**

- **Found during:** Task 1 verification
- **Issue:** yaml package not available in worktree node_modules for CJS require() verification
- **Fix:** Ran `npm install` in worktree to populate node_modules
- **Files modified:** package-lock.json (already staged)
- **Impact:** None — development environment only, yaml is already in devDependencies

## Known Stubs

None. All specs use real anchor strings sourced directly from Header.tsx and help.ts implementations. No placeholder text remains.

## Threat Flags

None. T-05-09 (Zod validation of spec files) is satisfied — all three specs are validated by schema.ts at parse time. T-05-10 (README information disclosure) is accepted risk per plan.

## Self-Check

- qa-fixtures/tui-harness-empty/.gitkeep — FOUND
- tests/tui-specs/smoke.yaml — FOUND
- tests/tui-specs/commands.yaml — FOUND
- tests/tui-specs/mode-transitions.yaml — FOUND
- tests/tui-harness/README.md — FOUND
- Commit 3277570 — FOUND
- Commit 7609fdd — FOUND
- Commit faf2430 — FOUND

**Self-Check: PASSED (for auto tasks 1-3)**

Note: Full self-check pending Task 4 live verification.
