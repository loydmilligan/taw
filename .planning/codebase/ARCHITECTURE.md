# Architecture

**Analysis Date:** 2026-04-14

## Pattern Overview

**Overall:** Modular command-driven TUI with reactive state and pluggable AI providers

**Key Characteristics:**
- Centralized app state (`src/app/App.tsx`) as single source of truth
- Command engine: Slash-based command parser + registry + execution
- Provider abstraction layer: Multiple AI backends behind unified interface
- Mode system: Specialized prompts and behaviors for different workflows
- Session-scoped artifact and telemetry tracking
- Streaming chat with tool integration (wiki writes, web search, research)

## Layers

**CLI Layer:**
- Purpose: Entry point, bootstrap, command-line argument parsing
- Location: `src/cli/` - contains `entry.tsx`, `bootstrap.ts`, `bridge.ts`, `research-harness.ts`
- Contains: Node process startup, app initialization, headless execution paths
- Depends on: Core services, session manager, config loader
- Used by: Package bin scripts (`taw`, `taw-bridge`, `taw-research-harness`)

**TUI / App Shell:**
- Purpose: Terminal rendering, user input handling, state management, layout
- Location: `src/app/` - App.tsx (main component), `layout/` (Header, Transcript, Footer, etc.), `state.ts` (input/phase helpers)
- Contains: Ink React components, input handling, keyboard shortcuts (Ctrl+L palette, Ctrl+P maps, Ctrl+T draft)
- Depends on: Commands, chat engine, app state
- Used by: CLI entry point via `render(<App />)`

**Command Engine:**
- Purpose: Parse, route, and execute slash commands
- Location: `src/commands/` - `parser.ts` (tokenizer), `registry.ts` (command list), individual command files
- Contains: ~40 command definitions (brainstorm, research, workflow, wiki, etc.)
- Depends on: Core services, mode system, artifact writer
- Used by: App shell for user input processing

**Chat/Streaming Layer:**
- Purpose: Manage conversation flow, streaming responses, tool execution, telemetry
- Location: `src/core/chat/engine.ts`
- Contains: Message building, provider adapter selection, tool runtime invocation, streaming callbacks
- Depends on: Providers, context builder, tool runtime, telemetry collector
- Used by: App shell on chat turns

**Provider Adapter Layer:**
- Purpose: Normalize different AI APIs into unified interface
- Location: `src/core/providers/` - `anthropic-provider.ts`, `openai-compatible-provider.ts`, `index.ts` selector
- Contains: `sendMessage()`, `streamMessage()`, `completeMessage()`, `validateConfig()`, `normalizeError()`
- Depends on: SDK clients (`openai`, `@anthropic-ai/sdk`)
- Used by: Chat engine for all AI interactions

**Mode System:**
- Purpose: Define specialized prompts, artifact types, and activation behaviors for workflows
- Location: `src/core/modes/definitions.ts`, `src/core/prompts/modes.ts`
- Contains: Mode definitions (General, Brainstorm, Workflow Review/Generate, Research Politics/Culture, Wiki modes)
- Depends on: Prompt templates
- Used by: Chat engine for system prompt selection, artifact writer for artifact typing

**Tool Runtime:**
- Purpose: Execute local tools invoked by LLM (wiki write, web search, etc.)
- Location: `src/core/tools/runtime.ts`
- Contains: Tool invocation dispatcher, result serialization
- Depends on: Wiki manager, research search, artifact writer
- Used by: Chat engine during streaming

**Session Manager:**
- Purpose: Create, load, persist session metadata and artifacts
- Location: `src/core/sessions/session-manager.ts`, `schema.ts`
- Contains: Session ID/slug generation, directory creation, metadata JSON R/W
- Depends on: Filesystem service, logging
- Used by: Bootstrap, command execution, artifact writer

**Config System:**
- Purpose: Load and merge global + project config
- Location: `src/services/config/` - `loader.ts`, `schema.ts`, `env.ts`
- Contains: Zod schemas for GlobalConfig and ProjectConfig, env var precedence, file loading
- Depends on: Filesystem service, validation
- Used by: Bootstrap, commands, chat engine

**Context Builder:**
- Purpose: Assemble prompt context from assistant files, user context, memory, project config
- Location: `src/core/context/prompt-context.ts`, `assistant-files.ts`
- Contains: Context section assembly (global agents, soul, memory, user summary, relevant docs)
- Depends on: Filesystem, wiki manager, research store
- Used by: Chat engine before building messages

**Artifact System:**
- Purpose: Write and track user-facing markdown artifacts
- Location: `src/core/artifacts/writer.ts`
- Contains: Timestamped filename generation, content writing, session metadata update
- Depends on: Session manager, mode definitions
- Used by: Commands and chat engine when creating output files

**Wiki System:**
- Purpose: Manage local markdown wiki with indexing, linking, and ingest
- Location: `src/services/wiki/` - `manager.ts`, `reindex.ts`, `link-review.ts`, `hister-ingest.ts`, `frontmatter.ts`
- Contains: Topic discovery, file R/W, backlink resolution, browser history ingest
- Depends on: Filesystem, YAML parsing
- Used by: Wiki commands, bridge server, tool runtime, context builder

**Research System:**
- Purpose: Conduct web searches, store sources, track ratings
- Location: `src/core/research/` - `search.ts`, `store.ts`, `source-rating.ts`, `schema.ts`
- Contains: SearXNG client, research source persistence, user ratings
- Depends on: Config (search backend), filesystem, logging
- Used by: Research commands, tool runtime, bridge server

