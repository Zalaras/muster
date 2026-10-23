# Daemon Tests: bugs-one-batch-1

**Plan**: bugs-one-batch-1
**Verdict**: pass
**Pack**: kb: pack 40477 words (budget 30000)

## Red-first (commit 7e6bc85d)

Three tests in `internal/session/manager_test.go` for REQ-1/REQ-2:
`TestApply_NonClearSessionEndEndsSessionPromptlyOnceThePaneDies` (red on the missing re-check),
`TestApply_ClearSessionEndStartsNoPaneRecheck` and `TestApply_SessionEndRecheckDoesNotPersistAfterStop` (guards, green by design).

## Ordinary Mode (after daemon-impl 59cf5bef)

### Summary

Tests created: 2 new, 1 repaired | Passing: all | Failing: 0

### Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/session/manager_test.go` | TestApply_NonClearSessionEndEndsSessionPromptlyOnceThePaneDies | REQ-1: flip, persisted row and last sessionUpsert all `alive:false` within 1 s (race repaired) | pass |
| `internal/session/manager_test.go` | TestApply_ClearSessionEndStartsNoPaneRecheck | REQ-2: clear SessionEnd arms no watch | pass |
| `internal/session/manager_test.go` | TestApply_SessionEndRecheckDoesNotPersistAfterStop | REQ-2: stopped guard silences the watch | pass |
| `internal/session/manager_test.go` | TestApply_SessionEndRecheckEndsOnceTheSessionReadsDead | new: no pane checks after the session reads dead | pass |
| `internal/session/manager_test.go` | TestApply_SessionEndRecheckExpiresAtTheCapWithThePaneAlive | new: live pane is re-checked while armed, checks stop at `sessionEndRecheckFor`, session stays alive (edge case 2) | pass |

### Handoff Received

`manager_test.go` lines 975 and 978 (the `test-race:` line): the test read the store and recorder once after `mgr.Get` saw the in-memory flip, which `markEnded` makes before the store write and broadcast under the write ticket. It now polls `st.GetSession(...).Alive == false` and the recorder's last upsert `alive:false` inside the same 1 s `require.Eventually`, then asserts `Get` shows `!Alive` with `EndedAt` set. REQ-1's 1 s bound is the proof. The implementation is unchanged.

### Notes

- Added only the two Decisions-named behaviours no test pinned: the watch ending once the session reads dead, and expiry at the 3 s cap with the pane alive (edge case 2). The cap test takes about 3.6 s because `sessionEndRecheckFor` is a const, not a seam.
- No `dupl` repetition kept on purpose.

### Test Run Output

```
go test -count=30 -run 'TestApply_NonClearSessionEnd|TestApply_ClearSessionEnd|TestApply_SessionEndRecheck|TestCheckOneLiveness_StoppedGuard' ./internal/session/
ok  	github.com/Zalaras/muster/internal/session	212.093s

go test -race -count=1 -run '<same>' ./internal/session/
ok  	github.com/Zalaras/muster/internal/session	11.112s

go test -count=1 ./internal/session/
ok  	github.com/Zalaras/muster/internal/session	38.803s

make lint
golangci-lint run
0 issues.
```
