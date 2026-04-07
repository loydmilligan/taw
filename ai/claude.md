# Claude / Codex Implementation Guidance

## Mission

Build a lean, modern, terminal-native AI workspace that prioritizes:
- conversational planning
- workflow design and review
- markdown artifact generation
- clarity and reliability

## Product constraints

Do not turn this into:
- a coding agent
- a broad task manager
- a plugin framework
- a GUI app
- a giant RAG system

## Preferred implementation style

- TypeScript first
- modular architecture
- readable code over clever code
- practical abstractions
- low ceremony

## Build priorities

1. get a working shell fast
2. make sessions reliable
3. make commands intuitive
4. make artifact writing trustworthy
5. make the UI easy to understand

## UI guidance

The UI should:
- look modern and functional
- use hierarchy, spacing, color, and contrast well
- make next steps obvious
- avoid gratuitous complexity
- avoid terminal gimmicks

## Quality guidance

When implementing:
- prefer acceptance-criteria thinking
- write a few meaningful tests for critical logic
- do manual walkthroughs for interaction-heavy flows
- avoid spending days on elaborate test suites

## If a tradeoff is needed

Choose:
- simpler architecture over speculative flexibility
- practical polish over feature breadth
- reliable file behavior over advanced magic
- understandable prompts over premature agent complexity

## Handoff expectation

A good handoff includes:
- working app
- clear setup
- core docs updated if needed
- clean repo state
- known limitations called out
