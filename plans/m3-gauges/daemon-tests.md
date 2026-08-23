# Daemon Tests: M3 — Gauges

**Plan**: m3-gauges
**Verdict**: pass

## Summary

Tests created: 37 new test functions (plus subtests) across 6 new files, and targeted
additions to 5 existing test files. Passing: all. Failing: 0.

Three sanctioned-breakage fixes from the implementation handoff were applied first:
`internal/store/migrate_test.go` (both `schema_migrations` count/version literals,
2 → 3) and `internal/store/store_test.go` (the same count literal), and
`internal/server/state_test.go`'s `TestBuildSnapshot_M0Shape` frozen `JSONEq` gained
`"model": null` inside the `usage` object. All three now pass.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|----------------|--------|
| `internal/claudecode/status_test.go` | `TestInterpretStatus_PreFirstResponse` | REQ-2/D7: null pcts + zero tokens → all-null context; D8: no account sample pre-first-response | pass |
| `internal/claudecode/status_test.go` | `TestInterpretStatus_PreFirstResponse_SessionNameSurfacesAsTitle` | REQ-4: session_name → Title | pass |
| `internal/claudecode/status_test.go` | `TestInterpretStatus_FullPost` | REQ-1: full post yields title/model/context/account together | pass |
| `internal/claudecode/status_test.go` | `TestInterpretStatus_ResetsAtConvertsEpochToUTC` | REQ-3: epoch int → UTC time.Time (canary-fields.md correction #2) | pass |
| `internal/claudecode/status_test.go` | `TestInterpretStatus_ZeroUsedPercentageIsRealDataNotNull` | REQ-2's converse: real 0% adopted, not conflated with null | pass |
| `internal/claudecode/status_test.go` | `TestInterpretStatus_RateLimitsPresentButModelAbsentProducesNoSample` | Edge Case 9: sample only when rate_limits AND model share a payload | pass |
| `internal/claudecode/status_test.go` | `TestInterpretStatus_EmptySessionNameDoesNotSurfaceAsATitle` | empty string session_name is not a title | pass |
| `internal/claudecode/status_test.go` | `TestInterpretStatus_MalformedPayloadReturnsZeroValueWithoutPanicking` | loss tolerance: garbled body degrades, doesn't crash | pass |
| `internal/usage/aggregator_test.go` | `TestAggregator_Current_BootStateIsUnknown` | REQ-7/D10: no hydration at boot | pass |
| `internal/usage/aggregator_test.go` | `TestAggregator_Record_FirstSamplePersistsAndBroadcasts` | REQ-5 happy path: 1 row, 1 broadcast | pass |
| `internal/usage/aggregator_test.go` | `TestAggregator_Record_IdenticalBackToBackSamplesDedupToOneRowAndOneBroadcast` | D9/INV-5: pair-post dedup; SampledAt frozen on dedup | pass |
| `internal/usage/aggregator_test.go` | `TestAggregator_Record_AThirdChangedSampleAfterTwoIdenticalOnesPersistsASecondRow` | E6 at unit level | pass |
| `internal/usage/aggregator_test.go` | `TestAggregator_Record_ChangedFiveHourPctTriggersASecondSample` | value-level dedup, five_hour field | pass |
| `internal/usage/aggregator_test.go` | `TestAggregator_Record_ChangedSevenDayPctTriggersASecondSample` | value-level dedup, seven_day field | pass |
| `internal/usage/aggregator_test.go` | `TestAggregator_Record_ChangedResetsAtAloneTriggersASecondSample` | locks in documented decision: resets_at counts as a bucket change | pass |
| `internal/usage/aggregator_test.go` | `TestAggregator_Record_ChangedModelAloneTriggersASecondSample` | model change alone triggers persist+broadcast | pass |
| `internal/usage/aggregator_test.go` | `TestAggregator_Record_SameDisplayNameDifferentIDStillCountsAsAChange` | dedup compares both Model fields | pass |
| `internal/usage/aggregator_test.go` | `TestAggregator_Record_SourceDefaultsToSubscriptionWhenCallerOmitsIt` | default source fallback | pass |
| `internal/usage/aggregator_test.go` | `TestAggregator_Record_NilOnChangeDoesNotPanic` | nil OnChange in unit tests | pass |
| `internal/usage/aggregator_test.go` | `TestAggregator_Record_PersistsExactRowValues` | persisted row's exact column values | pass |
| `internal/session/status_test.go` | `TestApplyStatusUpdate_NeverTouchesStateMachineOwnedFields` (table, 7 subtests) | INV-1 exhaustive: all 6 states + dead session | pass |
| `internal/session/status_test.go` | `TestApplyStatusUpdate_TitleOnlyAdoptedWhenPresentAndDifferent` (4 subtests) | REQ-4 title change-detection | pass |
| `internal/session/status_test.go` | `TestApplyStatusUpdate_ModelOnlyAdoptedWhenPresentAndDifferent` (5 subtests) | REQ-4/R3 model change-detection incl. display-name-only diff | pass |
| `internal/session/status_test.go` | `TestApplyStatusUpdate_ContextOnlyAdoptedWhenPresentAndDifferent` (5 subtests) | REQ-4/INV-2 context change-detection incl. token-count-only diff | pass |
| `internal/session/status_test.go` | `TestApplyStatusUpdate_EmptyUpdateReportsNoChangeAndTouchesNothing` | zero-value StatusUpdate is a full no-op | pass |
| `internal/session/status_test.go` | `TestApplyStatusUpdate_MultipleFieldsChangingAtOnceStillReportsChangedOnce` | boolean accumulation across fields | pass |
| `internal/session/machine_test.go` | `TestApplyInput_ClearRebind/explicit_clear-rebind_resets_context_to_nil` | REQ-9/D12 | pass |
| `internal/session/machine_test.go` | `TestApplyInput_ClearRebind/id-change_escalation_to_clear-rebind_also_resets_context_to_nil` | REQ-9 via Edge Case 5's escalation path | pass |
| `internal/session/machine_test.go` | `TestApplyInput_ClearRebind/a_plain_bind_with_an_unchanged_claude_session_id_leaves_context_untouched` | negative case: non-clear bind preserves context | pass |
| `internal/session/manager_test.go` | `TestApplyStatus_PersistsAndBroadcastsOnAChange` | REQ-4 manager-level happy path, incl. persisted row | pass |
| `internal/session/manager_test.go` | `TestApplyStatus_NoChangeDoesNotBroadcast` | REQ-4/INV-5 session-side twin | pass |
| `internal/session/manager_test.go` | `TestApplyStatus_UnknownSessionErrors` | error path | pass |
| `internal/session/manager_test.go` | `TestApplyStatus_NeverTouchesAttentionWhileNeedsInput` | INV-1 manager-level (E8 unit twin) | pass |
| `internal/session/manager_test.go` | `TestApplyStatus_ModelDisplayNamePersistsAcrossARestart` | REQ-16 via LoadAll | pass |
| `internal/session/manager_test.go` | `TestRowToSession_ModelDisplayNameFallsBackToIDForPreM3Rows` | REQ-16 fallback for null column | pass |
| `internal/store/session_test.go` | `TestInsertSession_NilOptionalFieldsRoundTripAsNil` (extended) | REQ-8: new columns default NULL | pass |
| `internal/store/session_test.go` | `TestUpdateSession_RoundTripsEveryField` (extended) | REQ-8: new columns round-trip | pass |
| `internal/store/session_test.go` | `TestUpdateSession_ContextFieldsRoundTripAllOrNothingIncludingBackToNil` | INV-2 storage twin, both directions | pass |
| `internal/store/usage_test.go` | `TestInsertUsageSample_PersistsConvertedValues` | REQ-8 usage_sample row shape + its own RFC3339Nano `at` stamp | pass |
| `internal/store/usage_test.go` | `TestInsertUsageSample_EachCallInsertsARow` | store itself is unconditional; dedup is the aggregator's job | pass |
| `internal/store/store_test.go` | `TestInsertEvent_ReceivedAtIsRFC3339NanoAndDiffersAcrossImmediateInserts` | REQ-10/D13 | pass |
| `internal/server/usagewire_test.go` | `TestToWireUsage_ZeroSnapshotRendersEveryFieldNullExceptSource` | boot-state wire shape | pass |
| `internal/server/usagewire_test.go` | `TestToWireUsage_PopulatedSnapshotFormatsEveryFieldPerTheProtocol` | §5.4 wire formatting | pass |
| `internal/server/usagewire_test.go` | `TestToWireUsage_ResetsAtConvertsToUTCEvenFromANonUTCTime` | UTC conversion regardless of input location | pass |
| `internal/server/sessionwire_test.go` | `TestToWireSession_ContextGaugesPopulateAllThreeFieldsTogetherWhenPresent` | INV-2 wire twin, populated case | pass |
| `internal/server/state_test.go` | `TestBuildSnapshot_M0Shape` (updated) | sanctioned: `"model": null` added | pass |
| `internal/server/state_test.go` | `TestHandleState_ReturnsSnapshotJSON` (extended) | `snap.Usage.Model` nil assertion added | pass |
| `internal/server/gauges_test.go` | `TestIngestStatusLine_UpdatesSessionAndRecordsUsageSample` | full happy path through real HTTP ingest | pass |
| `internal/server/gauges_test.go` | `TestIngestStatusLine_PreFirstResponsePostLeavesContextUnknownAndRecordsNoSample` | E2/D7/D8 at wiring level | pass |
| `internal/server/gauges_test.go` | `TestIngestStatusLine_IdenticalPairPostDedupsThenAThirdChangedPostAddsASecondRow` | E6/D9/INV-5 through real HTTP ingest | pass |
| `internal/server/gauges_test.go` | `TestIngestStatusLine_NeverTouchesSessionStateWhileNeedsInput` | INV-1 end-to-end wiring twin (E8) | pass |
| `internal/server/gauges_test.go` | `TestIngestStatusLine_RoutedToOneSessionLeavesTheOtherUnaffected` | INV-4 wiring twin (E9), 2 live sessions | pass |
| `internal/server/gauges_test.go` | `TestIngestStatusLine_UnroutedPostFeedsNothing` | REQ-6: untrusted envelope feeds nothing | pass |

## Sanctioned Breakage Fixed

| File | Change | Reason |
|------|--------|--------|
| `internal/store/migrate_test.go` | `TestMigrate_AppliesInitSchema`: count/version literals 2 → 3; `TestMigrate_SecondCallIsANoOp`: `before` literal 2 → 3 | `0003_gauges.sql` is a real third migration |
| `internal/store/store_test.go` | `TestOpen_SecondOpenOnSamePathDoesNotReapplyMigrations`: count literal 2 → 3 | same |
| `internal/server/state_test.go` | `TestBuildSnapshot_M0Shape`: frozen `JSONEq` gains `"model": null` inside `usage` | `UsageInfo.Model` is a real new wire field, present-as-null like its siblings (§5.4 delta) |

## Implementation Bugs

None found. Read every changed file (`internal/claudecode/status.go`, `internal/usage/usage.go` + `aggregator.go`, `internal/session/status.go`/`session.go`/`manager.go`/`machine.go`, `internal/store/usage.go`/`session.go`/`store.go`, `internal/server/ingest.go`/`server.go`/`sessionwire.go`/`usagewire.go`/`state.go`) against the plan's requirements, invariants, and acceptance criteria, and every test above passed against the real implementation without needing a workaround.

Two implementation decisions documented in `daemon-implementation.md`'s "Decisions" section were independently verified rather than taken on faith:
- The aggregator's dedup comparison includes `ResetsAt` (not just `UsedPct`) per bucket — confirmed via `TestAggregator_Record_ChangedResetsAtAloneTriggersASecondSample`.
- `status_line` events skip the generic `Interpret`/`manager.Apply` path entirely — confirmed indirectly by `TestApplyStatus_NoChangeDoesNotBroadcast` and the `gauges_test.go` wiring tests never observing a spurious no-op `sessionUpsert`.

## Test Run Output

```
$ go build ./... && go vet ./...
(clean, no output)

$ make lint
golangci-lint run
0 issues.

$ go clean -testcache && make test
go test ./...
?   	github.com/Zalaras/muster/cmd/musterd	[no test files]
ok  	github.com/Zalaras/muster/internal/claudecode	1.074s
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
ok  	github.com/Zalaras/muster/internal/gitutil	2.623s
ok  	github.com/Zalaras/muster/internal/server	12.541s
ok  	github.com/Zalaras/muster/internal/session	3.610s
ok  	github.com/Zalaras/muster/internal/store	3.184s
ok  	github.com/Zalaras/muster/internal/termbridge	4.910s
ok  	github.com/Zalaras/muster/internal/tmux	6.603s
ok  	github.com/Zalaras/muster/internal/usage	2.646s
?   	github.com/Zalaras/muster/test/rig/capture	[no test files]
?   	github.com/Zalaras/muster/test/rig/failproxy	[no test files]

$ rg -n "hook_event_name" cmd/ internal/ --glob '!internal/claudecode/**'
(no matches — D4 passes with the new test files in scope)

$ rg -n '"rate_limits"|"used_percentage"|"context_window"|"session_name"|"total_input_tokens"' cmd/ internal/ --glob '!internal/claudecode/**'
(no matches — D6 passes with the new test files in scope)
```

## Fix Attempt 1 (review cycle 1, wave 2 — Minor 6)

**Issue**: `claudecodetest.StatusLineFullOpts.UsedPct` was a plain `float64` with
zero-means-default semantics, so the builder could never express a genuine 0%
reading. `internal/claudecode/status_test.go`'s
`TestInterpretStatus_ZeroUsedPercentageIsRealDataNotNull` (REQ-2's converse) had to
hand-build a raw JSON body to cover that case, which is legal (it's inside
`internal/claudecode`, D6's own boundary, and the original comment said so) but broke
REQ-15's "tests never hand-write wire bodies" literal.

**Fix**: Changed `StatusLineFullOpts.UsedPct` from `float64` to `*float64` in
`internal/claudecode/claudecodetest/claudecodetest.go`. `EnvelopedStatusLineFull` now
treats `nil` as "use the 42% default" and a non-nil pointer (including one pointing at
`0.0`) as the caller's real value — mirroring the wire's own null-vs-zero distinction
that REQ-2 itself is about.

Rewrote `TestInterpretStatus_ZeroUsedPercentageIsRealDataNotNull` to call
`EnvelopedStatusLineFull` with `UsedPct: &zeroPct` (`zeroPct := 0.0`) through
`innerPayload`, instead of constructing the JSON body by hand. Dropped the test's
assertion on `TotalInputTokens == 0`: that value was an artifact of the old hand-built
minimal body, not something REQ-2's converse claim (a real 0% must be adopted, not
conflated with null) depends on — the builder's `TotalInputTokens` default (84000) now
flows through instead, which is fine since the test only asserts on `UsedPct`.

**Call-site sweep**: grepped every `_test.go` file in the tree for
`StatusLineFullOpts{` and for `UsedPct:` — no existing call site set `UsedPct` as a
bare `float64` literal (the two in `status_test.go` and the ones in `gauges_test.go`
only set `MusterSession`/`FiveHourPct`/`SessionName`, all unaffected), so no other file
needed updating for the type change.

**Verification**:
```
$ go build ./...
(clean, no output)

$ go clean -testcache && make test
go test ./...
?   	github.com/Zalaras/muster/cmd/musterd	[no test files]
ok  	github.com/Zalaras/muster/internal/claudecode	0.844s
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
ok  	github.com/Zalaras/muster/internal/gitutil	2.312s
ok  	github.com/Zalaras/muster/internal/server	9.147s
ok  	github.com/Zalaras/muster/internal/session	4.425s
ok  	github.com/Zalaras/muster/internal/store	3.728s
ok  	github.com/Zalaras/muster/internal/termbridge	5.653s
ok  	github.com/Zalaras/muster/internal/tmux	7.127s
ok  	github.com/Zalaras/muster/internal/usage	2.927s
?   	github.com/Zalaras/muster/test/rig/capture	[no test files]
?   	github.com/Zalaras/muster/test/rig/failproxy	[no test files]

$ make lint
golangci-lint run
0 issues.
```

**Verdict**: pass. Files touched:
`internal/claudecode/claudecodetest/claudecodetest.go`,
`internal/claudecode/status_test.go`.
