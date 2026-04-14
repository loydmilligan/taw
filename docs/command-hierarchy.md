# TAW Command Hierarchy & Workflow Guide

> **Purpose**: Definitive reference for TAW modes, commands, and intended workflows.  
> Last updated: 2026-04-13

---

## The Three Primary Modes

TAW has three first-class modes. Each has a distinct color identity used throughout the UI (headers, footers, chat borders, mode indicators).

| Mode | Color | Hex | Job |
|------|-------|-----|-----|
| **Brainstorm** | Magenta | `#d946ef` | Diverge — explore unknown territory, generate ideas and questions |
| **Research** | Teal | `#14b8a6` | Gather — pull in sources, synthesize, answer specific questions |
| **Wiki** | Pumpkin | `#ea580c` | Capture — turn session knowledge into permanent, queryable notes |

These three form a natural progression for any project:

```
Brainstorm → Research → Wiki
(explore)    (gather)   (capture)
```

You can enter them in any order, repeat them, and move between them freely. The modes are not linear stages — they are lenses.

---

## Mode Definitions

### Brainstorm (Magenta `#d946ef`)

**Job**: Generate the idea space. Divergent. Open-ended.

Brainstorm mode is for when you have a question, problem, or concept and want to understand it more deeply before committing to a direction. The AI acts as a thought partner — expanding, questioning, reframing, and surfacing angles you haven't considered.

**Use when:**
- Starting a new project and mapping the problem space
- Feeling stuck and wanting to break out of a single perspective  
- Generating feature ideas, strategy options, or design approaches
- Asking "what should I even be thinking about here?"

**Do not use for:**
- Gathering specific external facts (use Research)
- Writing final deliverables (use Finalize)
- Saving knowledge permanently (use Wiki)

**Entry:** `/brainstorm`  
**Exit:** `/exit-mode` or `/finalize`

---

### Research (Teal `#14b8a6`)

**Job**: Gather grounded information with sources. Convergent.

Research mode is for specific questions that benefit from external sources — web pages, GitHub repos, YouTube videos, news articles, Hister browser history. The AI helps you analyze and synthesize what you gather. Sources are tracked and can be rated, annotated, and ingested into the wiki.

**Use when:**
- You have specific questions from a brainstorm you want to answer
- Investigating a technology, competitor, or concept with real data
- Building a documented evidence base for a decision
- Reviewing a GitHub repo or technical reference

**Types:** `politics` | `tech` | `repo` | `video`

**Entry:** `/research <type> [question]`  
**Exit:** `/exit-mode` or `/finalize`

---

### Wiki (Pumpkin `#ea580c`)

**Job**: Permanent, structured knowledge capture. Persistent across sessions.

Wiki mode is TAW's knowledge base. Topics are directories of markdown notes with structured frontmatter. Unlike session notes, wiki content persists and can be queried, linked, and maintained over time. The wiki is the long-term memory of your work.

**Use when:**
- Capturing decisions, concepts, or findings that matter beyond this session
- Building a knowledge base for a project or domain
- Summarizing research into reusable notes
- Reviewing and refining existing wiki pages

**Entry:** `/wiki <subcommand>`  
**Exit:** Automatic (wiki commands complete and return to general mode)

---

## Are These Three Complete?

**Yes, for now — with one addition under consideration.**

The three modes cover the core creative/knowledge loop. However, two other workflow types exist and may warrant first-class status:

| Candidate | Current Command | Case for Promotion |
|-----------|----------------|-------------------|
| **Workflow** | `/workflow generate\|review` | Structured process generation is a distinct mode from brainstorm (output-oriented, not exploratory) |
| **Capture** | `/capture-idea`, `/capture-issue` | Lightweight capture during any mode that doesn't require entering wiki |

**Current recommendation**: Keep Brainstorm / Research / Wiki as the three primary modes. Workflow is a power-user tool. Capture commands are utilities, not modes.

---

## Complete Command Inventory

### Tier 1 — Primary Modes (color-coded, modal)

| Command | Mode Color | Description |
|---------|-----------|-------------|
| `/brainstorm` | Magenta | Enter brainstorm mode |
| `/research <type> [question]` | Teal | Enter research mode (types: politics, tech, repo, video) |
| `/wiki <subcommand>` | Pumpkin | Manage persistent knowledge wiki |

### Tier 2 — Workflow Tools (extend or complete a mode session)

| Command | Description | Typical Context |
|---------|-------------|----------------|
| `/finalize` | Save current draft as artifact and exit mode | End of brainstorm or research |
| `/finalize-gen` | Ask AI to generate final draft then finalize | End of brainstorm or research |
| `/workflow generate` | Generate a workflow document | Standalone or post-brainstorm |
| `/workflow review` | Review and critique an existing workflow | Standalone |
| `/summarize-session` | Write session-summary.md for current session | End of session |

### Tier 3 — Research Utilities (used during Research mode)

| Command | Description |
|---------|-------------|
| `/sources` | List research sources saved this session |
| `/open-source <index>` | Open a source in a tmux window |
| `/source-note <index> <note>` | Attach a note to a source |
| `/rate-source <index\|url>` | Show bias and quality metadata for a source |
| `/search-source <query>` | Web search and save results as sources |
| `/hister <query>` | Search browser history index |

