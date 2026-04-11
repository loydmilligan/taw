# Changelog

All notable changes to this project should be documented in this file.

The format is based on Keep a Changelog and the project uses Semantic Versioning for release tags.

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
