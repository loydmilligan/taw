# Terminal AI Workspace

TAW is a terminal-native, chat-first AI workspace for planning, brainstorming, workflow design, workflow review, and markdown artifact generation. It is intentionally not a coding agent.

## Requirements

- Node.js 20+
- `pnpm` via Corepack
- An API key for your configured provider
  - `OPENROUTER_API_KEY` for the default OpenRouter path
  - `OPENAI_API_KEY` for OpenAI-compatible mode
  - `ANTHROPIC_API_KEY` for Anthropic mode

## Quick start

```bash
corepack enable
corepack pnpm install
corepack pnpm dev
```

The default provider is OpenRouter. Launching TAW from any directory starts a session immediately. If the current directory contains `.ai/config.json`, sessions are saved under `.ai/sessions/`. Otherwise they are saved under `~/.config/taw/sessions/`.

## Commands

- `/brainstorm`
- `/workflow <generate|review>`
- `/attach-dir <path>`
- `/capture-idea <summary> [note]`
- `/capture-issue <summary> [note]`
- `/ideas`
- `/issues`
- `/config`
- `/init`
- `/summarize-session`
- `/help`
- `/status`
- `/exit`

## Config

Global config lives at `~/.config/taw/config.json`.

Project config lives at `.ai/config.json`.

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

## Scripts

- `corepack pnpm dev`
- `corepack pnpm build`
- `corepack pnpm lint`
- `corepack pnpm test`

## Debugging

- Set `TAW_DEBUG=1` to enable debug log writes.
- Daily logs are written to `~/.config/taw/logs/`.

## QA

Manual QA steps live in [docs/manual-qa-checklist.md](/home/loydmilligan/Projects/taw/docs/manual-qa-checklist.md).

Memory design notes live in [docs/memory-architecture.md](/home/loydmilligan/Projects/taw/docs/memory-architecture.md).
