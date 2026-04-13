# Working Docs Workflow

This directory exists to support handoff between agents and across sessions.

## Rule

Before any substantial implementation sprint, create or update a working doc in this directory.

The doc is the authoritative handoff record for that sprint while the work is in progress.

## Required Structure

Each working doc should contain these sections:

1. `Title`
2. `Goal`
3. `Scope`
4. `Constraints`
5. `Implementation Plan`
6. `Step Status`
7. `Decisions`
8. `Open Questions`
9. `Verification`
10. `Post-Implementation Summary`
11. `Files Touched`
12. `Next Steps`

## Step Status Rules

For each planned step:

- mark it `pending`, `in_progress`, or `completed`
- add a short completion note after implementation
- if a step changes shape mid-sprint, record why

## Update Timing

Update the doc:

- before major implementation starts
- after each meaningful milestone
- after tests/verification
- before pausing or handing off

## Naming Convention

Use:

```text
docs/working/YYYY-MM-DD-<short-slug>.md
```

Example:

```text
docs/working/2026-04-12-mobile-pwa-sprint.md
```

## Notification Workflow

If a sprint produces something the user should test on another device, send an ntfy notification when requested.

Current notification target:

- server: `https://ntfy.mattmariani.com`
- topic: `agent-chat`

Example command:

```bash
curl -sS -X POST 'https://ntfy.mattmariani.com/agent-chat' \
  -H 'Title: TAW Update' \
  -H 'Priority: high' \
  -H 'Tags: mobile,test_tube' \
  -d 'Your message here'
```

## Current Agent Expectation

Going forward, the agent should:

- create the working doc first for substantial implementation
- keep it updated during the sprint
- leave it in a usable state for takeover by another agent

This is now part of the repo workflow, not a one-off request.
