# Codebase Concerns

**Analysis Date:** 2026-04-14

## Concurrency & Race Conditions

**File Write Race Conditions:**
- Issue: Multiple functions use `readFile()` → `writeFile()` pattern without locking for concurrent updates
- Files: 
  - `src/core/notes/notes-writer.ts` (appendFile)
  - `src/core/research/store.ts` (appendResearchSource, writeResearchSources)
  - `src/services/wiki/link-review.ts` (applyPendingLinkReview)
  - `src/services/config/env.ts` (saveEnvVar)
- Impact: Simultaneous writes from multiple sessions/processes can corrupt JSON files or lose data; two session.json writes can overwrite each other's updates
- Fix approach: 
  - Implement file-level locking (flock) or use atomic write-to-temp-then-rename pattern
  - Add write queue or mutex for critical files (session.json, sources.json)
  - For append-only operations, consider using dedicated append handles

**Session Metadata Updates:**
- Issue: `updateSessionMetadata()` in `src/core/sessions/session-manager.ts` and artifact creation in `src/core/artifacts/writer.ts` both modify `session.metadata.artifacts` without synchronization
- Files:
  - `src/core/sessions/session-manager.ts:88-97`
  - `src/core/artifacts/writer.ts:31-33`
- Impact: Rapid artifact creation can lose artifacts if writes race; metadata updates overwrite each other
- Fix approach: Use atomic JSON operations or introduce a transaction layer for metadata updates

## Error Handling & Recovery

**Silent Failures on File Read:**
- Issue: Config and research store functions silently return empty defaults on any error
- Files:
  - `src/services/config/loader.ts:54-58` (loadGlobalConfig catches all, returns `{}`)
  - `src/core/research/store.ts:20-22` (readResearchSources catches all, returns `[]`)
  - `src/services/wiki/manager.ts:36-45` (listWikiTopics catches all, returns `[]`)
- Impact: Actual file corruption, permission errors, or disk full conditions are invisible; user has no idea data is missing
- Fix approach: Log actual errors to debug log; distinguish between "file not found" (ok) vs "I/O error" (critical)

**Provider Error Message Opacity:**
- Issue: Provider errors in `src/core/chat/engine.ts:161-182` are caught but message quality depends entirely on what provider returns; no validation
- Files: `src/core/chat/engine.ts`
- Impact: Cryptic or misleading error messages; users can't tell if it's auth, quota, or network
- Fix approach: Parse error responses and normalize to standard error categories (invalid_key, rate_limited, timeout, invalid_model, etc.)

**Streaming Abort Not Fully Cleaned Up:**
- Issue: When stream is aborted in `src/app/App.tsx:401-439`, streamAbortRef is cleared but pending tool calls may still execute
- Files: `src/app/App.tsx`, `src/core/chat/engine.ts`
- Impact: Tool side effects (wiki writes, searches) can execute after user cancels; incomplete data written to artifacts
- Fix approach: Propagate abort signal through tool runtime; kill in-flight tools immediately

## Security Concerns

**XSS in Bridge HTML Generation:**
- Issue: Topic names are injected into HTML without escaping in `src/bridge/server.ts:2442-2446`
- Files: `src/bridge/server.ts:2442-2446`, `src/bridge/server.ts:1433`
- Code: `.concat(topics.map((topic) => '<option value="' + topic + '">' + topic + '</option>'))`
- Impact: Wiki topic names containing `'><script>alert('xss')</script><option value='` will execute arbitrary JavaScript
- Fix approach: Use `textContent` or proper HTML escaping helper; consider using DOM methods instead of string concatenation

**Markdown Rendering XSS:**
- Issue: `renderMarkdown()` in `src/bridge/server.ts:2246-2274` does NOT escape user content before wrapping in HTML tags
- Files: `src/bridge/server.ts:2276-2277`
- Code: User-controlled text is directly interpolated into regex replacements → innerHTML
- Impact: User or LLM output containing `<img src=x onerror=alert(1)>` will execute
- Fix approach: HTML-escape all user text before regex replacements, or use a sanitization library (e.g., DOMPurify via node-html-parser)

