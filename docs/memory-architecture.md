# TAW Memory Architecture

## Goal

Keep TAW memory useful without paying the cost of passing large files on every message.

## Principles

- Use the live transcript as short-term memory.
- Keep durable memory in small markdown files with clear ownership.
- Pass strict behavior files every turn only if they stay short.
- Pass summaries every turn, not full long-term files.
- Retrieve raw memory sections only when relevant.
- Prefer simple file-based retrieval before adding a vector database.

## Proposed file layout

### Global

```text
~/.config/taw/assistant/
  AGENTS.md
  SOUL.md
  USER.md
  USER.summary.md
  MEMORY.md
  MEMORY.summary.md
  COMMANDS.md
```

### Project

```text
project/.ai/assistant/
  AGENTS.md
  SOUL.md
  USER.md
  USER.summary.md
  MEMORY.md
  MEMORY.summary.md
  COMMANDS.md
```

## File roles

- `AGENTS.md`
  Hard operating rules, workflow rules, and product boundaries.
- `SOUL.md`
  Personality, style, and conversational identity.
- `USER.md`
  Stable facts about the user: background, preferences, habits, strengths, constraints.
- `MEMORY.md`
  Durable facts and recurring context worth recalling across sessions.
- `COMMANDS.md`
  Generated command reference so the assistant can inspect its own slash commands.

## Precedence

- Global assistant files are the default base layer.
- Project assistant files are optional overlays.
- Project files do not erase the global files.
- When both exist, project files should be treated as stronger local guidance.

## Injection policy

### Every turn

- Global `AGENTS.md`
- Project `AGENTS.md` if present
- Global `SOUL.md`
- Project `SOUL.md` if present
- `COMMANDS.md`
- `USER.summary.md`
- `MEMORY.summary.md`

### Retrieved on demand

- raw sections from `USER.md`
- raw sections from `MEMORY.md`
- project-local sections when relevant to the current conversation

## Why not pass raw files every turn

- cost grows too quickly
- the model stops treating large repeated blocks as salient
- repeated long prompts make prompt quality worse, not better

## Why not start with a vector database

- the initial corpus is small
- markdown sections plus direct retrieval are cheaper and easier to reason about
- embeddings add complexity before TAW has stable memory shapes

## Suggested rollout

### Phase 1

- Add assistant file directories
- Generate `COMMANDS.md`
- Add `AGENTS.md`, `SOUL.md`, `USER.md`, `MEMORY.md` placeholders

### Phase 2

- Add summary generation for `USER.summary.md` and `MEMORY.summary.md`
- Inject command reference and summaries every turn

### Phase 3

- Add retrieval of relevant raw sections from `USER.md` and `MEMORY.md`
- Add explicit write rules for what belongs in `USER.md` versus `MEMORY.md`

### Phase 4

- Reassess whether embeddings or a vector store are needed

## Current TAW state

Today TAW persists session notes, summaries, and artifacts, but it does not yet perform durable memory recall. `COMMANDS.md` is the first generated assistant reference file added to close the command-awareness gap.
