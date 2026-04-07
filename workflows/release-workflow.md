# Release Workflow

## Beta readiness flow

1. Update docs if implementation changed
2. Run lint
3. Run targeted tests
4. Run manual QA checklist
5. Fix blockers
6. Verify project initialization in a clean directory
7. Verify general-mode launch outside a project
8. Verify artifact creation paths
9. Tag / mark beta candidate
10. Document known limitations

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
