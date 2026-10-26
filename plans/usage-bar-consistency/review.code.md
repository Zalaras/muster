# Correctness review: Usage Bar Consistency

**Plan**: usage-bar-consistency
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 42673 words (budget 30000) — `kb: WARN pack exceeds budget of 30000 words`

Full cycle. Cycle 1 had open Majors, so this is not a delta re-review. I re-read the whole
branch (`git diff main...HEAD`), giving the most attention to the cycle-1 fix wave
(`git diff 5d194a2c..HEAD`: 2870abd2, 73b5e85e, ac53fd6b, 4529da3e, a9802ac3, ce647833).

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 call feeds 5h/7d | Yes — `usageapi.go` `interpretWindow`, then `usagepoll.go` `recordBuckets`, then `Aggregator.RecordFetch` | D1 `TestInterpretUsageReport_FiveHourAndSevenDayBuckets`, `Tick_SuccessFeedsBucketsAndWindows`; E1, E1 focus, E2 | pass |
| REQ-2 newest arrival wins per bucket | Yes — `adopt`/`adoptBucket` (aggregator.go:59-106) | D2 `TestAggregator_NewestArrivalWinsPerBucket` (both orders); E1 | pass |
| REQ-3 past-reset value never adopted | Yes — `adoptBucket` refuses `!ResetsAt.After(now)` for both writers | D3 `TestAggregator_PastResetNeverAdopted`, `AllPastArrivalIsInert`, `Tick_PastResetBucketsAreNotAdopted` | pass |
| REQ-4 call at each reset | Yes — `watchResets`/`nextReset` call the coalesced `Refresh`. Because of the round-up, the wake now falls on the whole second the status line names, not 0.48 s before it | D4 `TestNextReset`, `ResetWake` (5h, 7d, model), `FollowsAMovedReset`, `CoalescesWithTheCallInFlight`; E2, E3 | pass |
| REQ-5 past reset renders unknown (all three bars) | Yes — `resetHasPassed` = `remainingSeconds(resetsAt, now) < 0`, the same strict `<` as before | W1/W2 `usage.test.ts`; R1, R2, R3 in `web/render/usage.spec.ts`; E2, E3 | pass |
| REQ-6 start-up call fills bars, no hydration | Yes — the first `runTicked` tick; nothing reads `usage_sample` | E2 setup assertion, E4 | pass |
| REQ-7 failed call changes no bucket | Yes — error paths return before `recordBuckets` | D10 `Tick_FailureLeavesBucketsAsTheyWere`; E3 | pass |
| REQ-8 row only when both known; `subscription-api` + last model | Yes | D6 `RecordFetch_OneBucketOnlyWritesNoRowUntilBothKnown`, D9 `RecordFetch_RowCarriesSourceAndModel` | pass |
| REQ-9 cross-source de-dup (as *Amended*) | Yes — `parseResetsAt` → `ceilToSecond` for every call window (usageapi.go:161-181); `sameBucket` compares `UsedPct` within `usedPctTolerance` 1e-9 and `ResetsAt` exactly (aggregator.go:126-133) | D8 `TestMeasuredForms_OneWindowFromBothSourcesIsOneChange`: the status line goes through `InterpretStatus`, epoch seconds and `14.000000000000002`; the call goes through the real poller tick and `InterpretUsageReport`, `…:59.522275+00:00` and `14`. Both orders: no message, no row, one whole-second reset, and a new window still adopts. `TestParseResetsAt_RoundsRFC3339UpToTheSecond` (8 cases). `TestAggregator_PercentTolerance_FloatNoiseDedupsRealChangeAdopts` (8 deltas × 2 orders × 2 buckets). The log records two mutations: dropping `ceilToSecond` and setting the tolerance to 0 each fail these tests | pass — closes correctness Major 1 of cycle 1 |
| INV-1 | Yes | W1, R1, R2 | pass |
| INV-2 | Yes | D3 | pass |
| INV-3 | Yes — `writeMu` serialises adopt → persist → commit → broadcast; readers use `mu` | D7 under `-race` (gate 02) | pass |
| DIAG | `kb:diagram/daemon-components`: the `claudecodetest` split adds files, not package edges. `kb:diagram/web-components`: `usage.ts` already imported `./format`. `kb:diagram/context`: the prose and `System_Ext` label now name all three bars, which closes cycle-1 Minor 2. The ingest spec's inline sequence diagram is still true | — | pass |

