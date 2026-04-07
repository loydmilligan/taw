# Changelog

All notable changes to this project should be documented in this file.

The format is based on Keep a Changelog and the project uses Semantic Versioning for release tags.

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
