# Daemon Tests: order-sidebar

**Plan**: order-sidebar
**Verdict**: pass

## Summary

Re-run after daemon-impl's Fix Attempt 1 (`internal/session/railorder.go`'s `applyPin`
now short-circuits to `nil, nil` when `current.Pinned == pinned`, before
`sortedByRailPos`/`rebuild` ever run). Both previously-failing tests now pass, and 2 new
tests were added to close a gap the fix itself warrants: the original gap-regression
tests only exercised the already-unpinned/unpin-again direction; the fix's short-circuit
is symmetric in the flag, so the already-pinned/pin-again direction is now covered too,
at both the pure-function layer and the Manager+store layer.

Tests created this pass: 2 new (1 pure-function subtest added to an existing table test,
1 new Manager-level test) | Total in `internal/session/railorder_test.go` +
`manager_test.go` for this plan: 72 | Passing: 72 | Failing: 0

`go build ./...`, `go vet ./...`, `gofmt -l .`, and `make lint` (`golangci-lint run` → `0
issues`) are all clean. `make test` is fully green across every package.

## Tests

All tests from the prior report (`plans/order-sidebar/daemon-tests.md.failed.1`) are
unchanged except the two rows below. See that file for the full table of the other 68.

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/session/railorder_test.go` | `TestApplyPin_NoOpWithPreExistingGapsStillBroadcastsNothing/already-unpinned_session_unpinned_again,_gap_among_unpinned_bystanders` | D8 no-op with a REQ-14 gap, unpin direction (previously failing, now fixed) | pass |
| `internal/session/railorder_test.go` | `TestApplyPin_NoOpWithPreExistingGapsStillBroadcastsNothing/already-pinned_session_pinned_again,_gap_among_pinned_bystanders` | **new**: same invariant, pin direction, gap inside the pinned block — the symmetric case the fix's flag-equality short-circuit also needs to hold for | pass |
| `internal/session/manager_test.go` | `TestSetPinned_NoOpWithABystanderGapFromAnEarlierRemoveStillBroadcastsNothing` | D8 no-op with a real Remove-induced gap, unpin direction, real store persistence + broadcast recorder (previously failing, now fixed) | pass |
| `internal/session/manager_test.go` | `TestSetPinned_PinNoOpWithABystanderGapFromAnEarlierRemoveStillBroadcastsNothing` | **new**: same invariant, pin direction — two sessions pinned, the one between them removed leaving a gap inside the pinned block, then a same-flag pin call must persist/broadcast nothing for either session | pass |

## Test Run Output

```
$ go test ./internal/session/... -v -run 'TestApplyPin_NoOpWithPreExistingGapsStillBroadcastsNothing|TestSetPinned_.*NoOpWith'
=== RUN   TestSetPinned_NoOpWithABystanderGapFromAnEarlierRemoveStillBroadcastsNothing
--- PASS: TestSetPinned_NoOpWithABystanderGapFromAnEarlierRemoveStillBroadcastsNothing (0.01s)
=== RUN   TestSetPinned_PinNoOpWithABystanderGapFromAnEarlierRemoveStillBroadcastsNothing
--- PASS: TestSetPinned_PinNoOpWithABystanderGapFromAnEarlierRemoveStillBroadcastsNothing (0.01s)
=== RUN   TestApplyPin_NoOpWithPreExistingGapsStillBroadcastsNothing
=== RUN   TestApplyPin_NoOpWithPreExistingGapsStillBroadcastsNothing/already-unpinned_session_unpinned_again,_gap_among_unpinned_bystanders
=== RUN   TestApplyPin_NoOpWithPreExistingGapsStillBroadcastsNothing/already-pinned_session_pinned_again,_gap_among_pinned_bystanders
--- PASS: TestApplyPin_NoOpWithPreExistingGapsStillBroadcastsNothing (0.00s)
    --- PASS: TestApplyPin_NoOpWithPreExistingGapsStillBroadcastsNothing/already-unpinned_session_unpinned_again,_gap_among_unpinned_bystanders (0.00s)
    --- PASS: TestApplyPin_NoOpWithPreExistingGapsStillBroadcastsNothing/already-pinned_session_pinned_again,_gap_among_pinned_bystanders (0.00s)
PASS
ok  	github.com/Zalaras/muster/internal/session	1.033s

$ make test
go test -count=1 ./...
ok  	github.com/Zalaras/muster/cmd/musterd	6.496s
ok  	github.com/Zalaras/muster/internal/claudecode	1.875s
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
ok  	github.com/Zalaras/muster/internal/gitutil	2.196s
ok  	github.com/Zalaras/muster/internal/server	14.568s
ok  	github.com/Zalaras/muster/internal/session	5.400s
ok  	github.com/Zalaras/muster/internal/store	5.269s
ok  	github.com/Zalaras/muster/internal/termbridge	4.019s
ok  	github.com/Zalaras/muster/internal/tmux	6.929s
ok  	github.com/Zalaras/muster/internal/usage	4.648s
?   	github.com/Zalaras/muster/test/rig/capture	[no test files]
?   	github.com/Zalaras/muster/test/rig/failproxy	[no test files]

$ go vet ./...
(no output)

$ gofmt -l .
(no output)

$ make lint
golangci-lint run
0 issues.
```

## Notes

- Confirmed the fix (`internal/session/railorder.go`) matches the reported root cause:
  `applyPin` now captures the target's current `railEntry` and returns `nil, nil`
  immediately when `current.Pinned == pinned`, before `sortedByRailPos`/`rebuild` run —
  the same short-circuit shape `applyOrder` already used for its empty-`ids` case.
- Did not touch any implementation code. Only `internal/session/railorder_test.go` and
  `internal/session/manager_test.go` were changed this pass.
- No other gaps identified: the fix is a single early-return guard with no other branch
  to cover, and the existing D8/INV-5 table tests already cover the clean-rail no-op
  case from multiple starting configurations. The only real gap was the missing flag
  direction on the gap-regression tests, now closed above.
