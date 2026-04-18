#!/usr/bin/env bash
# ---
# name: testing-harness-tui-cli.sh
# description: >
#   4-pane tmux testing harness for manually testing a CLI or TUI application.
#   Provides a structured layout with a runner pane, AI agent pane, checklist
#   pane, and notes pane. Supports joining an existing tmux pane as the AI agent
#   and graceful teardown that returns the agent pane to its original window.
# requires:
#   - tmux
#   - a compiled CLI/TUI binary to run in the RUNNER pane
# config:
#   BINARY: command to launch your app (e.g. "node dist/index.js", "./myapp")
#   CHECKLIST_FILE: path to a markdown UAT checklist (optional — cat'd in pane)
#   NOTES_FILE: path to a markdown file for test notes (created if absent)
# panes:
#   top-left:     RUNNER        — runs the app binary
#   bottom-left:  AI-AGENT      — Claude / opencode session (joined or blank)
#   top-right:    CHECKLIST     — human UAT checklist (cat'd)
#   bottom-right: NOTES         — test notes file in nano
# suitable_for: >
#   Any project with a CLI or TUI binary that benefits from a structured
#   manual testing layout. Adjust BINARY, CHECKLIST_FILE, and NOTES_FILE
#   for your project. If your project has no planning/phases structure, pass
#   the checklist path directly or leave CHECKLIST_FILE empty.
# not_suitable_for: >
#   Web/browser apps (no browser pane — see testing-harness-web.sh if it exists).
#   Projects without tmux in the dev environment.
# ---
#
# Usage:
#   bash .claude/workspaces/testing-harness-tui-cli.sh [session] [--agent-pane SESSION:WINDOW.PANE]
#   bash .claude/workspaces/testing-harness-tui-cli.sh --teardown [session:window]
#
# Options:
#   session            tmux session to target (default: 0)
#   --agent-pane SRC   Join an existing pane into the AI-AGENT slot instead of
#                      creating a blank one. SRC format: session:window.pane
#                      e.g. --agent-pane 0:1.0
#   --teardown [WIN]   Gracefully close the testing harness. Moves the AI-AGENT
#                      pane back to its original window, kills all other panes,
#                      closes the harness window. WIN defaults to current window.

set -euo pipefail

PROJ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROJECT_NAME="$(basename "$PROJ")"

# ── Project-specific config — adjust these for your project ──────────────────
BINARY="echo 'Set BINARY in this script to your app command'"
CHECKLIST_FILE=""   # e.g. "$PROJ/docs/UAT-checklist.md"
NOTES_FILE="$PROJ/docs/tui-test-notes.md"
WINDOW_NAME="TEST-HARNESS | ${PROJECT_NAME}"
# ─────────────────────────────────────────────────────────────────────────────

# ── Teardown mode ────────────────────────────────────────────────────────────

if [[ "${1:-}" == "--teardown" ]]; then
  if [[ -n "${2:-}" ]]; then
    TARGET_WIN="$2"
  else
    SESSION_NOW=$(tmux display-message -p '#S')
    WIN_NOW=$(tmux display-message -p '#I')
    TARGET_WIN="${SESSION_NOW}:${WIN_NOW}"
  fi

  AGENT_SRC=$(tmux show-options -t "$TARGET_WIN" -qv @twh_agent_source 2>/dev/null || true)

  echo "Tearing down testing harness: $TARGET_WIN"

  if [[ -n "$AGENT_SRC" ]]; then
    echo "Returning AI-AGENT pane to: $AGENT_SRC"
    AGENT_PANE="${TARGET_WIN}.1"
    ORIG_SESSION="${AGENT_SRC%%:*}"
    ORIG_WIN="${AGENT_SRC#*:}"
    ORIG_WIN="${ORIG_WIN%%.*}"
    tmux join-pane -s "$AGENT_PANE" -t "${ORIG_SESSION}:${ORIG_WIN}" -h 2>/dev/null \
      || echo "Warning: could not return agent pane — may have already exited. Continuing teardown."
  else
    echo "No agent source recorded — AI-AGENT pane will be killed with the window."
  fi

  tmux kill-window -t "$TARGET_WIN" 2>/dev/null && echo "Testing harness closed." || echo "Window already gone."
  exit 0
