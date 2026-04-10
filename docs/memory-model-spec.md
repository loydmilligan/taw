# Memory Model Spec

Applies to baseline `0.1.0-beta.3`.

## Goal

Extend TAW memory beyond general assistant summaries so research sessions can preserve:

- source-specific findings
- recurring user interests
- watchlists
- historical parallels
- timestamped notes

The memory system must stay transparent, file-based, and editable.

## Memory layers

### Session memory

Purpose:

- preserve what happened in the current session
- track sources, draft findings, source notes, and generated artifacts

Examples:

- source list for a politics research session
- timestamp notes for a video
- repo integration ideas

Storage:

- session-local files under the session directory

### Persistent personal memory

Purpose:

- preserve what the user cares about across sessions
- support personalized follow-up and long-term recall

Examples:

- fascination with political norm changes
- interest in historical parallels for current political behavior
- desire to remember useful tech or AI ideas
- watchlist of promising GitHub repos
- preference for timestamped notes on videos

Storage:

- global memory files under `~/.config/taw/assistant/`
- optionally project-level overlays for project-specific research memory

## Proposed memory categories

### Interests

Stable recurring topics the user wants surfaced over time.

Examples:

- political norm erosion
- historical comparisons across presidencies
- deployable open-source tools
- memorable AI and Hacker News ideas

### Research themes

Higher-order recurring patterns within one domain.

Examples:

- political framing shifts
- policy-position reversals
- corruption normalization
- institutional stress signals

### Watchlists

Items worth revisiting later.

Examples:

- GitHub repos
- topics
- people
- channels
- articles

### Notes and highlights

Domain-specific durable notes.

Examples:

- timestamped video notes
- concise tech idea summaries
- historical parallel records

## Suggested file layout

### Global

```text
~/.config/taw/memory/
  interests.json
  political-themes.json
  repo-watchlist.json
  tech-ideas.json
  video-notes-index.json
```

### Session local

```text
session/
  sources.json
  source-notes.json
  research-memory.json
  timestamps.json
```

## Data design guidelines

- Keep memory structured when the category is recurring.
- Keep heavy raw content in separate files and index it.
- Preserve a human-readable explanation for every durable memory record.
- Avoid opaque embeddings-only storage for MVP.

## Example memory records

### Interest record

```json
{
  "id": "interest_001",
  "topic": "political norm erosion",
  "note": "User likes comparing current events to historical deviation points.",
  "createdAt": "2026-04-07T20:00:00.000Z",
  "updatedAt": "2026-04-07T20:00:00.000Z"
}
```

### Repo watchlist record

```json
{
  "id": "repo_001",
  "url": "https://github.com/example/project",
  "title": "example/project",
  "whyInteresting": "Potential deployment helper for future TAW research tooling.",
  "status": "watch",
  "createdAt": "2026-04-07T20:00:00.000Z"
}
```

### Historical parallel record

```json
{
  "id": "parallel_001",
  "currentEvent": "current administration action",
  "historicalComparator": "prior presidential action",
  "similarity": "both signaled a norm shift around executive conduct",
  "difference": "press and party reaction diverged sharply",
  "whyItMatters": "captures how norms changed over time",
  "sourceIds": ["source_001", "source_002"]
}
```

## Memory write rules

Do not automatically persist everything.

Prefer one of these triggers:

- explicit command
  - `/remember-interest`
  - `/remember-repo`
  - `/remember-idea`
- finalize step of a research artifact
- later, a review step that asks for confirmation before writing durable memory

## Retrieval policy

Every turn should not include all memory.

Preferred approach:

- inject short summaries every turn
- retrieve relevant raw records only when the current session overlaps with them
- use research type to narrow retrieval scope

Examples:

- politics sessions retrieve political interests and historical parallels
- repo sessions retrieve repo watchlist and integration ideas
- video sessions retrieve prior video note patterns and note-taking preferences

## Non-goals for MVP

- vector store as the primary memory mechanism
- fully automatic memory writing from every session
- hidden memory updates the user cannot inspect

## Planned integration points

- typed research mode definitions
- browser bridge source ingestion
- `/sources` and source-note capture
- persistent interests and watchlists
- explicit memory commands
