# Correctness review: tmux-server-env-leak

**Plan**: tmux-server-env-leak
**Verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 14280 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes — `internal/tmux/tmux.go:729` sets `cmd.Env` to `os.Environ()` minus `MUSTER_SESSION=` in `execSeparated`, the seam `New` wires as `Client.exec` (`tmux.go:48`) | Yes — `TestNewSession_PaneNeverInheritsMusterSessionFromTheClientEnvironment` (red first with `[leaked]`, recorded in daemon-tests.md; green in D1) | pass |
| REQ-2 | Yes — same change; both named `internal/server` tests are unedited (`git diff main..HEAD -- internal/server/shells_test.go` adds only an import and one new test) | Yes — D3 runs them with `MUSTER_SESSION=9` | pass |
| Edge 1 | Per-pane `-e` path untouched | `launchcreate_test.go` D4 pane-environment assertion runs under `make test` (green) | pass |
| DIAG | `kb:diagram/daemon-components` (from `kb for internal/tmux/tmux.go`): `internal/tmux` still imports no Muster package; the new `claudecode` import is in a `internal/server` test file only | — | pass |

## Build & Tests

E2E tests: skipped (E2E Scope none; no e2e line in the gate run) · Daemon tests (race): pass (all packages ok, 0 FAIL) · Web tests: pass (2492) · Daemon build: pass · Web build: pass · Lint: pass (0 issues) — all read from $GATES_LOG_DIR

Other gate lines: web-lint pass · contrast pass · features-inventory pass · versions pass · e2e-honest pass · kb-check pass (0 problems) · e2e-lint pass · features-scope pass · comment-checks pass · comment-ledger pass · size WARN on `internal/tmux/tmux.go` file length (review-maintainability's; the file was over threshold before this branch).

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `go test -count=1 -run 'TestNewSession_PaneNeverInheritsMusterSessionFromTheClientEnvironment' ./internal/tmux/` | pass (`17-D1.log`) |
| D2 | `make test` | pass (deduped to the baseline `make test-race`, a superset) |
| D3 | `MUSTER_SESSION=9 go test -count=1 -run 'TestShellRegistry_(EnsurePaneEnvironmentNeverCarriesMusterSession\|RespawnsAfterExternalKillWithNoMusterSession)' ./internal/server/` | pass (`18-D3.log`) |
| D4 | `make lint` | pass (deduped to the baseline lint line, 0 issues) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass — both TODO entries moved to `docs/history/todo-done.md` under the same heading with done lines; no `deviation:` lines, and `kb ls --feature surfaces --status proposed` is empty, so no ADR is owed; the impl log's `doc-delta: none` matches; the surfaces Doc Delta sentence holds for what shipped |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| R1 | Scrub sits in `execSeparated`, every tmux invocation passes through it | pass | `rg 'execSeparated\('` finds only its definition; `New` is the only production constructor and wires `exec: execSeparated`. Every other production `exec.Command` of tmux is `tmux -V` in the preflighter, which starts no server, and termbridge's attach, which targets a live session on an already-running server. |
| R2 | Nothing else about tmux's environment changed; `-e` still reaches the pane | pass | The filter is `slices.DeleteFunc` over the fresh copy `os.Environ()` returns, matching the exact `MUSTER_SESSION=` prefix, so `MUSTER_SESSION_X` and every other variable survive and none is added. `NewSession` is not in the diff. |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — `MUSTER_SESSION` is Muster's own wrapper variable, not Claude Code wire format; `internal/tmux` does not import `internal/claudecode` |
| 2 | Terminal-output state parsing | pass |
| 3 | Blocking hook handler | pass — not touched |
| 4 | Bare tmux | pass — the new test uses `tmuxtest.Socket` (per-test `-S` socket) |
| 5 | Payload logging | pass |
| 6 | Empty-gauge dishonesty | pass — no rendering path touched |
| 7 | Session identity on `session_id` | pass |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary/probes | pass — the test runs `/bin/sh` |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** The doc comment on `execSeparated` at `internal/tmux/tmux.go:724` describes the stdout/stderr split and the WaitDelay but not the new environment scrub. It is incomplete rather than false.
2. **[note]** The Doc Delta says "the tmux client strips `MUSTER_SESSION` before any command". That holds for every command `tmux.Client` runs. The terminal bridge still execs the attach argv with the full daemon environment at `internal/termbridge/termbridge.go:62`. Plan Edge Case 2 covers why this is harmless: the attach targets a live session, and the default `update-environment` list leaves the variable out. doc-reconcile may want "the daemon's tmux client" wording if it promotes the sentence.
3. **[note]** The auto-memory note on running `make check` inside a Muster session says the shell-registry respawn test fails on main with `MUSTER_SESSION` set. Once this lands, that note is stale and the `env -u MUSTER_SESSION` workaround is no longer needed. This is for the orchestrator to update, not an agent fix.
