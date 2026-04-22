# TAW Phase 999.5: Scope Decisions and Improvement Backlog

**Produced:** 2026-04-22
**Phase:** 999.5 — PWA/Extension Parity Review
**Input:** docs/parity-audit.md (gap matrix, PWA strength inventory, quick wins table)
**Status:** Authoritative scope record for Phase 999.5 Plan 03 and future planning

---

## Section 1: Decision Framework

The core heuristic governing every decision in this document: **"Good PWA candidate: one-shot action, no active session required. Poor PWA candidate: interactive multi-turn session, mode navigation, or Python subprocess dependency."** Mobile users need to tap, capture, or query in isolation — they cannot shepherd a multi-phase brainstorm session from a phone. Any TUI feature that requires the user to navigate modes, hold state across turns, or invoke a subprocess is TUI-only by nature. Features that are one-shot triggers (POST a payload, GET a list, fire an action) or read-only queries (fetch a list, render stats) are strong PWA candidates when they also have genuine mobile utility. Admin and environment-management commands that assume a terminal context (key rotation, config editing, project initialization) are permanently out of scope for the mobile surface.

---

## Section 2: Gap Scope Decisions

Decision values:
- **Quick win — 999.5**: Implement in Plan 03 of this phase (< 90 min effort each)
- **Backlog — future phase**: Implement later, not in scope for 999.5
- **TUI-only — permanent**: Will never be bridged; TUI session-interactive by nature
- **Out of scope — admin**: Not suitable for mobile surface

