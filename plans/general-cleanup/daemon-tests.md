# Daemon Tests: General Cleanup

**Plan**: general-cleanup
**Verdict**: pass
**Pack**: `<!-- kb:pack plan=general-cleanup role=daemon-tests features=ingest,lifecycle,surfaces,actions,connection,theme,reader,triage,launch -->`

## Summary

Wave-2 pass (pre-review fix cycle, no review has run yet). Scope: cover Fix Attempt 3's
new `Manager.stopped atomic.Bool` guard in `internal/session/manager.go`, which had no
test at all, and confirm D1-D16/REQ-14 are still landed and green after Fix Attempts 2
and 3 (`5ea7a88`, `d970b4a`).

Tests created: 2 (one table-driven with 2 subtests, one single test) | Passing: 3/3 | Failing: 0

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/session/manager_test.go` | `TestCheckOneLiveness_StoppedGuard_PeriodicPollAndNudgeSkipPersistAfterStop/periodic_poll` | After `Stop()`, `checkLiveness`'s periodic-poll path (`endOnCheckError=false`) sees a missing pane but does not persist `alive:false` or broadcast | pass |
| `internal/session/manager_test.go` | `TestCheckOneLiveness_StoppedGuard_PeriodicPollAndNudgeSkipPersistAfterStop/nudge` | Same guard from the `Nudge` entry point (the actual regression path per Fix Attempt 2/3's captured log sequence) | pass |
| `internal/session/manager_test.go` | `TestEnd_StillMarksEndedAfterStop` | After `Stop()`, `End` (`endOnCheckError=true`) still marks the session ended — the `-on-exit=kill` regression risk of the guard itself; a bystander session stays alive and untouched (INV-2, multi-instance coverage) | pass |

The third minimum-coverage item the task named — "before `Stop()`, the poll path still
marks ended as it always did (guard is inert while running)" — is already covered and
was not duplicated:
- `internal/session/manager_test.go:385` `TestCheckLiveness_FlipsAliveFalseOnMissingPaneAndBroadcasts`
  asserts `assert.False(t, persisted.Alive)` after `mgr.checkLiveness(...)` with `Stop`
  never called, i.e. `m.stopped` at its zero value (`false`) — the periodic-poll path.
- `internal/session/manager_test.go:560` `TestNudge_FlipsAliveFalseImmediatelyWithoutWaitingForThePollTicker`
  covers the same pre-`Stop` case from the `Nudge` entry point.

## D1-D16 / REQ-14 confirmation

Re-ran targeted suites after Fix Attempts 2 and 3 landed:

```
$ go test ./cmd/musterd/... ./internal/triage/... ./internal/server/... \
    -run 'TestOnExit|TestAskKillPrompt|TestCheckVersion|TestShellRegistry_Ensure|Drain' -v -count=1
--- PASS: TestAskKillPrompt
--- PASS: TestAskKillPrompt_EOFWithNoInputAnswersLeave
--- PASS: TestOnExit_Leave_LiveSessionSurvivesShutdown       (D14 predecessor)
--- PASS: TestOnExit_Kill_LiveSessionIsKilledAndRowMarkedDead
--- PASS: TestOnExit_AskWithNonTTYStdinBehavesAsLeave
--- PASS: TestOnExit_Kill_LiveSessionAndShellAreBothKilled   (D13)
--- PASS: TestOnExit_Leave_LiveSessionAndShellBothSurvive    (D14)
--- PASS: TestOnExit_Kill_ShellOnlyNoLiveSessionsStillKillsIt (D15)
--- PASS: TestAskKillPrompt_NamesBothCountsPluralFixed       (D16)
ok  	github.com/Zalaras/muster/cmd/musterd	6.508s
--- PASS: TestCheckVersion                                   (D1)
--- PASS: TestCheckVersion_WrongKindAlwaysFails
ok  	github.com/Zalaras/muster/internal/triage	0.328s
--- PASS: TestIngestQueue_Drain_NothingQueuedReturnsImmediately  (REQ-14/REQ-3 Drain)
--- PASS: TestIngestQueue_Drain_WorkerNotRunningBlocksToDeadline
--- PASS: TestShellRegistry_EnsureSpawnsATmuxSessionNamedMusterIDShell (D1, shells)
--- PASS: TestShellRegistry_EnsureIsIdempotentNoSecondSpawn
--- PASS: TestShellRegistry_EnsurePaneEnvironmentNeverCarriesMusterSession
--- PASS: TestShellRegistry_EnsureOnCollisionRechecksAndReportsNotCreated
--- PASS: TestShellRegistry_EnsureOnCollisionWithFailedRecheckReturnsSpawnError
--- PASS: TestShellRegistry_EnsureBoundedByShellTmuxTimeoutWhenTmuxNeverReturns
ok  	github.com/Zalaras/muster/internal/server	9.321s
```

Also confirmed `internal/server/reader_test.go`'s REQ-14 sweep tests
(`TestReaderObserve_*`) still pass. D1-D16 and REQ-14 are all landed and green.

## Implementation Bugs

None found. The `Manager.stopped` guard (Fix Attempt 3) behaves exactly as documented:
gates the periodic-poll and `Nudge` paths, leaves `End`'s deliberate kill path
untouched.

## Test Run Output

```
$ go build ./...
(exit 0)

$ make test
go test -count=1 ./...
ok  	github.com/Zalaras/muster/cmd/musterd	28.174s
ok  	github.com/Zalaras/muster/internal/claudecode	22.795s
ok  	github.com/Zalaras/muster/internal/ghissue	3.406s
ok  	github.com/Zalaras/muster/internal/gitutil	5.758s
ok  	github.com/Zalaras/muster/internal/kb	2.914s
ok  	github.com/Zalaras/muster/internal/locate	2.787s
ok  	github.com/Zalaras/muster/internal/selfupdate	4.184s
ok  	github.com/Zalaras/muster/internal/server	37.815s
ok  	github.com/Zalaras/muster/internal/session	7.805s
ok  	github.com/Zalaras/muster/internal/store	8.640s
ok  	github.com/Zalaras/muster/internal/termbridge	8.464s
ok  	github.com/Zalaras/muster/internal/tmux	20.289s
ok  	github.com/Zalaras/muster/internal/tmux/tmuxtest	7.335s
ok  	github.com/Zalaras/muster/internal/triage	7.802s
ok  	github.com/Zalaras/muster/internal/usage	8.290s
ok  	github.com/Zalaras/muster/internal/webui	8.236s
ok  	github.com/Zalaras/muster/tools/kb	7.409s
ok  	github.com/Zalaras/muster/tools/triage	6.430s
ok  	github.com/Zalaras/muster/tools/versions	15.046s

$ make lint
golangci-lint run
0 issues.

$ python3 .claude/skills/orchestrate/scripts/dead-refs.py
dead-refs: 971 references checked, 0 missing
```

**Files touched**: `internal/session/manager_test.go` only. No implementation files
edited.
