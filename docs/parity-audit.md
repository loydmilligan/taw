# TAW Parity Audit: PWA, Extension, and TUI Feature Alignment

**Produced:** 2026-04-22
**Phase:** 999.5 — PWA/Extension Parity Review
**Status:** Authoritative baseline for Phase 999.5 scope decisions

---

## Overview

Phase 999.4 (bridge-refactor) is complete. The bridge server is now a clean 26-line dispatcher
(`server.ts`) that routes to two handlers: `bridge-core.ts` for the browser extension
(token-auth, no UI, 12 narrow endpoints) and `app-server.ts` for the PWA companion
(cookie-auth, full SPA, AI APIs). `renderer.ts` holds all HTML render functions as pure
template literals. The codebase is in the best state it has been to reason about surface
alignment. This document audits all three surfaces — TUI, PWA, and browser extension — for
feature parity, identifies gaps, rates them for mobile value and bridging effort, inventories
unique PWA strengths, and produces a quick-wins table for Phase 999.5 Plan 03.

---

## Feature Inventories

### Table 2a — TUI Commands (42 entries)

| Command | Purpose | Mode | PWA Analog | Gap Type |
|---------|---------|------|------------|----------|
| `/brainstorm` | Enter brainstorm mode Phase 1 — idea discovery | Brainstorm | None | Major |
| `/finalize` | Generate + save artifact for DECIDE/DESIGN/VALIDATE item | Brainstorm | None | Major |
| `/finalize-gen` | Generate artifact without marking resolved | Brainstorm | None | Major |
| `/save-map` | Save brainstorm map to disk | Brainstorm | None | Major |
| `/load-map` | Load a saved brainstorm map | Brainstorm | None | Major |
| `/commit-map` | Commit completed map to Obsidian vault | Brainstorm | None | Major |
| `/research` | Search the web and save results as research sources | Research | None | Medium |
| `/lp-research` | AI-planned research: SearXNG search + lightpanda ingest + iterative deepening | Research | None | Medium |
| `/sources` | List research sources in current session | Research | Status tab (partial) | Medium |
| `/open-source` | Open source in viewer / list open windows | Research | None | Low |
| `/source-views` | List and jump to open source windows | Research | None | Low |
| `/source-note` | Attach a note to a saved research source | Research | None | Low |
| `/search-source` | Search saved sources | Research | None | Low |
| `/rate-source` | Rate a saved research source | Research | None | Low |
| `/wiki` | Manage wiki (init/ingest/query/links/reindex/list) | Wiki Setup/Query/Lint | Capture tab (ingest only) | Medium |
| `/wiki-item` | Open wiki work session for a specific open item | Wiki | None | Major |
| `/wiki-finalize-item` | Generate + save artifact for wiki item | Wiki | None | Major |
| `/wiki-save-item` | Persist a wiki item change | Wiki | None | Major |
| `/wiki-add-research` | Add a research item to the map | Wiki | None | Major |
| `/wiki-resolve-item` | Mark map item as resolved | Wiki | None | Major |
| `/voice` | Toggle voice mode (STT input + TTS output) | All | None | Major |
| `/flashcards` | Browse flashcards extracted from research notes | General | None | Medium |
| `/workflow` | Enter workflow generate or review mode | Workflow | None | Medium |
| `/capture-idea` | Save a feature/improvement idea with chat context | General | None | Medium |
| `/capture-issue` | Save a bug-like issue with chat context | General | None | Medium |
| `/ideas` | Render captured feature ideas as markdown | General | None | Medium |
| `/issues` | Render captured issues as markdown | General | None | Medium |
| `/hister` | Search, inspect, and reindex Hister browser history index | General | None | Medium |
| `/summarize-session` | Write session-summary.md for current session | General | None | Low |
| `/session-usage` | Show usage and cost telemetry | General | Status tab (partial) | Low |
| `/status` | Show session, storage, and attachment details | General | Status tab (partial) | Low |
| `/config` | Show or update provider/model configuration | General | None | Low |
| `/init` | Create local .ai project scaffolding | General | None | Low |
| `/or-key` | Create, rotate, and inspect OpenRouter app keys | General | None | Out of scope |
| `/attach-dir` | Attach a directory to session context | General | None | Low |
| `/checkpoint` | Save annotated context bundle (transcript + state + notes) | General | None | Low |
| `/confirm` | Confirm pending preview action | All | Actions tab (one-tap) | None |
| `/cancel` | Cancel pending preview action | All | Actions tab (one-tap) | None |
| `/exit-mode` | Return to General mode | All | None | Low |
| `/exit` | Exit TAW gracefully | All | None | Out of scope |
| `/help` | Show available commands and examples | All | None | Low |
| (map panel) | Ctrl+P to open MapPicker; MapPanel renders brainstorm map | TUI UI | None | Major |