| Feature | Decision | Rationale | Target |
|---------|----------|-----------|--------|
| Brainstorm mode (phases 1+2) | TUI-only — permanent | Requires active session state, multi-phase navigation, multi-turn interaction. Cannot be initiated or managed without a running TUI session. | Never |
| `/finalize`, `/finalize-gen` | TUI-only — permanent | Artifact generation for map items depends on brainstorm session state. No standalone trigger makes sense. | Never |
| Map panel (MapPanel, MapPicker) | TUI-only — permanent | TUI-native visual component rendered by Ink. Not portable to HTML without a full re-implementation. | Never |
| `/save-map`, `/load-map`, `/commit-map` | TUI-only — permanent | Depends on brainstorm session context. No meaningful standalone action for mobile. | Never |
| `/wiki-item`, `/wiki-finalize-item`, `/wiki-save-item`, `/wiki-add-research`, `/wiki-resolve-item` | TUI-only — permanent | Wiki work session commands require interactive multi-turn session state. The Actions tab already handles review/intake queues (the mobile-appropriate subset). | Never |
| Voice mode (STT/TTS) | TUI-only — permanent | Python subprocess dependency makes mobile bridging impractical. Web Speech API inconsistency on Android adds risk. Phase 999.3 (voice) is paused at plan 5 of 7. Re-evaluate if Phase 999.3 resumes with a different transport. | Never (re-evaluate post-999.3) |
| `/flashcards` | Quick win — 999.5 | One-shot read; trivial GET endpoint; mobile knowledge-review is a genuine use case. No session context required — reads wiki files directly. | Plan 03 |
| `/workflow` (generate or review mode) | Backlog — future phase | Generate mode is feasible as a queued trigger but is multi-step. Review mode requires UI navigation too complex for a quick win. Low mobile urgency relative to other items. | TBD |
| `/lp-research` (AI-planned deep research) | Backlog — future phase | Lightpanda subprocess dependency. Not trivial; requires orchestration. Topics tab Research Seeds already covers the simpler case. | TBD |
| `/capture-idea` | Quick win — 999.5 | One-shot POST; `captureFeedback` already exists in `core/feedback/store.ts`. High mobile value — users get ideas away from desk. | Plan 03 |
| `/capture-issue` | Quick win — 999.5 | One-shot POST; same infrastructure as capture-idea. High mobile value for quick bug logging. | Plan 03 |
| `/ideas` (list captured ideas) | Quick win — 999.5 | Read-only list; single GET endpoint; reads feedback store files. Pairs with capture-idea to close the capture→review loop on mobile. | Plan 03 |
| `/issues` (list captured issues) | Quick win — 999.5 | Read-only list; same infrastructure as /ideas. Pairs with capture-issue. | Plan 03 |
| `/hister` | TUI-only — permanent | Hister binary dependency; local terminal-environment tool. Not suitable for PWA. No mobile use case. | Never |
| `/sources` (full list + metadata) | Backlog — future phase | Status tab partially covers this. Full source library management requires session context. Low urgency. | TBD |
| `/source-note`, `/rate-source`, `/search-source` | Backlog — future phase | Source library management; useful but not urgent. Requires session context for meaningful operation. | TBD |
| `/open-source`, `/source-views` | TUI-only — permanent | Terminal window management commands. Not portable to any non-terminal surface. | Never |
| `/checkpoint` | Out of scope — admin | Session context snapshot; debugging/archival tool. Not a mobile use case. | Never |
| `/summarize-session` | Backlog — future phase | Feasible as a queued background job but low priority relative to quick wins. No pressing mobile need. | TBD |
| `/session-usage` (cost telemetry) | Backlog — future phase | Status tab already shows basic info. Full telemetry useful but not urgent. Low mobile urgency. | TBD |
| `/status` (full session details) | Quick win — 999.5 | Status tab enrichment — add topic count and wiki health (pending review count). Small renderer update. | Plan 03 |
| `/config` | Out of scope — admin | Config management; not a mobile use case. Requires terminal context. | Never |
| `/init` | Out of scope — admin | Project scaffolding; requires local filesystem access. Not a mobile use case. | Never |
| `/or-key` | Out of scope — admin | API key management; security-sensitive; requires terminal context. | Never |
| `/attach-dir` | Out of scope — admin | Project context attachment; requires local filesystem. Not a mobile use case. | Never |
| `/exit-mode`, `/exit` | Out of scope — admin | TUI lifecycle commands. Not applicable to PWA. | Never |
| `/help` | Backlog — future phase | Technically simple but low mobile priority. Not blocking any other feature. | TBD |
| Research seeds source URLs | Quick win — 999.5 | Source URLs already present in `buildTopicResearchSeeds` response. Renderer update only — no new backend logic needed. | Plan 03 |
| `/session/append-context` (501 stub) | Backlog — future phase | Implementing "inject context into running session" requires a per-session IPC channel (named pipe or socket) that does not exist. Two blocking problems: (1) identifying which running TAW process is the current session when multiple tmux windows are open; (2) queuing the injection in a way the target session can consume. Simplest path (queue-for-next-launch) degrades the promise. Deferred until IPC channel exists. | TBD |

---

## Section 3: PWA Strength Preservation Decisions

| PWA Feature | Verdict | Action Required |
|-------------|---------|-----------------|
| Android Share Target | Preserve — no change needed | Core PWA value; the defining mobile capture mechanism. Already working after 999.4 service worker fix. Must work flawlessly — no changes that could break share_target registration. |
| Installable standalone app | Preserve — no change needed | PWA install prompt, homescreen icon, standalone window mode. Working correctly after 999.4 manifest and service worker validation. |
| Mobile-optimized UI | Preserve — no change needed | Touch targets sized for thumbs, swipe tab navigation, safe-area-inset padding. These micro-UX details distinguish a usable mobile tool from a crammed desktop UI. Any Plan 03 additions must respect existing touch target sizing. |
| Background ingest jobs | Preserve — no change needed | Wiki/research ingest runs as a background process after form submit; user can close the browser. Essential for mobile. Working correctly after 999.4 refactor. |
| Preview-before-confirm capture | Strengthen — future phase | Server-side page fetch shows title + excerpt before the user commits to ingesting. Consider porting explicit quality indicators to TUI `/research` command. Not in scope for Plan 03. |
| Topics deep analysis | Preserve — no change needed | Note-focused AI analysis: choose a specific note within a topic, ask a question. Unique analytical surface not replicated in TUI chat mode. Not modified in Plan 03. |
| Research seeds on-demand | Strengthen — quick win | One-tap SearXNG + AI gap analysis for any wiki topic. Source URLs already in `buildTopicResearchSeeds` result but not surfaced in renderer. Plan 03 surfaces them alongside AI summary — improves this unique strength. |
| One-tap action queue clearing | Preserve — no change needed | Pending review/intake items rendered as buttons; one tap runs confirm/cancel/reindex. Superior UX for queue clearance vs TUI prompt typing. Not modified in Plan 03. |

