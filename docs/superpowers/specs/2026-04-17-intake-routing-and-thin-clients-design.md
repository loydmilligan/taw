# Intake Routing And Thin Clients Design

## Summary

TAW should formalize browser extension and PWA intake around three explicit entry paths:

1. add to existing map/topic
2. create new map
3. one-off research

The TUI remains the primary workspace and system of record. The extension and PWA remain thin capture surfaces that route content into TAW-owned state and workflows instead of trying to reproduce full TUI feature parity.

## Goals

- align extension and PWA with the brainstorm -> research -> wiki map-first workflow
- preserve a fast one-off research path that does not require entering a full brainstorm/map lifecycle
- let capture surfaces create new map shells, feed existing maps/topics, and start bounded research runs
- keep routing and terminology consistent across browser extension and phone share-target/PWA surfaces
- keep operational authority in the TUI and bridge-backed server state

## Non-Goals

- full TUI feature parity in extension or PWA
- long-form map editing from phone or extension popup
- autonomous routing based on weak inference
- inbox-first triage as the primary intake model

## Product Model

TAW has two complementary work styles:

### 1. Map-Centered Deep Work

This is the primary workflow for:

- addressing problems
- fleshing out ideas
- learning deeply on a topic
- working through open questions toward durable knowledge

The intended arc is:

`brainstorm/map -> define open items -> research/design/decide -> commit-map -> wiki`

This workflow is TUI-led. The extension and PWA can feed it, but they do not replace it.

### 2. One-Off Research

This is the secondary workflow for bounded investigations that do not justify opening a full map lifecycle. Example: reading an article about a new Claude Code feature, digging deeper on usage patterns, and preserving the result immediately.

The intended arc is:

`capture -> research -> finalize -> auto-ingest to wiki`

This path should support saving into either:

- a new wiki topic
- an existing wiki topic

It should not require a brainstorm/map stage first.

## Core Intake Paths

Both extension and PWA should start from an explicit router with three choices.

### Add To Existing Map/Topic

Purpose:

- attach new content, ideas, links, notes, or excerpts to work that already exists

Behavior:

- show the active destination by default when one exists
- allow choosing any existing map/topic from TUI-managed state
- allow adding optional user note/context
- submit captured payload into TAW for downstream handling

Outcome:

- the selected destination receives the captured material
- the TUI can surface it as new context, pending work, or attached intake

### Create New Map

Purpose:

- create a lightweight shell for new deep-work threads from browser or phone capture

Required fields:

- title
- type
- optional note

Initial type set:

- problem
- idea
- learning

Behavior:

- create a new map stub in TAW-owned state
- make that map available immediately from the TUI
- do not try to drive full map shaping from the capture surface

Outcome:

- user continues real exploration and structuring in the TUI

### One-Off Research

Purpose:

- support bounded research sessions that should conclude directly in the wiki

Inputs:

- source URL and/or captured content
- research question/topic
- destination choice: new wiki topic or existing wiki topic
- optional note/context

Behavior:

- run the research command flow without creating a full brainstorm/map session
- finalize the research artifact on completion
- auto-ingest the final result into the chosen wiki destination

Outcome:

- no manual promotion step is required for this mode
- research output lands directly in durable knowledge storage

## Authority And State Ownership

The TUI remains the authority for:

- map lifecycle and progression
- destination registry and active destination state
- command execution
- artifact generation
- wiki ingest/commit rules
- final representation of work in session and knowledge state

The extension and PWA are responsible for:

- capture
- routing choice
- lightweight creation flows
- destination selection
- request submission
- status and confirmation feedback

The extension and PWA should not own durable workflow state beyond temporary form/session convenience.

## Destination Model

For add-to-existing intake:

- default to the active destination when available
- allow selection of any existing map/topic from TUI-provided state
- do not limit routing to a single pinned destination only

For one-off research:

- require an explicit destination choice at submission time
- support both new topic creation and existing topic selection

This keeps routing explicit while preserving flexibility.

## Surface Responsibilities

### TUI

Primary workspace for:

- brainstorm and map development
- open-item handling
- research/design/decide progression
- wiki review and commit
- broad workspace management

### Browser Extension

Primary laptop-browser capture surface for:

- capturing current page or selection
- routing into existing map/topic
- creating a new map shell
- starting one-off research from something being read in-browser

It should stay optimized for fast capture from the browsing context, not workspace management.

### Android PWA / Mobile Share Target

Primary phone capture surface for:

- sharing URLs, notes, and quick context into TAW
- routing to existing map/topic
- creating lightweight new maps
- starting one-off research runs
- checking lightweight submission status

It should stay optimized for phone-share ergonomics, not deep editing or mode parity.

## Shared UX Rules

- present the same three top-level routing choices in extension and PWA
- use the same naming and terminology in both surfaces
- prefer explicit user routing over inference
- keep forms short and focused
- show a clear submission result and next state
- preserve the framing that TUI is the main place where the work gets developed

## Error Handling

### Destination Errors

- if the selected destination no longer exists, reject submission clearly and ask for reselection
- if active destination is stale, fall back to explicit destination picker

### Intake Errors

- if capture extraction fails, allow manual note/context submission rather than failing the whole action
- if bridge/TAW is unavailable, show a clear unavailable state instead of silently dropping work

### Research Errors

- if one-off research fails, do not claim wiki ingest succeeded
- preserve enough request metadata that the user can retry from TUI or capture surface

## Testing Strategy

### Unit / Integration

- route selection behavior for all three intake paths
- destination list and active destination fallback behavior
- map stub creation for title/type/note flow
- one-off research destination handling for new vs existing topic
- auto-ingest behavior after successful research finalize
- failure behavior when destination resolution or research execution fails

### End-To-End

- extension capture -> add to existing map/topic
- extension capture -> create new map
- extension capture -> one-off research -> auto-ingest
- PWA/share-target -> add to existing map/topic
- PWA/share-target -> create new map
- PWA/share-target -> one-off research -> auto-ingest

### Manual QA

- verify phone share-target flow remains fast enough for real-world use
- verify capture surfaces never require deep workspace navigation
- verify TUI sees newly routed work immediately enough to feel coherent

## Recommended Implementation Direction

Use an explicit intake router with thin capture clients:

- extension and PWA share one routing model
- routing is explicit, not inferred
- TUI/bridge state remains authoritative
- one-off research is treated as a first-class fast path rather than an awkward exception

This approach matches the product boundary:

- TUI is the main workspace
- extension and PWA are intake surfaces
- map-first deep work remains central
- bounded research remains fast and durable

## Open Design Decisions For Planning

These choices are now fixed for implementation planning:

- extension/PWA must support add to existing map/topic
- extension/PWA must support create new map
- extension/PWA must support one-off research
- add-to-existing must allow choosing any existing topic/map from TUI-managed state
- create-new-map uses title + type + optional note
- one-off research must ingest directly into either a new or existing wiki topic on completion
- capture surfaces are intentionally not feature-parity TUI clients

Implementation planning should focus on API shape, state propagation, destination representation, and migration of existing extension/PWA UX toward this model.
