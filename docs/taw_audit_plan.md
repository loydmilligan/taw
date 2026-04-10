# TAW Audit And Improvement Plan

Applies to baseline `0.1.0-beta.3`.

## Summary

This document tracks the highest-value audit items and whether they are now addressed, partially addressed, or still open.

## Completed from the earlier audit

### Artifact over-generation

Status: complete

What changed:

- structured modes now stay in draft form
- artifacts are saved explicitly with `/finalize`
- interrupted or failed drafts are not valid finalize targets

### Context injection

Status: complete

What changed:

- chat execution now injects project config, attached directories, recent artifacts, and session summaries into prompt context

### Mode exit

Status: complete

What changed:

- `/exit-mode` cleanly returns the app to General mode without saving an artifact

### State clarity

Status: partial

What changed:

- the header now shows mode and phase
- the footer explains the draft/finalize loop

More work available:

- more nuanced provider and interruption states if needed after live usage

### Prompt constraints

Status: complete

What changed:

- structured prompts explicitly avoid early finalization
- prompts now encourage clarification and draft labeling before save

### Draft versus final separation

Status: complete

What changed:

- structured assistant responses are labeled as drafts
- final artifact writing is now a separate user action

## Current strengths to preserve

- clean separation between commands, core logic, and services
- session-based local storage model
- provider abstraction
- markdown-first artifact workflow

## Current open priorities

1. Run the full manual QA playbook with live provider credentials.
2. Collect real-user feedback on brainstorm/workflow prompt quality.
3. Expand automated coverage around provider error paths and summaries.
4. Decide whether workflow review needs a stronger scoring rubric.
5. Keep the release docs and fixture pack aligned with shipped behavior.

## Strategic guardrails

Avoid:

- turning TAW into a generic coding agent
- adding features faster than the manual QA process can validate them
- hiding important state transitions from the user

Favor:

- explicit mode behavior
- reliable artifact creation
- repeatable human verification
