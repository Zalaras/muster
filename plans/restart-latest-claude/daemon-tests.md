# Daemon Tests: Restart Latest Claude

**Plan**: restart-latest-claude
**Verdict**: pass
**Pack**: kb: pack 41113 words (budget 30000)

## Summary

Tests created: 39 new top-level tests across 8 new files (earlier waves) plus, in review cycle 1's fix wave, 11 new top-level tests (4 held-mark manager tests, 1 held failed-write test, 3 `RunBatch` tests, 3 held-mark handler tests) and 7 starting conditions added to the crossed invariants table (24 conditions became 31, 20 inputs each: 620 cells) | Passing: all | Failing: 0

Review cycle 1 fix wave (commit suffix `(review cycle 1)`). Gate: `go build ./...` exits 0; `make lint` 0 issues; `comment-checks.py daemon-tests` clean; `go test -race -count=1 ./...` through `bin/gatelock run --shared --wait 30m` green, per-package times below.

## Fixes

**Critical 1 (`make test-race` hit the 10 m per-package timeout in `internal/session` and `internal/server`).** Cause measured, not assumed: a probe in the session package timed `openTestStore` at 396 ms of a 440 ms `newRestartRig` (`store.Open` replays 19 migrations, each with WAL fsyncs, under `-race`); `behindSession` itself is 16-19 ms. Every cell of the crossed tables paid that. The `internal/server` timeout was the same cost across the whole package, not this plan's tests: `-json` timing of the full package at load 10 showed 682 top-level tests summing 620 s (mean 0.9 s), of which the restart and claude-version tests were 35 s.
Fix, no crossed row removed: one migrated database is built once per test binary (`TestMain`, new `internal/session/main_test.go`, extended `internal/server/main_test.go`) and `openTestStore` (session) / `openCopiedStore` (server, replacing all 22 `store.Open` calls in 19 test files; a path that already holds a database is opened as is, so reopen tests still see what they wrote) copy that file instead of replaying migrations. Each test still gets its own private store and manager.

