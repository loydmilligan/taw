# Codex implementation prompt

Read the following documents in order and implement the project accordingly:

1. docs/product-brief.md
2. docs/user-stories.md
3. docs/architecture.md
4. docs/ui-ux-spec.md
5. docs/project-plan.md
6. docs/tasks.md
7. docs/testing-strategy.md
8. docs/repo-standards.md
9. ai/claude.md
10. ai/agents.md
11. workflows/implementation-workflow.md
12. workflows/release-workflow.md

Implementation instructions:
- Build a TypeScript + Node.js terminal app using Ink.
- Prioritize a working beta over speculative architecture.
- Start with the app shell, session manager, command parser, and OpenRouter integration.
- Keep the app chat-first.
- Implement `/init`, `/attach-dir`, `/brainstorm`, `/workflow`, `/summarize-session`, `/help`, and `/status`.
- Keep outputs markdown-first and session-based.
- Make the UI modern, clear, and functional, with obvious next actions.
- Use only a small, practical test suite.
- Prefer manual verification for interaction-heavy behavior.
- Do not turn the app into a coding agent, task manager, GUI, or plugin system.
- Keep the repository clean and update docs if implementation decisions materially diverge.

Once the core implementation is done:
- run lint/build/test
- perform manual QA using the checklist in `docs/testing-strategy.md`
- fix blockers
- leave a short `KNOWN_LIMITATIONS.md` if needed
