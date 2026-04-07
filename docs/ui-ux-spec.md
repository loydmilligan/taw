# UI / UX Spec

## UX goals

TAW should feel:
- modern
- sharp
- calm
- immediately understandable
- efficient in tmux

The user should almost never wonder:
- what mode they are in
- whether the session is project-aware
- where outputs went
- what they can do next

## Design language

### Visual principles
- dark-theme-first, but theme-safe
- restrained color palette
- strong spacing hierarchy
- subtle depth through nested containers and contrast, not literal shadows
- selective emphasis for active state, warnings, saves, and suggestions
- attention-grabbing moments should be purposeful, not noisy

### Terminal-specific implementation guidance
Use:
- padding
- contrast bands
- border variants
- glyphs/icons
- spacing and grouping
- progress rows and callout blocks

## Layout

### Header
Persistent, one or two rows max.

Contains:
- app name and version
- current mode
- attached project status
- provider/model
- session slug/path snippet

### Main transcript area
Largest pane.

Behavior:
- user messages visually distinct
- assistant messages readable with spacing
- command events rendered as compact system blocks
- file creation events shown as success notices
- long outputs line-wrap gracefully
- artifacts called out with file path and purpose

### Footer hint rail
Always visible.

Shows:
- available next actions
- key shortcuts
- current affordance

Example states:
- “Type a message or `/brainstorm` to start structured planning”
- “Try `/workflow review` to analyze a process issue”
- “Run `/init` to create project scaffolding here”

## Command discoverability

### Slash command experience
As the user types `/`, show:
- a compact command list
- one-line descriptions
- likely next commands first

Top command set for beta:
- `/brainstorm`
- `/workflow`
- `/attach-dir`
- `/init`
- `/summarize-session`
- `/help`
- `/status`

### Empty state
When first launched:
- welcome text
- current mode: General
- 3 suggested actions
- note that project attach/init is optional

## Interaction patterns

### Freeform chat
Default mode.

### Mode entry
A slash command changes the active prompt/mode and updates the header.

### Structured prompts
For modes like `/workflow`, the app asks 2–5 targeted questions when needed instead of forcing a full form.

### Artifact proposal
When the assistant decides a file should be created, it should state:
- what file is being created
- why
- where it is being saved

## State design

At all times, show:
- mode
- provider/model
- project/general state
- streaming status
- artifact save events

Keep advanced details behind `/status`.

## Color / emphasis guidance

Use a small semantic palette:
- primary accent: current mode / active selection
- success: saved artifact / completed summary
- warning: missing config / context limitation
- error: provider / file / command failures
- muted: metadata and secondary guidance

The default theme should work in common dark terminals and not rely on exotic colors.

## Motion / feedback
Terminal-friendly feedback should include:
- streaming cursor / indicator
- temporary “saving…” and “saved” states
- progress wording for longer operations
- subtle separators between message groups

## Core screens / states

### 1. Welcome / idle
Shows:
- session started
- no project attached (if applicable)
- 3 recommended next actions

### 2. Active conversation
Shows:
- transcript
- mode-specific suggestions
- artifact notices

### 3. Command help
Shows:
- commands grouped by use
- examples

### 4. Error recovery
Shows:
- plain-language error
- direct next step
- optional retry command

## Keyboard UX

### Must-have shortcuts
- `Ctrl+C` graceful exit
- `Esc` dismiss autocomplete or prompts
- `Tab` complete command suggestions
- `Up/Down` navigate command suggestions if implemented
- `Ctrl+L` clear visible viewport only, optional
- `Ctrl+S` manual summarize session, optional alias if easy

## UX heuristics

TAW should:
- keep the user oriented
- keep the user moving
- keep the user informed
- keep saved work visible
- avoid modal confusion
- avoid noisy chrome

## Accessibility / readability
- maintain strong contrast
- no critical information by color alone
- icons should be paired with text cues
- line lengths should remain readable in typical terminal widths
