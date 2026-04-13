# 2026-04-12 PWA Share Target Sprint

## Goal

Make the bridge-hosted mobile app installable as a proper Android-targeted PWA and add real share-target support for shared URLs and text.

## Scope

In scope:

- diagnose current installability blockers
- improve manifest/service worker/app metadata for Android installability
- add manifest `share_target`
- add receive route and app bootstrap path for shared payloads
- support shared URL and shared text prefill
- update tests

Out of scope:

- iPhone/Safari-specific workarounds
- full HTTPS/tunnel deployment
- full in-app approval UX for arbitrary pending actions
- background sync

## Constraints

- Android is the only target for share target support in this pass
- keep the app inside the current bridge server for now
- preserve future ability to split the app surface from the bridge later
- local/LAN flow should still work, but real installability/share-target behavior depends on secure context

## Implementation Plan

1. Inspect current PWA app shell for installability blockers.
2. Improve manifest/service worker metadata and installability-related routes.
3. Add Android-first `share_target` support in the manifest.
4. Add routes and app logic to receive shared URL/text payloads.
5. Update tests and record verification.

## Step Status

### Step 1: Inspect installability blockers

Status: `completed`

Completion note:

- Current code already had manifest, service worker, icon, and standalone app shell.
- The likely installability blocker for Android testing is secure context, not just missing manifest fields.
- `http://127.0.0.1` is fine locally, but `http://<laptop-ip>` on LAN is generally not enough for true Android install/share-target behavior.

### Step 2: Manifest/service worker/installability cleanup

Status: `completed`

Completion note:

- Added stronger manifest fields: `id`, `scope`, `display_override`.
- Upgraded icon purpose to `any maskable`.
- Improved service worker to cache the basic app shell.
- Added an in-app warning when the app is not running in a secure context.

### Step 3: Share target support

Status: `completed`

Completion note:

- Added Android-first manifest `share_target`.
- Added `/app/share` to receive shared payloads and redirect into `/app`.
- Supported shared `url`, `text`, and `title` values via query params.

### Step 4: UX and tests

Status: `completed`

Completion note:

- App now preserves shared payloads through bootstrap/login state.
- Shared URL/text is applied into the app form after session load.
- Added bridge tests for manifest share-target metadata and `/app/share` redirect behavior.

### Step 5: Verification and handoff update

Status: `completed`

Completion note:

- Verified with typecheck and bridge tests.
- Working doc updated with final outcomes and constraints.

## Decisions

### Share target scope

Decision:

- Support Android-first shared URL/text only in this pass.

Reason:

- keeps the surface tight
- avoids file-upload and multipart complexity for the first share-target pass

### Installability messaging

Decision:

- Explicitly surface secure-context requirements in the app UI.

Reason:

- avoids false debugging loops when the real issue is LAN `http` rather than missing app metadata

## Open Questions

1. Whether to support shared files in a later pass.
2. Whether to add a documented HTTPS/tunnel recipe next for real Android install/share-target testing.

## Verification

- `corepack pnpm typecheck`
- `corepack pnpm test -- tests/bridge-server.test.ts`

## Post-Implementation Summary

- The bridge-hosted app now has Android-targeted PWA manifest/share-target support.
- Shared URL/text can be redirected into `/app` and prefilled into the current app UX.
- The app is code-ready for Android install/share target, but true installability still depends on secure context.

## Files Touched

- [src/bridge/server.ts](/home/loydmilligan/Projects/taw/src/bridge/server.ts)
- [tests/bridge-server.test.ts](/home/loydmilligan/Projects/taw/tests/bridge-server.test.ts)
- [docs/working/2026-04-12-pwa-share-target.md](/home/loydmilligan/Projects/taw/docs/working/2026-04-12-pwa-share-target.md)

## Next Steps

- Test Android install/share-target over a secure context.
- If needed, add a Cloudflare Tunnel or Tailscale-based HTTPS recipe.
- Decide whether to support shared files and richer in-app approval UX next.

## Follow-Up Addendum

Date: `2026-04-12`

### Goal

- tighten Android install/share-target compatibility after first real-device testing
- improve wiki ingest end-of-run summaries so they report created vs updated note totals

### Changes

- Added concrete Android-friendly PNG manifest icons at `192x192` and `512x512` in addition to the SVG icon.
- Added bridge routes that serve those PNG icons directly.
- Updated the service worker shell cache to include the PNG icons.
- Tightened wiki ingest prompts so the final summary starts with totals for notes created and notes updated.

### Reasoning

- The first share-target pass only exposed an SVG icon. Android Chrome install/share-target behavior is stricter than “site can be installed,” so concrete PNG icon entries are a safer manifest shape.
- The ingest flow already returns per-write `created` vs `updated` metadata, so the model prompt should explicitly ask for totals instead of relying on a vague summary.

### Verification

- `corepack pnpm test -- tests/bridge-server.test.ts tests/wiki-command.test.ts`
