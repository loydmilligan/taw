# Research Mode Spec

Applies to baseline `0.1.0-beta.3`.

## Goal

Add a typed research workflow to TAW that can ingest browser-sent content, keep source context visible, preserve session findings, and produce explicit research artifacts without turning TAW into a full browser.

## Design principles

- Keep the browser as the browser.
- Keep TAW as the terminal workspace.
- Use one research framework with content-type-specific behavior.
- Require explicit user actions for browsing, fetching, and finalizing.
- Preserve sources, notes, and recurring interests as first-class session data.

## Primary command model

TAW provides a parent command:

- `/research <politics|tech|repo|video> [question]`

Supporting commands:

- `/sources`
- `/open-source <index>`
- `/source-views [index]`
- `/search-source <query>`
- `/source-note <index> <note>`
- `/rate-source <index|url>`
- `/finalize`
- `/exit-mode`

Optional later:

- `/add-source <url|file>`
- `/compare-sources <a> <b>`
- `/fetch-source <index>`
- `/remember-interest <note>`
- `/show-interests`
- `/note-timestamp <mm:ss> <note>`
- `/remember-repo`
- `/remember-idea`

## Shared research workflow

1. Start or resume a research session.
2. Ingest browser-sent or manually added sources.
3. Keep a structured list of sources in session state.
4. Ask narrow follow-up questions if necessary.
5. Build a draft research note appropriate to the content type.
6. Allow the user to inspect sources and attach notes.
7. Save the final artifact only on `/finalize`.

## Research types

### Politics

Purpose:

- discuss political events
- compare framing across sources
- identify conflicting perspectives
- connect current events to historical parallels
- remember the recurring themes the user cares about

Special behavior:

- separate reported facts from outlet framing
- separate analogy from evidence
- preserve recurring interests like norm erosion and corruption normalization
- support follow-up discovery of related sources

Suggested artifact:

- `political-brief.md`

Suggested sections:

- Current Event
- Sources Reviewed
- Competing Framings
- Historical Parallels
- Norm / Institutional Implications
- Open Questions

### Tech

Purpose:

- summarize interesting content
- discuss implications
- preserve useful concepts and project ideas
- eventually support flashcard creation

Suggested artifact:

- `tech-digest.md`

Suggested sections:

- Topic
- Key Ideas
- Why It Matters
- Possible Uses
- Questions To Revisit

### Repo

Purpose:

- understand what a repository does
- evaluate deployment and usage
- discuss integration ideas for the user's own projects
- preserve a watchlist of promising repos

Suggested artifact:

- `repo-eval.md`

Suggested sections:

- Repo Summary
- Use Case
- Setup / Deployment Notes
- Integration Ideas
- Risks / Unknowns
- Keep / Ignore Decision

### Video

Purpose:

- support active watching
- keep timestamped notes
- summarize transcripts
- preserve ideas worth remembering

Suggested artifact:

- `video-notes.md`

Suggested sections:

- Video Metadata
- Timestamped Notes
- Key Claims / Ideas
- Follow-up Questions
- Summary

## Source model

Each research session should track source records separately from the transcript.

Suggested fields:

- `id`
- `type`
  - `article`
  - `repo`
  - `video`
  - `note`
- `url`
- `title`
- `origin`
  - `browser-extension`
  - `manual`
  - `fetch`
  - `search`
- `selectedText`
- `excerpt`
- `note`
- `snapshotPath`
- `createdAt`
- `status`
  - `new`
  - `reviewed`
  - `used`
  - `ignored`

Heavy content should live in files, not directly in `session.json`.

Suggested file layout:

```text
session/
  sources.json
  sources/
    source-001.txt
    source-002.txt
```

## Finalize behavior

Research mode should follow the same draft-first rule as brainstorm and workflow:

- keep outputs as drafts while the user is still exploring
- only write the artifact on `/finalize`
- write source metadata and notes before or alongside artifact generation

## Implementation status

Implemented:

- `/research <politics|tech|repo|video>`
- research mode definitions and draft artifact flow
- session-local source storage in `sources.json`
- browser bridge intake for new research sessions
- `/sources`
- `/open-source <index>` with tmux side-pane integration and browser hints
- `/source-views [index]` for listing and jumping between managed source windows
- `/source-note <index> <note>`
- `/search-source <query>`
- `/rate-source <index|url>`
- SourceInfo-derived `sources.db` lookup from `~/.config/taw/sources.db` by default
- high-cost warnings for last-turn and session spend
- research `/finalize` dossier output that includes the latest draft, saved sources, and session notes

