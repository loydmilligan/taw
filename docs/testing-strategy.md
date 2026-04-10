# Testing Strategy

Applies to baseline `0.1.0-beta.3`.

## Testing philosophy

Testing should catch meaningful regressions without turning the repo into a UI-test project.

The target mix is:

- manual testing for terminal behavior and end-to-end flows
- targeted automated tests for critical filesystem, command, and state behavior

## Manual testing

Manual testing is the primary source of confidence for:

- launch behavior
- project/general storage mode clarity
- command discoverability
- streaming and interruption behavior
- structured-mode draft/finalize flow
- artifact quality

Use the formal playbook in [docs/manual-qa-checklist.md](manual-qa-checklist.md).

Use the ready-made fixtures in [qa-fixtures/README.md](../qa-fixtures/README.md) instead of inventing ad hoc test projects.

## Automated testing

Automated coverage should stay focused on behavior with real regression value:

- session path creation and metadata persistence
- command parsing
- artifact writing
- provider abstraction behavior with mocks
- prompt-context composition
- structured draft/finalize state transitions

Avoid:

- snapshot-heavy TUI tests
- tests tied to exact terminal layout details
- overmocked pseudo-integrations that do not protect real workflows

## Required automated coverage

### Session manager

- project mode path resolution
- general mode path resolution
- folder creation behavior
- metadata persistence

### Commands

- slash command detection
- argument parsing
- graceful handling of unknown commands
- finalize behavior only using valid completed drafts

### Artifact engine

- files are written to the session artifact folder
- file names are safe and stable enough
- artifacts are recorded in session metadata

### Context and prompt setup

- project config inclusion
- attached directory inclusion
- recent artifact inclusion
- session summary inclusion

## Release expectation

Before cutting a beta tag:

1. Run the targeted automated suite.
2. Run typecheck, lint, and build.
3. Run the manual QA playbook against the included fixtures.
4. Record any remaining gaps in `KNOWN_LIMITATIONS.md`.