## Build & Tests

E2E tests: pass (131, scoped to 20 files: auth, cache-warmth, claude-version, embedded, gauges, ingest-envelope, ingest, masthead-indicators, masthead-update-dot, rail-activity, rail-cards, rail-drag-groups, rail-layout, rail-menu, rail-order, rail-unread, resilience, subagent-status, usage-model, usage-reset) · Daemon tests (race): pass (every package `ok`, `go test -race -count=1 ./...`) · Web tests: pass (3037/3037) · Daemon build: pass · Web build: pass · Lint: pass (`golangci-lint` 0 issues; web lint clean) — all read from `/var/folders/8t/36s1xtwj1xjfn1pg_jrwztjw0000gn/T/gates-usage-bar-consistency-c2`. Also green there: render-test 421 passed, check-render-fixtures "up to date (106 scenarios)", render-lint clean, e2e-lint clean, contrast 0 failures in 3 themes, versions fresh, kb check 650 records / 0 problems, features-scope, comment-checks clean, comment ledger (6 blocks kept), e2e-honest and features-inventory empty. `WARN size` (5 hits) belongs to review-maintainability. The `claudecodetest.go` filelen line from cycle 1 is gone; the `statusLineFullPayload` funlen moved untouched into `statusline.go`. No flake repair is in the diff, so no soak was owed.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass (02-test.log, run as `go test -race -count=1 ./...`) |
| D2 | `go build ./...` | pass (01-build.log, empty, exit 0) |
| D3 | `make lint` | pass (03-lint.log, "0 issues.") |
| D4 | `make check-render-fixtures` | pass (06-render-fixtures.log) |
| W1 | `make web-build` | pass (04-web-build.log; the chunk-size notice is pre-existing) |
| W2 | `make web-test` | pass (05-web-test.log, 3037/3037) |
| W3 | `make web-lint` | pass (09-web-lint.log) |
| R1 | `make render-test` | pass (08-render-test.log, 421 passed) |
| E1 | `make e2e` | pass, scoped (21-e2e.log, 131 passed over 20 specs; the full sweep runs at Completion) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass — all three ADRs (`usage-all-windows-polled-and-refetched-at-reset`, `usage-past-reset-reads-unknown`, `usage-call-resets-rounded-up-to-the-second`) are `proposed`, carry `refs: plan:usage-bar-consistency` and describe what shipped. The new fact `rate-limit-resets-differ-in-precision-across-sources` matches the rig captures: every real capture value is a multiple of 600 s; the one exception, `1790500000` in capture-8, is a fail-proxy probe value. The logs have no `deviation:` lines. `doc-delta.md` carries every log `doc-delta:` line and both cycle-1 doc items (§ Honesty "unknown before a session's first response", and the `sampledAt` wording). The #105 tick is held until `approved` (orchestrate SKILL.md "no ✅ tick until `review.md` says `approved`"), so its absence is correct here; I was wrong to call it a DOC FAIL in cycle 1. One example value is left: Minor 1 |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| V1 | no `any` in new web code | pass | `git diff main...HEAD -- '*.ts'` adds no `: any`, `as any` or `<any>` |
| V2 | `internal/usage` free of Claude Code vocabulary | pass | `rg "five_hour\|seven_day\|utilization\|resets_at\|rate_limits" internal/usage` finds only Muster's own SQLite column names in test queries. The rounding lives in `internal/claudecode/usageapi.go`; the single `StatusBucket`→`Bucket` mapping (`toUsageBucket`/`toOptionalUsageBucket`) lives in `internal/server/usagepoll.go` |
| V3 | no comment in `aggregator.go` claims a single writer | pass | read the whole file; `rg "single writer\|one writer\|single-writer" internal/usage` finds nothing |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — `ceilToSecond` and every `five_hour`/`utilization`/`resets_at` read sit in `internal/claudecode`; the `rg` hits outside it (`permission_mode` in session/store) are pre-existing and untouched |
| 2 | Terminal-output state parsing | pass — none |
| 3 | Blocking hook handler | pass — `processStatus` still runs on the ingest worker; the only change there is the bucket mapping call |
| 4 | Bare tmux / resize-pane | pass — no tmux in the diff |
| 5 | Payload logging | pass — the new log lines log only `err` |
| 6 | Empty-gauge dishonesty | pass — past reset and null both return `UNKNOWN_VIEW_MODEL` (no fill, no resets) |
| 7 | Identity on `session_id` | pass — account usage is not session-keyed |
| 8 | Settings trespass | pass — none |
| 9 | Real `claude` outside canary | pass — Go tests use `httptest` stubs; e2e uses `FakeUsageAPI` and the token-file seam |

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[orchestrator]** `docs/protocol.md:1441`, § `ws.usage` example: `"modelScoped": [{ "displayName": "Fable", "usedPct": 61.0, "resetsAt": "2026-09-01T13:59:59Z" }]`. This is the measured Fable window (kb:fact/usage-api-oauth-shape, `13:59:59.522599`). After kb:adr/usage-call-resets-rounded-up-to-the-second, the daemon sends that window as `2026-09-01T14:00:00Z`, and `TestInterpretUsageReport_MeasuredLiveShape` now pins `14:00:00`. `doc-delta.md` has no line for it, and doc-reconcile only promotes what the delta lists. A fix must make this true: `doc-delta.md` gains a `docs/protocol.md` § `ws.usage` line changing the example's `resetsAt` to `2026-09-01T14:00:00Z`.

