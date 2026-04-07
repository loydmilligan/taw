# Project Plan

Applies to baseline `0.1.0-beta.2`.

## Roadmap status

TAW is past initial bootstrap and is now in beta-hardening work. The product already supports general chat, project-aware sessions, structured brainstorming/workflow modes, artifact writing, summaries, and capture commands. The current focus is reliability, clarity, and release discipline.

## Phase status

### Phase 0 - Repo bootstrap

Status: complete

Delivered:

- Node + TypeScript + pnpm setup
- linting, formatting, scripts, Dockerfile
- baseline docs and workflows

### Phase 1 - App shell and session backbone

Status: complete

Delivered:

- Ink TUI shell with header, transcript, footer
- session creation on launch
- general/project storage roots
- visible session path and provider/model context

### Phase 2 - Command system and core project commands

Status: complete

Delivered:

- slash command parser and registry
- `/help`, `/status`, `/init`, `/attach-dir`
- capture and listing commands for ideas/issues
- graceful command errors in transcript

### Phase 3 - Provider layer and streaming chat

Status: partial

Delivered:

- provider abstraction
- OpenRouter-first path
- OpenAI-compatible path
- Anthropic-compatible path
- streaming assistant output into transcript

Remaining:

- broader live-provider QA across real accounts
- smoother Anthropic streaming parity

### Phase 4 - Mode system and artifact writing

Status: partial

Delivered:

- mode-specific prompts for Brainstorm, Workflow Review, and Workflow Generate
- shared chat engine and prompt context injection
- explicit draft lifecycle with phase tracking
- `/brainstorm`, `/workflow`, `/finalize`, `/exit-mode`
- mode-definition-driven artifact writing

Remaining:

- further prompt tuning from real sessions
- stronger finalize/readiness heuristics if users need them

### Phase 5 - Summaries and polish

Status: partial

Delivered:

- `/summarize-session`
- session summary file generation
- improved empty states and footer guidance
- targeted tests for config, sessions, artifacts, prompt context, and finalize behavior
- formal manual QA playbook with reusable fixtures

Remaining:

- more real-world summary quality evaluation
- more targeted automated coverage around summaries and provider error paths

### Phase 6 - Beta hardening

Status: partial

Delivered:

- changelog and versioning policy
- known limitations tracking
- roadmap/task refresh tied to shipped behavior
- reusable manual QA data for regression checks

Remaining:

- execute the full manual playbook with live provider credentials
- tag the next beta after the full release checklist is clean

## Current release goals

- keep structured-mode drafts reliable
- keep project/general state obvious
- preserve session data and artifact paths
- make manual verification repeatable for another person

## Release checklist

- [x] fresh project `/init` works
- [x] general-mode launch works
- [x] attached-dir sessions work
- [x] structured modes support explicit finalize/exit
- [x] prompt context is injected into chat setup
- [x] `/summarize-session` writes a summary file
- [x] roadmap and release-facing docs match shipped behavior
- [ ] full live-provider manual walkthrough completed for this baseline
- [ ] beta tag cut after release verification
