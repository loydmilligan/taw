# Changelog

All notable changes to this project should be documented in this file.

The format is based on Keep a Changelog and the project uses Semantic Versioning for release tags.

## [0.1.0-beta.10] - 2026-04-12

### Added

- Wiki commands for topic setup, ingest, querying, linting, Hister-backed ingest, link review, and reindexing.
- Frontmatter-backed wiki maintenance state with `link_review_status` and `index_status` flows plus staged `/confirm` and `/cancel` handling.
- Hister command and client support for search, inspection, browser opening, and reindex control inside TAW.
- A bridge-hosted mobile companion app with installable PWA metadata, Android-oriented share-target support, capture flows, `Ask TAWD`, `Actions`, `Recent Status`, and `Topics`.
- Working-doc handoff workflow under `docs/working/` plus updated agent memory guidance.

### Changed

- Wiki ingest summaries now explicitly request created-vs-updated note totals before listing written paths.
- The bridge can now run queued wiki ingest work headlessly in the background and expose that status to the mobile companion.
- The bridge app manifest now serves concrete PNG icons and stronger install metadata for Android PWA behavior.

### Documentation

- Added Hister integration guidance and API notes in `docs/HISTER_README.md`.
- Added wiki planning and mobile/PWA planning docs for ongoing follow-up work.

## [0.1.0-beta.9] - 2026-04-11

### Added

- Wiki auto-ingest option in the browser extension, plus a saved default toggle for whether auto-ingest starts checked.
- Headless queued-command execution so the bridge can run wiki-ingest sessions in the background without opening the TAW UI.

### Changed

- Command-generated queued inputs now run before older queued items, which fixes startup sequencing for multi-step wiki flows such as init-then-ingest.

## [0.1.0-beta.8] - 2026-04-11

### Added

- Browser-extension wiki ingest flow with topic selection from existing wikis or entry of a new topic.
- Bridge endpoints for listing wiki topics and launching a TAW session with queued wiki commands.

### Changed

- The browser extension now supports two workflows in the popup: research and wiki.
- Bridge launch infrastructure now supports generic queued startup commands, not just browser research payloads.

## [0.1.0-beta.7] - 2026-04-11

### Added

- `/confirm` and `/cancel` commands for pending wiki-ingest preview flows.
- Pending Hister preview state so `/confirm` can ingest the exact previewed result set and `/open-source <n>` can inspect preview items before ingest.
- `docs/wiki-roadmap.md` to track smarter wiki updates, YAML frontmatter, and deferred link-crawling work.

### Changed

- `/wiki ingest-hister` preview entries now advertise `/confirm`, `/cancel`, and `/open-source <n>` directly in the UI.
- `write_wiki_page` now requires `overwrite=true` for intentional updates to existing files, which blocks accidental duplicate-page creation from silently overwriting notes.

### Fixed

- Pending preview confirmation now reuses the exact previewed Hister result list instead of rerunning the search query.

## [0.1.0-beta.6] - 2026-04-11

### Added

- Preview-first `/wiki ingest-hister` behavior that shows matched Hister results before fetching or ingesting content.
- `--max-results N` and `--yes` flags for `/wiki ingest-hister` so result volume is explicit and auto-confirm is opt-in.

### Changed

- `/wiki ingest-hister` now defaults to a capped preview of 5 results instead of immediately fetching and ingesting matching pages.
- Wiki prompts and schema guidance now require Obsidian-safe slug links like `[[agentic-loops|Agentic Loops]]`.

### Fixed

- Corrected broken Obsidian links in the existing `vibecoding` wiki where display text and slugged note filenames did not match.

## [0.1.0-beta.5] - 2026-04-11

### Added

- `/wiki ingest-hister <topic> [review] <query>` for searching Hister, fetching matching pages, extracting readable content, and feeding that content directly into wiki ingestion.
- `/hister <search|show|open|reindex>` for Hister-powered source import, inline source preview, terminal-browser opening, and reindex control from within TAW.

### Changed

- The TUI header and `/status` now read the current app version from the shared repository version source instead of a hardcoded UI string.
- Hister-backed searches now save fetched page content as session research sources so `/sources` and `/open-source` work with imported history pages.

### Fixed

- Hister-based wiki ingest no longer depends on preexisting session excerpts alone; it now fetches readable page text before writing wiki pages.

