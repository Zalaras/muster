# Doc Reconcile: tmux-server-env-leak

**Verdict**: reconciled
**Pack**: kb: pack 6003 words (budget 30000)
**Features derived**: surfaces (plan header: surfaces)

## Claims

| Feature | Claim | Verified against | Action |
|---------|-------|------------------|--------|
| surfaces | The shell pane carries no Muster session environment whatever environment the daemon started in; the tmux client strips `MUSTER_SESSION` from every command it runs, so the server never holds the daemon's own. | `internal/tmux/tmux.go:execSeparated` (deletes `MusterSessionEnvVar=` from `os.Environ()`; production `New` wires it as `Client.exec`); `internal/tmux/tmux_test.go:TestNewSession_PaneNeverInheritsMusterSessionFromTheClientEnvironment`; `internal/server/shells_test.go` | extended the existing sentence |
| surfaces | Nothing stopped being true. | none | none |

Changed files (`internal/tmux/tmux.go`, `tmux_test.go`, `internal/server/shells_test.go`) all map to surfaces.

## Contradictions
None

## For the orchestrator
None. `docs/protocol.md` unchanged (no protocol delta).

## Checks
make gen-kb: all generated files fresh. make check-kb: 558 records, 27 features, 0 problem(s). surfaces spec.md: 694 words including frontmatter (cap 800).