### Tier 4 — Capture Utilities (lightweight, any mode)

| Command | Description |
|---------|-------------|
| `/capture-idea <text>` | Save a feature idea with chat context |
| `/capture-issue <text>` | Save a bug or problem with chat context |
| `/ideas` | List captured ideas |
| `/issues` | List captured issues |

### Tier 5 — Session & Config (housekeeping)

| Command | Description |
|---------|-------------|
| `/status` | Show session, storage, and attachment details |
| `/session-usage` | Show token usage and cost for current session |
| `/attach-dir <path>` | Attach a directory to session context |
| `/config` | Show or update provider/model config |
| `/or-key` | Manage OpenRouter API keys |
| `/init` | Create .ai project scaffolding in current directory |
| `/help` | List all available commands |
| `/exit` | Exit TAW |
| `/exit-mode` | Return to general mode without saving artifact |
| `/cancel` | Cancel pending preview action |
| `/confirm` | Confirm pending preview action |

### Wiki Subcommands (all under `/wiki`)

| Subcommand | Description |
|-----------|-------------|
| `init <topic>` | Create a new wiki topic directory |
| `ingest <topic> [review] [file]` | Ingest a file into a wiki topic |
| `ingest-source <topic> <N> [review]` | Ingest session research source #N into topic |
| `ingest-hister <topic> [review] <query>` | Ingest browser history results into topic |
| `query <topic> <question>` | Ask a question answered by wiki content |
| `links <topic> [recent]` | Show links found in topic pages |
| `reindex <topic>` | Rebuild search index for a topic |
| `lint <topic>` | Check topic pages for schema issues |
| `show [topic]` | Show wiki topic summary or page list |
| `list` | List all wiki topics |

---

## Workflow: New Project from Scratch

This maps the recommended end-to-end flow for a new project.

```mermaid
flowchart TD
    START([New Project / Question]) --> B[/brainstorm\nMagenta mode]
    
    B --> B1[Explore problem space\nGenerate questions\nSurface unknowns]
    B1 --> B2{Enough to act on?}
    B2 -->|No| B1
    B2 -->|Yes| B3[/exit-mode or /finalize]
    
    B3 --> WIKI_INIT[/wiki init topic\nCreate wiki stub]
    WIKI_INIT --> R[/research type question\nTeal mode]
    
    R --> R1[Gather sources\nWeb search, repos, video]
    R1 --> R2[/sources — review list]
    R2 --> R3[/rate-source — check quality]
    R3 --> R4[/source-note — annotate]
    R4 --> R5{Enough sources?}
    R5 -->|No| R1
    R5 -->|Yes| R6[/finalize — save research artifact]
    
    R6 --> WI[/wiki ingest-source topic N\nPumpkin mode]
    WI --> WQ[/wiki query topic question\nVerify capture]
    
    WQ --> MORE{More branches?}
    MORE -->|Yes| R
    MORE -->|No| END([Session complete])

    style B fill:#d946ef,color:#fff
    style B1 fill:#d946ef,color:#fff
    style R fill:#14b8a6,color:#fff
    style R1 fill:#14b8a6,color:#fff
    style R2 fill:#14b8a6,color:#fff
    style R3 fill:#14b8a6,color:#fff
    style R4 fill:#14b8a6,color:#fff
    style WI fill:#ea580c,color:#fff
    style WQ fill:#ea580c,color:#fff
    style WIKI_INIT fill:#ea580c,color:#fff
```

---

## Workflow: Mid-Session Source Capture (Browser Extension)

When you capture a source from the browser extension:

```mermaid
flowchart LR
    EXT([Browser Extension\nCapture]) --> SRC[Source added to session]
    SRC --> LIST[/sources — view list]
    LIST --> NOTE[/source-note N text\nOptional annotation]
    NOTE --> INGEST[/wiki ingest-source topic N\nIngest into wiki]
    INGEST --> QUERY[/wiki query topic question\nVerify]

    style INGEST fill:#ea580c,color:#fff
    style QUERY fill:#ea580c,color:#fff
```

---

## Mode Footer Design (UX Spec)

Every AI response in a mode should end with a context-aware footer. Colors match the active mode.

**Brainstorm footer example** (magenta):
```
─────────────────────────────────────────────
Mode: BRAINSTORM  |  Session: loyalty-app
Next: keep exploring | /brainstorm exit | /wiki capture <topic> | /research <question>
```

**Research footer example** (teal):
```
─────────────────────────────────────────────
Mode: RESEARCH [tech]  |  3 sources saved
Next: /sources | /search-source <query> | /wiki ingest-source <topic> <N> | /finalize
```

**Wiki footer example** (pumpkin):
```
─────────────────────────────────────────────
Mode: WIKI  |  Topic: loyalty-mechanics
Next: /wiki query loyalty-mechanics <q> | /wiki links loyalty-mechanics | /research tech <q>
```

---

## Color Tokens

```css
--mode-brainstorm: #d946ef;   /* magenta */
--mode-research:   #14b8a6;   /* teal */
--mode-wiki:       #ea580c;   /* pumpkin / burnt sienna */
```

Apply to:
- Top app bar background tint (10% opacity) + left border accent
- Chat message border-left (3px solid)
- Mode label text in header and footer
- Bottom nav active indicator when in that mode
