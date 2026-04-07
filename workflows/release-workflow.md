# Release Workflow

## Beta readiness flow

1. Update docs if implementation changed
2. Update `CHANGELOG.md`
3. Confirm release version and versioning policy expectations in `docs/versioning.md`
4. Run lint
5. Run targeted tests
6. Run manual QA checklist
7. Fix blockers
8. Verify project initialization in a clean directory
9. Verify general-mode launch outside a project
10. Verify artifact creation paths
11. Tag / mark beta candidate
12. Document known limitations

## Known limitations template

Every beta handoff should include:
- what works
- what is partial
- what is deferred
- what needs real-world feedback

## Release bar

Do not delay beta for:
- more commands than needed
- a richer theme system
- broad integrations
- exhaustive tests
- perfect prompt wording

Do delay beta for:
- broken session saves
- unclear project/general state
- unusable command flow
- poor artifact reliability
