# TAW Tasklist

> Ongoing task log for features, redesigns, and investigations.  
> Status: `idea` → `scoped` → `in-progress` → `done`

---

## Active

### UX Redesign — Mode System & Discoverability
**Status**: `in-progress`  
**Summary**: Define and implement the three-mode system (Brainstorm / Research / Wiki) with color-coded UI, persistent mode indicators, and contextual footers that teach the user what to do next.

**Ideal state (magic wand)**:

Every mode has a distinct visual identity — color, chat border, header tint — so you always know where you are. When you enter a mode, the first response orients you in one sentence. Every subsequent AI response ends with a mode-aware footer listing 2-3 natural next steps. The footer is not boilerplate — it changes based on what you've done so far in the session (e.g., "3 sources saved — ready to ingest" vs "no sources yet — try /search-source").

The AI inside each mode has a different posture:
- Brainstorm AI is expansive and challenges your assumptions
- Research AI is precise and cites everything
- Wiki AI is editorial and asks clarifying questions before writing

You never feel lost. The app tells you what it can do right now, in context.

**Specific work items**:
- [ ] Implement mode color tokens in TUI (header, chat border, footer text)
- [ ] Add persistent mode indicator to TUI header (always visible)
- [ ] Build contextual footer appended to every mode response
- [ ] Write mode-entry orientation message for each of the three modes
- [ ] Update AI system prompts per mode to reflect distinct posture
- [ ] Define and document mode color tokens: magenta `#d946ef` / teal `#14b8a6` / pumpkin `#ea580c`

**Depends on**: command-hierarchy.md (scoped)  
**See also**: PWA/TUI Unification (below — do these together)

---

### PWA App & Browser Extension Review
**Status**: `scoped`  
**Summary**: Audit and improve the TAW PWA (Android mobile app) and Chrome browser extension. Ensure both feel like first-class surfaces, not afterthoughts.

**Ideal state (magic wand)**:

**PWA**: The mobile app is the best way to capture and review. When you open it, you immediately know what session you're in, what mode you're in, and what you've captured. The three modes are prominent — you can enter any of them from the home screen. Chat feels native — markdown renders beautifully, code blocks are readable, responses feel designed not dumped. Swipe navigation is smooth and obvious. The app is fast enough that you reach for it instinctively.

**Browser Extension**: One-tap capture from any page. The extension knows your active session and active research type — you don't re-enter that context each time. Capture has three flavors: send the full page, send selected text, send a note with URL. After capture, the extension confirms with the source title and session it went into. You can optionally add a note inline. The extension feels like a natural part of your browser, not a modal that interrupts you.

**The unified experience**: What you capture on mobile or via the extension shows up immediately in the TUI session. The session is the single source of truth — PWA and extension are input surfaces into it.

**Specific work items**:
- [ ] Audit current PWA features against ideal state — identify gaps
- [ ] Audit current browser extension features against ideal state — identify gaps
- [ ] Define capture flow: what fields, what confirmation, what session targeting
- [ ] Design extension popup for three capture flavors (page / selection / note)
- [ ] PWA: session selector (switch between active sessions)
- [ ] PWA: mode entry buttons on home screen (not just chat input)
- [ ] PWA: source list view — see what's been captured this session
- [ ] Ensure TUI/PWA/extension all show same session state in real time

**Note**: Do not redesign PWA UI/UX independently — coordinate with TUI unification task below.

---

### PWA / TUI Visual Unification
**Status**: `scoped`  
**Summary**: When mode colors and UX patterns are finalized in the TUI, apply them consistently to the PWA so both surfaces feel like the same product.

**Ideal state (magic wand)**:

You switch between terminal and phone and it feels like the same app. The three mode colors appear in both. The footer/next-steps pattern exists in both (adapted for touch in PWA — as chips or buttons, not raw text). The language used — mode names, command names, source terminology — is identical. A user who learns brainstorm mode in the TUI immediately understands it in the PWA.

The design token set is defined once and referenced by both surfaces. Changing a mode color changes it everywhere.

**Specific work items**:
- [ ] Extract mode color tokens into shared reference (docs or config)
- [ ] Apply mode colors to PWA header, chat border, and mode indicator
- [ ] Implement PWA equivalent of contextual footer (next-step chips at bottom of response)
- [ ] Audit language consistency between TUI responses and PWA UI copy
- [ ] PWA mode entry: dedicated buttons for Brainstorm / Research / Wiki on home screen

**Dependency**: Complete TUI mode system first, then port to PWA. Do not do in parallel.

---

## Backlog

### Hister Integration Review
**Status**: `idea`  
**Summary**: Review what Hister currently does in TAW, evaluate whether it should be repositioned as a Research-tier tool rather than a standalone command, and define what the ideal Hister experience looks like.

**Ideal state (magic wand)**:

Hister is invisible when you don't need it and instantly useful when you do. Inside Research mode, when you ask a question, TAW optionally checks your browser history for relevant pages you've already visited — surfacing them as sources alongside web search results. You don't run `/hister` manually — it's an option the AI offers: "I found 3 pages in your browser history about this topic — want me to include them?"

Outside of Research mode, `/hister` works as a standalone search tool — fast, filtered, results directly actionable as sources.

The key insight: Hister is valuable because it knows what you've already read. That context should flow into Research automatically, not require a separate command.

**Specific work items** (to be defined):
- [ ] Audit current `/hister` implementation — what it does, what it returns
- [ ] Evaluate: is Hister best as (a) auto-surface in Research, (b) explicit sub-option in Research, or (c) standalone command?
- [ ] If repositioning: update Research mode prompts to offer Hister as an option
- [ ] Define Hister result format as a research source type
- [ ] Evaluate Hister index freshness and reindex UX

**Note**: Hister may be genuinely unique — its browser history angle doesn't map neatly to web search or file ingest. Investigate before deciding on positioning.

---

## Done

_(nothing yet)_
