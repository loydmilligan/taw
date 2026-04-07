# Testing Strategy

## Testing philosophy

Testing exists to catch important issues before handoff, not to become a project of its own.

The goal is:
- fast feedback
- confidence in core flows
- low maintenance burden

## Core rule

Do **not** write brittle UI tests that merely confirm the current screen rendering.

Instead:
- define acceptance criteria
- build the UI and behavior to meet them
- add only a small number of tests that verify important behavior

## Testing mix

### Manual testing — primary
Use manual testing for:
- end-to-end conversation flow
- terminal UX and readability
- command discoverability
- mode transitions
- streaming behavior
- artifact usefulness

Codex should perform manual runs whenever possible during implementation and before handoff.

### Automated tests — targeted
Use automated tests for:
- session path creation
- command parsing
- config loading/override precedence
- artifact writing
- provider abstraction behavior with mocks
- summary file generation input/output shape

Avoid:
- snapshot-heavy render tests
- tests tied to exact colors, spacing, or box drawing
- overmocked pseudo-integration tests

## Suggested tools
- Vitest for tests
- built-in mocking where possible

## Required automated coverage

### Session manager
Must verify:
- project mode path resolution
- general mode path resolution
- folder creation behavior
- idempotent file creation where relevant

### Command parser
Must verify:
- slash command detection
- argument parsing for `/attach-dir`
- graceful error for unknown commands

### Artifact engine
Must verify:
- files are written to the session artifact folder
- names are valid and stable enough
- artifacts are recorded in session metadata

### Config loader
Must verify:
- global config loads
- project config overrides global config
- missing config handled cleanly

## Manual QA checklist

### General launch
- [ ] Launch from a random non-project directory
- [ ] Confirm session starts
- [ ] Confirm next actions are visible

### Init flow
- [ ] Run `/init`
- [ ] Confirm `.ai/` structure is created
- [ ] Confirm rerunning does not break state

### Attach dir flow
- [ ] Run `/attach-dir <path>`
- [ ] Confirm status updates
- [ ] Confirm invalid path gives useful guidance

### Brainstorm flow
- [ ] Start `/brainstorm`
- [ ] Hold a realistic planning conversation
- [ ] Confirm at least one useful markdown artifact is created

### Workflow flow
- [ ] Start `/workflow`
- [ ] Provide a realistic workflow review scenario
- [ ] Confirm output quality is useful and saved

### Summary flow
- [ ] Run `/summarize-session`
- [ ] Confirm summary file exists and is readable

### Error handling
- [ ] Remove API key / break provider config
- [ ] Confirm UI error is understandable
- [ ] Confirm next step is suggested

## Exit criteria

The build is acceptable when:
- core flows work manually
- targeted automated tests pass
- no high-severity file-loss or session-loss bugs remain
- the app feels stable enough for daily personal use
