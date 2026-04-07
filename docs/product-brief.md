# Product Brief

## Product name

**Terminal AI Workspace (TAW)**

## One-line description

A terminal-native, chat-first AI workspace for brainstorming, planning, workflow design, workflow review, and markdown artifact generation.

## Product vision

TAW gives a user the feeling of “doing strategy, planning, and systems thinking directly inside tmux,” with AI that behaves like a sharp collaborator rather than a chatbot or coding agent.

## Problem

Current AI tools are split between:
- browser chat apps that are great for discussion but disconnected from local project context
- coding agents that are optimized for code generation rather than planning and process improvement
- note/task tools that lack strong conversational reasoning

The user needs one terminal-native place to:
- think through ambiguous projects
- create project artifacts quickly
- refine workflows over time
- review process failures and mitigation options
- keep outputs on disk in a useful structure

## Users

### Primary user
A technically fluent terminal-heavy operator who prefers tmux, local files, markdown, and command-first workflows.

### Secondary user
A founder / PM / systems thinker / researcher who wants strong AI help with planning, process design, and decision support without using a browser.

## Core product pillars

### 1. Chat-first interaction
The app should feel natural to talk to. Commands are available, but chat remains the default mode.

### 2. Structured help where it matters
Brainstorming can stay loose. Workflow design/review should become more structured and rubric-driven.

### 3. Artifact generation over code generation
The app should bias toward creating markdown notes, briefs, review docs, and summaries.

### 4. Session-based organization
Outputs should be grouped by session so the user never has to think hard about where files went.

### 5. Clarity of next action
The UI should make it obvious what the user can do next.

## Beta feature scope

### In scope
- chat UI
- streaming responses
- `/init`
- `/attach-dir`
- `/brainstorm`
- `/workflow`
- `/summarize-session`
- session folders
- markdown artifact writing
- modern TUI polish
- small targeted tests
- manual acceptance workflow

### Deliberately not in scope
- full task management system
- kanban
- multi-user collaboration
- plugin ecosystem
- GUI
- autonomous execution
- heavy general-purpose RAG platform
- broad integrations

## Beta success criteria

TAW beta is successful if:
1. the user chooses it over web ChatGPT for daily non-coding thinking work
2. it helps improve workflows and process quality
3. it saves time, reduces rework, and increases clarity
4. it feels natural inside tmux and terminal workflows