### Table 2b — PWA Features (5 tabs)

| Tab | Feature | TUI Equivalent | Unique to PWA? |
|-----|---------|----------------|----------------|
| Capture | URL input with page preview (server-side fetch via `/app/api/capture-url`) | None | YES |
| Capture | Wiki mode — topic picker (from API), new topic creation | `/wiki ingest <topic>` | NO |
| Capture | Wiki mode — user note field | `/wiki ingest` note arg | NO |
| Capture | Wiki mode — auto-run checkbox | `/wiki ingest --auto` | NO |
| Capture | Research mode — initial question field | `/research <question>` | NO |
| Capture | Preview-before-confirm (shows page title + excerpt before submit) | None | YES |
| Capture | Android Share Target (OS-level tap-to-share integration) | None | YES |
| Capture | Tactile swipe navigation between tabs | None | YES |
| Ask | Free-form text prompt field | General chat | NO |
| Ask | Calls `/app/api/ask` → `executeChatTurn` in General mode | Any TUI chat input | NO |
| Ask | Renders markdown AI response in UI | TUI transcript | NO |
| Actions | Pending wiki review queue (link review, reindex) per topic | `/wiki links <topic>` | NO |
| Actions | Pending intake queue (confirm/cancel pending wiki ingest, link review, index review) | `/confirm`, `/cancel` | NO |
| Actions | One-tap action execution | Multi-step TUI prompts | YES |
| Status | Current mode display | `/status` | NO |
| Status | Queued inputs count | `/status` | NO |
| Status | Research source count | `/sources` | NO |
| Status | Session folder path | `/status` | NO |
| Status | Background job list (running/success/failed with timestamps) | None (jobs invisible in TUI) | YES |
| Topics | Topic picker (all wiki topics) | `/wiki list` | NO |
| Topics | Summarize button (wiki-only or full summary) | No direct equivalent | YES |
| Topics | Research Seeds button (SearXNG search + AI gap analysis) | `/lp-research` (partial) | YES |
| Topics | Deep Analysis — choose a note, enter question, run AI analysis | No direct equivalent | YES |
| PWA infra | Service worker with shell caching | N/A | YES |
| PWA infra | Web App Manifest with share_target registration | N/A | YES |
| PWA infra | Installable as standalone app (display: standalone) | N/A | YES |
| PWA infra | Cookie-based session auth | N/A | YES |
| PWA infra | Client-side session check on load (stateless PWA shell) | N/A | YES |

### Table 2c — Extension Endpoints (12 entries)

| Endpoint | Method | PWA Equivalent | TUI Equivalent | Status |
|----------|--------|----------------|----------------|--------|
| `/version` | GET | None | None | Live — public, no auth |
| `/health` | GET | None | `/status` | Live — token auth |
| `/job/:id` | GET | None (PWA uses internal background jobs) | None | Live — token auth |
| `/wiki/topics` | GET | Topics tab (internal) | `/wiki list` | Live — token auth |
| `/search-backend/status` | GET | None | None (managed internally) | Live — token auth |
| `/search-backend/start` | POST | None | None | Live — token auth |
| `/search-backend/stop` | POST | None | None | Live — token auth |
| `/search-backend/touch` | POST | None | None | Live — token auth |
| `/session/new-research` | POST | `/app/api/research-ingest` | `/research` | Live — token auth |
| `/session/new-wiki-ingest` | POST | `/app/api/wiki-ingest` | `/wiki ingest <topic>` | Live — token auth |
| `/session/new-mobile-wiki-ingest` | POST | `/app/api/wiki-ingest` (same logic) | `/wiki ingest` | Live — legacy mobile path |
| `/session/append-context` | POST | None | `/attach-dir` (conceptual) | **501 stub — not implemented** |

---

## Gap Matrix — TUI Features Not in PWA

