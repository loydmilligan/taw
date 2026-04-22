# Wiki Roadmap

Applies to baseline `0.1.0-beta.11`.

## High Priority

- Improve ingest update behavior so existing notes can be reviewed and adjusted instead of only rejecting duplicate creates.
- Consolidate wiki and research maintenance commands around the shared storage helpers so future layout changes stay centralized.

## Planned

- Add per-note versioning or changelog sections so wiki pages can track what changed over time.
- Replace duplicate-create skipping with smarter note reconciliation:
  - read the existing note
  - compare the new source material
  - decide whether to append, revise, or leave unchanged
- Build a separate link-crawling and link-repair update feature that runs independently from ingest.
- Keep ingest focused on fast source capture and content filing, then run broader link maintenance after success or in a later batch job.