---

## Section 4: Open Question Answers

**Q1: Should the parity audit include `docs/browser-bridge-spec.md`?**
Answer: Yes — included in Plan 01 Section 6 (spec vs implementation). The spec documents 6 endpoints; the Phase 999.4 implementation has 12. This is spec lag, not behavioral divergence — the spec was written before the PWA and wiki ingest paths were added. The implementation is correct; the spec is out of date. No significant behavioral divergence was found. The `initialQuestion` field in the research payload schema is present in the implementation but absent from the spec — a benign addition.

**Q2: What is the intended deployment model for the PWA?**
Answer: The current model (127.0.0.1 access via USB debugging or Tailscale tunnel on Android) is acceptable for beta. The tool is single-user and personal; formal HTTPS/Tailscale infrastructure setup is not a blocking requirement. Tailscale formalization is out of scope for Phase 999.5. Defer to a future infrastructure phase if the user decides to formalize LAN access. The beta deployment model stands as-is.

**Q3: Is voice mode (STT/TTS) a candidate for the PWA?**
Answer: No. The current TUI voice implementation relies on a Python subprocess for STT (Whisper). Bridging this to a mobile PWA would require either: (a) running the Python process on the server and streaming audio from the phone (high complexity, latency issues), or (b) switching to Web Speech API on the client (inconsistent Android support, especially for continuous input). Web Speech API on Android is unreliable for the multi-turn session use case that voice mode targets. Phase 999.3 (voice) is also paused at plan 5 of 7, meaning the TUI voice implementation itself is not fully stabilized. Voice stays TUI-only until Phase 999.3 is complete and a transport model has been evaluated. Decision: **TUI-only — permanent** (subject to re-evaluation after 999.3 completion).

**Q4: Flashcards — PWA candidate?**
Answer: Yes. `/flashcards` reads Q: / A: pairs from wiki markdown files — a purely read-only operation with no session dependencies. An API endpoint that scans wiki files for flashcard pairs and returns a JSON array is straightforward to implement. Mobile flashcard review is a genuine use case (reviewing research notes away from the desk). Included as a quick win in Plan 03: `GET /app/api/flashcards` endpoint + Topics tab or dedicated panel rendering. Decision: **Quick win — 999.5**.

---

## Section 5: Prioritized Improvement Backlog

### Quick Wins — Plan 03 Scope (Phase 999.5)

All items below are bounded to Plan 03 of this phase. Each is rated S (< 30 min) or M (30–90 min) effort.

| Priority | Feature | Type | Target Phase | Effort | Notes |
|----------|---------|------|-------------|--------|-------|
| 1 | `GET /app/api/flashcards` endpoint + Topics tab rendering | Quick win | 999.5 (Plan 03) | S | Parse Q:/A: from wiki markdown files; render as flashcard list in Topics tab or a new panel |
| 2 | Research seeds source URL surfacing | Quick win | 999.5 (Plan 03) | S | Source URLs already present in `buildTopicResearchSeeds` result; update `renderer.ts` to show them alongside AI summary — no backend change needed |
| 3 | Status tab enrichment (topic count + wiki health) | Quick win | 999.5 (Plan 03) | S | Call `listWikiTopics()` for topic count; call `buildAppActions()` for pending review count; add both to `buildRecentStatus` response and render in Status tab |
| 4 | `POST /app/api/capture-idea` endpoint | Quick win | 999.5 (Plan 03) | M | Call `captureFeedback('idea', ...)` via ensureAppState; add capture fields to Capture tab or Ask tab; wires mobile idea capture to existing feedback store |
| 5 | `POST /app/api/capture-issue` endpoint | Quick win | 999.5 (Plan 03) | M | Call `captureFeedback('issue', ...)` via ensureAppState; paired with capture-idea; same implementation pattern |
| 6 | `GET /app/api/ideas` read endpoint | Quick win | 999.5 (Plan 03) | S | Read feedback/ideas store files; return JSON array of idea entries |
| 7 | `GET /app/api/issues` read endpoint | Quick win | 999.5 (Plan 03) | S | Read feedback/issues store files; return JSON array of issue entries |

