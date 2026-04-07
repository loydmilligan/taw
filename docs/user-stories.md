# User Stories

## Primary experience stories

### US-001 — Start a session from anywhere
As a terminal-first user, I want to launch TAW from any directory so I can think and work without first creating a project structure.

**Acceptance criteria**
- launching `taw` works from any current working directory
- a session begins even when no project has been initialized
- the UI clearly shows whether the session is attached to a project or not

### US-002 — Initialize a project
As a user, I want to run `/init` to create the files and folders TAW needs in a project so the workspace becomes project-aware.

**Acceptance criteria**
- `/init` creates `.ai/` and expected subfolders/files
- the command is safe to rerun
- the user gets a clear summary of what was created

### US-003 — Attach a project directory
As a user, I want to attach a directory to the current session so the AI can treat it as project context.

**Acceptance criteria**
- `/attach-dir <path>` validates the path
- the current session records the attached directory
- the UI updates immediately to reflect attached context

### US-004 — Brainstorm and plan
As a user, I want to discuss an idea naturally and have the system generate useful artifacts so I can move from ambiguity to a plan quickly.

**Acceptance criteria**
- the user can stay in freeform chat
- `/brainstorm` activates a planning-oriented mode
- the mode can ask a few clarifying questions when useful
- the system can produce at least one markdown artifact from the conversation
- the artifact is stored in the current session folder

### US-005 — Generate a project brief
As a user, I want the AI to turn rough discussion into a clean project brief so I have a stable reference doc.

**Acceptance criteria**
- the AI can produce a concise markdown brief
- the output includes goals, scope, assumptions, constraints, and next steps when relevant
- the file is saved into the session artifacts folder

### US-006 — Review a workflow
As a user, I want to provide workflow details, issues, and criteria so the AI can help diagnose problems and suggest improvements.

**Acceptance criteria**
- `/workflow` supports review mode
- the mode accepts pasted content and file-backed content
- the output can include root causes, risks, mitigations, and proposed changes
- the artifact is saved as markdown

### US-007 — Generate a workflow
As a user, I want to design or improve an AI-assisted process so the system can help me make workflows tighter and more reliable.

**Acceptance criteria**
- `/workflow` supports generate mode
- the system can ask targeted questions when inputs are incomplete
- the output includes stages, roles, handoffs, quality checks, and failure points when relevant

### US-008 — Keep outputs organized
As a user, I want all outputs for a session to land in one clear location so I never lose work.

**Acceptance criteria**
- each session has its own folder
- `notes.md` and `session-summary.md` are easy to locate
- artifacts are stored under `artifacts/`

### US-009 — End with a useful summary
As a user, I want the system to summarize a session so I can quickly pick it back up later.

**Acceptance criteria**
- `/summarize-session` creates `session-summary.md`
- the summary includes topics covered, decisions made, open loops, and suggested next steps
- summary generation works even in non-project sessions

### US-010 — Understand what to do next
As a user, I want the UI to always make next actions obvious so I do not stall or hunt for commands.

**Acceptance criteria**
- the UI shows contextual hints
- empty states tell the user what they can do next
- slash commands are discoverable

## Quality stories

### US-011 — Feel modern, not flashy
As a user, I want the TUI to look modern and functional so it feels good to use for long sessions.

**Acceptance criteria**
- the TUI uses spacing, hierarchy, and restrained color well
- focus and activity are visually obvious
- the app remains readable in common terminal themes

### US-012 — Stay fast and robust
As a user, I want the app to remain responsive so it feels dependable in real work.

**Acceptance criteria**
- input never blocks during streaming
- long responses remain usable
- errors are recoverable and clearly explained

### US-013 — Keep tests practical
As a maintainer, I want targeted tests and strong manual checks so quality improves without slowing development to a crawl.

**Acceptance criteria**
- only critical paths get automated tests
- automated tests verify acceptance criteria, not brittle render details
- manual test scripts exist for core workflows