| TUI Feature | Gap Type | Mobile Value | Effort to Bridge | Recommendation |
|-------------|----------|--------------|------------------|----------------|
| `/brainstorm` (Phase 1 — idea discovery) | Major | L | H | TUI-only |
| `/finalize`, `/finalize-gen` | Major | L | H | TUI-only |
| `/save-map`, `/load-map`, `/commit-map` | Major | L | H | TUI-only |
| Map panel (MapPanel, MapPicker — Ctrl+P) | Major | L | H | TUI-only |
| `/wiki-item`, `/wiki-finalize-item`, `/wiki-save-item`, `/wiki-add-research`, `/wiki-resolve-item` | Major | L | H | TUI-only |
| `/voice` | Major | H | H | Deferred |
| `/research` (web search) | Medium | M | M | Deferred |
| `/lp-research` (AI-planned deep research) | Medium | M | H | Deferred |
| `/flashcards` (wiki Q&A review) | Medium | H | L | Bridge |
| `/workflow` (generate or review mode) | Medium | L | H | Deferred |
| `/capture-idea` (save feature idea) | Medium | H | L | Bridge |
| `/capture-issue` (save bug/issue) | Medium | H | L | Bridge |
| `/ideas` (render captured ideas) | Medium | H | L | Bridge |
| `/issues` (render captured issues) | Medium | H | L | Bridge |
| `/hister` (browser history search) | Medium | L | H | Deferred |
| `/sources` (full list + metadata) | Low | M | M | Deferred |
| `/source-note`, `/rate-source`, `/search-source` | Low | L | M | Deferred |
| `/open-source`, `/source-views` | Low | L | H | Out of scope |
| `/checkpoint` (context snapshot) | Low | L | M | Deferred |
| `/summarize-session` | Low | L | M | Deferred |
| `/session-usage` (telemetry) | Low | L | L | Bridge |
| `/status` (full session details) | Low | M | L | Bridge |
| `/config` | Low | L | M | Out of scope |
| `/init` | Low | L | M | Out of scope |
| `/or-key` | Low | L | L | Out of scope |
| `/attach-dir` | Low | L | M | Out of scope |
| `/exit-mode`, `/exit` | Low | L | L | Out of scope |
| `/help` | Low | L | L | Deferred |

**Classification rules applied:**
- **TUI-only**: Requires interactive multi-turn session (brainstorm phases, map navigation, wiki work sessions)
- **Bridge**: One-shot triggers or read queries that a mobile user can use in isolation
- **Deferred**: Technically feasible but low mobile value, or requires significant session context
- **Out of scope**: Admin CLI tools that make no sense on mobile, or require terminal environment

---

## PWA Unique Strengths

| Feature | Why Unique | TUI Equivalent | Verdict |
|---------|-----------|----------------|---------|
| Android Share Target | OS-level integration — tap "Share" from Chrome (or any Android app) → fills the Capture form automatically | None | **Preserve** — this is the defining mobile capture mechanism; it must work flawlessly |
| Installable standalone app | PWA install prompt, homescreen icon, standalone window mode — feels like a native app | None | **Preserve** — reduces friction for repeat mobile use; already working |
| Mobile-optimized UI | Touch targets sized for thumbs, swipe tab navigation, safe-area-inset padding for iPhone notch | None | **Preserve** — these micro-UX details distinguish a usable mobile tool from a crammed desktop UI |
| Background ingest jobs | Wiki/research ingest runs as a background process after form submit; user can close the browser | None (TUI foreground only) | **Preserve** — essential for mobile: users need to hand off and move on |
| Preview-before-confirm capture | Server-side page fetch shows title + excerpt before the user commits to ingesting | None | **Strengthen** — add explicit page quality indicators; currently the only surface that validates before ingest |
| Topics deep analysis | Note-focused AI analysis: choose a specific note within a topic, ask a question → deep contextual answer | No direct TUI command | **Preserve** — unique analytical surface not replicated in TUI chat mode; consider adding `/analyze-note` to TUI |
| Research seeds on-demand | One-tap SearXNG + AI gap analysis for any wiki topic via Topics tab | `/lp-research` (partial analog) | **Neutral** — parallel to TUI `/lp-research` but simpler scope; source URLs not yet surfaced in PWA output |
| One-tap action queue clearing | Pending review/intake items rendered as buttons; one tap runs confirm/cancel/reindex | TUI prompts require typing commands | **Preserve** — superior UX for queue clearance; no reason to degrade this pattern |

---

## Extension Surface Analysis

### What the extension is and isn't

The browser extension surface is narrow by design — it is a machine-facing handoff API, not a user interface. Its 12 endpoints fall into four categories: health/version probes (2), job status polling (1), wiki topic query (1), SearXNG lifecycle controls (4), and session launch triggers (4). There is no HTML UI, no WebSocket, no streaming. All endpoints authenticate via the `x-taw-token` header; only `/version` is public. The extension is correctly scoped: it captures page context and fires it into TAW's session queue, then gets out of the way.

### /session/append-context — the 501 stub

The `POST /session/append-context` endpoint exists in `bridge-core.ts` (line 325) and returns 501 with the message "Append-context targeting is not implemented yet." The spec (`docs/browser-bridge-spec.md`) describes this as the "Append to Current TAW Session" action — the user would use it when they find a supporting source while already in a research session and want to inject it without starting a new session. Implementing it requires solving two hard problems: (1) identifying which running TAW process is the "current" session — when multiple tmux windows are open, there is no IPC channel to target a specific one, and (2) queuing the context injection in a way the target session can consume. The simplest path would be a "queue for next launch" semantic (write a queued-inputs file and let the next TAW launch pick it up), but this degrades the "append to running session" promise. The correct implementation requires an IPC channel (e.g., a named pipe or socket per session) which does not exist today. **Recommendation: leave as deferred; document the two blocking problems in Plan 02.**

