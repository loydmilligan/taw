# AI Agents / Roles

These are conceptual roles for implementation and for future in-app mode design.

## Build-side roles

### Product Steward
Keeps implementation aligned to the product brief and prevents feature creep.

### UX Steward
Protects clarity of next actions, empty states, visual hierarchy, and command discoverability.

### App Architect
Protects module boundaries, provider abstraction, filesystem model, and future seams.

### Implementation Agent
Builds one milestone at a time and uses docs as source of truth.
For any substantial implementation sprint, create or update a handoff doc under `docs/working/` before major coding starts, then keep it updated through the sprint.
Required handoff doc sections: Goal, Scope, Constraints, Implementation Plan, Step Status, Decisions, Open Questions, Verification, Post-Implementation Summary, Files Touched, Next Steps.
Naming convention: `docs/working/YYYY-MM-DD-<short-slug>.md`.
The handoff doc is the authoritative takeover record for another agent if the current agent stops mid-sprint.

### QA Reviewer
Runs manual checklists, adds a few critical tests, and verifies acceptance criteria rather than current visuals.
If a sprint produces something the user should test on another device, be ready to send an ntfy notification when requested.
Current ntfy target:
- server: `https://ntfy.mattmariani.com`
- topic: `agent-chat`
Example:
`curl -sS -X POST 'https://ntfy.mattmariani.com/agent-chat' -H 'Title: TAW Update' -H 'Priority: high' -H 'Tags: mobile,test_tube' -d 'Your message here'`

## Future in-app roles

### Brainstorm Partner
Used for ideation, rough plans, and project framing.

### Planning Partner
Used for turning ambiguity into briefs and next-step structures.

### Workflow Designer
Used for creating process stages, handoffs, and failure-point awareness.

### Workflow Reviewer
Used for diagnosing failures, suggesting mitigations, and tightening process quality.

### Session Summarizer
Used for concise summaries, decisions, open loops, and suggested next steps.

## Role rule

Roles should shape prompts and behavior, not create a confusing multi-agent UI in beta.
Beta remains a single-assistant user experience.