fi

# ── Setup mode ───────────────────────────────────────────────────────────────

SESSION="${1:-0}"
AGENT_PANE_SRC=""

shift 1 2>/dev/null || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent-pane)
      AGENT_PANE_SRC="${2:?--agent-pane requires SESSION:WINDOW.PANE}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

# Create new window
WIN=$(tmux new-window -t "$SESSION" -n "$WINDOW_NAME" -c "$PROJ" -P -F '#{window_index}')

# Build 4-pane layout
#   0 (top-left)  | 1 (top-right)
#   2 (bot-left)  | 3 (bot-right)
tmux split-window -t "${SESSION}:${WIN}.0" -h -c "$PROJ"
tmux split-window -t "${SESSION}:${WIN}.0" -v -c "$PROJ"
tmux split-window -t "${SESSION}:${WIN}.1" -v -c "$PROJ"

# Label panes
tmux set-option -t "${SESSION}:${WIN}" pane-border-status top
tmux set-option -t "${SESSION}:${WIN}" pane-border-format "#{pane_title}"
tmux select-pane -t "${SESSION}:${WIN}.0" -T "RUNNER"
tmux select-pane -t "${SESSION}:${WIN}.2" -T "AI-AGENT"
tmux select-pane -t "${SESSION}:${WIN}.1" -T "CHECKLIST"
tmux select-pane -t "${SESSION}:${WIN}.3" -T "NOTES"

# Wire RUNNER
tmux send-keys -t "${SESSION}:${WIN}.0" "cd $PROJ && $BINARY" Enter

# Wire CHECKLIST
if [[ -n "$CHECKLIST_FILE" && -f "$CHECKLIST_FILE" ]]; then
  tmux send-keys -t "${SESSION}:${WIN}.1" "cat '$CHECKLIST_FILE'" Enter
else
  tmux send-keys -t "${SESSION}:${WIN}.1" "echo 'No checklist file configured. Set CHECKLIST_FILE in this script.'" Enter
fi

# AI-AGENT pane
if [[ -n "$AGENT_PANE_SRC" ]]; then
  ORIG_SESSION="${AGENT_PANE_SRC%%:*}"
  ORIG_WIN_PANE="${AGENT_PANE_SRC#*:}"
  ORIG_WIN="${ORIG_WIN_PANE%%.*}"
  tmux set-option -t "${SESSION}:${WIN}" @twh_agent_source "${ORIG_SESSION}:${ORIG_WIN}"

  BLANK_PANE_ID=$(tmux display-message -t "${SESSION}:${WIN}.2" -p '#{pane_id}')
  tmux join-pane -s "$AGENT_PANE_SRC" -t "${SESSION}:${WIN}" -v -p 50 2>/dev/null
  tmux kill-pane -t "$BLANK_PANE_ID" 2>/dev/null || true
  tmux select-pane -t "${SESSION}:${WIN}.2" -T "AI-AGENT"
  echo "AI-AGENT: joined pane from $AGENT_PANE_SRC"
else
  tmux send-keys -t "${SESSION}:${WIN}.2" \
    "echo 'AI-AGENT pane — use --agent-pane SESSION:WINDOW.PANE to attach an existing session, or start one here'" Enter
fi

# NOTES
if [ ! -f "$NOTES_FILE" ]; then
  mkdir -p "$(dirname "$NOTES_FILE")"
  touch "$NOTES_FILE"
fi
tmux send-keys -t "${SESSION}:${WIN}.3" "nano '$NOTES_FILE'" Enter

# Focus RUNNER
tmux select-pane -t "${SESSION}:${WIN}.0"

echo ""
echo "Testing harness ready: $WINDOW_NAME (${SESSION}:${WIN})"
echo "  Teardown: bash .claude/workspaces/testing-harness-tui-cli.sh --teardown ${SESSION}:${WIN}"
