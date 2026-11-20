# Daemon Tests: better-terminal

**Plan**: better-terminal
**Verdict**: pass
**Pack**: kb: pack 27118 words (budget 30000)

## Summary

Tests created: about 95 cases (new functions and subtests across 4 packages) | Passing: all | Failing: 0. `go build ./...`, `make test` and `make lint` (0 issues) are green.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/tmux/shellname_test.go` | TestTerminalSessionName_ParseTerminalName_Table, TestTerminalSessionName_RoundTripAcrossIDsAndNumbers | D1: name <-> (id, n); 6 valid and 16 rejected shapes (explicit -1, 0, 02, +2, junk, overflow, Claude name); IsShellSessionName/ParseSessionName agree | pass |
| `internal/session/reconcile_shell_test.go` | TestReconcile_KillsEveryTerminalOfEverySession, TestClassifyTmuxNames_TerminalNamesRaiseTheWatermarkAndAreKeptAsNames, TestKillAllShells_KillsEveryTerminalNumber | reconcile and shutdown kill every terminal n; none reported unknown; malformed suffix is unknown; watermark | pass |
| `internal/server/shellactivity_test.go` | TestTick_*, TestSync_*, TestReconcile_Transitions (8 rows), TestReconcile_SessionsAreIndependent, TestReconcile_ForgetsTheNames..., TestCurrent_*, TestShellActivityFeature_Contribute... | terminals poller: per-session sorted list, effective names, busy gating, whole-list broadcast on add/rename/busy/close/last-gone, silent when unchanged, lister error keeps the list, hasShells gate, multi-session independence | pass |
| `internal/server/terminals_test.go` | TestLowestFree_Table, TestTerminalNames_*, TestShellRegistry_* (numbering, hole reuse, EnsureAny lowest running, Close, two-session Kill, list failure), TestHandleNewTerminal_*, TestHandleCreateShell_ReturnsLowestRunningTerminalWithN, TestHandleRenameTerminal_Table (16 rows), TestHandleCloseTerminal_EndsOnlyThat..., TestHandleRemoveSession_EndsEveryTerminal..., TestHandleShellTerminal_PerTerminalAttachRules | registry, names, POST /shells, POST /shell, PUT name, DELETE n, WS 404/409, per-terminal supersede with the Claude socket and another terminal coexisting | pass |
| `internal/server/shells_test.go` | TestShellRegistry_SpawnCollisionSurfacesTheSpawnError | replaces the two collision re-check tests | pass |

## Handoff Received

- `fakes_test.go`, `launchcreate_test.go`, `shells_test.go`: `ListSessions` added to fakeTmux, barrierTmux, blockingNamedSessionTmux, collidingTmux and neverRespondingTmux (the other paneSpawner fakes already had it).
- `shells_test.go`, `actions_test.go`, `groups_harness_test.go`: `newShellRegistry(x, newTerminalNames(), log)`; `Ensure` became `EnsureAny` (four returns).
- `shells_remove_lock_test.go`: the interleaving gate moved from PaneExists to ListSessions, the first call EnsureAny makes under the lock.
- `shellactivity_test.go`: rewritten for the new poller signature, `terminals` lists and the map-valued `Current()`.
- `state_test.go`: `shellsBusy: []` became `terminals: {}`. `server_test.go` needed no change (it asserts lifecycle features only).
- `plainshell_test.go`: dials `/ws/shell/{id}/1` through the new `dialTerminalN`; `shellscroll_test.go` comment updated.
- `groups_harness_test.go`, `groups_test.go`, `actions_test.go`: harness `launch` opens terminals 1 and 2; teardown assertions expect every terminal of the removed sessions and none of the others (Kill used to kill `-shell` unconditionally).
- tmux and reconcile name tests: see the table; `classifiedTmuxNames.shellNames` is read directly.

## Notes

- Behaviour change, not a bug against the plan: the old `Ensure` re-checked `PaneExists` after an `ErrSessionExists` collision and reported `created:false`. `EnsureAny` lists under the per-session lock and returns the spawn error on a collision (the plan does not specify). The two re-check tests were replaced by one asserting the error. The same-session race stays covered by `TestShellRegistry_ConcurrentEnsureOnlySpawnsOnce`.
- `Kill` now kills only listed terminals (it used to kill terminal 1 unconditionally), hence the harness change. If the list fails it kills terminal 1 (covered).
- Not unit-tested: handlers' immediate broadcast (`changed` = `poller.sync`) through the HTTP seam, because the server's poller reads the real client's `ListPaneActivity`. `sync` itself is covered by `TestSync_BroadcastsAChangeAtOnceAndOnlyOnce`; the E2E specs cover the live push.
- No `dupl` warnings named my files.

## Test Run Output

```
make test: every package ok (internal/server 144.8s, session, tmux, ...)
make lint: 0 issues.
```
