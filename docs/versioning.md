# Versioning

## Scope

TAW uses repository-level versioning for code and key documents.

## Source of truth

- The repository version starts in `package.json`.
- Release tags should follow Semantic Versioning.
- Human-readable release history belongs in `CHANGELOG.md`.

## Document versioning policy

- Key docs track the repository version, not an independent per-file version number.
- When behavior changes materially, the relevant doc must be updated in the same change or the next immediate follow-up.
- Release-oriented docs should be checked before every tagged beta or release candidate.

## Release process

For each release or beta cut:

1. Update `package.json` version if the release version changed.
2. Add or update the matching entry in `CHANGELOG.md`.
3. Verify `README.md`, `KNOWN_LIMITATIONS.md`, release workflow docs, and any changed architecture or UX docs still match implementation.
4. Run lint, build, tests, and the manual QA checklist.
5. Tag the release after the docs and code are in sync.

## Document classes

- Stable product/engineering docs
  Should evolve with the repository and be reviewed during release prep.
- AI/process docs
  Should be updated when behavior guidance changes.
- Templates
  Should change only when output structure changes.

## Current baseline

- Current documented baseline: `0.1.0-beta.1`
