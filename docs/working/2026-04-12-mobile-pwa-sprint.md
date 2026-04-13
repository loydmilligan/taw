# 2026-04-12 Mobile PWA Sprint

## Goal

Add a usable mobile ingestion path for TAW, starting with a fast shortcut and then extending it into a bridge-hosted installable app for wiki and research ingestion.

## Scope

Included in this sprint:

- frontmatter-based wiki operational state for link review and re-index
- link review apply/cancel flow
- re-index apply/cancel flow
- mobile shortcut ingest page
- bridge-hosted PWA-style app shell
- research inbox capture from phone
- session bootstrap for the app
- notification to phone via ntfy for testing

Not included in this sprint:

- full Web Share Target integration
- remote live session companion UX
- real `research inbox` core taxonomy expansion
- scheduled background jobs/systemd wiring
- full HTTPS/tunnel deployment workflow

## Constraints

- keep the bridge and app together for now
- keep the architecture modular enough to split later
- prefer existing queue/bridge/session patterns over parallel mechanisms
- default to LAN/local usage, but do not hard-block future HTTPS/tunnel support
- keep wiki and research as distinct modes even if they later share storage patterns

## Implementation Plan

1. Move wiki maintenance state from session-local tracking to note-local frontmatter.
2. Add `link_review_status` and `index_status` lifecycle handling.
3. Implement staged re-index flow based on pending note frontmatter.
4. Build a quick mobile-friendly bridge page for URL-based wiki ingest.
5. Extend that into an installable `/app` shell with wiki and research inbox modes.
6. Add app bootstrap auth and cookie-backed app sessions.
7. Add testing and phone test notification.

## Step Status

### Step 1: Frontmatter-based wiki maintenance state

Status: `completed`

Completion note:

- Replaced session-local “recent writes” dependency with note-local frontmatter.
- Added operational fields:
  - `link_review_status`
  - `link_reviewed_at`
  - `index_status`
  - `indexed_at`
- Backfilled the live `vibecoding` vault.

### Step 2: Link review flow

Status: `completed`

Completion note:

- `/wiki links <topic>` now finds pending notes by frontmatter.
- `/confirm` applies staged link review.
- `/cancel` discards staged link review.

### Step 3: Re-index flow

Status: `completed`

Completion note:

- Added `/wiki reindex <topic>`.
- Rebuilds `index.md` from note frontmatter when notes have `index_status: pending`.
- `/confirm` applies the rebuilt index and marks notes indexed.
- `/cancel` discards the staged re-index.

### Step 4: Mobile shortcut page

Status: `completed`

Completion note:

- Added `/mobile?token=<bridge-token>`.
- Mobile page can:
  - paste URL
  - select wiki topic
  - add note
  - auto-run ingest
- Bridge fetches the page and extracts a simple readable excerpt before queueing wiki ingest.

### Step 5: PWA-style app shell

Status: `completed`

Completion note:

- Added `/app`.
- App has two modes:
  - `Wiki`
  - `Research Inbox`
- Added preview-before-submit flow with confirm/cancel.
- Added manifest, service worker, and vector icon.

### Step 6: App bootstrap auth

Status: `completed`

Completion note:

- Added `/app/bootstrap?token=<bridge-token>` for one-time bootstrap.
- Added `/app/api/bootstrap` for token exchange.
- App uses cookie-backed sessions after bootstrap.

### Step 7: Testing and phone notification

Status: `completed`

Completion note:

- Added/updated tests for bridge app flows and wiki maintenance flows.
- Sent ntfy notification to `https://ntfy.mattmariani.com/agent-chat` with phone testing instructions.

## Decisions

### Research inbox mapping

Decision:

- The app presents a single `Research Inbox` mode.
- Under the hood it maps into the existing `tech` research path for now.

Reason:

- avoids widening core research taxonomy during this sprint
- keeps the mobile UX simple

### Bridge/app packaging

Decision:

- Keep the app inside the current bridge server for now.

Reason:

