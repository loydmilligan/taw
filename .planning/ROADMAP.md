# Roadmap: Terminal AI Workspace (TAW)

## Overview

TAW is a working product. The current milestone completes the brainstorm → idea map → Obsidian vault pipeline (the core workflow redesign), verifies it end-to-end, then addresses the most critical known bugs. Future phases add knowledge base improvements, research enhancements, and ongoing feature work as priorities emerge.

## Phases

- [ ] **Phase 1: Pipeline Completion** - Finish and stabilize all new map/wiki commands and the map UI
- [ ] **Phase 2: End-to-End Verification** - Test and validate the full brainstorm → vault workflow
- [ ] **Phase 3: Critical Fixes** - Security hardening and reliability improvements
- [ ] **Phase 4: Knowledge Base Enhancements** - Improve RAG quality, search, and chat-with-wiki UX

---

## Phase Details

### Phase 1: Pipeline Completion
**Goal**: All new commands and UI components from the redesign are implemented, working, and testable — map commands, wiki commands, map panel UI
**Depends on**: Nothing (work is already in progress)
**Requirements**: MAP-01, MAP-02, MAP-03, MAP-04, MAP-05, MAP-06, WIKI-01, WIKI-02, WIKI-03, WIKI-04, WIKI-05, MAPUI-01, MAPUI-02, MAPUI-03, TEST-02
**Success Criteria** (what must be TRUE):
  1. User can save and load a brainstorm map
  2. User can finalize decisions and generate design docs from a map node
  3. User can commit a completed map to the Obsidian vault
  4. All new wiki commands (wiki-add-research, wiki-finalize-item, wiki-resolve-item, wiki-save-item, wiki-item) execute without errors
  5. MapPanel and MapPicker render correctly in the TUI

**Plans:** 4 plans

Plans:
- [x] 01-01-PLAN.md — Consolidate map file parsing (load-map + App.tsx use shared readMapFile)
- [x] 01-02-PLAN.md — Audit new wiki commands and add Vitest coverage (TEST-02)
- [x] 01-03-PLAN.md — Stabilize MapPanel (all tags active, unified /wiki-item hint) and verify MapPicker/Ctrl+P
- [x] 01-04-PLAN.md — Implement /commit-map command (writes brainstorm map to Obsidian vault)

### Phase 2: End-to-End Verification
**Goal**: The full brainstorm → map → finalize → vault pipeline works end-to-end; committed topics are queryable in chat
**Depends on**: Phase 1
**Requirements**: E2E-01, E2E-02, E2E-03, TEST-01
**Success Criteria** (what must be TRUE):
  1. A complete workflow from `/brainstorm` to vault commit completes without errors
  2. The committed vault topics appear with correct tree structure (parent-child as wiki links)
  3. Topics committed to vault are accessible via chat tool in the same or a subsequent session
  4. Integration test covers the map → vault commit flow

**Plans:** 3 plans

Plans:
- [x] 02-01-PLAN.md — Vitest integration test for commit-map → vault pipeline (TEST-01, E2E-02)
- [x] 02-02-PLAN.md — tmux harness spec + fixture for /commit-map live TUI (TEST-01, E2E-01)
- [ ] 02-03-PLAN.md — Manual E2E run, issue triage, and Wiki Query context injection verification (E2E-01, E2E-03)

### Phase 3: Critical Fixes
**Goal**: Address the highest-priority security and reliability issues identified in the codebase audit
**Depends on**: Phase 2
**Requirements**: SEC-01, SEC-02, SEC-03, REL-01, REL-02, REL-03, TEST-03
**Success Criteria** (what must be TRUE):
  1. No XSS vulnerabilities in bridge HTML generation
  2. Config and wiki loaders distinguish file-not-found from actual I/O errors
  3. Stream abort stops in-flight tool calls (no partial wiki writes after cancel)
  4. Provider errors show meaningful messages (not raw API responses)

