# AI Telemetry

## Purpose

TAW tracks AI request telemetry so the workspace can review cost, latency, token usage, and process effectiveness over time.

## Storage

Each session writes append-only telemetry to:

```text
<session>/ai-telemetry.jsonl
```

## What is tracked

- request lifecycle events
- per-turn usage summaries
- mode and session context
- interruption and error state
- artifact generation state
- OpenRouter generation metadata when available

## OpenRouter behavior

For OpenRouter requests, TAW attempts a best-effort follow-up fetch to:

```text
GET /api/v1/generation?id=<generation_id>
```

This is asynchronous from the user experience perspective and should not block the visible chat flow.

## Current reporting

- `/session-usage`

## Notes

- Telemetry focuses on raw truth first.
- Derived evaluation metrics are intentionally lightweight in this first version.
- Aggregate management-key analytics are out of scope for the initial implementation.