Remaining:

- persistent interests and watchlists
- type-specific memory extraction
- comparison workflows
- richer fetch and extraction paths
- source rating annotations in `/sources`
- richer managed source views or source tabs beyond the current list/jump flow
- high-token/context-size warnings
- adaptive model policy

## Source Rating Plan

TAW includes a first-pass `/rate-source <index|url>` command for news and
research sources. It uses the SourceInfo data as a practical local baseline:

- build a portable SQLite `sources.db` from the SourceInfo project
- use root-domain lookup so `edition.cnn.com/world/...` resolves to `cnn.com`
- expose source name, bias/lean label, NewsGuard-style quality score when
  present, source type, and any stored criteria metadata
- show explicit "source not found" output for domains that are not in the
  SourceInfo database

Later:

- use the local rating directly in `/sources` and research prompts when available
- add maintenance paths for unknown domains

Implemented order:

1. import/build `sources.db` outside the app from the existing SourceInfo JSON
   and scripts described in [rate-source-source-idea.md](rate-source-source-idea.md)
2. add a small TypeScript query layer that extracts root domains from URLs
3. add `/rate-source <index|url>` and print a compact rating block
4. copy the rebuilt DB to `~/.config/taw/sources.db`

Remaining:

- add optional rating annotations to `/sources`
- add maintenance paths for unknown domains

Difficulty: moderate. The lookup path is straightforward; the main work is
building the database asset, adding root-domain normalization, and making the
rating output compact enough to be useful during research.

Runtime caveat: the current query layer uses Node's experimental `node:sqlite`
module. It works on the local Node 22 runtime used for verification. A fallback
or stricter engine requirement may be needed before a wider release.

## Cost And Model Policy Plan

Research mode can become expensive because it combines long browser excerpts,
many search results, local tool loops, and large final drafts. TAW already has
session usage telemetry, but research mode should make cost more visible and
more actionable.

Implemented behavior:

- show last-turn cost and session cost prominently in research mode
- warn when a turn crosses configured dollar thresholds
- add `/config budget show`, `/config budget high-turn <amount>`, and
  `/config budget high-session <amount>`
- add `/config budget high-prompt <tokens>` and `/config budget high-context <chars>`

Remaining near-term behavior:

- warn when a turn crosses prompt-token or completion-token thresholds
- show source count and context-size hints when a session has many stored sources
- avoid injecting full source bodies by default; keep source metadata and
  selected snippets separate from full snapshots

Adaptive model behavior:

- define budget tiers such as `economy`, `balanced`, and `splurge`
- let the user configure preferred model per tier
- automatically prefer cheaper models when recent spend crosses a threshold
- allow explicit override for the next turn or current session
- collect quick end-of-session model ratings so TAW can learn which models the
  user likes for research, writing, workflow, and general chat

Implementation order:

1. improve display of existing telemetry in the header/footer and `/session-usage` - implemented
2. add configurable warnings without changing model selection - implemented for dollar-cost warnings
3. add manual budget/model tier selection
4. add adaptive selection only after warnings and manual controls are reliable
5. add quick model rating capture after `/finalize`, `/exit`, or session summary

Difficulty: warnings are low to moderate because telemetry already exists.
Adaptive model routing is higher risk because it can surprise the user and
should be opt-in until the behavior is predictable.

## Source View UX Plan

When `/open-source <index>` opens a source, TAW should make the current state
and next actions obvious.

Implemented minimum behavior:

- show a short terminal-browser hint before or inside the opened view: scroll,
  search, follow links, close, and return to TAW
- if no terminal browser is installed, keep the pane open with the URL and a
  clear install/open-manually message
- add `/source-note <index> <note>` so users can bring observations back into
  TAW explicitly

Preferred later behavior:

- name source views from the source title when they become managed windows
- keep open sources in named tmux windows and track them in session state
- make `/open-source <index>` jump to the existing view when one is already open
- extend `/source-views` or fold more open-view state into `/sources`
- allow a source view to be marked reviewed, useful, dubious, or ignored

## Non-goals for MVP

- full browser UI inside TAW
- autonomous crawling
- unrestricted multi-hop browsing
- hidden background research loops
