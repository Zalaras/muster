# Daemon Tests: Usage Bar Consistency

**Plan**: usage-bar-consistency
**Verdict**: pass
**Pack**: kb: pack 18955 words (budget 30000)

## Summary

Tests created: 13 new test functions (about 130 table rows and subtests) plus 3 edited files | Passing: all | Failing: 0

`go build ./...` exit 0; `make test` all packages `ok`; `make lint` "0 issues."; the new and changed usage tests also pass under `go test -race` (`internal/usage` 14.9s, `internal/server` 16.7s).

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/claudecode/usageapi_test.go` | TestInterpretUsageReport_FiveHourAndSevenDayBuckets | D1: measured shape yields both buckets; missing, null, non-object, no resets_at, no utilization, unparseable resets_at, epoch resets_at and zero utilization each decide that bucket alone | pass |
| `internal/claudecode/usageapi_test.go` | TestInterpretUsageReport_BucketsDoNotDisturbModelWindows | D1: garbage top-level windows leave the per-model list intact | pass |
| `internal/usage/aggregator_sources_test.go` | TestAggregator_PastResetNeverAdopted | D3/INV-2: start state (none, status value, call value) x arriving source x stale bucket x reset (an hour past, just past, now); refused bucket keeps its value, the other adopts, no bucket past its reset | pass |
| `internal/usage/aggregator_sources_test.go` | TestAggregator_AllPastArrivalIsInert | D3: nothing adoptable gives no state change, broadcast or row, from every start state and both writers | pass |
| `internal/usage/aggregator_sources_test.go` | TestAggregator_NewestArrivalWinsPerBucket | D2: newest wins in both source orders; a one-bucket call leaves the other bucket | pass |
| `internal/usage/aggregator_sources_test.go` | TestAggregator_RecordFetch_OneBucketOnlyWritesNoRowUntilBothKnown | D6/REQ-8: one bucket adopts alone, no row until both known, a row thereafter | pass |
| `internal/usage/aggregator_sources_test.go` | TestAggregator_RecordFetch_NothingToOfferIsInert | nil/nil call: no state, `SampledAt` nil, no broadcast, no row | pass |
| `internal/usage/aggregator_sources_test.go` | TestAggregator_IdenticalValuesFromSecondSourceAreDeduped | D8/REQ-9: identical values from the second source, both orders, send nothing and write no row | pass |
| `internal/usage/aggregator_sources_test.go` | TestAggregator_RecordFetch_RowCarriesSourceAndModel | D9: call row is `subscription-api` with empty or carried status-line model; status rows keep `subscription`; wire source stays `subscription` | pass |
| `internal/usage/aggregator_sources_test.go` | TestAggregator_RecordFetch_PersistFailureLeavesMemoryUnchanged | a failed row write on the call path leaves state and broadcasts unchanged | pass |
| `internal/usage/aggregator_sources_test.go` | TestAggregator_ConcurrentWritersLoseNothingAndRowsMatchBroadcasts | D7/INV-3: 20 `Record` and 20 `RecordFetch` goroutines; every arrival broadcast and persisted, row i equals snapshot i, final state equals the last broadcast | pass |
| `internal/usage/aggregator_test.go` | (existing, sanctioned) | fixed resets moved from 2026 to 2099 in `fullSample` and the exact-row assertions | pass |
| `internal/server/usagepoll_buckets_test.go` | TestUsagePoller_Tick_SuccessFeedsBucketsAndWindows | REQ-1/D1 through the poller: both, one or neither window fed, `SampledAt` nil iff both nil, model windows still recorded | pass |
| `internal/server/usagepoll_buckets_test.go` | TestUsagePoller_Tick_PastResetBucketsAreNotAdopted | REQ-3 through the seam: a call answering with the old window changes nothing | pass |
| `internal/server/usagepoll_buckets_test.go` | TestUsagePoller_Tick_RepeatedIdenticalCallBroadcastsNothingNew | REQ-9 through the seam: second identical call notifies neither holder | pass |
| `internal/server/usagepoll_buckets_test.go` | TestUsagePoller_Tick_FailureLeavesBucketsAsTheyWere | D10/REQ-7: no-credentials, unauthorized, unreachable (500) and connection refused, from never-fetched and after-good-fetch states; buckets and `SampledAt` identical, only `modelScopedError` set | pass |
| `internal/server/usagepoll_buckets_test.go` | TestNextReset | D4: earliest strictly-after instant over 5h, 7d and model windows; none known; passed and equal-to-now ignored | pass |
| `internal/server/usagepoll_buckets_test.go` | TestUsagePoller_ResetWake | D4/REQ-4: a call at the reset instant of the 5h bucket, the 7d bucket and a model window learned from the start-up call; the endpoint's last hit is at or after the instant; exactly one wake per instant | pass |
| `internal/server/usagepoll_buckets_test.go` | TestUsagePoller_ResetWake_FollowsAMovedReset | watcher re-arms: a reset moved later before it passes wakes nothing | pass |
| `internal/server/usagepoll_buckets_test.go` | TestUsagePoller_ResetWake_CoalescesWithTheCallInFlight | D4/Edge 7: two resets pass during one held call, one extra call | pass |
| `internal/server/usagepoll_buckets_test.go` | TestUsagePoller_NoResetKnownMakesNoExtraCall, TestUsagePoller_StopEndsAnArmedWatcher | idle watcher makes no call; Stop returns promptly with the watcher armed | pass |
| `internal/server/usagepoll_buckets_test.go` | TestUsageFeature_PollingDisabledHasNoWatcher | D5: with polling off there is no poller; `notifyPoller` and holder callbacks do not panic; the bucket is held with nothing to refetch it | pass |
| `internal/server/usagepoll_test.go` | (existing, sanctioned) | `newUsagePoller` call sites take the aggregator via `newPollerHolders`; stub gains `setBody` and hit times | pass |
| `internal/server/usagewire_test.go` | TestToWireUsage_BucketsMapIndependentlyAndSampledAtIsNullIffBothNull | one-bucket snapshots map independently; `sampledAt` null iff both null | pass |
| `internal/claudecode/claudecodetest/claudecodetest.go` | (helper) `UsageAPIBucketsBody`, `UsageBucketOpt` | wire-shaped response with the top-level windows, so `internal/server` tests never spell `five_hour`/`utilization` (V2, kb:adr/ingest-wire-shaped-fixtures-via-claudecodetest); `UsageAPIBody` delegates to it | pass |

## Handoff Received

- `internal/server/usagepoll_test.go`: every `newUsagePoller` call now passes the aggregator (`agg, ms := newPollerHolders(t, nil)`); the stub gained a settable body and hit timestamps. `Tick_SuccessRecordsWindows` is unchanged; bucket feeding is covered in `usagepoll_buckets_test.go`.
- `internal/usage/aggregator_test.go`: the seven failing tests were all one cause, the fixture's 2026 resets; moved to 2099 in `fullSample` and the persisted-row assertions. No test logic changed.
- `internal/claudecode/usageapi_test.go:59` `MissingLimitsKeyIsNilNotError`: still passes unchanged (its `five_hour` lacks `resets_at`, so no bucket); the `five_hour without resets_at` row of the new table pins that.
- Render/web and `web/e2e/usage-model.spec.ts`: not daemon-tests' files; untouched.

## Notes

- A status post after a call carries the status line's model for the first time, which is a change in its own right: it writes a row and broadcasts even with identical buckets. The tests pin this (`IdenticalValuesFromSecondSourceAreDeduped` seeds the model first; `AllPastArrivalIsInert` expects one event for `call value`/`status`). This is `adopt`'s model-change rule, not a defect.
- Observation, not a verdict: a model-only change (buckets refused or unchanged) advances `SampledAt`, so `sampledAt` is "when the last change was adopted" rather than the contract's "when the last bucket value was adopted". It is the pre-existing model-only behaviour (`usagebroadcast_test.go` `ModelOnlyChange…` allows `sampledAt` to move), the wire shape is unaffected and the dashboard does not read it; `AllPastArrivalIsInert` therefore skips the `SampledAt` equality in that one case. Flagged for the reviewer.
- Declined: wire `ModelScoped` reset wake across a daemon restart (E4) and the dashboard's own clock-based `unknown` (W1/R1) are web and E2E specs (`web/e2e/usage-reset.spec.ts`, `web/src/sessions/usage.test.ts`), not unit-level daemon logic.
- `dupl`: no `dupl` warning names my files (`make size-warn | grep -i "usage\|dupl"` shows only the pre-existing `driveCacheWarmthHover` funlen). That check could not see a `filelen` line for `claudecodetest.go`; fix attempt 1 below resolves it. The two `newBucketPoller`/`startNotifyingPoller` setups differ in notify wiring and stay separate.
- Timing: the reset-wake tests use 300-700 ms reset delays and `Eventually`/`Never` windows totalling about 7 s; each `Never` window follows a positive `Eventually`, so they cannot pass vacuously (the 3 wake rows each first require the second request).

## Test Run Output

```
$ make test
ok  	github.com/Zalaras/muster/internal/claudecode	20.809s
ok  	github.com/Zalaras/muster/internal/claudecode/claudecodetest	8.186s
ok  	github.com/Zalaras/muster/internal/server	145.196s
ok  	github.com/Zalaras/muster/internal/usage	12.478s
(all packages ok, no failures)
$ make lint
golangci-lint run
0 issues.
```

## Fix Attempt 1 (review cycle 1)

**Issues addressed**: maintainability Minor 4 (`claudecodetest.go` filelen 710, no reason); correctness Major 1's test ask (D8 with the two measured forms, the rounding, the tolerance); wave-1 sanctioned breaks.

**Changes**:
- `internal/claudecode/claudecodetest/`: split along the seam the adapter itself already has (`status.go`, `usageapi.go`): `statusline.go` (status-line builders, `statusLineFullPayload`, `farFutureResetsAt`, 200 lines) and `usageapi.go` (`UsageWindowOpt`, `UsageAPIBody`, `UsageBucketOpt`, `UsageAPIBucketsBody`, `OAuthCredentialsBody`, 62 lines) moved out verbatim; `claudecodetest.go` keeps hook/envelope builders and shared defaults at 448 lines. Measured: `make size-warn | grep -c claudecodetest.go` prints `0` (was `internal/claudecode/claudecodetest/claudecodetest.go:1: file is 710 lines`); the only remaining line for the package is the pre-existing `statusline.go:133 statusLineFullPayload is too long (68 > 60)`, moved untouched.
- `internal/claudecode/usageapi_test.go`: sanctioned breaks repaired (`MeasuredLiveShape`, `FiveHourAndSevenDayBuckets` measured_shape / seven_day_missing / seven_day_null_keeps_five_hour now expect `13:40:00` and `14:00:00`); new `TestParseResetsAt_RoundsRFC3339UpToTheSecond` (micros, 1ns past, 999999999ns, already-whole with and without fraction, minute/hour carry, `+02:00` offset, epoch int unchanged).
- `internal/usage/aggregator_sources_test.go`: new `TestAggregator_PercentTolerance_FloatNoiseDedupsRealChangeAdopts` (8 deltas x both orders x each bucket: noise, +-5e-10 dedup; 2e-9, 0.01, a 1ns or 1s later reset adopt). Mutation: `usedPctTolerance = 0` makes 12 subtests fail.
- `internal/server/usagepoll_measured_forms_test.go`: `TestMeasuredForms_OneWindowFromBothSourcesIsOneChange`: status line through `claudecode.InterpretStatus` (epoch seconds on a 10-minute boundary, 14.000000000000002 / 30.000000000000004) and the call through the real poller tick and `InterpretUsageReport` (`...13:39:59.522275+00:00`, 14.0 / 30.0), both orders: second arrival sends no `usage` message and writes no row, snapshot shows the one whole-second reset, a genuinely new window still adopts. Mutation: replacing `ceilToSecond(t.UTC())` with `t.UTC()` fails both order subtests.
- Aggregator internals: no test referenced `aggregateState`, `arrival` or `Sample.SampledAt` (`go vet`/`make test` compile clean).

**Decisions**:
- design: the helper file keeps no size reason; it is restructured along a real seam instead (one file per Claude Code surface, mirroring `internal/claudecode`), so no Decisions exemption is claimed. Grep before adding the D8 helpers: `rg "func bucketsBody|func newBucketPoller"` in `internal/server` found `bucketsBody`/`fakeTokenReader`/`newUsageAPIStub`, reused; `measuredForms` is new because the other helpers hold the holders but not a status-line feeder.

**Verdict**: pass

```
$ go build ./...        exit 0
$ make test             all packages ok
$ make lint             0 issues.
$ make size-warn | grep -c claudecodetest.go   0
```

## Fix Attempt 2 (review cycle 1, gate wave 2)

- `claudecodetest/statusline.go` and `usageapi.go`: seven comments carried REQ-/D3 plan IDs from the verbatim move; reworded to state the why (one cites `kb:adr/ingest-wire-shaped-fixtures-via-claudecodetest`), no code changed. `comment-checks.py --gates` prints `comment-checks: clean`.
- `internal/server/gauges_test.go` `TestIngestStatusLine_UpdatesSessionAndRecordsUsageSample`: now `Eventually` waits for the row AND both buckets in `Current()` (the aggregator persists the row before committing its snapshot). Grep of `aggregator.Current()` and `countUsageSampleRows` in `internal/server` tests: the other readers (gauges_test.go:122, :214, :272) already wait on `Current()`, and `usagebroadcast_test.go:108` reads only DB rows, so no other site had the row-then-Current pattern. 5 repeated runs of `-run "TestIngestStatusLine|TestMeasuredForms"` pass.
- Gate evidence: `make test` could not run, `gatelock: busy after 4m0s — held by pid 35866 exclusive … muster-remove-unread-right-click-1` (another worktree). `go test -count=1 ./...` directly: every package ok except `internal/tmux` `TestRunCommand_DescendantHoldingStdoutDoesNotHang` (15s timeout while that other worktree's run loaded the machine; untouched code; passes alone in 3.5s). `make lint`: 0 issues.
