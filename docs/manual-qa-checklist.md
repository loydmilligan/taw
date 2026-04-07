# Manual QA Checklist

## General launch
- [ ] Launch `taw` from a directory without `.ai/config.json`
- [ ] Confirm a general session starts under `~/.config/taw/sessions`
- [ ] Confirm the footer shows clear next actions

## Project init and attach
- [ ] Run `/init`
- [ ] Confirm `.ai/config.json` and `.ai/sessions/` exist
- [ ] Restart and confirm the header now shows project mode
- [ ] Run `/attach-dir <path>` with a valid directory
- [ ] Run `/attach-dir <path>` with an invalid directory and confirm the error is actionable

## Chat and modes
- [ ] Send a freeform chat message with a valid provider key configured
- [ ] Confirm streamed assistant text appears without freezing input
- [ ] Run `/brainstorm` and create a saved project brief artifact
- [ ] Run `/workflow review` and create a saved review artifact
- [ ] Run `/workflow generate` and create a saved workflow artifact

## Summary and errors
- [ ] Run `/summarize-session` and confirm `session-summary.md` is written
- [ ] Remove the provider API key and confirm the error explains the next step
- [ ] Check `~/.config/taw/logs/` for a readable daily log entry
