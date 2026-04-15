---
phase: 05-create-a-tmux-based-tui-testing-framework-for-taw-what-playw
plan: 02
subsystem: tests/tui-harness
tags: [testing, tmux, tap, vitest, tui-harness, executor, reporter, runner]

requires:
  - phase: 05-01
    provides: [tui-harness-schema, tui-harness-assertions]

provides:
  - tui-harness-session (tmux lifecycle: createSession, killSession, sendKeys, sendKeyRaw, capturePane, waitForText, buildTawLaunchCommand, hasTmux)
  - tui-harness-executor (executeStep dispatcher for all 6 step actions)
  - tui-harness-reporter (TAP version 14 pass/fail/summary output)
  - tui-harness-runner (CLI entry: pnpm test:tui <spec> emits TAP and sets process.exitCode)

affects: [05-03-specs]

tech-stack:
  added: []
  patterns:
    - execFileSync/execFileAsync array args (prevents shell injection — no bare execSync)
    - try/finally killSession (prevents orphaned tmux sessions on failure)
    - process.exitCode not process.exit for TAP runner exit (lets event loop drain)
    - shellEscape single-quote pattern for user-supplied cwd in tmux send-keys
    - randomUUID().slice(0,8) session ID suffix for parallel-run isolation

key-files:
  created:
    - tests/tui-harness/session.ts
    - tests/tui-harness/executor.ts
    - tests/tui-harness/reporter.ts
    - tests/tui-harness/runner.ts

key-decisions:
  - "All tmux invocations use execFileSync/execFileAsync with array args — never bare execSync — satisfying T-05-04 shell injection mitigation"
  - "waitForText throws with last 800 chars of capture on timeout, matching the 600-char pattern from Wave 1 assertPane"
  - "buildTawLaunchCommand prefers dist/cli/entry.js (compiled), falls back to tsx src/cli/entry.tsx"
  - "runner.ts uses process.exitCode not process.exit(1) for test failures, letting the event loop drain cleanly"
  - "Session IDs use taw-test-<randomUUID[:8]> to prevent parallel-run collision (T-05-06)"

patterns-established:
  - "tmux-array-args: All tmux CLI calls use execFileSync('tmux', [...args]) — array prevents shell injection"
  - "finally-kill: createSession/executeSteps wrapped in try/finally that always calls killSession"
  - "tap-reporter: TAP version 14 output with reportPlanHeader/Pass/Fail/Summary helpers"

requirements-completed: [TUI-01, TUI-04]

duration: 8min
completed: 2026-04-14
---

# Phase 05 Plan 02: TUI Harness Runtime Summary

**tmux session wrappers + step executor + TAP reporter + runner CLI wiring Wave 1 schema/assertions to live tmux I/O — ready for 05-03 to feed real specs.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-14T20:55:00Z
- **Completed:** 2026-04-14T21:03:00Z
- **Tasks:** 3
- **Files modified:** 4 created + pnpm-lock.yaml updated

## Accomplishments

- Complete tmux lifecycle module with `hasTmux`, `createSession`, `killSession`, `sendKeys`, `sendKeyRaw`, `capturePane`, `waitForText`, `buildTawLaunchCommand` — all using array-arg execFileSync/execFileAsync (no shell injection surface)
- Step dispatcher (`executeStep`) covering all 6 action types (launch/type/key/wait/assert/sleep) with regex-string detection for wait patterns, shellEscape for cwd in launch steps
- TAP version 14 reporter with `reportPlanHeader`, `reportPass`, `reportFail`, `reportSummary`
- CLI runner `runner.ts` with guard exits (1=no args, 2=no tmux, 3=missing file, 99=crash), try/finally session cleanup, and `process.exitCode` for test outcomes

## Task Commits

1. **Task 1: session.ts tmux lifecycle** - `5e1f590` (feat)
2. **Task 2: executor.ts + reporter.ts** - `d2c23b0` (feat)
3. **Task 3: runner.ts CLI entry** - `3af5462` (feat)

## Files Created/Modified

- `tests/tui-harness/session.ts` — tmux lifecycle: createSession/killSession/sendKeys/sendKeyRaw/capturePane/waitForText/buildTawLaunchCommand/hasTmux
- `tests/tui-harness/executor.ts` — executeStep dispatcher for all 6 step actions; imports from session.ts and assertions.ts only (no direct child_process)
- `tests/tui-harness/reporter.ts` — TAP version 14 output helpers
- `tests/tui-harness/runner.ts` — CLI entry: arg parsing, hasTmux guard, spec parsing, per-test session lifecycle, TAP emit, exitCode

## Decisions Made

- Used `execFileSync`/`execFileAsync` with array args throughout session.ts — satisfies T-05-04 (shell injection prevention); grep gate in acceptance criteria enforces it
- `buildTawLaunchCommand` resolves paths relative to `import.meta.url` from `tests/tui-harness/session.ts`, using `../../dist/cli/entry.js` and `../../src/cli/entry.tsx`
- `runner.ts` uses `process.exitCode = N` (not `process.exit(N)`) for test pass/fail — lets event loop drain naturally, avoiding potential promise/async teardown issues
- `--keep-session` flag skips killSession cleanup for developer debugging

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed missing yaml package in worktree node_modules**
- **Found during:** Task 3 (runner.ts verification)
- **Issue:** Worktree node_modules only contained .vite directory; yaml was in main project node_modules but not available to tsx in the worktree
- **Fix:** Ran `npx pnpm install` in the worktree directory to populate node_modules including yaml@2.8.3
- **Files modified:** pnpm-lock.yaml (updated)
- **Verification:** `npx tsx tests/tui-harness/runner.ts` resolved yaml import successfully
- **Committed in:** 3af5462 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required for local CLI verification of runner.ts. No scope creep.

## Issues Encountered

- Worktree node_modules did not have the yaml package installed despite it being in devDependencies. Running `npx pnpm install` resolved it. This is expected for fresh git worktrees.

## Known Stubs

None. All 4 files are complete functional implementations. `tests/tui-harness/runner.ts` is no longer a placeholder — it is the actual runner replacing the forward-declaration from Wave 1.

## Threat Flags

None. The four files implement the mitigations documented in the plan's threat model:
- T-05-04 (shell injection): All tmux calls use execFileSync/execFileAsync array args
- T-05-05 (cwd injection): shellEscape pattern applied to step.cwd in launch branch
- T-05-06 (orphaned sessions): try/finally killSession in runner.ts per-test loop

T-05-07 and T-05-08 remain accepted-risk per plan.

## Next Phase Readiness

- `pnpm test:tui <spec.yaml>` is a working CLI ready for Wave 3 to provide real spec files
- All exports match the interfaces contract — plan 05-03 can import from session.ts, executor.ts, reporter.ts
- Typecheck passes; 112 existing tests unaffected

## Self-Check: PASSED

- tests/tui-harness/session.ts — FOUND
- tests/tui-harness/executor.ts — FOUND
- tests/tui-harness/reporter.ts — FOUND
- tests/tui-harness/runner.ts — FOUND
- Commit 5e1f590 — FOUND
- Commit d2c23b0 — FOUND
- Commit 3af5462 — FOUND

---
*Phase: 05-create-a-tmux-based-tui-testing-framework-for-taw-what-playw*
*Completed: 2026-04-14*