### SearXNG controls not exposed in PWA

The extension exposes four SearXNG lifecycle endpoints (`/search-backend/start`, `/stop`, `/status`, `/touch`) that the PWA does not expose. This is intentional, not a gap. The PWA's research flows (Topics → Research Seeds, Capture tab research mode) consume SearXNG indirectly via `buildTopicResearchSeeds` and `queueResearchIngestRequest`, which manage the backend internally. Exposing start/stop controls to a mobile PWA user would be confusing and potentially disruptive — the user cannot manage a Docker container from a phone in a meaningful way. The extension SearXNG controls are correctly scoped to a desktop environment where the user might want to manually conserve resources. **Verdict: intentional design, not a gap.**

### /mobile (legacy) vs /app (PWA) — separate surfaces

`/mobile` and `/app` are two distinct surfaces with different UX contracts. `/mobile` is the legacy warm-color form introduced before the full PWA: it uses a token in the URL parameter for auth (not cookie), has no service worker, no share target registration, no swipe navigation, and uses a warm parchment color scheme (`--bg: #f4ede6`). It calls `renderMobilePage` in `renderer.ts` and maps to the `new-mobile-wiki-ingest` flow in `bridge-core.ts`. `/app` is the full PWA: dark slate theme, cookie auth, service worker caching, Web App Manifest with Android Share Target, swipe tabs, background jobs. They share some backend logic (same `queueWikiIngestRequest` function) but are separate render paths. The legacy `/mobile` path is preserved for backward compatibility with existing Android shortcuts; new development goes into `/app` only. Any quick wins in Plan 03 must target `/app` routes exclusively.

---

## Spec vs Implementation Check

Reading `docs/browser-bridge-spec.md` (baseline `0.1.0-beta.4`) against the Phase 999.4 implementation:

1. **Spec lists only 6 endpoints; implementation has 12.** The spec was written before the PWA and wiki ingest paths were added. It lists `/session/new-research`, `/health`, and the four SearXNG controls. The implementation adds `/version`, `/job/:id`, `/wiki/topics`, `/session/new-wiki-ingest`, `/session/new-mobile-wiki-ingest`, and `/session/append-context` (stub). This is not spec drift so much as spec lag — the spec was never updated after the wiki ingest and PWA work. The implementation is correct; the spec is out of date.

2. **Spec describes `POST /session/append-context` as a "later endpoint"; implementation has it as a 501 stub.** The spec acknowledges it is deferred. The 501 stub is the correct implementation of that intent — the endpoint exists at the specified path but clearly signals non-implementation. The extension popup can detect 501 and show appropriate UI. No divergence requiring action.

3. **Spec payload schema omits `initialQuestion` field.** The spec shows a base payload with `kind`, `researchType`, `url`, `title`, `selectedText`, `pageTextExcerpt`, `userNote`, and `sentAt`. The implementation's `browserResearchPayloadSchema` (in `src/core/research/schema.ts`) includes `initialQuestion` as an additional field. The PWA's research ingest form (`/app/api/research-ingest`) uses this field. The spec does not mention it. This is a benign addition, but the spec should be updated to reflect the current schema.

**Overall assessment:** No significant behavioral divergence. The spec is a baseline document from an early milestone and has been superseded by the Phase 999.4 implementation. It should be treated as historical context, not a current specification.

---

## Quick Wins Summary

| Gap | Quick Win | Files Affected | Effort |
|-----|----------|----------------|--------|
| No flashcard access from PWA | Add `GET /app/api/flashcards` endpoint reading Q:/A: pairs from wiki; render in Topics tab or new Flashcards tab | `app-server.ts`, `renderer.ts` | S |
| No ideas/issues capture from PWA | Add `POST /app/api/capture-idea` and `POST /app/api/capture-issue` endpoints calling `captureFeedback` from `core/feedback/store.ts`; add capture fields to Capture tab or Ask tab | `app-server.ts`, `renderer.ts` | S |
| Status tab is minimal — missing wiki health | Surface topic count and pending review item count already available from `listWikiTopics()` and `buildAppActions()` | `app-server.ts` (buildRecentStatus), `renderer.ts` | S |
| Research seeds does not show source URLs | `buildTopicResearchSeeds` already has source URLs in result; update renderer to show them alongside AI summary | `renderer.ts` | S |
| No read access to captured ideas/issues from PWA | Add `GET /app/api/ideas` and `GET /app/api/issues` endpoints calling existing store readers | `app-server.ts`, `renderer.ts` | S |
| Topics tab lacks per-note listing | `GET /app/api/topics/notes` endpoint already exists (verified in app-server.ts line 383); wire it to UI navigation in Topics tab | `renderer.ts` (JS only) | M |

**Effort scale:** S = under 30 min, M = 30–90 min, L = over 90 min
