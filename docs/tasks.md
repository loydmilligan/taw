# Tasks

Applies to baseline `0.1.0-beta.4`.

## Milestone 0 - Bootstrap

- [x] Initialize repo with Node 20+, TypeScript, pnpm
- [x] Add ESLint and Prettier
- [x] Add tsconfig and scripts
- [x] Add Dockerfile
- [x] Add editor and git hygiene files
- [x] Add startup README

## Milestone 1 - TUI shell

- [x] Install Ink and support libs
- [x] Build header component
- [x] Build transcript component
- [x] Build footer hint rail
- [x] Add app state store for session, mode, provider status
- [x] Add simple theming constants
- [x] Validate layout in common terminal sizes

## Milestone 2 - Session management

- [x] Define session metadata schema with Zod
- [x] Implement session ID and slug generation
- [x] Implement general-mode session root under user config dir
- [x] Implement project-mode session root under `.ai/sessions`
- [x] Write `session.json`
- [x] Create `notes.md`
- [x] Create `artifacts/` folder

## Milestone 3 - Command engine

- [x] Implement slash command parser
- [x] Implement command registry
- [x] Add `/help`
- [x] Add `/status`
- [x] Add `/init`
- [x] Add `/attach-dir`
- [x] Render command feedback blocks in transcript

## Milestone 4 - Config and providers

- [x] Define global config schema
- [x] Load global config from `~/.config/taw/config.json`
- [x] Load project config from `.ai/config.json`
- [x] Implement OpenRouter provider adapter
- [x] Implement OpenAI-compatible provider adapter
- [x] Implement Anthropic-compatible adapter
- [x] Add provider/model selection in config
- [x] Add API key validation errors

## Milestone 5 - Chat and streaming

- [x] Implement input box and submit flow
- [x] Stream model output into transcript
- [x] Persist current session turns in memory
- [x] Append meaningful content to `notes.md` where appropriate
- [x] Improve loading and error states

## Milestone 6 - Modes and prompts

- [x] Implement mode engine
- [x] Add `/brainstorm`
- [x] Add `/workflow`
- [x] Add mode-aware system prompts
- [x] Add templates for artifacts
- [ ] Add rubric support for workflow review mode
- [ ] Add 2-5 question guided flow where useful

Notes:

- Prompt guidance now asks targeted clarifying questions and keeps structured responses in draft mode until `/finalize`.

## Milestone 7 - Artifact generation

- [x] Implement artifact naming strategy
- [x] Write markdown artifacts to `artifacts/`
- [x] Add save notices to transcript
- [x] Create project brief template
- [x] Create review report template
- [ ] Create brainstorm notes template
- [x] Track created artifacts in `session.json`

Notes:

- Artifact saves are now explicit for structured modes via `/finalize`, which replaces the earlier auto-save-on-every-response behavior.

## Milestone 8 - Summary and compaction prep

- [x] Implement `/summarize-session`
- [x] Generate `session-summary.md`
- [x] Include decisions, open loops, and next steps
- [x] Add future-facing compaction service seam
- [ ] Optionally generate artifact index when multiple outputs exist

## Milestone 9 - Polish

- [x] Improve empty states
- [x] Improve command autocomplete/help
- [x] Tune visual hierarchy and spacing
- [x] Make next actions obvious in footer
- [x] Add practical logging
- [x] Add useful debug mode

## Milestone 10 - Testing and QA

- [x] Add critical unit tests for session manager
- [x] Add critical tests for command parsing
- [x] Add critical tests for artifact writing
- [x] Add provider smoke tests with mocks
- [x] Write manual QA checklist
- [ ] Perform manual walkthroughs for beta flows with live providers
- [ ] Fix blocking issues found in full manual testing

Notes:

- A formal playbook plus reusable `qa-fixtures/` data now exists so manual testing can be repeated without inventing scenarios.

## Milestone 11 - Research and browser bridge

- [x] Add `/research <politics|tech|repo|video>`
- [x] Add research mode definitions and draft artifact flow
- [x] Add session-local source storage and `/sources`
- [x] Add browser bridge payload schema and CLI ingestion path
- [x] Build browser extension MVP for sending page/selection context
- [x] Add tmux side-pane source opening
- [x] Add helper-service stack for SearXNG and bridge status controls
- [x] Improve research `/finalize` to include the current draft, saved sources, and session notes
- [x] Add source-pane usage hints and clear return-to-TAW guidance when opening sources
- [x] Add `/source-views [index]` to list and jump between managed source windows
- [x] Add `/source-note <index> <note>` for observations made while reading a source
- [x] Add deterministic `/search-source <query>` for adding search results to `sources.json`
- [x] Add `/rate-source <index|url>` using a static SourceInfo-derived SQLite database as a first pass
- [x] Add cost warnings for high-turn and high-session spend
- [x] Add prompt-token and context-size warnings alongside dollar-cost warnings
- [x] Add OpenRouter management-key credits display and `/or-key` app-key management commands
- [ ] Add persistent interest and watchlist memory files
- [ ] Add explicit memory commands for interests, ideas, and repos
- [ ] Add manual QA coverage for browser-to-terminal workflows
- [ ] Extend managed source views with richer tab state, reviewed markers, and closing/cleanup controls
- [ ] Add richer research `/finalize` synthesis across the full transcript, not only the latest draft plus stored notes
- [ ] Add optional rating annotations directly to `/sources`
- [ ] Add adaptive model policy controls for budget-sensitive model selection
- [ ] Add end-of-session model rating capture so model recommendations can learn user preferences

## Deferred

- [ ] heavy RAG across many file types
- [ ] task management system
- [ ] kanban
- [ ] collaboration
- [ ] plugin architecture
- [ ] autonomous actions
