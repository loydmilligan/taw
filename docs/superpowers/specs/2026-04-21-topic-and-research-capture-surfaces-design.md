# Topic And Research Capture Surfaces Design

## Summary

TAW should align the browser extension and PWA around the same core product language as the TUI while preserving the TUI as the primary workspace. The capture surfaces should stay thin and focused on intake, not workflow execution.

The shared model is:

1. `Topic` is the full workflow object.
2. `Research` is a one-off "remember to think about this later" lane.
3. The PWA and extension are companion capture clients, not parallel workspaces.

## Goals

- make the PWA and browser extension match the TUI's naming, wording, and overall product framing
- keep the TUI as the primary and authoritative workspace
- let users capture content into an existing topic or create a new topic immediately
- keep one-off research separate from the topic workflow
- add a lightweight read-only topic lookup flow for mobile and desktop companion clients
- establish a clear MVP for existing-topic intake that does not depend on map-branch placement

## Non-Goals

- full TUI feature parity in the PWA or browser extension
- map editing from mobile or extension surfaces
- branch-level placement of captured content into an existing topic map during MVP intake
- turning `Research` into an implicit sub-part of a topic
- using the PWA or extension as primary workflow environments

## Product Model

### TUI Is Primary

The TUI remains the main workspace and system of record. Topic development, brainstorm progression, map shaping, design decisions, and durable workflow management stay in the TUI.

The PWA and browser extension exist to capture and retrieve lightweight context while pushing the user back toward the TUI for deeper work.

### Topic

`Topic` is the full workflow object. A topic is something that belongs to the main TAW process and should eventually live in the topic map and downstream knowledge workflow.

Capture surfaces should let the user either:

- create a new topic immediately
- add captured material to an existing topic

### Research

`Research` is a one-off lane for bounded material that should be remembered and revisited later, but is not part of a larger topic by default.

This should be framed as lightweight storage for later thinking, not as a partial topic or hidden topic precursor.

### Topic Lookup

`Look Up Topic` is a read-only action available in both companion clients. It returns a concise summary of an existing topic so the user can quickly orient themselves from mobile or desktop capture contexts.

It does not edit the topic, route material into map branches, or expose broad topic-management capabilities.

## Shared Actions

Both the PWA and browser extension should expose the same four actions:

1. `Add to Topic`
2. `Start New Topic`
3. `Save as Research`
4. `Look Up Topic`

The wording, meaning, and backend behavior should be shared. Layout and ergonomics may differ between desktop-extension and mobile-PWA contexts.

## Action Behavior

### Add to Topic

The user selects an existing topic from a searchable list and submits captured material against it.

For MVP, this does **not** attempt to place the capture into a specific map branch. Instead, the system stores the capture in a topic-scoped `to be added to map` queue for later TUI review.

This is a deliberate constraint. Existing topic maps can vary substantially in structure and branch naming, so trying to classify incoming material at intake time would create false precision and poor UX.

Confirmation text should clearly reflect the real behavior, for example:

- filed to topic for later map review
- saved to topic intake queue

It should not say the item was added directly to the map.

### Start New Topic

The user supplies a title and optional note. TAW creates the topic immediately and attaches the capture as initial seed context.

Creating a topic from the PWA or extension should not attempt to run the full brainstorm experience in those clients. Instead, it should create the topic right away and make clear that the next real workflow step continues in the TUI.

Confirmation text should reinforce that framing, for example:

- topic created and ready in TAW
- continue shaping this topic in the TUI

### Save as Research

The user saves a one-off research seed outside the topic workflow.

This path is for material that should be remembered and possibly explored later, but should not yet become part of a topic. The wording should feel lighter and more temporary than the topic flows.

### Look Up Topic

The user chooses an existing topic and receives a concise, passive summary.

This action is read-only. It does not expose editing, branching, or topic workflow controls.

## Surface Responsibilities

### Browser Extension

The browser extension is the desktop capture client. It should be optimized for:

- capturing the current page
- capturing selected text
- attaching quick notes
- quickly routing that material into `Topic` or `Research`
- quickly looking up an existing topic

It should stay fast and compact rather than trying to mirror the TUI's broader interface.

### PWA

The PWA is the mobile capture client. It should be optimized for:

- share-target capture
- pasted URLs or notes
- topic lookup while away from the terminal
- quick filing into `Topic` or `Research`

It should support the same action set and language as the extension while remaining mobile-first in layout and flow.

## Authority And State Ownership

The TUI and TAW-owned backend state remain authoritative for:

- topic creation
- topic summaries
- topic intake queues
- research storage
- map workflow progression
- future queue-triage and map-placement workflows

The PWA and extension should not own durable workflow state beyond temporary form state or local convenience state.

## MVP Data Model

The current generic "destination" framing should be replaced with explicit action-oriented modeling aligned to the user-facing actions.

The MVP needs these backend concepts:

- topic creation from capture input
- topic-scoped intake queue named `to be added to map`
- research capture storage separate from topics
- topic summary lookup endpoint
- topic list lookup for action pickers

For existing-topic capture, the intake queue is the durable result of the action. The later workflow for reviewing that queue and placing items into the topic map should be designed separately.

## UX Rules

- use the same nouns and action labels across TUI-adjacent surfaces
- preserve the framing that the TUI is primary
- keep capture flows short
- avoid implying capabilities that do not exist yet
- be explicit when an item is queued for later map review rather than placed into the map directly
- make `Research` feel separate from `Topic`, not like a weak version of it

## Error Handling

### Topic Selection Errors

- if a selected topic no longer exists, show a clear error and require reselection
- if topic lookup fails, do not show stale or partial summary content as if it were current

### Topic Intake Errors

- if capture extraction fails, still allow manual note submission
- if filing to a topic queue fails, do not claim the topic was updated

### Topic Creation Errors

- if topic creation fails, do not imply the brainstorm seed was saved
- preserve enough capture data in the client UI to let the user retry

### Research Errors

- if research capture saving fails, do not present it as safely stored

### Availability Errors

- if TAW or the bridge is unavailable, show a clear unavailable state instead of silently dropping work

## Testing Strategy

### Unit / Integration

- shared action schema validation
- topic creation from capture payload
- existing-topic capture writes to the correct topic intake queue
- research capture stays outside topic state
- topic lookup returns a concise summary payload
- topic list retrieval supports both PWA and extension pickers
- failure behavior for missing topics, unavailable bridge, and save failures

### End-To-End

- extension current-page capture -> `Add to Topic`
- extension current-page capture -> `Start New Topic`
- extension current-page capture -> `Save as Research`
- extension topic selection -> `Look Up Topic`
- PWA share-target capture -> `Add to Topic`
- PWA share-target capture -> `Start New Topic`
- PWA share-target capture -> `Save as Research`
- PWA topic selection -> `Look Up Topic`

### Manual QA

- verify the wording feels like TUI language rather than separate-product language
- verify confirmations always describe queueing vs direct map placement correctly
- verify new topics appear in TAW immediately after capture
- verify topic lookup summaries are concise and useful on mobile

## Recommended Implementation Direction

Implement this as a shared capture-action model that both clients consume, with surface-specific presentation only where ergonomics differ.

Do not attempt branch-aware routing in MVP. Build the topic-level intake queue first, then add a TUI-side triage workflow later.

Do not add more capture actions than the four approved here. Keep the model explicit and small until the queue-review workflow exists.
