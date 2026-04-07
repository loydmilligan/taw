# Changelog

All notable changes to this project should be documented in this file.

The format is based on Keep a Changelog and the project uses Semantic Versioning for release tags.

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