### Future Phases (Backlog)

Items below are out of scope for Phase 999.5 but should be revisited in future phases.

| Priority | Feature | Type | Target Phase | Effort | Notes |
|----------|---------|------|-------------|--------|-------|
| 8 | `/workflow` PWA trigger (generate mode) | Future | TBD | M | Queue workflow-generate job; skip review mode (requires multi-step UI). Generate-only path is feasible without session state. |
| 9 | `/summarize-session` PWA trigger | Future | TBD | S | Queue input + background launch; low mobile urgency but straightforward |
| 10 | Source library management (note, rate, search) | Future | TBD | M | Requires session context for meaningful annotation; build after source viewer rework |
| 11 | Preview-before-confirm quality indicators | Future | TBD | M | Port PWA pattern (page title + excerpt preview) to TUI `/research` command; adds quality validation before ingest |
| 12 | Session cost telemetry in Status tab | Future | TBD | S | Read session telemetry file; surface cost and token counts in Status tab enrichment |
| 13 | `/help` PWA rendering | Future | TBD | S | Technically simple; low mobile priority |
| 14 | Topics deep analysis in TUI | Future | TBD | M | Port PWA Topics → Deep Analysis pattern as `/analyze-note` TUI command |
| 15 | `/session/append-context` IPC implementation | Future | TBD | L | Requires per-session named pipe or socket; two hard blocking problems documented in audit |

---

## Section 6: Phase 999.5 Plan 03 Scope Summary

**Exactly what Plan 03 implements.** No other features. This list is the bounded scope that prevents creep.

### In Scope for Plan 03

- `GET /app/api/flashcards` — read wiki files for Q:/A: pairs, return `Flashcard[]` JSON; render in Topics tab
- `GET /app/api/ideas` — read feedback/ideas store, return entries JSON array
- `GET /app/api/issues` — read feedback/issues store, return entries JSON array
- `POST /app/api/capture-idea` — call `captureFeedback('idea', ...)` via appState; wire to Capture tab or Ask tab
- `POST /app/api/capture-issue` — call `captureFeedback('issue', ...)` via appState; same tab as capture-idea
- Status tab enrichment: add `topicCount` and `pendingReviewCount` to `buildRecentStatus` response and renderer
- Research seeds: surface source URLs in Topics tab research-seeds response rendering (renderer.ts update only)

### Explicitly Excluded from Plan 03

- `/session/append-context` implementation — non-trivial session targeting; IPC channel does not exist
- Any new PWA tabs — would require significant `renderer.ts` restructuring; out of scope for a quick-win plan
- Voice PWA bridging — out of scope per Section 4 Q3 decision above
- Any TUI-only features (brainstorm, map, wiki work sessions, hister)
- Workflow mode PWA trigger — multi-step; backlog per Section 5
- `/mobile` route changes — legacy path; new work targets `/app` exclusively
- SearXNG lifecycle controls in PWA — intentionally omitted; mobile users cannot manage Docker containers

### Files Plan 03 Will Modify

- `src/bridge/app-server.ts` — new API endpoints (flashcards, ideas, issues, capture-idea, capture-issue, status enrichment)
- `src/bridge/renderer.ts` — UI updates for flashcards rendering, research seeds source URLs, status tab enrichment

No other files should be modified in Plan 03. If a fix requires touching files outside these two, it must be documented as a deviation.