**Environment Variable File Parsing:**
- Issue: `.env` file parser in `src/services/config/env.ts` handles quotes but doesn't validate or sanitize values
- Files: `src/services/config/env.ts:84-107`
- Impact: Malformed env files (e.g., newlines in quoted values) can be misinterpreted; no protection against format confusion
- Fix approach: Use a proper dotenv parser library; validate loaded values against schema

**Command Execution in Shell Scripts:**
- Issue: `src/commands/open-source.ts:365-369` and `src/services/testing/research-harness.ts:360` use `shellEscape()` but the escape function may have gaps
- Files: `src/bridge/launcher.ts:87`, `src/commands/open-source.ts:356,365-369`
- Impact: If URL or title contains special shell characters not covered by `shellEscape()`, command injection possible
- Fix approach: Audit `shellEscape()` implementation; consider using execFile with array args instead of shell strings

## Performance Bottlenecks

**Memory: Large File Reads:**
- Issue: Wiki link review in `src/services/wiki/link-review.ts:27` loads all topic notes into memory at once
- Files: `src/services/wiki/link-review.ts`
- Cause: `loadTopicNotes()` reads all .md files in pages/ recursively, then filters and ranks
- Impact: On wikis with 1000+ pages, this is slow and memory-heavy; blocks UI during link review
- Improvement path: Stream file reads; implement pagination; lazy-load candidates

**String Operations: Markdown Rendering:**
- Issue: `renderMarkdown()` in `src/bridge/server.ts:2245-2274` uses chained `.replace()` calls on entire text at once
- Files: `src/bridge/server.ts:2245-2274`
- Impact: For large notes (10KB+), repeated regex passes are inefficient; browser hangs on render
- Improvement path: Use a real markdown parser or implement single-pass tokenizer

**Synchronous File Operations in App:**
- Issue: Bridge server uses sync operations for some file reads (search, telemetry)
- Files: Multiple locations in `src/bridge/server.ts`
- Impact: Long file reads block the entire HTTP server
- Improvement path: Audit for sync file calls; convert to async; consider connection pooling

## Fragile Areas

**Wiki Link Review State Machine:**
- Files: `src/services/wiki/link-review.ts`, `src/services/wiki/pending-link-review.ts`
- Why fragile: 
  - Complex multi-file proposal system with in-memory planned file tracking (`plannedFiles` map)
  - No transaction rollback if one write fails midway
  - Frontmatter updates happen separately from content updates; can get out of sync
- Safe modification: Add comprehensive unit tests for link review proposals; validate all updates before applying any
- Test coverage: No dedicated tests for link review proposal application

**Command Registry & Parser:**
- Files: `src/commands/registry.ts`, `src/commands/parser.ts`
- Why fragile:
  - Parser is simple string split; doesn't handle quoted args with spaces correctly in all cases
  - Registry has no validation that command names are unique or valid
  - No type safety between parsed args and command.run() signature
- Safe modification: Add tests for edge cases (empty args, nested quotes, special chars); add schema validation
- Test coverage: Parser may have untested edge cases

**App State Management:**
- Files: `src/app/App.tsx`, `src/app/state.ts`
- Why fragile:
  - Large component with multiple interacting state variables (inputState, appState, selectedSuggestion, etc.)
  - No single source of truth; refs used to work around stale closures (inputRef, appStateRef, streamAbortRef)
  - Async operations (chat, commands) can run concurrently and modify state in non-deterministic order
- Safe modification: Add invariant tests for app state transitions; consider reducer pattern
- Test coverage: No tests for complex interaction sequences (rapid input + abort + command + chat)

**Session Artifact Metadata:**
- Files: `src/core/artifacts/writer.ts`, `src/types/session.ts`
- Why fragile:
  - Artifact list in session.metadata.artifacts is mutable array modified directly
  - Path to file is stored but not validated; if file is deleted, metadata is stale
  - No cascade on artifact delete
- Safe modification: Validate artifact paths on session load; implement proper delete function
- Test coverage: No tests for artifact consistency

## Scaling Limits

