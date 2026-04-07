# Implementation Workflow

## Purpose

Keep the project moving quickly without losing discipline.

## Default loop

1. Read the relevant docs before starting a milestone
2. Pick one milestone-sized slice
3. Define acceptance criteria from the docs
4. Implement the slice
5. Add only the minimal useful tests
6. Run manual checks
7. Clean up and commit
8. Move to the next slice

## For every milestone

### Before coding
- confirm scope
- identify affected files
- confirm whether docs need updates

### During coding
- keep modules small
- avoid speculative features
- log errors meaningfully
- keep UI state clear

### Before handoff
- run lint/build/test
- run manual QA for touched flows
- remove dead code
- update docs if behavior changed

## Manual QA bias

For this project, prefer:
- opening the app
- running commands
- checking files on disk
- verifying useful output

Over:
- trying to encode every interaction in tests

## Stop conditions
Stop and simplify if:
- a feature requires a plugin system
- a feature demands broad schema design not needed for beta
- a feature would derail the milestone sequence
