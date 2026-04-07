# tasks.md

## Milestone 0 — Bootstrap
- [ ] Initialize repo with Node 20+, TypeScript, pnpm
- [ ] Add ESLint and Prettier
- [ ] Add tsconfig and scripts
- [ ] Add Dockerfile
- [ ] Add editor and git hygiene files
- [ ] Add startup README

## Milestone 1 — TUI shell
- [ ] Install Ink and support libs
- [ ] Build header component
- [ ] Build transcript component
- [ ] Build footer hint rail
- [ ] Add app state store for session, mode, provider status
- [ ] Add simple theming constants
- [ ] Validate layout in common terminal sizes

## Milestone 2 — Session management
- [ ] Define session metadata schema with Zod
- [ ] Implement session ID and slug generation
- [ ] Implement general-mode session root under user config dir
- [ ] Implement project-mode session root under `.ai/sessions`
- [ ] Write `session.json`
- [ ] Create `notes.md`
- [ ] Create `artifacts/` folder

## Milestone 3 — Command engine
- [ ] Implement slash command parser
- [ ] Implement command registry
- [ ] Add `/help`
- [ ] Add `/status`
- [ ] Add `/init`
- [ ] Add `/attach-dir`
- [ ] Render command feedback blocks in transcript

## Milestone 4 — Config and providers
- [ ] Define global config schema
- [ ] Load global config from `~/.config/taw/config.json`
- [ ] Load project config from `.ai/config.json`
- [ ] Implement OpenRouter provider adapter
- [ ] Implement OpenAI-compatible provider adapter
- [ ] Stub or implement Anthropic-compatible adapter if practical
- [ ] Add provider/model selection in config
- [ ] Add API key validation errors

## Milestone 5 — Chat and streaming
- [ ] Implement input box and submit flow
- [ ] Stream model output into transcript
- [ ] Persist current session turns in memory
- [ ] Append meaningful content to `notes.md` where appropriate
- [ ] Improve loading and error states

## Milestone 6 — Modes and prompts
- [ ] Implement mode engine
- [ ] Add `/brainstorm`
- [ ] Add `/workflow`
- [ ] Add mode-aware system prompts
- [ ] Add templates for artifacts
- [ ] Add rubric support for workflow review mode
- [ ] Add 2–5 question guided flow where useful

## Milestone 7 — Artifact generation
- [ ] Implement artifact naming strategy
- [ ] Write markdown artifacts to `artifacts/`
- [ ] Add save notices to transcript
- [ ] Create project brief template
- [ ] Create review report template
- [ ] Create brainstorm notes template
- [ ] Track created artifacts in `session.json`

## Milestone 8 — Summary and compaction prep
- [ ] Implement `/summarize-session`
- [ ] Generate `session-summary.md`
- [ ] Include decisions, open loops, and next steps
- [ ] Add future-facing compaction service seam
- [ ] Optionally generate artifact index when multiple outputs exist

## Milestone 9 — Polish
- [ ] Improve empty states
- [ ] Improve command autocomplete/help
- [ ] Tune visual hierarchy and spacing
- [ ] Make next actions obvious in footer
- [ ] Add practical logging
- [ ] Add useful debug mode

## Milestone 10 — Testing and QA
- [ ] Add critical unit tests for session manager
- [ ] Add critical tests for command parsing
- [ ] Add critical tests for artifact writing
- [ ] Add provider smoke tests with mocks
- [ ] Write manual QA checklist
- [ ] Perform manual walkthroughs for beta flows
- [ ] Fix blocking issues found in manual testing

## Deferred
- [ ] browser capture implementation
- [ ] heavy RAG across many file types
- [ ] task management system
- [ ] kanban
- [ ] collaboration
- [ ] plugin architecture
- [ ] autonomous actions
