# Repo Standards

## Goals

The repository should stay:
- clean
- easy to navigate
- low on churn
- documented enough for future work
- safe for AI-assisted implementation

## Branching and commits

For solo beta work:
- small, focused commits
- imperative commit messages
- one concern per commit when practical

Examples:
- `build session manager and metadata writer`
- `add brainstorm mode and artifact template`
- `polish footer hints and empty state`

## Directory hygiene

Keep directories purposeful:
- `src/` for application code
- `docs/` for product and engineering docs
- `ai/` for AI-facing process files and role definitions
- `workflows/` for implementation and release workflows
- `templates/` for markdown templates and prompt fragments
- `scripts/` for project scripts only

Do not let random experiments, duplicate prompt files, old one-off scripts, or abandoned prototypes linger in the root.

## Prompt hygiene
Prompt files should:
- have clear ownership/purpose
- be named by function, not by date
- avoid silent duplication
- include short notes on when to use them

## Code standards
- prefer small modules with clear names
- validate external inputs
- centralize filesystem logic
- centralize provider logic
- avoid hidden side effects
- keep mode behavior explicit

## Dependency discipline
Before adding a dependency, ask:
1. Does this save meaningful implementation time?
2. Is it well maintained?
3. Does it reduce complexity rather than add it?

Prefer fewer dependencies for beta.

## Documentation discipline
When adding a meaningful subsystem:
- update relevant docs if behavior changes materially
- keep README setup instructions current
- keep command docs accurate

## Definition of clean handoff
A handoff is clean when:
- setup works from the README
- docs reflect actual behavior
- debug instructions exist
- known limitations are listed
- there are no mystery files in the repo root

## Anti-patterns to avoid
- testing the exact UI instead of acceptance criteria
- mixing prompt logic into UI components
- letting commands bypass central app state
- provider-specific logic leaking everywhere
- hidden writes outside session/project dirs
