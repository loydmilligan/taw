# Terminal AI Workspace

TAW is a terminal-native, chat-first AI workspace for planning, brainstorming, workflow design, workflow review, and markdown artifact generation. It is intentionally not a coding agent.

Current baseline: `0.1.0-beta.3`

Structured modes now use a draft-first workflow:

- `/brainstorm`
- `/workflow <generate|review>`
- `/finalize` to save the current structured draft
- `/exit-mode` to return to General mode without saving

## Requirements

- Node.js 20+
- `pnpm` via Corepack
- An API key for your configured provider
  - `OPENROUTER_API_KEY` for the default OpenRouter path
  - `OPENAI_API_KEY` for OpenAI-compatible mode
  - `ANTHROPIC_API_KEY` for Anthropic mode
- Node 22+ is recommended for `/rate-source`, which currently uses Node's
  experimental `node:sqlite` module.

## Quick start

```bash
corepack enable
corepack pnpm install
corepack pnpm dev
```

The default provider is OpenRouter. Launching TAW from any directory starts a session immediately. If the current directory contains `.ai/config.json`, sessions are saved under `.ai/sessions/`. Otherwise they are saved under `~/.config/taw/sessions/`.

You can also seed a research session from a browser bridge payload:

```bash
corepack pnpm dev -- --research-from-browser /path/to/payload.json
```

Run the localhost browser bridge with:

```bash
corepack pnpm bridge:dev
```

The bridge listens on `127.0.0.1:4317` by default and creates an auth token at `~/.config/taw/bridge-token`.

TAW includes an optional helper-service stack under [infra/docker-compose.yml](infra/docker-compose.yml). The first service is SearXNG, which can be started on demand from the browser extension popup or directly with:

```bash
corepack pnpm searxng:up
corepack pnpm searxng:status
corepack pnpm searxng:down
```

The browser popup shows current SearXNG status, lets you start or stop it manually, and can keep it warm by resetting the idle shutdown timer. Idle shutdown is configurable from TAW with `/config search idle-minutes <n>`.

In research modes, TAW can now use a local `search_web` tool backed by SearXNG during a chat turn. On OpenRouter, `openrouter:datetime` is enabled by default for current-date awareness, and hosted web search can be enabled as a fallback with `/config search hosted-fallback on`.

A minimal Chromium extension MVP lives in [browser-extension/README.md](browser-extension/README.md).

## Commands

- `/brainstorm`
- `/research <politics|tech|repo|video>`
- `/workflow <generate|review>`
- `/finalize`
- `/exit-mode`
- `/sources`
- `/open-source <index>`
- `/source-note <index> <note>`
- `/search-source <query>`
- `/rate-source <index|url>`
- `/attach-dir <path>`
- `/capture-idea <summary> [note]`
- `/capture-issue <summary> [note]`
- `/ideas`
- `/issues`
- `/session-usage`
- `/config`
- `/config search`
- `/init`
- `/summarize-session`
- `/help`
- `/status`
- `/exit`

## Config

Global config lives at `~/.config/taw/config.json`.

Project config lives at `.ai/config.json`.

## Assistant Memory Files

TAW now scaffolds durable assistant context in both the global config dir and any initialized project:

- `AGENTS.md`
- `SOUL.md`
- `USER.md`
- `USER.summary.md`
- `MEMORY.md`
- `MEMORY.summary.md`
- `COMMANDS.md`

Use these files as follows:

- `AGENTS.md` for operating rules and product boundaries
- `SOUL.md` for tone and conversational style
- `USER.md` for stable facts about you
- `MEMORY.md` for durable cross-session context and decisions

TAW injects `AGENTS.md`, `SOUL.md`, and the generated `USER` and `MEMORY` summaries on every turn. It also retrieves matching raw sections from `USER.md` and `MEMORY.md` when the current message overlaps with them.

`SOUL.md` is only a voice file. The assistant should identify itself as `TAW` or `TAWd`, not `SOUL`.

Global config example:

```json
{
  "defaultProvider": "openrouter",
  "defaultModel": "openrouter/auto",
  "providers": {
    "openrouter": {
      "apiKey": "..."
    },
    "openai": {},
    "anthropic": {}
  }
}
```

Useful search config examples:

```text
/config search show
/config search idle-minutes 45
/config search hosted-fallback on
/config search hosted-fallback-max-results 5
/config budget show
/config budget high-turn 0.05
/config budget high-session 0.25
```

Source rating data is read from `~/.config/taw/sources.db` by default. You can
set another path with `sourceRatings.dbPath` in `~/.config/taw/config.json`.

## Scripts

- `corepack pnpm dev`
- `corepack pnpm build`
- `corepack pnpm lint`
- `corepack pnpm test`

## Debugging

- Set `TAW_DEBUG=1` to enable debug log writes.
- Daily logs are written to `~/.config/taw/logs/`.

## QA

Manual QA steps and ready-made fixtures live in [docs/manual-qa-checklist.md](docs/manual-qa-checklist.md) and [qa-fixtures/README.md](qa-fixtures/README.md).

A repeatable tmux-based research harness lives in [docs/research-harness.md](docs/research-harness.md) and can be run with `corepack pnpm research:harness`.

Memory design notes live in [docs/memory-architecture.md](docs/memory-architecture.md).

Research and browser handoff docs live in [docs/research-mode-spec.md](docs/research-mode-spec.md), [docs/browser-bridge-spec.md](docs/browser-bridge-spec.md), and [docs/memory-model-spec.md](docs/memory-model-spec.md).

Versioning policy lives in [docs/versioning.md](docs/versioning.md). Release history lives in [CHANGELOG.md](CHANGELOG.md).

Telemetry details live in [docs/ai-telemetry.md](docs/ai-telemetry.md).

Current release caveats live in [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).