Plans:
- [ ] 03-01: Fix XSS in bridge server HTML generation (topic names, markdown rendering)
- [ ] 03-02: Fix silent failure swallowing in config loader and wiki manager
- [ ] 03-03: Propagate abort signal through tool runtime; kill in-flight tools on cancel
- [ ] 03-04: Normalize provider error messages to standard categories

### Phase 4: Knowledge Base Enhancements
**Goal**: Make the growing Obsidian vault more useful for chat — better retrieval, smarter context injection, improved search
**Depends on**: Phase 3
**Requirements**: TBD — define at phase planning time
**Success Criteria** (what must be TRUE):
  1. Chat with large vault (100+ topics) returns relevant results reliably
  2. User can see which wiki topics are being used as context in a given turn
  3. Research sources can be linked to vault topics for traceability

Plans:
- [ ] 04-01: TBD — define during phase research

---

## Progress

**Execution Order:** 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Pipeline Completion | 0/4 | Not started | - |
| 2. End-to-End Verification | 0/3 | Not started | - |
| 3. Critical Fixes | 0/4 | Not started | - |
| 4. Knowledge Base Enhancements | 0/1 | Not started | - |
| 5. TUI Testing Framework | 3/3 | Complete | 2026-04-15 |

### Phase 5: Create a tmux-based TUI testing framework for TAW — what Playwright is to web apps. Build a harness that controls TAW via tmux, reads structured test definition files (YAML/JSON with step-by-step tasks), executes those steps by sending keystrokes/commands to the running TUI, and records pass/fail results. Include the test runner, a test file schema, and example test specs.

**Goal:** A tmux-based TUI test harness drives TAW end-to-end, parses YAML spec files against a Zod schema, executes step actions (launch/type/key/wait/assert/sleep) via tmux send-keys + capture-pane, and emits TAP pass/fail output — enabling regression testing of rendering, keyboard input, and mode transitions that the existing headless runner cannot cover.
**Requirements**: TUI-01, TUI-02, TUI-03, TUI-04, TUI-05
**Depends on:** Phase 4
**Plans:** 3 plans

Plans:
- [x] 05-01-PLAN.md — Schema + pure assertion predicate with Vitest coverage (Wave 1)
- [x] 05-02-PLAN.md — tmux session/executor/reporter/runner CLI (Wave 2)
- [x] 05-03-PLAN.md — Example specs (smoke, commands, mode-transitions) + README, with live-run checkpoint (Wave 3)

---
*Roadmap defined: 2026-04-14*
*Last updated: 2026-04-14 after GSD initialization*

---

## Backlog

Ideas and future tasks not yet assigned to a phase.

| # | Task | Notes |
|---|------|-------|
| B-01 | Use `_test/` topic namespace for harness wiki writes | Fixture map topic should be `_test/pipeline-e2e` not `"Harness E2E Topic"`. All harness-generated wiki entries land under `~/.config/taw/wiki/_test/` — organized, non-polluting, wipeable. Requires: update `qa-fixtures/.../map-data.md` topic field, update `pipeline-e2e.yaml` assert, add `_test/` convention note to harness README. |

### Phase 999.1: Harness LLM-as-user — OpenRouter-driven variance testing (BACKLOG) **HIGH PRIORITY**

**Goal:** Add a new harness step type (e.g. `action: ai_user`) that makes an OpenRouter API call with the current conversation context to generate the next user turn, then types that response into TAW. Enables throwing varied, realistic input at TAW without the determinism of pre-scripted specs — catches bugs that only emerge with natural language variance.

**Why high priority:** Scripted specs (like `brainstorm-scripted-e2e.yaml`) are tight enough to verify known behavior but can't surface bugs that only appear with the AI responses users actually produce. The BUG-01/BUG-02/BUG-06/BUG-07 chain we hit on 2026-04-15 was only fully uncovered *because* scripted runs still exposed format drift the parsers didn't handle. With LLM-driven user turns, we can fuzz-test TAW continuously without human time. Without it, we're stuck either hand-typing every test scenario or accepting that scripted tests will miss whole classes of real-world failures.

