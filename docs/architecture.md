# Architecture

## Architecture summary

TAW should be built as a **TypeScript application** with a modular CLI/TUI architecture.

The best fit for the user's background and the desired UX is:

- **Language:** TypeScript
- **Runtime:** Node.js 20+
- **TUI:** Ink + React
- **CLI parser:** lightweight custom command parser inside the app
- **Validation:** Zod
- **File ops:** fs/promises + path + fast-glob
- **HTTP / model IO:** provider-specific SDKs behind a shared adapter
- **Config:** JSON with local project overrides
- **Packaging:** pnpm
- **Container support:** Dockerfile for dev + reproducible runs

## Why this stack

### Why Node + TypeScript
- strongest fit for the user's current experience
- excellent ecosystem for provider integrations
- strong support for terminal UIs with Ink
- easier future bridge to browser extension/web capture tooling

## High-level component model

```text
src/
  app/
    App.tsx
    layout/
    screens/
    state/
  cli/
    entry.ts
    bootstrap.ts
  commands/
    init.ts
    attachDir.ts
    brainstorm.ts
    workflow.ts
    summarizeSession.ts
    help.ts
    status.ts
  core/
    sessions/
    artifacts/
    context/
    prompts/
    providers/
    workflows/
    summaries/
  services/
    filesystem/
    config/
    logging/
  types/
  utils/
```

## Core subsystems

### 1. App shell
Responsible for terminal rendering, layout, keyboard shortcuts, transcript display, command output, and footer hints.

### 2. Session manager
Responsible for session IDs, folder creation, metadata persistence, attached directory tracking, notes, and summaries.

### 3. Command engine
Responsible for slash command parsing, dispatch, validation, and help/autocomplete metadata.

### 4. AI provider layer
Responsible for active provider/model, streaming completions, response normalization, and retries/common error handling.

#### Provider abstraction contract
Every provider adapter should expose:
- `sendMessage`
- `streamMessage`
- `validateConfig`
- `normalizeError`

First implementation priority:
1. OpenRouter
2. OpenAI-compatible API mode
3. Anthropic-compatible API mode where straightforward

Target API-based access and compatible endpoints, not consumer subscriptions.

### 5. Prompt/mode engine
Responsible for selecting system prompts by mode, injecting templates/rubrics, and deciding when to ask clarifying questions.

### 6. Artifact engine
Responsible for file names, writing markdown artifacts, tracking created files, and optional artifact index data.

### 7. Context manager
Responsible for collecting scoped project files, respecting configured directories, and tracking compaction state.

Beta context scope:
- `.ai/`
- attached dir metadata
- optional `docs/` if present
- future expansion points for more folders

### 8. Summary / compaction service
Responsible for session summaries and future compact context snapshots.

For beta, session summaries are required; compaction is only scaffolded.

## Filesystem model

### Project-scoped mode

```text
project-root/
  .ai/
    config.json
    sessions/
      2026-04-06_idea-slug/
        session.json
        notes.md
        session-summary.md
        artifacts/
```

### Non-project mode

```text
~/.config/taw/
  sessions/
  cache/
  logs/
```

## Session model

Each session gets:
- `id`
- `slug`
- `createdAt`
- `cwdAtLaunch`
- `attachedDirs[]`
- `modeHistory[]`
- `artifacts[]`
- `provider`
- `model`
- `summaryStatus`

Store this in `session.json`.

## UI architecture

Use a three-region layout:

1. **Header / status rail**
   - app name
   - current mode
   - project attachment state
   - provider/model
   - session path hint

2. **Main transcript pane**
   - chat history
   - command output
   - progress blocks
   - artifact notices

3. **Footer / action hint rail**
   - next suggested command
   - active shortcuts
   - help affordances

## Design principles for the TUI

- modern through hierarchy, not ornament
- use box borders sparingly
- use color for focus and state, not decoration
- keep command hints visible
- show success/failure states clearly
- make file save actions explicit

## Config model

### Global config
`~/.config/taw/config.json`

Contains:
- default provider
- default model
- theme settings
- output behavior
- allowed context dirs

### Project config
`project/.ai/config.json`

Contains:
- project name
- default attached dirs
- preferred artifact outputs
- prompt overrides
- project-local provider/model override if desired

Project config overrides global config.

## Logging

Beta logging should be plain and practical:
- `~/.config/taw/logs/*.log`
- one log file per day
- redact API keys
- keep user prompts only if debug mode is enabled

## Error handling

Differentiate:
- provider config errors
- network/provider API errors
- invalid command usage
- file system permission issues
- context/read errors

Errors must:
- explain what happened
- suggest what to do next
- avoid stack traces in normal UI
- write details to logs when useful

## Safety / behavior constraints

- local-first by default
- visibly indicate attached context
- no autonomous code execution
- no destructive file changes without explicit command

## Future-ready seams

Leave extension points for:
- browser capture ingestion
- richer context packs
- manual function generator
- persistent open-loop tracking
