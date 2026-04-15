---
phase: 05
plan: 01
subsystem: tests/tui-harness
tags: [testing, schema, zod, vitest, tui-harness]
requires: []
provides: [tui-harness-schema, tui-harness-assertions]
affects: [tests/tui-harness/schema.ts, tests/tui-harness/assertions.ts]
tech_stack:
  added: [yaml@2.8.3]
  patterns: [zod-discriminated-union, pure-predicate-testing, esm-js-imports]
key_files:
  created:
    - tests/tui-harness/schema.ts
    - tests/tui-harness/schema.test.ts
    - tests/tui-harness/assertions.ts
    - tests/tui-harness/assertions.test.ts
  modified:
    - package.json
    - pnpm-lock.yaml
decisions:
  - "Used z.discriminatedUnion('action', [...]) for StepSchema — strict exhaustive action dispatch at parse time"
  - "assertions.ts is a pure predicate module (no tmux I/O) — checkPane returns { ok, reason }, assertPane throws with Capture snippet"
  - "test:tui script is a forward-declaration pointing to Wave 2 runner.ts — fails gracefully today"
metrics:
  duration: "2 minutes"
  completed: "2026-04-15"
  tasks_completed: 3
  files_created: 4
  files_modified: 2
---

# Phase 05 Plan 01: TUI Harness Schema and Assertion Foundation Summary

**One-liner:** Zod discriminatedUnion schema for YAML test specs + pure checkPane/assertPane predicates with 18-test Vitest coverage — Wave 0 foundation with no tmux dependency.

## What Was Built

Wave 0 foundation for the tmux TUI testing framework. Four new files under `tests/tui-harness/` define the contract that downstream waves (session manager, executor, runner) will depend on. No tmux, no I/O — just typed schemas and pure predicates.

### Task 1: yaml devDependency + test:tui script
- Added `yaml@2.8.3` to devDependencies (spec parser used by Wave 2 runner)
- Added `"test:tui": "tsx tests/tui-harness/runner.ts"` script (forward-declaration — runner.ts lands in Wave 2)
- pnpm-lock.yaml updated

### Task 2: Zod schema (schema.ts + schema.test.ts)
- `StepSchema` — `z.discriminatedUnion('action', [...])` covering 6 action types: launch, type, key, wait, assert, sleep
- `TestCaseSchema` and `TestSuiteSchema` wrapping step arrays
- Exported types: `TestSuite`, `TestCase`, `Step`, `AssertStep` (Extract<Step, { action: 'assert' }>)
- 7 Vitest tests: parse success (minimal + full), unknown action rejection, missing suite field, missing text field, optional assert fields, optional timeout

### Task 3: Pure assertion predicates (assertions.ts + assertions.test.ts)
- `checkPane(pane, step)` — pure predicate returning `{ ok: boolean; reason?: string }`
- Handles: contains/matches checks, not-negation, row-scoped line selection
- `assertPane(pane, step)` — throws `Error` with `Capture:\n...` snippet (600 char tail) on failure
- 11 Vitest tests covering all 10 specified behaviors + undefined return on success
- Zero I/O, no child_process imports — fully unit-testable without tmux

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | 26310f3 | chore(05-01): add yaml@2.8.3 devDep and test:tui script placeholder |
| Task 2 | 238cb52 | test(05-01): add Zod TestSuite schema + 7-test Vitest coverage |
| Task 3 | 7b50688 | feat(05-01): implement pure checkPane/assertPane predicates + 11 Vitest tests |

## Verification

- `pnpm test tests/tui-harness/` — 2 test files, 18 tests, all green
- `pnpm test` (full suite) — 28 test files, 112 tests, all green — no regressions
- `package.json` devDependencies contains `yaml: 2.8.3`
- `package.json` scripts contains `test:tui: tsx tests/tui-harness/runner.ts`
- `pnpm-lock.yaml` contains `yaml@2.8.3`

## Deviations from Plan

None — plan executed exactly as written. All 3 tasks completed per spec with exact interface contracts from `<interfaces>` block.

## Known Stubs

None. All 4 files are fully functional implementations, not placeholders. The `test:tui` script in package.json points to a not-yet-created `runner.ts` — this is an intentional forward-declaration documented in the plan; Wave 2 creates runner.ts.

## Threat Flags

None. The schema and assertions modules introduce no new network endpoints, auth paths, or file access. The Zod discriminatedUnion satisfies T-05-01 (tamper mitigation — unknown action types are rejected at parse time). T-05-02 and T-05-03 are accepted-risk per plan.

## Self-Check: PASSED

- tests/tui-harness/schema.ts — FOUND
- tests/tui-harness/schema.test.ts — FOUND
- tests/tui-harness/assertions.ts — FOUND
- tests/tui-harness/assertions.test.ts — FOUND
- Commit 26310f3 — FOUND
- Commit 238cb52 — FOUND
- Commit 7b50688 — FOUND
