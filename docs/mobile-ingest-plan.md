# Mobile Ingest Plan

## Current Shortcut

The implemented shortcut is a small mobile-friendly bridge page:

- `GET /mobile?token=<bridge-token>`
- paste a URL
- choose an existing wiki topic or enter a new one
- optionally add a note
- optionally auto-run ingest

Server behavior:

- fetch the pasted URL on the bridge host
- extract a title and readable text excerpt
- write a bridge markdown source file
- queue `/wiki ingest <topic> <source-file>`

This is the fastest workable path and should be tested first.

## Better Version

The better version is a proper installable mobile capture app with share support.

## Goals

- open directly from the phone home screen
- receive shared URLs from mobile browsers/apps
- support URL capture, text capture, and later image/file capture
- optionally show recent jobs and ingest status
- keep auth and LAN exposure safe

## Phase 1: PWA Shell

- add a manifest
- add service-worker support
- make `/mobile` installable
- add a stronger landing page with saved bridge URL and topic defaults

Outcome:

- home-screen app feel without relying on browser tabs

## Phase 2: Share Target

- implement Web Share Target support in the manifest
- accept shared URLs into the same ingest form
- prefill note text if the share payload includes text

Expected caveat:

- Android support is better than iPhone support
- Safari/iOS share-target support is limited and should be treated as best-effort

## Phase 3: Auth Cleanup

The shortcut version uses `?token=...` in the mobile URL to bootstrap the page.

The better version should replace that with one of:

- short-lived signed session link
- bridge-issued login session stored in cookie/local storage
- optional LAN-only auth plus QR bootstrap

Recommended direction:

- keep bridge token as the root secret
- add a one-time bootstrap page that exchanges it for a short-lived session cookie

## Phase 4: Capture Modes

Support multiple mobile capture modes:

- URL only
- URL + note
- pasted text
- pasted markdown
- later: uploaded file or image

Recommended UI:

- tabs or segmented control for `Link`, `Text`, `File`

## Phase 5: Job UX

Add mobile status pages:

- recent ingest jobs
- running/completed/failed status
- direct links to queued source file paths and topic names

This matters more once mobile capture becomes frequent.

## Phase 6: Better Extraction

The shortcut version uses a lightweight readable-text extraction.

The better version should consider:

- readability extraction
- article/main-content heuristics
- content-type-specific handling
- title normalization
- domain-specific filters

## Phase 7: Research Mode Support

Right now the shortcut is wiki-ingest oriented.

The better version should optionally support:

- send to research
- send to wiki
- send to both

## Security Requirements

Before widening usage, keep these constraints:

- default bridge host remains `127.0.0.1`
- LAN exposure should require deliberate `TAW_BRIDGE_HOST=0.0.0.0`
- document that users should not expose the bridge publicly
- prefer short-lived session auth before adding richer mobile capabilities

## Recommendation

Test the shortcut first.

If the flow is good enough, the next implementation order should be:

1. installable PWA shell
2. better auth/session bootstrap
3. share target
4. richer capture modes
5. job history/status UX
