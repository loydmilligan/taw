# Known Limitations

Applies to baseline `0.1.0-beta.4`.

- `/rate-source` uses Node's experimental `node:sqlite` module. It was verified
  locally on Node 22; older Node 20 installs may report that source ratings are
  unavailable.
- Browser bridge append-to-current-session is not implemented yet. The current
  extension flow starts a new research session.
- Source ratings are not yet shown inline in `/sources`.
- `/or-key` is command-driven today. It does not yet provide a true step-by-step
  interactive setup wizard inside the TUI.
- `/or-key status` can verify that the target env var exists, but TAW does not
  keep a plaintext backup of the key for exact drift comparison.
- Full live-provider manual QA for the `0.1.0-beta.4` baseline still needs to be
  completed before cutting a release tag.
