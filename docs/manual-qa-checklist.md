# Manual QA Playbook

Applies to baseline `0.1.0-beta.4`.

## Goal

This document is the human test procedure for TAW. It is meant to be executable without improvising test projects, prompts, or attachment directories.

## Prerequisites

- Node.js 20+
- dependencies installed with `corepack pnpm install`
- a clean build from repo root
- optional live provider key if you want to test real chat responses

Recommended prep:

```bash
corepack pnpm build
corepack pnpm test
```

## Test data

Use only the supplied fixtures:

- [qa-fixtures/non-project-workspace](../qa-fixtures/non-project-workspace)
- [qa-fixtures/project-workspace](../qa-fixtures/project-workspace)
- [qa-fixtures/context-dirs](../qa-fixtures/context-dirs)
- [qa-fixtures/prompts](../qa-fixtures/prompts)

Read the fixture index first:

- [qa-fixtures/README.md](../qa-fixtures/README.md)

## Reset before a fresh run

1. Remove fixture-created sessions if you want a clean pass.
2. For project-mode tests, remove contents under `qa-fixtures/project-workspace/.ai/sessions/`.
3. For general-mode tests, remove only the specific session folders created during testing under `~/.config/taw/sessions/`.
4. Keep the fixture source files unchanged so later runs are comparable.

## Execution modes

Run two passes when possible:

- Pass A: with no provider API key, to verify failure handling.
- Pass B: with a valid provider API key, to verify real chat, drafts, finalize, and summaries.

## Test cases

### QA-01 General-mode launch in a non-project workspace

1. Change into [qa-fixtures/non-project-workspace](../qa-fixtures/non-project-workspace).
2. Run `corepack pnpm dev`.
3. Confirm the header shows `Mode General`.
4. Confirm storage is general mode, not project mode.
5. Confirm the footer shows a useful next-step hint.
6. Run `/status`.
7. Confirm the session directory is under `~/.config/taw/sessions/`.

Expected result:

- session starts cleanly
- no project config is detected
- status output is readable and accurate

### QA-02 Help and command discovery

1. From the same non-project workspace, run `/help`.
2. Confirm the output includes `/brainstorm`, `/workflow`, `/finalize`, `/exit-mode`, `/attach-dir`, `/summarize-session`, `/capture-idea`, `/capture-issue`, `/ideas`, and `/issues`.
3. Run `/config`.
4. Confirm the provider/model output is readable.

Expected result:

- command help matches shipped commands
- config output is understandable

### QA-03 Provider error handling

1. Stay in [qa-fixtures/non-project-workspace](../qa-fixtures/non-project-workspace).
2. Ensure the relevant provider key is not set.
3. Paste the content from [general-chat-message.md](../qa-fixtures/prompts/general-chat-message.md).
4. Confirm the app shows a provider error with a clear next step.
5. Confirm the app returns to `Phase idle`.

Expected result:

- the error is actionable
- the app does not freeze
- no misleading draft is left in a finalized state

### QA-04 Project initialization flow

1. In [qa-fixtures/non-project-workspace](../qa-fixtures/non-project-workspace), run `/init`.
2. Confirm `.ai/config.json`, `.ai/sessions/`, and these assistant files are created under `.ai/assistant/`:
   `AGENTS.md`, `SOUL.md`, `USER.md`, `USER.summary.md`, `MEMORY.md`, `MEMORY.summary.md`, and `COMMANDS.md`.
3. Exit the app.
4. Relaunch `corepack pnpm dev` from the same fixture.
5. Confirm the header now shows project-aware state.

Expected result:

- initialization is idempotent
- the next session uses project storage

### QA-05 Attach-dir flow with valid and invalid paths

1. Change into [qa-fixtures/project-workspace](../qa-fixtures/project-workspace).
2. Launch `corepack pnpm dev`.
3. Run `/attach-dir ../context-dirs/brainstorm-context`.
4. Confirm `/status` lists that attached directory.
5. Run `/attach-dir ../context-dirs/does-not-exist`.
6. Confirm the error is clear and actionable.

Expected result:

- valid directories attach cleanly
- invalid paths fail gracefully

### QA-06 Brainstorm draft and finalize flow

1. In [qa-fixtures/project-workspace](../qa-fixtures/project-workspace), run `/brainstorm`.
2. Confirm the header shows `Mode Brainstorm` and `Phase idle`.
3. Optionally attach `../context-dirs/brainstorm-context`.
4. Paste the content from [brainstorm-message.md](../qa-fixtures/prompts/brainstorm-message.md).
5. Confirm the assistant response appears as `Draft Response`.
6. Confirm the header reaches `Phase draft-ready`.
7. Run `/finalize`.
8. Confirm an artifact path is shown and mode returns to General.
9. Open the newest file in `.ai/sessions/.../artifacts/` and confirm it contains the finalized draft.

Expected result:

- no artifact is created before `/finalize`
- `/finalize` saves the completed draft
- the app exits the mode after saving

### QA-07 Exit-mode without saving

1. Re-enter `/brainstorm` or `/workflow generate`.
2. Send one prompt and wait for a draft.
3. Run `/exit-mode` instead of `/finalize`.
4. Confirm mode returns to General.
5. Confirm no new artifact was written for that abandoned draft.

Expected result:

- exit is clean
- unsaved drafts are not persisted as artifacts

### QA-08 Workflow review flow

1. Run `/workflow review`.
2. Optionally attach `../context-dirs/workflow-review-context`.
3. Paste the content from [workflow-review-message.md](../qa-fixtures/prompts/workflow-review-message.md).
4. Confirm the response is clearly treated as a draft.
5. Run `/finalize`.
6. Confirm a workflow review artifact is created.

Expected result:

- the app stays in draft mode until finalize
- the saved artifact path is shown in transcript

### QA-09 Workflow generate flow

1. Run `/workflow generate`.
2. Optionally attach `../context-dirs/workflow-generate-context`.
3. Paste the content from [workflow-generate-message.md](../qa-fixtures/prompts/workflow-generate-message.md).
4. Confirm the response is a draft.
5. Run `/finalize`.
6. Confirm a workflow-generate artifact is created.

Expected result:

- generated workflow stays editable before finalize
- finalize writes the artifact and exits the mode

### QA-10 Summary generation

1. After completing at least one structured flow, run `/summarize-session`.
2. Confirm `session-summary.md` exists in the active session directory.
3. Confirm it mentions decisions, open loops, and next steps.

Expected result:

- summary file exists
- summary is readable and relevant to the transcript

### QA-11 Capture and list commands

1. Run `/capture-idea Improve onboarding copy Add examples for workflow mode`.
2. Run `/capture-issue Finalize should warn on empty draft Revisit after live QA`.
3. Run `/ideas`.
4. Run `/issues`.
5. Confirm the captured entries appear and reference recent transcript context where appropriate.

Expected result:

- idea and issue captures are saved and listed correctly

### QA-12 Logging and interruption

1. Start a live provider-backed response in any mode.
2. Press `Esc` mid-stream.
3. Confirm the transcript shows an interruption notice.
4. Confirm the mode returns to `Phase idle`.
5. If `TAW_DEBUG=1` is enabled, confirm a readable log entry exists under `~/.config/taw/logs/`.

Expected result:

- interruption is visible
- interrupted drafts cannot later be finalized

## Pass criteria

The baseline is ready for handoff when:

- all command flows above behave as expected
- structured drafts only save through `/finalize`
- no session or artifact paths are misleading
- any failures found are either fixed or documented in `KNOWN_LIMITATIONS.md`
