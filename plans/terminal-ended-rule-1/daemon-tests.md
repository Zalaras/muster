# Daemon Tests: terminal-ended-rule-1

**Plan**: terminal-ended-rule-1
**Verdict**: pass
**Pack**: kb: pack 14507 words (budget 30000)

## Summary

Tests created: 1 | Passing: 1 | Failing: 0 (plus the adapted existing tests, all passing)

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/server/terminalsrevpoller_test.go` | TestPollerRev_FailedFollowUpListingAnswersAFreshRevAndForcesNextBroadcast | REQ-2, REQ-3 | pass |

## Handoff Received

- `internal/server/shellactivity_test.go` (TestSync_BroadcastsAChangeAtOnceAndOnlyOnce): `p.sync(ctx)` -> `p.sync(ctx, 1)`; assertions unchanged.
- `internal/server/terminals_sockets_test.go`: four `poller.sync(ctx)` calls -> `poller.sync(ctx, s1.ID)`; assertions unchanged. No `newShellFeature` caller needed a change.

## Notes

Assumed seam: `shellActivityPoller.sync(ctx, sessionID int64)` as `plan.md` Affected Files names. It is compile-red today, not assertion-red; other existing `sync(ctx)` callers in tests are for daemon-impl's handoff.

## Test Run Output

```
ok  	github.com/Zalaras/muster/internal/server	107.143s
--- PASS: TestPollerRev_FailedFollowUpListingAnswersAFreshRevAndForcesNextBroadcast
go build ./...: ok; make lint: 0 issues
```
