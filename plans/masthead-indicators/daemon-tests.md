# Daemon Tests: masthead-indicators

**Plan**: masthead-indicators
**Verdict**: pass
**Pack**: kb: pack 15764 words (budget 30000)

## Summary

Tests created: 5 new (11 subtests incl. 6 table rows) plus 2 sanctioned files repaired | Passing: all | Failing: 0

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/server/usagewire_test.go` | TestToWireUsage_NeverCarriesAModelKey (6 rows) | REQ-2/INV-2/D1: exact wire key set and no `model` key from null, known, model-bearing, model-scoped populated/errored/empty states | pass |
| `internal/server/usagewire_test.go` | TestToWireUsage_ModelOnlyChangeIsIdenticalOnTheWire | Edge Case 2: snapshots differing only in model marshal identically | pass |
| `internal/server/usagebroadcast_test.go` | TestIngestStatusLine_ModelOnlyChangeBroadcastsNoModelAndLeavesWireUnchanged | D1 (WS `usage` broadcasts have no `model`, known buckets), Edge Case 2 (the two broadcasts are equal on the wire with `sampledAt` removed; second `sampledAt` is not earlier than the first) | pass |
| `internal/server/usagebroadcast_test.go` | TestIngestStatusLine_ModelOnlyChangeRecordsRowCarryingModel | D2/D7 (model-only post writes a second `usage_sample` row with that model_id/display name) | pass |
| `internal/server/usagebroadcast_test.go` | TestIngestStatusLine_ModelOnlyChangeKeepsStateSnapshotFreeOfModel | D1 (GET /api/state with known buckets has no `model`) | pass |
| `internal/server/state_test.go` | TestBuildSnapshot_M0Shape, TestHandleState_ReturnsSnapshotJSON | Repaired (see Handoff); empty snapshot has no `model` key | pass |
| `internal/server/usagewire_test.go` | existing TestToWireUsage_* | Repaired (see Handoff) | pass |

## Handoff Received

- `internal/server/state_test.go`: dropped `"model": null` from the expected empty snapshot JSON (now `JSONEq`-checked without the key, so a reintroduced key fails it) and the `snap.Usage.Model` assertion.
- `internal/server/usagewire_test.go`: removed the `got.Model` nil/NotNil assertions; the populated test still feeds a `usage.Model` into the snapshot input (it feeds history, not the wire), with the no-`model`-key assertion in the new table test.

## Fix Attempt (review cycle 1)

- Correctness Major 2: the Go broadcast test compared the two whole `usage` frames, `sampledAt` included, which the daemon stamps from its wall clock, so it failed when the posts straddled a clock second. It now removes `sampledAt` before comparing and asserts the second is not earlier than the first, as `masthead-indicators.spec.ts` does. Blast radius: the only other whole-frame comparison, `usagewire_test.go` `TestToWireUsage_ModelOnlyChangeIsIdenticalOnTheWire`, passes the same `at` to both snapshots and is deterministic. `go test -count=20` on the three tests passes.
- Maintainability Minor 1 (funlen 47 > 40): split where the three checks already divided, into the WS broadcast test, the `usage_sample` rows test and the `/api/state` test, sharing one scenario helper (`modelOnlyScenario`) that runs the two posts. Each test now asserts one effect, so the split is by subject, not to meet the line count.

## Implementation Bugs

None.

## Notes

- D3 (no sample from a status post lacking the model) is not re-covered: `internal/claudecode/status_test.go` `TestInterpretStatus_RateLimitsPresentButModelAbsentProducesNoSample` asserts `assert.Nil(t, got.Account, "no model in the same payload means no account sample, per plan Edge Case 9")`.
- D2 at the aggregator level is also covered by `internal/usage/aggregator_test.go` `TestAggregator_Record_ChangedModelAloneTriggersASecondSample` (`assert.Equal(t, 2, countUsageSampleRows(...))`); the new server test adds the row's model columns through the real ingest path.
- Edge Case 11 (older tab, no `model` key) is web-decoder territory, marked untested by the plan.
- `make test` run directly from this agent session fails two tests, `TestShellRegistry_EnsurePaneEnvironmentNeverCarriesMusterSession` and `TestShellRegistry_RespawnsAfterExternalKillWithNoMusterSession` (pane env shows `MUSTER_SESSION=[14]`). Cause: the agent's own shell runs inside a Muster session and exports `MUSTER_SESSION=14`/`TMUX`, which the tests inherit. Unrelated to this plan; `env -u MUSTER_SESSION -u TMUX make test` passes in full. The gates run should be started without those variables.
- No `dupl` repetition kept on purpose.

## Test Run Output

```
$ env -u MUSTER_SESSION -u TMUX make test   -> every package ok, no FAIL lines
$ make lint                                 -> golangci-lint run: 0 issues.
$ go build ./...                            -> exit 0
```
