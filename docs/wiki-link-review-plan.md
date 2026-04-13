# Wiki Link Review And Update Plan

## Goal

Add a separate post-ingest process that reviews newly added wiki notes and decides:

1. whether each new note should link to older existing notes
2. whether older existing notes should be updated to link back to the new notes

This should be independent from the main ingest path so ingest stays fast and focused on source capture.

## Why Separate It From Ingest

The current repo already points in this direction:

- `docs/wiki-roadmap.md` says link crawling and repair should be a separate feature
- `src/services/wiki/manager.ts` already supports wiki modes including `Lint`
- existing ingest behavior is still conservative around overwriting existing pages

That means the right design is:

- ingest creates or updates the immediate pages for the new source
- link review runs after ingest succeeds, or later as a batch job
- old-note updates happen through an explicit review/apply flow, not silently

## Scope

### In scope

- detect candidate links from new notes to old notes
- detect candidate reciprocal links from old notes to new notes
- rank and stage proposed edits
- let the user review and apply changes
- log what changed

### Out of scope for v1

- full semantic deduplication
- contradiction resolution across the whole wiki
- automatic large-scale rewrites of old notes
- external link validation

## Proposed Workflow

### 1. Trigger

Run link review in either of these ways:

- automatically after `/wiki ingest <topic>` succeeds
- manually via a new command such as `/wiki links <topic>` or `/wiki review-links <topic>`

Recommended default:

- after ingest, create a pending link-review job
- do not block ingest on it
- allow auto-run in the background later

### 2. Define The Review Set

The process needs two sets:

- `new_notes`: notes created or materially updated by the latest ingest
- `candidate_old_notes`: existing notes that may need cross-links

How to get them:

- record touched files during ingest
- use those as `new_notes`
- build `candidate_old_notes` from:
  - direct title/name matches
  - shared tags/frontmatter fields once frontmatter exists
  - mentions discovered by text search
  - links found in `index.md`
  - search hits over `pages/`

Keep the initial candidate set small. For v1, cap it per new note.

## Decision Logic

For each new note:

### A. Should the new note link to an old note?

Add a link when:

- the old note names an entity, concept, source, or analysis clearly referenced in the new note
- the reference is substantive, not just a passing mention
- the link improves navigation or context

Do not add a link when:

- the mention is too vague
- the candidate page is only loosely related
- the link would create noisy over-linking

### B. Should an old note link to the new note?

Update the old note when:

- the new note materially extends, clarifies, or specializes the old note
- the old note has a section where a “See also”, “Related”, “Recent developments”, or inline cross-link makes sense
- the new note is likely to be a useful inbound destination for future browsing

Do not update the old note when:

- the new note is too minor
- the old note is stable and broad, and a backlink would be clutter
- the relationship is symmetric but weak

## Edit Strategy

Use staged edits instead of direct write-through.

For each proposed change, generate:

- target file
- reason
- confidence score
- exact insertion plan
- before/after snippet

Types of edits:

- inline link insertion in existing prose
- add a short `## Related` or `## See also` section if none exists
- append to an existing related-links section

Recommended rule for v1:

- prefer updating existing `Related`/`See also` sections
- only create a new section if the note has no obvious place for the link
- avoid rewriting paragraphs unless needed for readability

## Command Surface

Add a dedicated flow instead of overloading ingest.

### Suggested commands

- `/wiki links <topic>`
- `/wiki links <topic> review`
- `/wiki links <topic> apply`
- `/wiki links <topic> recent`

Behavior:

- `review`: builds a staged proposal only
- `apply`: applies the currently staged proposal
- `recent`: only review notes touched in the latest ingest job

Alternative:

- extend `/wiki lint <topic>` with a link-maintenance mode

My recommendation:

- keep link review separate from general lint
- lint is broad health-checking
- link review is a focused maintenance pass with file edits

## Data Needed

To make this reliable, add lightweight metadata.

### Needed now

- list of files created/updated by the most recent ingest
- per-run job record under the wiki log or a small state file

### Needed soon

- YAML frontmatter on wiki pages
- note type
- aliases
- tags
- created/updated timestamps
- source count or provenance hints

Frontmatter will make candidate selection much more accurate.

## Implementation Phases

### Phase 1: Plumbing

- record which wiki files each ingest touched
- persist a pending link-review job
- add a command to inspect that job

Deliverable:

- TAW knows what “new notes” are for the latest ingest

### Phase 2: Candidate Discovery

- add a file search pass over the topic wiki
- match by title, aliases, headings, and strong term overlap
- produce ranked old-note candidates per new note

Deliverable:

- a machine-generated candidate map without editing files yet

### Phase 3: Proposal Generation

- have the agent read each new note plus top candidate old notes
- ask for proposed bidirectional links
- generate structured edit proposals with reasons and confidence

Deliverable:

- reviewable staged patch plan

### Phase 4: Review UX

- show proposed file updates in transcript output
- support confirm/cancel behavior similar to pending wiki ingest
- allow partial apply later if needed

Deliverable:

- safe human-in-the-loop workflow

### Phase 5: Apply And Log

- apply accepted edits with explicit overwrite behavior
- append a dated log entry describing reviewed notes, applied links, and skipped candidates

Deliverable:

- repeatable maintenance cycle with audit trail

### Phase 6: Hardening

- add frontmatter-aware matching
- detect duplicate or broken internal links
- avoid repeated suggestions for already-reviewed relationships

Deliverable:

- lower-noise recurring link maintenance

## Heuristics For V1

Keep the first version narrow and high precision.

- only review notes touched in the most recent ingest
- only inspect top 5 to 10 old-note candidates per new note
- require a clear mention match before proposing an inline link
- prefer `See also` updates over paragraph rewrites
- skip low-confidence proposals rather than forcing completeness

This reduces bad edits and keeps review manageable.

## Risks

### Over-linking

If every weak mention becomes a link, the wiki gets noisy fast.

Mitigation:

- high-confidence threshold
- candidate cap
- review-first workflow

### Bad Reciprocal Updates

Old notes can become cluttered if every new note gets back-linked.

Mitigation:

- only add backlinks when the new note materially adds context
- prefer one concise related-links line over prose rewrites

### Repeated Suggestions

The system may keep proposing the same relationship across runs.

Mitigation:

- log accepted and rejected proposals
- suppress recently rejected pairs unless the note changed materially

## Testing Plan

Add tests at three levels.

### Unit tests

- candidate selection from a set of note files
- reciprocal-link decision filters
- section insertion behavior for `Related` and `See also`

### Integration tests

- ingest creates pending link-review state
- review command produces staged proposals from fixture notes
- apply command updates only approved files

### Fixture tests

Use small sample wikis where:

- one new note should link to an existing entity page
- one existing concept page should gain a backlink to the new note
- one weakly related note should be ignored

## Recommended MVP

If you want the fastest path to value, build this MVP:

1. record files touched by the latest ingest
2. add `/wiki links <topic> recent review`
3. search the wiki for candidate old notes by title/term overlap
4. generate a staged proposal with:
   - new note -> old note links
   - old note -> new note related-links updates
5. require `/confirm` before applying
6. log applied edits

That gets you the workflow you described without trying to solve all wiki maintenance at once.

## Recommendation

Treat this as a dedicated “post-ingest link maintenance” feature, not part of core ingest.

The implementation order I would use is:

1. touched-file tracking
2. recent-link-review command
3. staged proposal generation
4. confirm/apply flow
5. frontmatter-enhanced matching

That sequence fits the current codebase and keeps risk low while still making the wiki meaningfully more connected over time.
