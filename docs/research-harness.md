# Research Harness

The research harness runs a repeatable tmux-based TAW session and uses a second AI call to play the human operator.

It is designed to catch research-mode failures that unit tests miss, especially:

- planning instead of researching
- repeated polished brief templates before evidence gathering
- unnecessary clarification questions when the model has enough context
- missing verification labels such as `confirmed`, `disputed`, and `unsupported`

## Default scenario

The default fixture is:

- [politics-verification.json](../qa-fixtures/research-harness/politics-verification.json)

## Run it

From repo root:

```bash
corepack pnpm research:harness
```

Or with an explicit fixture:

```bash
corepack pnpm research:harness --scenario qa-fixtures/research-harness/politics-verification.json
```

You can also force a lower interaction limit:

```bash
corepack pnpm research:harness --max-turns 3
```

The harness closes its `taw-harness-*` tmux session automatically when the run
finishes or fails. Keep the session open for debugging with:

```bash
corepack pnpm research:harness --keep-session
```

## Requirements

- tmux installed and available on `PATH`
- a working TAW provider API key
- TAW already configured so a fresh session can answer requests

## Outputs

Each run writes artifacts under a temporary harness run directory and prints the paths:

- `transcript.md`
- `evaluation.json`

The evaluation is heuristic, not authoritative. It is meant to catch obvious regressions quickly.

## Cost guardrails

The harness is deliberately bounded:

- each scenario defines `maxTurns`
- the CLI can lower that with `--max-turns`
- the code enforces a hard cap of 8 turns even if a scenario is misconfigured
- the harness stops early if the simulated human returns an empty message

## What the simulated human does

The harness uses a second model call to:

- inspect the current TAW pane
- decide whether to send another user message or stop
- push TAW away from planning-only behavior and toward real research work

The goal is not to mimic a perfect human. The goal is to create pressure against the exact failure mode you found.
