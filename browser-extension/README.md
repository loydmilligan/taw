# TAW Browser Bridge Extension

## Load the extension

1. Open your Chromium-based browser extension page.
2. Enable developer mode.
3. Choose `Load unpacked`.
4. Select this `browser-extension/` directory.

## Start the TAW bridge

From the TAW repo:

```bash
corepack pnpm bridge:dev
```

The bridge listens on `127.0.0.1:4317`.

The auth token is written to:

```text
~/.config/taw/bridge-token
```

Paste that token into the extension popup the first time you use it.

## Optional search backend stack

TAW now ships an optional helper-service stack in `infra/docker-compose.yml`.

Start SearXNG manually if you want it warm before you begin browsing:

```bash
corepack pnpm searxng:up
```

Or control it from the extension popup:

- `Refresh` checks current SearXNG status
- `Start` runs the compose service
- `Keep Warm` resets the idle auto-stop timer
- `Stop` stops the compose service

Configure idle auto-stop from TAW itself with:

```text
/config search idle-minutes 45
```

## What the MVP can do

- send the current page into a new TAW research session
- send only the selected text into a new TAW research session
- choose research type
- optionally override working directory
- optionally add an initial question and note
- show SearXNG status and start or stop it through the bridge

## What it does not do yet

- append context into an already running TAW session
- maintain session history in the extension
- extract full clean article text beyond the visible-page text excerpt