### Notes

1. **[note]** Cycle-1 correctness items, all resolved. Major 1 (REQ-9 measured-form de-dup): fixed per the amended requirement and tested on the measured forms (see the REQ-9 row). Major 2 (§ Honesty sentence): now in `doc-delta.md`. Minor 1 (`sampledAt` wording): now in `doc-delta.md`. Minor 2 (context diagram): fixed in ce647833.
2. **[note]** The REQ-9 amendment rests on one usage-API sample, and both new records say so. The fact has `guard: none`, and the ADR says "a probe pairing both sources for one window would confirm it". Two things are unmeasured. (a) The API's sub-second offset may always sit within one second below the status line's boundary. (b) The API's `utilization` may always equal the status line's `used_percentage` up to float noise. If either is false, the cross-source de-dup lapses again, and it lapses quietly: an extra row and a redundant broadcast, with no wrong display. The code meets REQ-9 as amended, so I request no change. A paired `/interface-probe` capture would settle both questions.
3. **[note]** `kb:adr/usage-call-resets-rounded-up-to-the-second` has `tests: []`, but `TestParseResetsAt_RoundsRFC3339UpToTheSecond` and `TestMeasuredForms_OneWindowFromBothSourcesIsOneChange` now guard it. The orchestrator may fill `tests:` when it flips the ADR at Completion.
4. **[note]** ce647833 added `rail` to `**Touches**`. The only link I found is `usage.ts` importing `remainingSeconds` from `web/src/sessions/format.ts`, which is rail-owned and unchanged. No rail behaviour changed, so nothing needs promoting to Features. The cost is the larger scoped e2e run (seven rail specs), and those all passed.
5. **[note]** The `web/e2e/usage-model.spec.ts` repair (test-specs.md Fix Attempt 1, commit 4529da3e) is honest. The expected reset text is now computed from `Math.ceil` of the raw instant rather than hardcoded. It still asserts the exact bracketed text and hover HH:MM, and a missing round-up would read `15:59` and fail.
6. **[note]** The cycle-1 note on D5 (`PollingDisabledHasNoWatcher` checks structure, not behaviour) still applies. It holds by construction, so no change is requested.