- faster delivery
- reuses queueing/auth/status infrastructure
- still separable later if needed

### Mobile approvals

Decision:

- For this sprint, the app focuses on ingestion and preview-confirm submission.
- Bridge-level `/confirm` and `/cancel` support already exists in TAW, but full in-app approval UX for arbitrary pending actions is still a later step.

Reason:

- kept this sprint bounded

## Open Questions

1. Should `research inbox` become a first-class research type later?
2. Should mobile app expose generic pending action approval UI next?
3. Should the bridge get systemd/scheduler support before or after full share-target support?
4. Should wiki and research eventually share a common Obsidian-backed storage pattern while remaining mode-separated?

## Verification

Verified during the sprint with:

- `corepack pnpm typecheck`
- `corepack pnpm test -- tests/wiki-link-review.test.ts tests/wiki-preview-flow.test.ts tests/wiki-command.test.ts`
- `corepack pnpm test -- tests/wiki-reindex.test.ts tests/wiki-link-review.test.ts tests/wiki-preview-flow.test.ts tests/wiki-command.test.ts`
- `corepack pnpm test -- tests/bridge-server.test.ts`

Observed live vault checks:

- `vibecoding` vault backfilled with operational frontmatter
- no pending `link_review_status`
- no pending `index_status`

## Post-Implementation Summary

### Wiki maintenance outcome

- Wiki maintenance is now durable across sessions because state lives in note frontmatter.
- Link review and re-index are both staged and confirmable.

### Mobile ingestion outcome

- There is now a working shortcut path for mobile wiki ingestion.
- There is also a more polished `/app` route that supports both wiki and research inbox capture.

### Security/auth outcome

- Raw bridge token can now be used once for app bootstrap instead of being required in every app request.
- The bridge still defaults to local-only binding unless `TAW_BRIDGE_HOST` is explicitly changed.

## Files Touched

Primary files from this sprint:

- [src/services/wiki/frontmatter.ts](/home/loydmilligan/Projects/taw/src/services/wiki/frontmatter.ts)
- [src/services/wiki/link-review.ts](/home/loydmilligan/Projects/taw/src/services/wiki/link-review.ts)
- [src/services/wiki/reindex.ts](/home/loydmilligan/Projects/taw/src/services/wiki/reindex.ts)
- [src/services/wiki/pending-index-review.ts](/home/loydmilligan/Projects/taw/src/services/wiki/pending-index-review.ts)
- [src/commands/wiki.ts](/home/loydmilligan/Projects/taw/src/commands/wiki.ts)
- [src/commands/confirm.ts](/home/loydmilligan/Projects/taw/src/commands/confirm.ts)
- [src/commands/cancel.ts](/home/loydmilligan/Projects/taw/src/commands/cancel.ts)
- [src/bridge/server.ts](/home/loydmilligan/Projects/taw/src/bridge/server.ts)
- [src/cli/bridge.ts](/home/loydmilligan/Projects/taw/src/cli/bridge.ts)
- [tests/wiki-link-review.test.ts](/home/loydmilligan/Projects/taw/tests/wiki-link-review.test.ts)
- [tests/wiki-reindex.test.ts](/home/loydmilligan/Projects/taw/tests/wiki-reindex.test.ts)
- [tests/bridge-server.test.ts](/home/loydmilligan/Projects/taw/tests/bridge-server.test.ts)
- [docs/mobile-ingest-plan.md](/home/loydmilligan/Projects/taw/docs/mobile-ingest-plan.md)
- [docs/HISTER_README.md](/home/loydmilligan/Projects/taw/docs/HISTER_README.md)

## Next Steps

Recommended next steps after this sprint:

1. manual phone testing of `/app` and `/mobile`
2. commit the ready implementation state
3. repo/docs cleanup updates
4. second commit for docs/repo cleanup if desired
5. decide whether to build:
   - systemd/scheduled bridge and maintenance jobs
   - Web Share Target
   - mobile approval UI
   - true research inbox type
