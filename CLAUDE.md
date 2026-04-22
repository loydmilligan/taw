# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Active incident — wiki layout migration disabled (2026-04-22)

`migrateLegacyWikiLayout()` in `src/services/wiki/manager.ts` is currently **disabled at both call sites** (`src/cli/bootstrap.ts:23`, `src/bridge/server.ts:12`). Do NOT re-enable it without fixing the underlying bug first.

**What happened:** Commit `fea81d0` ("feat: migrate wiki topics into topics root") introduced the migration to move TAW research folders under `wiki/topics/`. However, the implementation uses a denylist (only `topics` and `research` are reserved) and treats every other top-level folder as a legacy topic. This silently moved unrelated folders belonging to a sibling project (`manage-obsidian`) — `Projects/`, `Areas/`, `Workflows/`, `Evergreen/`, `Dashboards/`, `Templates/`, `Inbox/`, `daily-journal/`, `Reference-Materials/`, `Research/` — into `wiki/topics/`, breaking their expected paths. The user has restored them to vault root.

**Why the migration runs every boot:** `migrateLegacyWikiLayout` has no idempotency guard (no marker file, no "already migrated" check) — it re-runs on every CLI + bridge-server startup, so leaving the call sites enabled would undo the restoration on the very next TAW invocation.

**Required before re-enabling:**
- Replace the denylist with an allowlist of known TAW topic folders (e.g. `copilot`, `ntopng`, `obsidian`, `repo`, `taw`, `vibecoding`, `wiki`), OR
- Migrate only folders that contain a TAW-signature file (e.g. `pages/` or the index stub from `buildIndexStub`), OR
- Gate on a one-shot marker file at `wiki/.taw-migrated` so the migration runs exactly once.

Sibling project `manage-obsidian` owns the non-TAW folders at vault root and relies on their stability. TAW's `topics/` namespace is the correct home for TAW-generated research — do not expand TAW's write scope outside `topics/` and `.config/taw/`.


## What this repo is

This is the **planning and build pack** for Terminal AI Workspace (TAW) — a terminal-native, chat-first AI workspace built with Node.js + TypeScript + Ink (React for CLIs). The `src/` directory does not exist yet; implementation follows the milestone sequence in `docs/tasks.md`.

## Build commands (once bootstrapped)

```bash
pnpm install          # install dependencies
pnpm build            # compile TypeScript
pnpm dev              # run in dev/watch mode
pnpm lint             # ESLint
pnpm test             # Vitest
pnpm test <file>      # run a single test file
```

Stack: Node 20+, TypeScript, pnpm, Ink, Zod, Vitest, ESLint + Prettier.

## Architecture

```
src/
  app/          # Ink components: App.tsx, layout/, screens/, state/
  cli/          # entry.ts, bootstrap.ts
  commands/     # one file per slash command (init, brainstorm, workflow, …)
  core/         # sessions/, artifacts/, context/, prompts/, providers/, summaries/
  services/     # filesystem/, config/, logging/
  types/
  utils/
```

**Key subsystems:**
- **Session manager** — creates session IDs/slugs, writes `session.json`, `notes.md`, and `artifacts/` under `.ai/sessions/<date-slug>/` (project mode) or `~/.config/taw/sessions/` (general mode).
- **Command engine** — slash command parser + registry; commands must go through central app state, never bypass it.
- **Provider layer** — every adapter exposes `sendMessage`, `streamMessage`, `validateConfig`, `normalizeError`. Priority: OpenRouter → OpenAI-compatible → Anthropic-compatible.
- **Artifact engine** — writes markdown files to the session `artifacts/` folder and tracks them in `session.json`.
- **Config** — global at `~/.config/taw/config.json`, project override at `.ai/config.json`. Project config wins.

**UI layout:** three regions — header/status rail, main transcript pane, footer/action hint rail.

## Implementation order

Follow `docs/tasks.md` milestone by milestone:
0. Bootstrap (repo, tsconfig, ESLint, Prettier, Dockerfile)
1. TUI shell (Ink layout)
2. Session management
3. Command engine
4. Config + providers
5. Chat + streaming
6. Modes + prompts (`/brainstorm`, `/workflow`)
7. Artifact generation
8. Summary + compaction seam
9. Polish
10. Testing + QA

## Testing approach

Use **Vitest**. Automated tests cover: session path resolution, command parsing, config load/override precedence, artifact writing, provider mocks. Do not write brittle render/snapshot tests tied to terminal output formatting. Manual QA is primary for end-to-end flows — see `docs/testing-strategy.md` for the checklist.

## Key constraints

- No autonomous code execution, no destructive file changes without explicit user command.
- Provider-specific logic must not leak outside `core/providers/`.
- All filesystem writes go through `services/filesystem/`; writes outside session/project dirs are forbidden.
- Do not mix prompt logic into UI components.
- Prefer simpler architecture over speculative flexibility; beta scope only.

## Docs to read before implementing a subsystem

`docs/architecture.md` → `docs/ui-ux-spec.md` → `docs/tasks.md` → `docs/repo-standards.md` → `ai/claude.md` → `ai/agents.md`
