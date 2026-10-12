# Proposed backlog — plan `reader-expanded-persists`

Follow-up this run found, proposed for the developer to file or decline at `/land`
(kb:adr/process-backlog-entries-are-the-users-to-file). Nothing here is filed.

### `make test` fails when run from inside a Muster session

- [ ] **`make test` fails inside a Muster session** — run from a Claude session that Muster
  launched, `TestShellRegistry_EnsurePaneEnvironmentNeverCarriesMusterSession` and
  `TestShellRegistry_RespawnsAfterExternalKillWithNoMusterSession` (`internal/server`) fail with
  `MUSTER_SESSION=[9]` where they expect `MUSTER_SESSION=[]`. With `MUSTER_SESSION` unset they
  pass. They should pass whatever the environment they run in.

- **Source**: gates cycle 1, `02-test.log`; rerun with `env -u MUSTER_SESSION` → `ok`.
- **Change requested**: no — the branch changes no Go.
- **Suggested section**: Issues → On their own.
- **Pre-existing**: yes.

### A `musterd` started inside a Muster session hands `MUSTER_SESSION` to its shell panes

- [ ] **Shell panes inherit `MUSTER_SESSION` from the daemon's environment** — a `musterd`
  started from a terminal that already carries `MUSTER_SESSION` (a Claude session Muster
  launched) passes it on to the shell panes it creates. A shell pane should never see
  `MUSTER_SESSION`, whatever environment the daemon was started in.

- **Source**: `review.code.md` cycle 1, Critical 1's note (same mechanism as the entry above).
- **Change requested**: no — not measured against a running daemon; inferred from the test failure.
- **Suggested section**: Issues → On their own.
- **Pre-existing**: yes.

## Decisions (the developer, 2026-10-12)

1. filed: TODO.md § Issues → Together — `MUSTER_SESSION` from the surrounding environment, "`make test` fails inside a Muster session" (04bfaf41 on main)
2. filed: TODO.md § Issues → Together — `MUSTER_SESSION` from the surrounding environment, "Shell panes may inherit `MUSTER_SESSION` from the daemon's environment" (04bfaf41 on main)
