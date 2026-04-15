# TAW TUI Harness

tmux-based test harness for TAW — the Playwright equivalent for Terminal AI Workspace.

## Prerequisites

- tmux 3.x (verify with `tmux -V`)
- Node 20+
- `pnpm install` has been run (installs `yaml` devDependency)
- Optional: `pnpm build` before running — the harness uses `dist/cli/entry.js` when present (faster); otherwise falls back to `tsx src/cli/entry.tsx`.

## Running

Run a single spec:

```bash
pnpm test:tui tests/tui-specs/smoke.yaml
```

Run multiple specs:

```bash
pnpm test:tui tests/tui-specs/smoke.yaml tests/tui-specs/commands.yaml
```

Keep the tmux session alive after a test for debugging:

```bash
pnpm test:tui tests/tui-specs/smoke.yaml --keep-session
# Then: tmux attach -t taw-test-XXXXXXXX
```

Output is TAP 14 on stdout. Exit code is 0 when all tests pass, 1 when any fail, 2 if tmux is missing, 3 if a spec file is missing.

## Spec format

Specs are YAML files validated against a Zod schema in `tests/tui-harness/schema.ts`. See `tests/tui-specs/smoke.yaml` for the canonical example. Supported actions:

| Action | Fields | Purpose |
|--------|--------|---------|
| `launch` | `cwd?`, `args?` | Starts TAW inside the tmux pane |
| `type` | `text` | Sends text + Enter |
| `key` | `key` | Sends a raw tmux key (C-c, C-p, Up, Escape, Enter, BSpace) |
| `wait` | `for`, `timeout?` | Polls capture-pane until text or `/regex/` appears |
| `assert` | `contains?`, `matches?`, `row?`, `not?` | Asserts on the captured pane |
| `sleep` | `ms` | Explicit pause (prefer `wait` unless genuinely timing-based) |

## Adding a new spec

1. Create `tests/tui-specs/<suite>.yaml`.
2. Use the smoke spec as a template.
3. Launch from `qa-fixtures/tui-harness-empty` for non-project mode, or a project-mode fixture for project tests.
4. Prefer text anchors from `src/app/layout/Header.tsx` (Mode, State, Phase labels) for assertions — they are stable across renders.
5. Always end with `/exit` and a short `sleep` so the session exits cleanly.
6. Run with `pnpm test:tui tests/tui-specs/<suite>.yaml`; iterate until green.

## Relation to the headless runner

TAW has two testing surfaces:

- **Logic layer**: `--queued-inputs-file` + `--run-queued-and-exit`. Tests command parsing, state mutations, provider behavior. Run via Vitest (`pnpm test`). No tmux, no Ink rendering.
- **TUI layer (this harness)**: tmux harness. Tests Ink rendering, keyboard handling, mode transitions, anything visible in a real terminal.

Use the logic layer for command/state tests. Use this harness for interaction/rendering tests.

## CI

CI machines must have tmux installed. The harness runs serially by default. Do not run inside Vitest (stdout capture conflicts with tmux child-process management).

## Troubleshooting

- "waitForText timeout" — the expected text never appeared. Last 800 chars of pane content are in the error. Common causes: terminal too narrow (harness uses 220x50 — do not override), text anchor typo, TAW startup slow on first run (increase `timeout`).
- "duplicate session" — concurrent runs collided on a session ID. Session IDs are randomUUID-based; this is extremely rare. Rerun.
- Empty capture / TAW exits immediately — TAW may be detecting non-TTY. Always launch via the harness (tmux pane provides PTY); never via plain `child_process.spawn`.
