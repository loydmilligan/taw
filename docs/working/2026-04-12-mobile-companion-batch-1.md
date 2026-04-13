# 2026-04-12 Mobile Companion Batch 1

## Goal

Turn the installed Android PWA from a capture-only surface into a lightweight TAW companion with four useful first features:

- `Ask TAWD`
- `Actions`
- `Recent Status`
- `Topics`

## Scope

In scope:

- add app-backed session/runtime state so the mobile app can run lightweight TAW interactions
- add `Actions` with initial categories:
  - `Pending Review`
  - `Pending Intake`
- add `Recent Status` for background jobs and lightweight session state
- add `Ask TAWD` for short mobile chat requests
- add `Topics` with three actions:
  - summarize
  - research seeds
  - analysis
- update bridge tests

Out of scope:

- full multi-turn desktop-equivalent remote chat UX
- mobile artifact browsing
- arbitrary command execution from mobile
- push notifications for background completion
- file sharing into the app beyond current share-target URL/text support

## Constraints

- keep the app inside the current bridge server
- prefer reuse of existing wiki/research/confirm/cancel flows over new parallel systems
- keep the UI mobile-first and low-friction
- avoid risky deep refactors in the terminal app to support the phone app

## Implementation Plan

1. Add app runtime/session state for mobile interactions.
2. Add backend APIs for `Actions` and `Recent Status`.
3. Add backend API for `Ask TAWD`.
4. Add backend APIs for `Topics` summarize, research seeds, and analysis.
5. Update the `/app` UI to expose the four-feature batch.
6. Add tests and verification.

## Step Status

### Step 1: Add app runtime/session state

Status: `completed`

Completion note:

- The bridge-backed app session now lazily boots a real TAW `AppState` after unlock.
- Mobile APIs can now reuse the existing command/chat/runtime stack instead of inventing a parallel app-only state model.

### Step 2: Add `Actions` and `Recent Status`

Status: `completed`

Completion note:

- Added app APIs for `Actions` and `Recent Status`.
- `Actions` now exposes:
  - `Pending Review` from wiki frontmatter-backed pending link review / index counts
  - `Pending Intake` from staged session-scoped ingest/review confirmations
- `Recent Status` now shows app session info, queued input count, research source count, and recent background jobs.

### Step 3: Add `Ask TAWD`

Status: `completed`

Completion note:

- Added a lightweight `Ask TAWD` API that runs a normal TAW assistant turn from the mobile app.
- The result is added to the app session transcript so follow-on mobile actions stay in one session context.

### Step 4: Add `Topics`

Status: `completed`

Completion note:

- Added `Topics` support with:
  - summarize
  - research seeds
  - analysis against a selected note plus required question
- Topic notes are listed dynamically from the wiki so the analysis action can target an actual note.

### Step 5: Update app UI

Status: `completed`

Completion note:

- Reworked `/app` into a multi-panel mobile companion UI.
- Existing capture flow remains available.
- Added panels for:
  - `Ask TAWD`
  - `Actions`
  - `Recent Status`
  - `Topics`

### Step 6: Tests and verification

Status: `completed`

Completion note:

- Added a focused bridge test for app action/status reporting.
- Verified with typecheck and bridge tests.

## Decisions

### Feature naming

Decision:

- use `Ask TAWD`, `Actions`, `Recent Status`, and `Topics`

Reason:

- these match the user’s intended mental model better than terminal-centric names like `Pending Actions` or `Wiki Query`

### First action categories

Decision:

- use `Pending Review` and `Pending Intake`

Reason:

- both map directly to workflows that already exist in TAW state today:
  - link review / reindex review
  - pending wiki ingest preview

## Open Questions

1. Whether `Ask TAWD` should stay single-turn only in the first pass or preserve chat history in the app session transcript.
2. Whether `Topics` research seeds should store discovered search results in research sources by default or remain read-only.
3. Whether mobile actions beyond confirm/cancel should be added immediately after this batch.

## Verification

- `corepack pnpm typecheck`
- `corepack pnpm test -- tests/bridge-server.test.ts`

## Post-Implementation Summary

- The Android PWA now acts as a lightweight mobile companion instead of only a capture form.
- It keeps source capture, adds a small app-session-backed `Ask TAWD` surface, exposes review/intake actions, shows recent status, and lets the user operate against wiki topics directly.
- The first `Topics` pass is intentionally pragmatic:
  - summarize uses wiki query context
  - research seeds blend wiki context with local search-backed source discovery
  - analysis requires both a selected note and a user question

## Files Touched

- [src/bridge/server.ts](/home/loydmilligan/Projects/taw/src/bridge/server.ts)
- [tests/bridge-server.test.ts](/home/loydmilligan/Projects/taw/tests/bridge-server.test.ts)
- [docs/working/2026-04-12-mobile-companion-batch-1.md](/home/loydmilligan/Projects/taw/docs/working/2026-04-12-mobile-companion-batch-1.md)

## Next Steps

- test the companion panels on Android over the secure tunnel
- decide whether `Ask TAWD` should become explicitly multi-turn in the UI
- decide whether to add richer mobile approval flows beyond confirm/cancel