**Session Storage Disk Usage:**
- Current capacity: Unlimited — session.json can grow indefinitely as artifacts are added
- Limit: On mobile/limited storage, large sessions will exhaust disk; artifact list has no pagination/lazy load
- Scaling path: Implement artifact list pagination; add session cleanup/archival; compress old artifacts

**Transcript Memory:**
- Current capacity: Full conversation history held in AppState
- Limit: With thousands of turns, transcript becomes slow to render; React reconciliation is O(n)
- Scaling path: Implement virtual scrolling in Transcript component; paginate old turns to disk

**Wiki Pages Per Topic:**
- Current capacity: All pages loaded into memory for link review
- Limit: 1000+ pages → slow link review and high memory usage
- Scaling path: Paginate wiki reads; implement lazy-load for link candidates

**Research Source Storage:**
- Current capacity: All sources stored in single sources.json file
- Limit: 10,000+ sources → JSON parsing/writing becomes slow
- Scaling path: Implement database (SQLite) or split sources into sharded files

## Missing Critical Features / Gaps

**No Transaction/Rollback System:**
- Problem: Multi-step operations (link review apply, artifact creation) can partially fail, leaving system inconsistent
- Blocks: Complex workflows that need all-or-nothing semantics
- Mitigation: Currently relies on re-running commands; no data integrity guarantees

**No Session Persistence Across App Restarts (CLI):**
- Problem: CLI mode doesn't persist state; closing terminal loses unsaved context
- Blocks: Long-running sessions; pausing and resuming work
- Current: Terminal mode assumed to be single-run

**No Conflict Resolution for Concurrent Edits:**
- Problem: If two processes write to same wiki page simultaneously, last-write-wins
- Blocks: Multi-user or multi-process wiki editing
- Current: Not a design goal (single-user assumption)

**Limited Error Context in Tool Execution:**
- Problem: Tool calls (write_wiki_page, search_web) fail silently if preconditions aren't met
- Blocks: Debugging failed finalization; recovering from partial updates
- Improvement: Add detailed error reporting to tool runtime

## Dependencies at Risk

**Custom Environment Variable Parser:**
- Risk: `src/services/config/env.ts` implements dotenv parsing manually; may have edge cases
- Impact: Malformed .env files can corrupt configuration
- Migration plan: Standardize on `dotenv` or `dotenv-parse-keys` package; add validation

**Direct File I/O Without ORM:**
- Risk: Research sources stored as JSON with no migration system; schema changes require manual file updates
- Impact: Upgrade paths are fragile; no version tracking
- Migration plan: Consider SQLite with better-sqlite3 for research store; maintain schema versions

**HTML String Generation in Bridge:**
- Risk: `src/bridge/server.ts` generates large HTML documents as template strings; prone to escaping errors
- Impact: XSS, malformed markup, difficult to debug
- Migration plan: Use a template engine (EJS, Eta) or HTML builder library

## Test Coverage Gaps

**No Tests for Concurrency:**
- What's not tested: Race conditions in file writes; simultaneous session updates
- Files: `src/core/notes/`, `src/core/research/`, `src/core/artifacts/`
- Risk: Corruption bugs in production with low reproduction rate

**No Tests for Provider Error Scenarios:**
- What's not tested: Invalid API keys, rate limits, timeout handling, malformed responses
- Files: `src/core/providers/`, `src/core/chat/engine.ts`
- Risk: Users hit uncovered error paths with poor error messages

**No Tests for Large Data:**
- What's not tested: 1000+ artifacts, 1000+ wiki pages, 10KB+ notes, large streaming responses
- Files: `src/services/wiki/`, `src/app/App.tsx` (rendering)
- Risk: Performance degradation or crashes in production with real data

**No Tests for Command Parsing Edge Cases:**
- What's not tested: Commands with special chars, nested quotes, very long args
- Files: `src/commands/parser.ts`
- Risk: User commands fail or parse incorrectly in unexpected ways

**No Integration Tests:**
- What's not tested: Full workflows (init → brainstorm → finalize → wiki read), error recovery, cleanup
- Files: Entire `src/bridge/` and `src/cli/`
- Risk: Bugs in glue between components invisible in unit tests

---

*Concerns audit: 2026-04-14*