Measured (same machine, load 10-35 from other worktrees' gates):

| | before | after |
|---|---|---|
| `TestRestartRemove_OfAPendingSessionLeavesNothingToFire` under `-race` | 2.58 s | 0.43 s |
| `internal/session` `go test -race` | 608.9 s (timeout, review) / 313.7 s (my earlier gate run) | 141.6 s (gate) |
| `internal/server` `go test -race` | 608.6 s (timeout, review) / 643.7 s (my earlier gate run, FAIL) / 632 s alone | 189.0 s (gate), 184.6 s alone |

Gate output (last run, `go test -race -count=1 ./...`): `ok internal/server 188.950s`, `ok internal/session 141.579s`, `ok internal/store 69.099s`, `ok internal/usage 61.235s`, `ok cmd/musterd 98.183s`, every other package `ok`, none FAIL. The D3/D4/D5/D9 crossings keep every starting condition and input (`TestClassifyRestart_EveryStateAndCondition`, `TestSetInstalledClaude_ClearsThePendingMark...`, `TestRestartInvariants_EveryInputFromEveryState` untouched in shape; the invariants table only gained rows).

**Minor 4 (`RestartsWithTheLatchedModeAndEffort...` skipped leading `alive:true` upserts).** Traced: the terminal attach calls `Manager.MarkSeen` (`manager_rail.go`), which clears `Unread` with its own upsert, and `h.stop` leaves an idle session unread, so that upsert races `h.wire.reset()` (printed the wire: `alive=true unread=false`, then `alive=false`, then `alive=true`). The test now marks the card seen before attaching, so the attach emits nothing, and asserts the session's upserts are exactly `[false, true]` with `claudeVersion` null in both, no skip.

## Handoff Received (daemon-impl Fix Attempt 2)

- `internal/server/claudeversion_test.go`: `newClaudeVersionFeature` now takes `onInstalled`; `watchVersionOf` passes `nil`; `newVersionFeature` delegates to a new `newVersionFeatureTold(t, poll, logs, onInstalled)`.
- `internal/server/restart_installed_test.go`: `followInstalled` is gone; the four tests that used it pass `calls.record` or `h.feature.installedKnown` (what `server.go` wires) to the constructor. The two reloaded-mark tests (`FirstFailedCheck...`, `UnresolvedBinaryOnFirstTick...`) assert the hold through `requireHeld` (not pending, not behind, stored column 1, never due) and the dropped store column and empty queue after the tell.
- `internal/server/restart_test.go`: `TestRestartStart_SweepsTheFreePendingSessionsOnceAfterADaemonRestart` replaced by the three `TestRestartHeld_*` tests below (the sweep is `installedKnown`'s now).
- `internal/session/restart_invariants_test.go` and `restart_test.go`: "the store holds the mark" now reads the row (`restartRig.stored` / `storedVersion`, `GetSession`) instead of reloading through a fresh manager, which now yields a held mark; the death test accepts a reconcile-reloaded survivor as held; the `/clear` + daemon-restart test asserts the reloaded session is held with the store column still 1; `TestLoadAll_ReloadsTheRestartStateAndSweepsTheFreePendingOnes` replaced (below). Every listed failing session test passes.

## Tests (this wave)

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/session/restart_invariants_test.go` | TestRestartInvariants_EveryInputFromEveryState | adds 7 "reloaded and held" starting conditions (every display state) crossed with all 20 inputs: held never on the wire or due, resolved only by an installed result (released exactly when behind, else dropped) or a death, store column equals `RestartPending \|\| held` | pass |
| `internal/session/restart_invariants_test.go` | TestLoadAll_HoldsTheReloadedMarkOffTheWireUntilTheInstalledVersionIsKnown | held: not pending, not behind, never due, `ClassifyRestart` skips, `SetRestartPending` refuses, store keeps the mark, nothing offered | pass |
| `internal/session/restart_invariants_test.go` | TestLoadAll_AStatusPostBeforeTheFirstInstalledResultKeepsTheHold | four post kinds before the first result leave hold, wire and store column; no upsert shows pending or behind | pass |
| `internal/session/restart_invariants_test.go` | TestLoadAll_TheFirstInstalledResultReleasesOrDropsEveryHeldMark | known-and-behind releases (one upsert each, free ones offered once, busy ones not), equal / older / unknown drop (store too, nothing offered); unmarked and dead sessions not released or dropped | pass |
| `internal/session/restart_invariants_test.go` | TestLoadAll_AHeldMarkDiesWithItsSession | liveness death, Stop, Resume button, relaunch while held drop hold and column; another held session unaffected; later result releases nothing for the dead one | pass |
| `internal/session/restart_invariants_test.go` | TestLoadAll_AMidRunReloadOnceTheInstalledVersionIsKnownResolvesAtOnce | the render rig's `markDead` path: a `LoadAll` after the result never holds | pass |
| `internal/session/restart_writes_test.go` | TestRestartWrites_FailedPersistKeepsAHeldMarkHeld | a refused write on release or drop restores the hold with the rest, no broadcast | pass |
| `internal/session/actions_runbatch_test.go` | TestRunBatch_FilesEachIDUnderTheOutcomeItsOpReturned | done / queued / skipped outcomes, `ErrUnknownSession`, `ErrSessionNotAlive` (also wrapped) skipped, other error failed, listed order, a failure stops nothing | pass |
| `internal/session/actions_runbatch_test.go` | TestRunBatch_AnEmptyListIsAnEmptyResult, TestRunBatch_RunsEachOpUnderItsSessionsLock | empty list; op runs with the session lock held (a second holder waits) and the lock is released after | pass |
| `internal/session/actions_batch_test.go` | TestBatch_ARepeatedIDIsRefusedBeforeAnythingRuns | `RunBatch` with the restart's op joins `EndMany`/`RemoveMany`: repeated id is `ErrInvalidOrder` with the op never run | pass |
| `internal/server/restart_test.go` | TestRestartHeld_NothingIsDueOrRestartableBeforeTheFirstInstalledResult | after a daemon restart: held sessions off the wire, queue empty through a status post and a Stop, a restart batch skips them, no spawn or kill, no upsert shows pending or behind | pass |
| `internal/server/restart_test.go` | TestRestartHeld_TheFirstInstalledResultReleasesTheFreePendingSessionsOnce | `installedKnown` with a behind result: each free pending session restarted exactly once through the live queue, busy one released as pending and restarted when free, unconfirmed and ended ones untouched | pass |
| `internal/server/restart_test.go` | TestRestartHeld_AResultThatLeavesNothingBehindDropsTheMarks | equal, older and unknown first result drop every held mark (store too), nothing queued or restarted | pass |
| `internal/server/restart_installed_test.go` | the four repaired tests | see Handoff Received | pass |
| `internal/server/restart_test.go` | TestRestartSessions_RestartsWithTheLatchedModeAndEffortAndClosesTheTerminal | Minor 4: exact `[false, true]` upsert sequence | pass |

Earlier waves' table (39 tests: `internal/claudecode` status/version, `internal/store` columns, the D1-D12 manager and handler tests) is unchanged in what it covers; see `git show HEAD~3:plans/restart-latest-claude/daemon-tests.md`.

## Notes

- **Fails-on-old-code**, proven in a throwaway rsync copy in the scratchpad (the real tree never mutated); each one-line break of the implementation turned the named tests red:
  H1 `LoadAll` seeds `ClaudeBehind` from the mark and does not hold -> 5 `TestLoadAll_*`/`TestRestartWrites_FailedPersistKeepsAHeldMarkHeld` (16 subtests); H2 settle never drops a held mark on a not-behind result -> `TestLoadAll_TheFirstInstalledResult...`, invariants (74); H3 row writes `RestartPending` without the hold -> `TestLoadAll_AStatusPost...`, invariants (61); H4 `clearClaudeVersion` keeps the hold -> `TestLoadAll_AHeldMarkDies...`, invariants (48); H5 `file` puts `BatchQueued` in Done -> `TestRunBatch_FilesEachID...`; H6 `RunBatch` without the session lock -> `TestRunBatch_RunsEachOpUnderItsSessionsLock`; H7 failed write does not restore `restartHeld` -> `TestRestartWrites_FailedPersistKeepsAHeldMarkHeld`; H8 `LoadAll` does not settle -> `TestLoadAll_AMidRun...`; H9 repeated-id refusal removed -> `TestBatch_ARepeatedID...` (16, incl. the new RunBatch rows); H10 first result no longer resolves a hold -> 4 tests; H11 `restartDue` counts a held mark -> invariants and `TestLoadAll_*`; H12 `installedKnown` does not tell the manager -> 4 `TestRestartHeld_*`/`TestClaudeVersion_*`; H13 wired `onInstalled` never called -> 6 `TestClaudeVersion_*`, `TestNew_Follows...`; H14 an extra `alive:true` upsert before the kill -> `TestRestartSessions_RestartsWithTheLatched...`. (An earlier H2 that only changed the first branch survived because the second clause also drops the mark: an equivalent mutant, replaced by one that disables both.)
- The `TestRestartHeld_*` queue tests drive `installedKnown`, which calls `SetInstalledClaude` then enqueues `RestartDue`; the manager's upsert callback also enqueues each released session, so `enqueue`'s dedup is what keeps each restart single (asserted: `spawns() == 2`, then a stale entry restarts nothing).
- First `make test-race` attempt after the session speed-up still timed out `internal/server` (643.7 s, other worktrees' gates running at load 35); that is what led to the server-side template. An unrelated `internal/tmux` `TestRunCommand_DescendantHoldingStdoutDoesNotHang` (15 s ceiling) failed once in that overloaded run and passed in the gate run (`ok 30.673s`); not this plan's code.
- `MUSTER_GATELOCK_WAIT` is not read by `bin/gatelock` (only `MUSTER_GATELOCK`/`MUSTER_GATELOCK_FILE`); `make test-race` waited the 4 min default and exited 75 behind another worktree's exclusive lock, so the gate was run as `bin/gatelock run --shared --wait 30m -- go test -race -count=1 ./...`, the same command `make test-race` runs.
- Size warnings (`make size-warn`, warn only) naming my files are unchanged `funlen` ones on the long crossed-scenario tests (`TestRestartSessions_ClassifiesEachListedID` 49 statements, `..._RestartsWithTheLatched...` 47, `..._FailedHalves` 69 lines, `TestRestart_NeverTouchesSessionsOutsideIDs` 61, `TestRestartDue_Fires...` 65, `TestRestartWrites_FailedPersistRollsBack...` 66); each is one scene read top to bottom. No `dupl` line names my files. The plain (non-race) `make test` was started once after the gate but sat behind another worktree's load past the foreground ceiling and was stopped; the race run executes the identical tests.
- Declined coverage: an unresolvable binary on the first tick is covered at both ends (`TestClaudeVersion_UnresolvedBinaryOnFirstTickClearsAReloadedPendingMark` drives the real feature into `installedKnown`; the manager treats `nil` as unknown, `TestLoadAll_TheFirstInstalledResult...` "unknown" row).

## Test Run Output

```
$ go build ./...                       -> exit 0
$ make lint                            -> 0 issues.
$ python3 .claude/skills/orchestrate/scripts/comment-checks.py daemon-tests -> comment-checks: clean
$ bin/gatelock run --shared --wait 30m -- go test -race -count=1 ./...
ok  	github.com/Zalaras/muster/cmd/musterd	98.183s
ok  	github.com/Zalaras/muster/internal/claudecode	14.154s
ok  	github.com/Zalaras/muster/internal/server	188.950s
ok  	github.com/Zalaras/muster/internal/session	141.579s
ok  	github.com/Zalaras/muster/internal/store	69.099s
ok  	github.com/Zalaras/muster/internal/tmux	30.673s
ok  	github.com/Zalaras/muster/internal/usage	61.235s
... every other package ok, none FAIL
```
