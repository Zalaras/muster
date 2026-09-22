# Daemon Tests: Rail Card Improvements 2

**Plan**: rail-card-improvements-2
**Verdict**: pass
**Pack**: `go run ./tools/kb pack --plan rail-card-improvements-2 --role daemon-tests` (conventions §Testing, features rail/surfaces/update/settings, decisions and lessons for this plan)

## Summary

Tests created: 8 (2 fixes to existing tests' compile breaks, 1 stale-fixture repair, 6 new
tests, one with 2 subtests and one with 6 subtests) | Passing: all | Failing: 0

`daemon-impl`'s handoff named four compile-broken call sites in
`internal/server/update_test.go` (`checkAvailability`'s new `(ctx, manual bool) error`
signature) — fixed by passing `false` (the periodic-tick path these three tests already
covered) and capturing the new `error` return where the assertion needed it.

`go test ./internal/server/... -race` also turned up `TestBuildSnapshot_M0Shape`
(`internal/server/state_test.go`) failing on a stale JSON fixture missing the new
`canCheck` field — fixed by adding `"canCheck": false` to the zero-value fixture
(`buildSnapshot()` never constructs an `updateManager`, so the zero value is correct).

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `update_test.go` | `TestUpdateManager_SetCheckEnabledFalseClearsAndBroadcastsOnce` | fixed call site: `checkAvailability(ctx, false)` | pass |
| `update_test.go` | `TestUpdateManager_LateResponseAfterDisableIsDiscarded` | fixed call site: `checkAvailability(ctx, false)` | pass |
| `update_test.go` | `TestUpdateManager_FailedCheckKeepsPreviousResultAndBroadcastsNothing` | fixed call site: `checkAvailability(ctx, false)`, both calls, second asserted to error (D13, already covered pre-plan) | pass |
| `state_test.go` | `TestBuildSnapshot_M0Shape` | stale-fixture repair: added `canCheck: false` to the zero-value `update` object | pass |
| `update_check_test.go` | `TestHandleCheckUpdate_Success` | D1 (200 + update object), D2 (`checkedAt` set to the time of this check), D9 (exactly one broadcast), `canCheck` present | pass |
| `update_check_test.go` | `TestHandleCheckUpdate_Errors/release_host_unreachable_is_502_check_failed` | D3 | pass |
| `update_check_test.go` | `TestHandleCheckUpdate_Errors/latest_tag_is_not_a_release_version_is_502_check_failed` | D4 | pass |
| `update_check_test.go` | `TestHandleCheckUpdate_Errors/empty_update_base_URL_is_404_not_found` | D5 | pass |
| `update_check_test.go` | `TestHandleCheckUpdate_Errors/dev_install_is_404_not_found` | D6 | pass |
| `update_check_test.go` | `TestHandleCheckUpdate_Errors/shutting_down_is_409_shutting_down` | D7 | pass |
| `update_check_test.go` | `TestHandleCheckUpdate_Errors/requires_cookie` | D8 | pass |
| `update_check_test.go` | `TestHandleCheckUpdate_ManualCheckSurvivesTheAutomaticDiscardGuard/pref_already_off` | D10, Edge Case 8 | pass |
| `update_check_test.go` | `TestHandleCheckUpdate_ManualCheckSurvivesTheAutomaticDiscardGuard/pref_switched_off_mid-flight` | D10, Edge Case 9 (manual result survives a race with the pref turning off mid-flight, unlike the automatic path) | pass |
| `update_check_test.go` | `TestUpdateManager_CanCheck` (5 subtests: installer/homebrew/unmanaged/dev/empty-base-URL) | D12 across every reachable install kind, including the `um == nil` fallback | pass |

### Declined coverage (already covered, cited)

- **D11** ("with `updateCheck` false, no `/latest` request of its own across two check
  intervals"): `internal/server/update_test.go:229`
  `TestUpdateManager_DisabledCheckingMakesNoRequests` — `Start()`, three direct `tick()`
  calls and a `Refresh()` with `CheckEnabled: false`, then
  `assert.Equal(t, 0, origin.totalRequests(), "checking disabled must make zero requests to the update base URL")`.
  This is a stronger check than "two intervals" (any number of ticks/refreshes, not just
  two), pre-dates this plan, and needed no changes beyond the `manual bool` call-site fix.
- **D13** ("a failed periodic check leaves `available`/`checkedAt` unchanged and
  broadcasts nothing"): `internal/server/update_test.go:331`
  `TestUpdateManager_FailedCheckKeepsPreviousResultAndBroadcastsNothing` —
  `assert.Equal(t, first.Available, got.Available, "a failed check must not clear the previous result")`
  after a `checkAvailability(ctx, false)` with `origin.setFailNext(true)`, plus a `select`
  with a 200 ms timeout asserting no broadcast arrives. Pre-dates this plan.

## Implementation Bugs

None. `internal/server/update.go`'s `checkAvailability`/`handleCheckUpdate` match the
plan's Protocol Contract and every D1-D13 acceptance criterion exactly as implemented.

## Test Run Output

```
$ go build ./...
(clean)

$ make test
...
ok  	github.com/Zalaras/muster/internal/server	40.223s
...
(all packages ok)

$ make lint
golangci-lint run
0 issues.

$ go test ./internal/server/... -run 'TestUpdateManager|TestHandleCheckUpdate|TestHandleApplyUpdate|TestHandleRestartImpact|TestBuildSnapshot' -v
...
PASS
ok  	github.com/Zalaras/muster/internal/server	2.954s
```

## Note: unrelated pre-existing flaky race

`go test ./internal/server/... -race -count=1` (not part of `make test`/`make lint`,
which don't pass `-race`) turned up a data race in
`TestHandleShellTerminal_ScrollThatDoesNotEnterCopyModeNeverCancelsOnNextInput`
(`internal/server/shellscroll_test.go:261` vs `internal/server/terminal.go:472` via
`fakes_test.go:212`'s `fakePaneConn.Write`), reproducing roughly 1 run in 5 under `-race
-count=5` run in isolation. This is the shell-terminal-scroll feature, a file and
subsystem this plan's daemon-impl and daemon-tests changes never touch (no overlap with
`update.go`, `state.go`, or any file this plan's Affected Files section names) — flagging
per CLAUDE.md's evidence rule rather than fixing it, since it is out of this plan's scope
and not something I may alter (implementation code) or attribute to this plan without a
base-commit measurement it doesn't need (no file overlap at all).
