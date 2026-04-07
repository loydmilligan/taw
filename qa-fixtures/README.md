# QA Fixtures

These fixtures are the source of truth for manual QA scenarios in [docs/manual-qa-checklist.md](/home/loydmilligan/Projects/taw/docs/manual-qa-checklist.md).

## Layout

- [non-project-workspace](/home/loydmilligan/Projects/taw/qa-fixtures/non-project-workspace)
  Use this to verify general-mode launch and `/init`.
- [project-workspace](/home/loydmilligan/Projects/taw/qa-fixtures/project-workspace)
  Use this to verify project-aware launch, attachments, structured modes, summaries, and capture flows.
- [context-dirs](/home/loydmilligan/Projects/taw/qa-fixtures/context-dirs)
  Use these with `/attach-dir`.
- [prompts](/home/loydmilligan/Projects/taw/qa-fixtures/prompts)
  Paste these exact prompts into TAW during manual testing.

## Reset guidance

- Do not edit the prompt files during testing.
- Remove generated files only from `project-workspace/.ai/sessions/` when resetting project-mode runs.
- For general-mode runs, remove only the session folders created under `~/.config/taw/sessions/`.
