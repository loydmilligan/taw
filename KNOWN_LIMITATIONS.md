# Known Limitations

Applies to baseline `0.1.0-beta.3`.

- `/rate-source` uses Node's experimental `node:sqlite` module. It was verified
  locally on Node 22; older Node 20 installs may report that source ratings are
  unavailable.
- Browser bridge append-to-current-session is not implemented yet. The current
  extension flow starts a new research session.
- `/open-source` opens tmux side panes but does not yet track or reuse open
  source views as named tabs/windows.
- Source ratings are not yet shown inline in `/sources`.
- Research cost warnings cover dollar-cost thresholds, not prompt-token or
  completion-token thresholds.
- Full live-provider manual QA for the `0.1.0-beta.3` baseline still needs to be
  completed before cutting a release tag.