**Bridge Server:**
- Purpose: HTTP server for integration with browser extension and headless automation
- Location: `src/cli/bridge.ts`, `src/bridge/server.ts`, `launcher.ts`
- Contains: Route handlers for session launch, research ingest, wiki ops, artifact fetch
- Depends on: Chat engine, bootstrap, command execution
- Used by: `taw-bridge` executable, browser extension

**Telemetry / Observability:**
- Purpose: Track token usage, costs, latency, mode history
- Location: `src/core/telemetry/` - `collector.ts`, `store.ts`, `derivation.ts`, `types.ts`
- Contains: Per-request summaries, session aggregation, cost calculations
- Depends on: Session manager, filesystem
- Used by: Chat engine, app state, commands (session-usage)

**Logging:**
- Purpose: Debug and error logging to local files
- Location: `src/services/logging/logger.ts`
- Contains: Daily log file management, API key redaction, log level filtering
- Depends on: Filesystem, config
- Used by: All layers for error/debug output

**Filesystem Service:**
- Purpose: Centralized file I/O with safety checks
- Location: `src/services/filesystem/`
- Contains: Wrappers for readFile, writeFile, mkdir, path resolution
- Depends on: Node fs/promises
- Used by: All layers for file operations

## Data Flow

**Chat Turn Flow:**

1. User types message → App state captured in `inputState`
2. Enter key → `executeChatTurn()` called with user input
3. Build context: Collect assistant files, wiki refs, research sources → `buildPromptContext()`
4. Build messages: Add system prompt (mode-specific), append conversation history, add user message
5. Select provider: Based on config (`providerConfig.provider`)
6. Stream response: Call provider via `streamMessage()`, receive chunks, emit via `onChunk` callback
7. Tool invocation: If LLM calls tool (wiki write, search), invoke via `createToolRuntime()`
8. Persist: Write notes.md turn, update telemetry, store artifacts if created
9. Return: AssistantText + telemetryTurnId to App

**State Management:**
- React hooks: `inputState`, `appState`, `transcript`, `showStreamingDraft`, `mapPicker`, etc.
- Refs: `inputRef`, `appStateRef` (for callbacks), `streamAbortRef` (abort control)
- Updates via `setAppState()` on chat completion
- No external state management (Redux, Zustand) — kept simple for beta

**Command Execution:**
1. User types `/command arg1 arg2`
2. Parser tokenizes into command name + args
3. Registry lookup: Find command definition
4. Validation: Zod schema if present
5. Execute: Call handler, which typically:
   - Manipulates app state (mode change, phase update)
   - May trigger chat turn if it's a chat-like command (e.g., `/brainstorm`)
   - May write artifacts or update session
6. Return transcript entries (system notices, assistant responses)

## Key Abstractions

**ProviderAdapter:**
- Purpose: Hide provider-specific API details
- Examples: `anthropic-provider.ts`, `openai-compatible-provider.ts`
- Pattern: Each provider implements same interface, dispatched at runtime

**Mode:**
- Purpose: Bundle system prompt, artifact type, activation message
- Examples: General, Brainstorm, Workflow Review, Research Politics
- Pattern: Define in `modes/definitions.ts`, reference by string name in commands

**Command:**
- Purpose: Encapsulate a user-callable action
- Pattern: Export `CommandDefinition` with name, description, schema, handler; register in `registry.ts`
- Example: `src/commands/brainstorm.ts`, `src/commands/research.ts`

**Tool:**
- Purpose: Enable LLM to call local functions (wiki write, search)
- Pattern: Define function in `tools/` folder, register in `runtime.ts`, pass to provider as tool schema

**Session:**
- Purpose: Container for conversation, artifacts, metadata
- Pattern: Created on app start, persisted in session dir, ID/slug generated at creation

## Entry Points

**TUI App:**
- Location: `src/cli/entry.tsx`
- Triggers: User runs `taw` command
- Responsibilities: Parse CLI args, bootstrap app, render Ink app, handle user input/exit

**Bridge Server:**
- Location: `src/cli/bridge.ts` → `src/bridge/server.ts`
- Triggers: User runs `taw-bridge` or via script
- Responsibilities: Listen on HTTP port, handle research ingest, wiki ops, background job dispatch

**Research Harness:**
- Location: `src/cli/research-harness.ts`
- Triggers: User runs `taw-research-harness` or via bridge
- Responsibilities: Execute queued research commands in headless mode, write results to files

## Error Handling

**Strategy:** Distinguish error type, log details, show user-friendly message in transcript

**Patterns:**
- Config validation: Zod schema parse, show which field is invalid
- Provider errors: Catch API 401/403/429, suggest fix (wrong key, rate limit, etc.)
- Filesystem errors: ENOENT → "session dir missing", EACCES → "permission denied"
- Command usage: Schema validation, show expected args
- Network: Timeout → suggest retry, no network → suggest offline mode

Errors logged to `~/.config/taw/logs/` with full details; user sees summary in transcript.

## Cross-Cutting Concerns

**Logging:** `src/services/logging/logger.ts` used throughout for debug/error output, API keys redacted

**Validation:** Zod schemas in `types/`, `services/config/`, `core/research/` for runtime type safety

**Authentication:** Stored in env vars (`.env`), never in code or config files; validated at provider instantiation

**State Persistence:** Session.json + separate files (notes.md, artifacts/, telemetry/) — no database

---

*Architecture analysis: 2026-04-14*
