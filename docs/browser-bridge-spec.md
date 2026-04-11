# Browser Bridge Spec

Applies to baseline `0.1.0-beta.4`.

## Goal

Allow a browser extension to hand web context into TAW, either by appending context to an existing research session or by launching a new terminal session with the initial research command already prepared.

## Core idea

The browser extension is a capture and handoff tool.

It should not:

- replicate TAW
- implement research logic
- become a sync-heavy state manager

It should:

- capture page metadata and selected text
- send a structured payload to a local bridge
- optionally request that TAW starts a new session

## MVP extension actions

- `Send Page to TAW`
- `Send Selection to TAW`
- `Start New TAW Research Session`

Later action:

- `Append to Current TAW Session`

## Payload shape

Suggested payload:

```json
{
  "kind": "article",
  "researchType": "politics",
  "url": "https://example.com/story",
  "title": "Example Story",
  "selectedText": "optional selected text",
  "pageTextExcerpt": "optional visible-page text extract",
  "userNote": "optional note from the extension popup",
  "sentAt": "2026-04-07T20:00:00.000Z"
}
```

Additional kinds:

- `repo`
- `video`

## Local bridge

Implemented MVP:

- a localhost-only bridge process
- `127.0.0.1` only
- authenticated with a local token

Endpoints:

- `POST /session/new-research`
- `GET /health`
- `GET /search-backend/status`
- `POST /search-backend/start`
- `POST /search-backend/stop`
- `POST /search-backend/touch`

Later endpoint:

- `POST /session/append-context`

Responsibilities:

- validate token
- validate payload shape
- write temporary payload file if needed
- launch or target TAW
- expose helper-service controls for local research infrastructure

## Helper-service stack

The bridge should remain a local user-space process.

Helper services should live in a separate compose stack so heavier tools can be started only when needed.

Initial service:

- SearXNG in `infra/docker-compose.yml`

The bridge is responsible for:

- checking whether the service is reachable
- starting it on demand
- exposing status to the extension
- stopping it after a configurable idle timeout

## Launch model

Implemented CLI integration:

```bash
taw --research-from-browser /tmp/taw-bridge-payload.json
```

Direct flags later:

```bash
taw --mode research --research-type politics --source-url ... --source-title ...
```

Behavior:

- start a new TAW session in the chosen working directory
- inject the source metadata into session state
- prefill or auto-submit an initial research command

## Session targeting options

The bridge currently supports new-session handoff. It should support append
handoff later.

### New session

Use when:

- the user wants a fresh research thread
- the content is unrelated to the current session

### Append to current session

Use later when:

- the user is already in a research session
- the page is a supporting source for the current thread

The bridge should not guess aggressively. The extension popup should let the user choose once append support exists.

## Tmux integration

TAW supports tmux-backed source viewing without building a terminal browser
inside the app.

Command:

- `/open-source <index>`

Current behavior:

- if running inside tmux, open or reuse a managed tmux window for the source
- prefer opening the saved source snapshot file
- if no snapshot exists, optionally open the live URL in a terminal browser
- show basic terminal-browser usage hints
- fall back to a readable message if no terminal browser is installed

Opening order:

1. saved source text file
2. markdown-rendered snapshot
3. live URL in `w3m`, `lynx`, or `elinks`

## Security requirements

- bind only to localhost
- require a local token or secret
- do not expose any network listener publicly
- validate all incoming payload fields
- avoid shell injection by passing args safely and preferring temp files

## MVP non-goals

- browser-side session history
- cloud sync
- arbitrary remote control of the terminal
- full-page DOM serialization pipeline
- embedded browsing inside the TUI transcript

## Suggested implementation phases

### Phase 1

- define bridge payload schema - implemented
- add CLI entrypoint for browser payload ingestion - implemented

### Phase 2

- implement localhost bridge - implemented
- implement extension popup with send actions - implemented

### Phase 3

- add current-session targeting
- add tmux pane source opening - implemented

### Phase 4

- add richer source extraction and snapshot generation
