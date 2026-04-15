# Terminal AI Workspace (TAW)

## What This Is

TAW is a terminal-native, chat-first AI workspace that guides users through a structured workflow: any problem, learning topic, project idea, or business challenge gets transformed into a deeply-researched idea map — a tree of markdown notes with research, decisions, and design docs at each node — which is then committed as structured topics into an Obsidian vault. That vault is a personal RAG knowledge base that grows with every session and is available for chat via tool integration.

The product is a personal AI thinking partner and knowledge management system, built for a single power user, run entirely from the terminal.

## Core Value

Every session leaves a permanent, queryable artifact in the knowledge base — the map-to-vault pipeline must always work end-to-end.

## Requirements

### Validated

- ✓ TUI shell — Ink/React terminal UI with header, transcript pane, footer — existing
- ✓ Session management — session IDs, slugs, artifact tracking in `.ai/sessions/` — existing
- ✓ Command engine — slash command parser + registry, ~40 commands — existing
- ✓ Provider abstraction — Anthropic + OpenAI-compatible adapters, unified interface — existing
- ✓ Chat streaming — streaming responses with tool invocation during turns — existing
- ✓ Mode system — General, Brainstorm, Workflow Review/Generate, Research, Wiki modes — existing
- ✓ Brainstorm phase system — phase-aware commands with mode colors and UI indicators — existing
- ✓ Artifact writer — timestamped markdown artifacts tracked in session metadata — existing
- ✓ Wiki/Obsidian integration — topic management, indexing, frontmatter, backlinks — existing
- ✓ Research system — SearXNG + OpenRouter web search, source persistence, ratings — existing
- ✓ Bridge server — HTTP server for browser extension + headless research automation — existing
- ✓ Telemetry — token usage, cost tracking, latency per session — existing
- ✓ Context builder — assistant files, wiki refs, research sources assembled per turn — existing
- ✓ Map panel UI — visual map picker and panel for brainstorm maps — existing (in progress)

### Active

- [ ] Finalize brainstorm → vault pipeline — research enrichment loop, decision finalization, design doc generation, vault commit with tree structure preserved
- [ ] Map finalization step — the last step of the workflow: adding research topics, looping back, finalizing decisions, committing map to Obsidian
- [ ] Stabilize and validate all new wiki commands — wiki-add-research, wiki-finalize-item, wiki-resolve-item, wiki-save-item, wiki-item
- [ ] Map persistence commands — load-map, save-map, map-file working correctly end-to-end
- [ ] Bug fixes and polish from current testing round

### Out of Scope

- Multi-user support — single-user personal tool by design; concurrency concerns are known but not blocking
- Mobile/web UI — terminal-only; no browser-based equivalent planned
- Cloud sync — local-first; vault sync is the user's responsibility (Obsidian Sync, git, etc.)
- Autonomous code execution — no agent-driven file edits without explicit user commands

## Context

- Stack: Node.js 20+, TypeScript 5.9+, Ink 6 (React for terminal), Zod, Vitest, pnpm
- The codebase map was run 2026-04-14; architecture is well-understood
- Known technical debt: file write race conditions, XSS in bridge HTML generation, silent failure swallowing in config/wiki loaders — these are tracked in `.planning/codebase/CONCERNS.md`
- The redesign to deliver the brainstorm → idea map → vault workflow is the current milestone; testing is in progress
- `src/app/App.tsx` and `src/bridge/server.ts` are the largest, most complex files — changes here require care

## Constraints

- **Tech stack**: Node.js + TypeScript + Ink — no runtime switches, no web server for the TUI
- **Filesystem**: All writes go through `services/filesystem/`; no writes outside session/project dirs
- **Provider isolation**: Provider-specific logic must not leak outside `core/providers/`
- **No prompt logic in UI**: System prompts and context assembly stay in `core/`
- **Single user**: Designed for personal use — multi-user concurrency is a non-goal

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Ink/React for TUI | Declarative component model for terminal; avoids manual cursor math | ✓ Good |
| No external state manager (Redux/Zustand) | Beta scope; React hooks sufficient | — Pending |
| OpenRouter as primary provider | Unified API for many models; simplifies key management | ✓ Good |
| Local-first (no cloud) | Privacy, simplicity, user control | ✓ Good |
| Obsidian as vault target | User already uses Obsidian; preserves tree structure as linked MD | ✓ Good |
| SearXNG for local search | Privacy-preserving; Docker-based; falls back to OpenRouter | ✓ Good |
| Each brainstorm node = MD note | Enables per-node research/decisions and direct vault commit | — Pending (testing) |

---

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-14 after GSD initialization*
