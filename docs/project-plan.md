# Project Plan

## Delivery strategy

Build a lean but polished beta in **6 phases**, each ending with a runnable checkpoint.

## Phase 0 — Repo bootstrap
### Goals
- initialize Node + TypeScript repo
- set up pnpm, linting, formatting, basic scripts
- create basic folder structure
- create Dockerfile for reproducible runs
- add docs references in repo

### Deliverables
- runnable `pnpm dev`
- clean repository structure
- README with startup instructions

## Phase 1 — App shell and session backbone
### Goals
- build TUI shell with header, transcript pane, footer hint rail
- start sessions on launch
- create session folder and metadata
- implement general-mode fallback

### Deliverables
- basic app renders
- session folders created correctly
- session path visible in UI
- launch works inside tmux

## Phase 2 — Command system and core project commands
### Goals
- implement slash command parser
- implement `/help`
- implement `/status`
- implement `/init`
- implement `/attach-dir`

### Deliverables
- initialize project
- attach directory
- status reflects state changes
- command errors are graceful

## Phase 3 — Provider layer and streaming chat
### Goals
- implement provider abstraction
- implement OpenRouter first
- add OpenAI-compatible path
- add Anthropic-compatible path if straightforward
- stream assistant output into transcript

### Deliverables
- working chat with API key config
- provider/model visible in header
- robust common error handling

## Phase 4 — Mode system and artifact writing
### Goals
- add mode-specific system prompts
- implement `/brainstorm`
- implement `/workflow`
- add markdown artifact writer
- create/update session notes file

### Deliverables
- useful planning sessions
- useful workflow review sessions
- artifact files written automatically

## Phase 5 — Summaries and polish
### Goals
- implement `/summarize-session`
- generate session summary markdown
- improve visual hierarchy
- improve next-step hints
- add light manual QA scripts/checklists
- add targeted tests

### Deliverables
- coherent beta experience
- summary generation
- confidence for user testing

## Phase 6 — Beta hardening
### Goals
- manual end-to-end walkthroughs
- bug fixes
- cleanup prompts/templates
- improve command discoverability
- keep repo tidy

### Deliverables
- beta tag
- clean issue list / known limitations
- acceptable stability for daily personal use

## Sequence notes

Do not start with:
- elaborate test architecture
- broad RAG support
- plugin architecture
- fancy pane systems
- many integrations

Start with:
- one solid shell
- one clean session model
- one good provider abstraction
- two useful modes

## Risks and mitigations

### Risk: UI complexity grows too fast
Mitigation:
- keep one main transcript pane
- keep header/footer stable
- avoid sidebars in beta

### Risk: provider integration churn
Mitigation:
- provider abstraction early
- explicit API-based config
- keep model config user-driven

### Risk: weak mode prompts
Mitigation:
- ship strong defaults
- refine from real use
- keep prompts editable

### Risk: too much time on tests
Mitigation:
- test critical paths only
- use manual acceptance for interaction-heavy behavior

## Release checklist

- [ ] fresh project `/init` works
- [ ] general-mode launch works
- [ ] attached-dir sessions work
- [ ] streaming chat stable
- [ ] `/brainstorm` produces useful artifact
- [ ] `/workflow` review produces useful artifact
- [ ] `/summarize-session` writes summary
- [ ] UI clearly communicates next steps
- [ ] logs and errors are understandable
