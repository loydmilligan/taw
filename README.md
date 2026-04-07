# Terminal AI Workspace

TAW is a terminal-native, chat-first AI workspace for planning, brainstorming, workflow design, workflow review, and markdown artifact generation. It is intentionally not a coding agent.

Current baseline: `0.1.0-beta.2`

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
- `/finalize`
- `/exit-mode`
- `/attach-dir <path>`
- `/capture-idea <summary> [note]`
- `/capture-issue <summary> [note]`
- `/ideas`
- `/issues`
- `/session-usage`
- `/config`
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

Manual QA steps and ready-made fixtures live in [docs/manual-qa-checklist.md](/home/loydmilligan/Projects/taw/docs/manual-qa-checklist.md) and [qa-fixtures/README.md](/home/loydmilligan/Projects/taw/qa-fixtures/README.md).

Memory design notes live in [docs/memory-architecture.md](/home/loydmilligan/Projects/taw/docs/memory-architecture.md).

Versioning policy lives in [docs/versioning.md](/home/loydmilligan/Projects/taw/docs/versioning.md). Release history lives in [CHANGELOG.md](/home/loydmilligan/Projects/taw/CHANGELOG.md).

Telemetry details live in [docs/ai-telemetry.md](/home/loydmilligan/Projects/taw/docs/ai-telemetry.md).
