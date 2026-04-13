# Wiki Roadmap

Applies to baseline `0.1.0-beta.9`.

## High Priority

- Add YAML frontmatter to all newly created wiki notes.
- Backfill frontmatter for existing wiki notes before the backlog grows further.
- Improve ingest update behavior so existing notes are reviewed and adjusted instead of only skipping duplicate creates.

## Planned

- Add per-note versioning or changelog sections so wiki pages can track what changed over time.
- Replace duplicate-create skipping with smarter note reconciliation:
  - read the existing note
  - compare the new source material
  - decide whether to append, revise, or leave unchanged
- Build a separate link-crawling and link-repair update feature that runs independently from ingest.
- Keep ingest focused on fast source capture and content filing, then run broader link maintenance after success or in a later batch job.
