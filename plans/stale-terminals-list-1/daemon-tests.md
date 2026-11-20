# Daemon Tests: stale-terminals-list-1

**Plan**: stale-terminals-list-1
**Verdict**: pass
**Pack**: kb: pack 15024 words (budget 30000)

## Summary

Tests created: 4 new (poller level) + 5 repaired + 7 red-first kept (terminalsrev_test.go) | Passing: all in internal/server | Failing: 0 attributable

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/server/terminalsrevpoller_test.go` | TestPollerRev_TransitionsFromEveryStartingList | rev +1 per changed reconcile, +0 when silent, from empty/one/two lists; revFor at broadcast time and snapshot rev equal the new rev; the other session's rev untouched | pass |
| `internal/server/terminalsrevpoller_test.go` | TestPollerRev_SessionKeepsItsRevAfterItsListGoesEmpty | an emptied session keeps its empty list's rev in revFor; survivor unaffected; silent reconcile leaves it | pass |
| `internal/server/terminalsrevpoller_test.go` | TestPollerRev_OneReconcileOverSeveralSessionsNumbersEachBroadcastInOrder | three sessions changed in one reconcile get consecutive revs, each broadcast sees its own | pass |
| `internal/server/terminalsrevpoller_test.go` | TestPollerRev_SnapshotListsAndRevAgreeAfterReconcile | snapshot() lists equal Current(), rev is the newest session rev, lists are copies | pass |
| `internal/server/terminalsrev_test.go` | TestTerminalsRev_* (red-first, unchanged) | wire rev, route replies, DELETE 200, snapshot terminalsRev | pass |

## Handoff Received

- `state_test.go` TestBuildSnapshot_M0Shape: expected JSON gains `"terminalsRev": 0`.
- `terminals_sockets_test.go` TestHandleCloseTerminal_SocketsAndBroadcastAcrossSessions1And12: DELETE expects 200 (was 204); broadcast and survivor-socket assertions unchanged.
- `terminals_test.go` TestHandleNewTerminal_SpawnsLowestFreeAndReportsDefaultName: struct equality now includes `Rev` (taken from the body, asserted >= 0; this test's server does not pin values, terminalsrev_test.go does); DELETE expects 200.
- `terminals_test.go` TestHandleCreateShell_ReturnsLowestRunningTerminalWithN: asserts `"rev":` in both bodies; DELETE expects 200.
- `terminals_test.go` TestHandleCloseTerminal_EndsOnlyThatTerminalOfOnlyThatSession: 200 and a body that is exactly `{"rev":N}` (was 204/empty); survivor/name/Claude-pane assertions unchanged.

## Implementation Bugs

None.

## Notes

- Rev values are not asserted in the repaired legacy tests because their fake-tmux server stubs the poller's broadcast, giving rev 0 (measured: `Rev:0` actual where I first expected 1..3). Exact values are pinned by terminalsrev_test.go, which wires the real hub.
- Full `make test` run: first two attempts hit `gatelock: busy after 4m0s` (another worktree held the lock; not a test failure). Third run: one failure, `internal/tmux` TestRunCommand_DescendantHoldingStdoutDoesNotHang (15s timeout) while other worktrees were running gates; this plan does not touch internal/tmux (`git diff --stat main -- internal/tmux` empty) and the test passes alone (3.6s). Load flake, unrelated.
- TestHandleIngest_BodyAtLimitPersists passed in the full run; not reproduced.
- `make lint`: 0 issues. `go build ./...` ok.

## Test Run Output

```
ok  github.com/Zalaras/muster/internal/server  206.449s
--- FAIL: TestRunCommand_DescendantHoldingStdoutDoesNotHang (15.00s)  [internal/tmux, load flake; passes alone]
golangci-lint run: 0 issues.
```
