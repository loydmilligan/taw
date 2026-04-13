# Versioning

Applies to baseline `0.1.0-beta.10`.

## Scope

TAW uses repository-level versioning for code and key documents.

## Source of truth

- The repository version starts in `package.json`.
- User-visible UI and status surfaces must read the version from that shared repository value, not from duplicated hardcoded strings.
- Release tags should follow Semantic Versioning.
- Human-readable release history belongs in `CHANGELOG.md`.
- If the repository has moved past the latest tag, keep the current work folded
  into the active version entry until the next cut or use an `Unreleased`
  section deliberately.

## Document versioning policy

- Key docs track the repository version, not an independent per-file version number.
- When behavior changes materially, the relevant doc must be updated in the same change or the next immediate follow-up.
- Release-oriented docs should be checked before every tagged beta or release candidate.

## Release process

For each release or beta cut:

1. Update `package.json` version if the release version changed.
2. Update any shared runtime version helper or import path if the app reads the version through a wrapper module.
3. Add or update the matching entry in `CHANGELOG.md`.
4. Verify `README.md`, `KNOWN_LIMITATIONS.md`, release workflow docs, and any changed architecture or UX docs still match implementation.
5. Run lint, build, tests, and the manual QA checklist.
6. Tag the release after the docs and code are in sync.

## Change completion rule

For every user-visible change:

1. Bump the repository version in `package.json`.
2. Make sure the TUI and `/status` reflect that version automatically from the shared source of truth.
3. Mention the exact version in the completion note so the user can confirm they are testing the same build.
4. Record the change in `CHANGELOG.md`.

## Document classes

- Stable product/engineering docs
  Should evolve with the repository and be reviewed during release prep.
- AI/process docs
  Should be updated when behavior guidance changes.
- Templates
  Should change only when output structure changes.

## Current baseline

- Current documented baseline: `0.1.0-beta.10`
