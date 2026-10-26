# Daemon Implementation: Usage Bar Consistency

**Plan**: usage-bar-consistency
**Mode**: initial
**Pack**: kb: pack 20018 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/claudecode/usageapi.go` | modified | REQ-1: `UsageReport` gains `FiveHour`/`SevenDay` (`*StatusBucket`); each top-level window decoded on its own, missing/null/unparseable yields nil without failing the rest |
| `internal/claudecode/status.go` | modified | `StatusBucket` doc says the usage call reads into it too |
| `internal/usage/aggregator.go` | rewritten | REQ-2/3/8/9, INV-2/3: per-bucket adoption (`adoptBucket`: offered value taken iff its reset is after arrival, else current kept), `Record` (status sample) and new `RecordFetch` (call buckets, either nil) both go through `adopt`; row only when both buckets known, source `subscription-api` for call arrivals, carried status-line model or empty; one `usage` broadcast per change; two-writer guard |
| `internal/usage/usage.go`, `modelscoped.go` | modified | `Snapshot` doc (buckets independently nullable, `SampledAt` nil iff both nil); removed the single-writer claim (V3) |
| `internal/server/usagepoll.go` | modified | REQ-1/4/7: tick feeds `report.FiveHour/SevenDay` to `Aggregator.RecordFetch` (error paths untouched, so REQ-7 holds); reset watcher goroutine (`watchResets`, `nextReset`) calls `Refresh` at each known reset instant |
| `internal/server/usage.go` | modified | REQ-4: poller gets the aggregator; both holders' `OnChange` call `notifyPoller` so the watcher re-arms when a reset moves |
| `internal/server/renderfix_scenarios.go` | modified | `driveUsageKnown` 5h/7d resets and prompt-cache expiry moved to 2099 (same ordering and spacing); `make check-render-fixtures` reports "render fixtures up to date (106 scenarios)", fixture unchanged |
| `internal/server/renderfix_scenarios_usage.go` | modified | `newUsagePoller` call takes the aggregator |
| `cmd/musterd/main.go` | modified | `-usage-poll` help names all three bars |
| `internal/server/ingest.go`, `usagewire.go` | unchanged | REQ-2/3 for status posts come through `Aggregator.Record` (same call site); `toWireUsage` already maps each bucket independently and `SampledAt` is nil iff both nil from the aggregator |

REQ-5 is web-impl's. REQ-6: the poller's first `runTicked` tick is the start-up call and it now feeds the buckets; nothing reads `usage_sample`. REQ-9: `adopt` compares per-bucket value+reset, so a call repeating the status line's values returns before persisting or broadcasting (measured in the probe below).

## Decisions

- design: no new type for the second writer. `Aggregator` keeps `Record(Sample)` for the status line and gains `RecordFetch(ctx, five, seven *Bucket)`; both build an unexported `arrival` and call one `adopt`. Greps: `rg -n "StatusBucket" --glob '*.go'` found the neutral bucket the status line already uses (6 hits in status.go, 4 in usageapi.go), so `UsageReport` reuses `*claudecode.StatusBucket` instead of a duplicate `UsageBucket`; the seam maps it to `usage.Bucket` in `toUsageBucket`, mirroring `processStatus`.
- design: shared state `Aggregator.state`. Writers: the ingest worker (`Record`) and the usage poller goroutine (`RecordFetch`). Guard: `writeMu` serialises a whole adoption (read, persist, commit, broadcast) so rows and broadcasts follow commit order; `mu` guards `state` for `Current()` readers, so a reader never waits on a DB write. Matches `ModelScoped`'s `mu` for readers, adds the write lock because it now has two writers. Measured: a scratch test (deleted) ran 20 `RecordFetch` and 20 `Record` goroutines concurrently under `go test -race`, PASS; 43 broadcasts and 42 rows over the whole probe (the difference is the first, one-bucket-known broadcast, which writes no row by REQ-8).
- design: reset wake is a second `bgLoop` (`watch`) inside `usagePoller` that calls the existing `Refresh()`, not a third trigger inside `runTicked`. `rg -n "time.NewTimer|AfterFunc" internal/server --glob '!*_test.go'` found no timer-to-refresh helper, and `runTicked` is shared by five pollers, so leaving it alone and reusing `Refresh`'s coalescing gives "at most one extra call, at most one in flight" for free. `nextReset` considers only instants strictly after now, so a passed reset is never waited for again (once per instant). The watcher re-arms on a coalesced `changed` signal that `usageFeature.notifyPoller` sends from both holders' `OnChange`.
- design: the wire `source` stays `subscription` for every snapshot (the contract's example; shape unchanged); only the persisted row's `source` is `subscription-api` for call arrivals (REQ-8). The constant reuses `defaultModelScopedSource`.
- design: a model-only change while neither bucket is known commits the model but does not broadcast (nothing on the wire changes); with a bucket known, as before, a model change alone writes a row (if both known) and broadcasts.
- deviation: none from the plan. A test-visible consequence: `newUsagePoller` takes the aggregator as a new parameter (the poller needs it for the buckets and the watcher), which the plan lists under "Existing tests this breaks" for `usagepoll_test.go`.
- No size warning on a file I touched (`make size-warn | grep usage`: only the pre-existing `driveCacheWarmthHover` funlen in `renderfix_scenarios_usage.go:277`, not touched by me).
- doc-delta: `internal/usage/CLAUDE.md` (generated trailer aside, hand-written invariants) still says the aggregator is "fed by status posts" and that "`SampledAt` is stamped by `Record`" — it should say both sources feed it through `Record`/`RecordFetch`, that `adopt` stamps `SampledAt`, and that values already past their reset are never adopted.
- doc-delta: `docs/features/usage/spec.md` "Does not": "one aggregator carry both sources" stays true; its `Aggregator` is now two-writer, so no sentence there claims one writer.
- doc-delta: the usage poller is built also when only the buckets matter, so spec text calling it "the per-model poller" (`internal/server/usage.go` comments I rewrote) is now "the usage poller".

## Handoff

**Build status**: `go build ./...` exits 0; `go build -tags renderfix ./...` exits 0; `gofmt -l internal cmd` empty. `make lint` is blind while the test files below do not compile, so `golangci-lint run --tests=false ./...` was run as well: exit 0, no output. `make check-render-fixtures`: "render fixtures up to date (106 scenarios)".

Sanctioned breakage, for daemon-tests:
- `internal/server/usagepoll_test.go` — does not compile: `newUsagePoller` gained the `*usage.Aggregator` parameter (before `*usage.ModelScoped`); `Tick_SuccessRecordsWindows` (`:84`) should also cover a success feeding buckets (D1/D5/D10, and the reset watcher D4 via `nextReset`/`watchResets`).
- `internal/usage/aggregator_test.go` — every `Record` case with a fixed past `ResetsAt` (`fullSample` uses 2026-08-23/25) is refused under REQ-3: failing now are the ChangedSevenDayPct/ChangedResetsAt/ChangedModel/SameDisplayNameDifferentID, PersistsExactRowValues and PersistFailureLeavesMemoryUnchanged cases (measured: `go test ./internal/usage/` shows `expected: 2 actual: 0` etc.). Move the fixture resets to the future, add D2/D3/D6/D7/D8/D9 for `RecordFetch`.
- `internal/claudecode/usageapi_test.go:59` still passes (measured `ok`), but gains D1 cases for `FiveHour`/`SevenDay`.
- Render/web: `driveUsageModel` still posts its model windows with 2026-09-01 resets, which the web now renders `unknown` against a real clock (render fixtures normalise to the fixture epoch; `check-render-fixtures` shows the fixture unchanged).
- `web/e2e/usage-model.spec.ts`: no change expected on the daemon side (the fake's 2026-08-30 buckets are refused).

## Fix Attempt 1 (review cycle 1)

**Failures addressed**: correctness Major 1 (REQ-9 de-dup never fires on real data); maintainability Major 1 (`aggregateState`/`arrival`), Minor 1 (duplicate `StatusBucket` → `Bucket` mapping), Minor 2 (dead `Sample.SampledAt`).

**Changes made**:
- `internal/claudecode/usageapi.go`: `parseResetsAt`'s RFC3339 branch returns `ceilToSecond(t)`; every window the call yields (five_hour, seven_day, per-model limits) goes through it, an instant already on a whole second is unchanged. Epoch-int branch is already whole-second.
- `internal/usage/aggregator.go`: `sameBucket` compares `UsedPct` within `usedPctTolerance = 1e-9` absolute, `ResetsAt` stays `Equal`. `aggregateState` and `arrival` deleted: the Aggregator holds one `Snapshot` (`snap`, `Source` set at construction), `Current()` returns it, `adopt` takes the five/seven/model/source values as parameters, `snapshotOf` deleted.
- `internal/usage/usage.go`: `Sample.SampledAt` removed (comment updated).
- `internal/server/usagepoll.go` / `ingest.go`: one mapping `toUsageBucket(claudecode.StatusBucket) usage.Bucket`; `toOptionalUsageBucket` is the nil-able wrapper over it for the poll path; `processStatus` calls `toUsageBucket` for both buckets.

**Every path to the defect (REQ-9)**: the status-line → API order and the API → status-line order both end in `adopt` → `sameBucket(prev, next)`, so both are closed by the same two edits; the five_hour, seven_day and per-model windows all pass through `parseResetsAt`, so all are rounded (the per-model windows do not de-dup against anything, but now state the same whole-second instants as the buckets).

**Blast radius**: `parseResetsAt` — only `interpretWindow` and the `limits[]` loop in `InterpretUsageReport` (consumer: `usagepoll.go` via `FetchUsage`); `sameBucket` — only `adopt`; `Sample.SampledAt` — no non-test reader or writer (`rg SampledAt` hits only `Snapshot`, wire and test comments/`Snapshot` reads); `toUsageBucket` — `usagepoll.go` `recordBuckets`, `ingest.go` `processStatus`.

**Repro re-run** (throwaway test, deleted): measured pair, API `five_hour` `2099-01-01T13:39:59.522275+00:00` util 14 / `seven_day` `2099-01-05T06:59:59.522275+00:00` util 30, status line epoch for `13:40:00Z` / `07:00:00Z` with 14.000000000000002 / 30. `Record` first then `RecordFetch`: broadcasts stayed 1 (deduped). Parsed API resets logged `2099-01-01 13:40:00 +0000 UTC 2099-01-05 07:00:00 +0000 UTC`.

**Decisions**:
- design: `Aggregator.snap` is a `Snapshot` (rg `aggregateState|snapshotOf` → only aggregator.go): Snapshot already has every field the state needs, `Source` is a construction-time constant, so `Current()` hands the value out with no copy. `arrival` is gone: `adopt` takes plain parameters (five, seven, model, source) because `Sample` cannot serve — it has value buckets/model where `RecordFetch` needs nil-able pointers and no model — and a one-use struct would only repeat that signature.
- design: `toUsageBucket` + `toOptionalUsageBucket` in `usagepoll.go` is the one `StatusBucket` → `Bucket` mapping (rg `usage.Bucket\{` non-test in internal/server → only this one); the wrapper adds only the nil case.

**Handoff**: sanctioned breakage — the frozen `internal/claudecode/usageapi_test.go` expectations of microsecond-precision `resets_at` (kb:adr/usage-call-resets-rounded-up-to-the-second): `TestInterpretUsageReport_MeasuredLiveShape`, `TestInterpretUsageReport_FiveHourAndSevenDayBuckets` (measured_shape, seven_day_missing, seven_day_null_keeps_five_hour). Test agent should expect `13:40:00` etc. D8 with the measured forms is daemon-tests' wave-2 job. `go build ./...` exits 0; `make lint` and `golangci-lint run --tests=false ./...` both `0 issues`; `go test -race` of `internal/usage`, `claudecode/claudecodetest` and the Usage/Status/Ingest-filtered `internal/server` tests pass (the full `internal/server` run timed out only when two runs raced for the machine).