**Requirements:** TBD — likely includes: cost/rate-limit guardrails (cap turns per test, cap $ per test); deterministic seed support for reproducibility; conversation context window management; failure modes when the LLM goes off-script.

**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.3: Voice interface — STT/TTS via OpenRouter with selective output (BACKLOG)

**Goal:** Add an opt-in voice mode so the user can speak input and hear TAW's responses. Start v0 by shelling out to the existing Python `voice_coding` CLI (`python -m voice_coding.cli listen` / `speak`) — no Node port. Wrap with a `/voice` toggle and push-to-talk binding. TTS side uses a per-mode extractor that produces "aggressively short" audio: strip mode footers and map skeletons, speak only the question/notice-title/first-sentence depending on mode.

**Why this shape:** The Python package works and has mature audio I/O (sounddevice+scipy). A Node port would re-solve solved problems in a scrappier audio ecosystem. Port later only if TAW ships to other users (Python-dep friction) or if subprocess latency (~150ms/turn) starts mattering next to the 3-8s STT+LLM+TTS round-trip.

**Reference doc:** `docs/INTEGRATION_VOICE_FOR_TAW.md` (written for a Python codebase; translate the integration points to TypeScript).

**Key design work (where the effort actually is):**
- Per-mode extractor in `src/services/voice/extract.ts`:
  - Brainstorm Phase 1/2: speak only the final sentence ending in `?`
  - General: first 1–2 sentences, cap ~25 words
  - Command notices (Map Committed, Artifact Saved, etc.): title only
  - Always strip the `─── Phase N · … · Options: ───` footer block
  - Always strip map skeleton sections (`### Problem`, `### Market`, etc.)
- Interruption: hotkey to cut active TTS playback mid-sentence.
- Cost cap: per-session $ ceiling; auto-disable voice when hit.
- Fallback: if STT/TTS fails, drop back to text silently and notify once.

**Open questions:**
- Push-to-talk binding (Ctrl-V hold? `/listen` command?) vs always-on with silence detection
- Where does the extractor sit — at the transcript entry writer, or as a post-render hook?
- Can the harness test any of this, or is voice outside the harness's scope forever?

**Requirements:** VOICE-01 (STT input), VOICE-02 (TTS output), VOICE-03 (per-mode extraction), VOICE-04 (cost/interruption guardrails).

**Plans:** 2/7 plans executed

Plans:
- [x] 999.3-00-PLAN.md — Wave 0 test scaffolding + fixture transcripts
- [x] 999.3-01-PLAN.md — Pure per-mode extractor (extract.ts) [TDD]
- [ ] 999.3-02-PLAN.md — VoiceService (listen/speak/interrupt) + Zod config schema [TDD]
- [ ] 999.3-03-PLAN.md — In-session cost accumulator (cost.ts) [TDD]
- [ ] 999.3-04-PLAN.md — AppState + CommandResult extension + /voice command + registry
- [ ] 999.3-05-PLAN.md — App.tsx wiring (Ctrl+V hotkey, TTS hook, interrupt, cost gate)
- [ ] 999.3-06-PLAN.md — Brainstorm P1/P2 prompt VOICE SUMMARY directive + regression test

### Phase 999.2: Harness agent-in-the-loop — conversation log bridge (BACKLOG)

**Goal:** Add a harness mode where TAW's pane output is written to a log file continuously, and a new step type (e.g. `action: await_agent_reply`) pauses the spec until a reply file is populated. A separate agent (Claude or similar) polls the log, decides the next user turn, writes to the reply file. The harness types that reply into TAW and continues. Enables semi-automated testing where an agent uses judgment for each turn.

**Why it matters (lower priority than 999.1):** Useful when you want an intelligent observer in the loop (e.g., adversarial probing, exploratory debugging) but each test requires an agent's time. Less scalable than 999.1 for volume testing. Good for one-off deep dives or regression exploration where variance alone isn't enough.

**Requirements:** TBD — likely includes: atomic read/write on the bridge files to avoid races; a clean way to signal "test complete" from the agent side; log format stable enough for agents to parse reliably.

**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)