## [0.1.0-beta.4] - 2026-04-10

### Added

- `/source-views`, `/finalize-gen`, and `/or-key` commands for managed source windows, draft generation on finalize, and OpenRouter app-key lifecycle work.
- OpenRouter management-key support for showing account credits in the header.
- Local registry tracking for managed OpenRouter app keys written into external `.env` files.

### Changed

- Moved copied OpenRouter reference snapshots out of the live docs set into `docs/archive/openrouter-reference/`.
- Local tool binaries under `bin/` are now ignored as workspace artifacts.
- Bumped the documented release baseline to `0.1.0-beta.4`.

### Fixed

- `/open-source` now reuses existing managed source views instead of opening duplicates.
- OpenRouter streaming usage is now captured directly for cost and token telemetry even when generation metadata fetch fails.
- `/finalize` now reports when research mode has no completed draft and points the user to `/finalize-gen`.
- ESLint no longer fails on the sample `scripts/openrouter-taw-service.ts` file.

### Notes

- `/rate-source` currently uses Node's experimental `node:sqlite` module. It works on the local Node 22 runtime used for verification; older Node 20 installs may need a future fallback.

## [0.1.0-beta.3] - 2026-04-10

### Added

- Research modes for politics, tech, repo, and video with session-local source tracking.
- Local browser bridge, Chromium extension MVP, and tmux-based research harness.
- SearXNG helper-service controls and research `search_web` integration with optional OpenRouter hosted-search fallback.
- `/sources`, `/open-source`, `/source-note`, `/search-source`, and `/rate-source` commands for research workflows.
- Research `/finalize` dossier output that includes the latest draft, saved sources, and session notes.
- Budget warning configuration and high-cost notices in the footer and `/session-usage`.

### Changed

- Browser and research documentation now reflects the implemented MVP instead of pre-implementation plans.
- Removed copied OpenRouter reference snapshots and old brainstorm test-session captures from active project docs.
- Bumped the documented release baseline to `0.1.0-beta.3`.

### Fixed

- Research harness tmux sessions now clean up automatically unless `--keep-session` is used.
- Browser bridge tmux windows are named from the captured article title.
- Text input Backspace now behaves like backward delete after the arrow-key handling fix.
- SourceInfo-derived source rating setup now uses a rebuilt local `sources.db` at `~/.config/taw/sources.db`.

### Notes

- `/rate-source` currently uses Node's experimental `node:sqlite` module. It works on the local Node 22 runtime used for verification; older Node 20 installs may need a future fallback.

## [0.1.0-beta.2] - 2026-04-07

### Added

- Explicit structured-mode completion flow with `/finalize` and `/exit-mode`.
- Shared chat engine and prompt-context injection for project config, attachments, recent artifacts, and session summaries.
- Phase-aware app state and transcript draft-state tracking for pending, complete, interrupted, and failed structured drafts.
- Regression coverage for finalize behavior, prompt-context generation, and app phase helpers.
- Formalized manual QA playbook and reusable `qa-fixtures/` scenarios for general-mode, brainstorming, workflow review, workflow generation, summaries, and capture flows.

### Changed

- Brainstorm and workflow modes now stay in draft mode until the user explicitly finalizes.
- Artifact creation is now mode-definition driven instead of hard-coded per mode.
- Release-facing docs, roadmap docs, and versioning docs were updated to baseline `0.1.0-beta.2`.

### Fixed

- `/finalize` no longer saves stale assistant replies or interrupted/failed drafts as artifacts.
- Header/footer state now reflects the draft workflow more accurately.

## [0.1.0-beta.1] - 2026-04-07

### Added

- Initial TAW beta implementation in TypeScript, Node.js, and Ink.
- Chat-first TUI shell with session-backed local filesystem storage.
- Slash commands for project initialization, attachment, brainstorming, workflow work, summaries, config, exit, and issue/idea capture.
- OpenRouter-first provider layer with OpenAI-compatible and Anthropic-compatible adapters.
- Markdown artifact writing and session summaries.
- Generated `COMMANDS.md` assistant reference file.
- Targeted Vitest coverage for session paths, config loading, artifacts, feedback capture, and command parsing.

### Notes

- Live provider-backed manual QA still depends on local API key configuration.
