# Correctness review: Usage Bar Consistency

**Plan**: usage-bar-consistency
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 37022 words (budget 30000) — `kb: WARN pack exceeds budget of 30000 words`

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 call feeds 5h/7d | Yes — `usageapi.go` `interpretWindow`; `usagepoll.go` `recordBuckets` → `Aggregator.RecordFetch` | D1 `TestInterpretUsageReport_FiveHourAndSevenDayBuckets`, `TestUsagePoller_Tick_SuccessFeedsBucketsAndWindows`; E1, E1 focus, E2 | pass |
| REQ-2 newest arrival wins per bucket | Yes — `adopt`/`adoptBucket` | D2 `TestAggregator_NewestArrivalWinsPerBucket` (both orders, one-bucket calls); E1 | pass |
| REQ-3 past-reset value never adopted | Yes — `adoptBucket` refuses `!ResetsAt.After(now)` for both writers | D3 `TestAggregator_PastResetNeverAdopted` (3 start states × 2 sources × 2 buckets × 3 offsets), `AllPastArrivalIsInert`, `Tick_PastResetBucketsAreNotAdopted` | pass |
| REQ-4 call at each reset | Yes — `watchResets`/`nextReset`, a second `bgLoop` calling the coalesced `Refresh` | D4 `TestNextReset`, `ResetWake` (5h, 7d, model window), `FollowsAMovedReset`, `CoalescesWithTheCallInFlight`; E2, E3 | pass (see Major 1, second consequence) |
| REQ-5 past reset renders unknown (all three bars) | Yes — `buildUsageBucketViewModel` strict `<` | W1/W2 `usage.test.ts`; R1, R2, W2 boundary and per-model R3 in `web/render/usage.spec.ts`; E2, E3 | pass |
| REQ-6 start-up call fills bars, no hydration | Yes — first `runTicked` tick now feeds the buckets; nothing reads `usage_sample` | E2 setup assertion, E4 | pass |
| REQ-7 failed call changes no bucket | Yes — error paths return before `recordBuckets` | D10 `Tick_FailureLeavesBucketsAsTheyWere` (no-credentials, unauthorized, 500, refused); E3 | pass |
| REQ-8 row when merged state changes and both known; `subscription-api` + last model | Yes | D6 `RecordFetch_OneBucketOnlyWritesNoRowUntilBothKnown`, D9 `RecordFetch_RowCarriesSourceAndModel` | pass |
| REQ-9 de-dup across sources | Only for byte-identical values | D8 `IdenticalValuesFromSecondSourceAreDeduped` (identical whole-second values only) | **fail** — Major 1 |
| INV-1 | Yes | W1, R1, R2 | pass |
| INV-2 | Yes | D3 | pass |
| INV-3 | Yes — `writeMu` serialises read/persist/commit/broadcast; `mu` for readers | D7 `ConcurrentWritersLoseNothingAndRowsMatchBroadcasts` under `-race` (gate 02) | pass |
| DIAG | `kb:diagram/daemon-components` (no import edge changed), `kb:diagram/web-components` (no module edge changed); ingest spec's inline sequence diagram ("Record the account sample, when the payload carries one") still true. Not named by `kb for`, read anyway: `kb:diagram/context` — Minor 2 | — | pass |

## Build & Tests

E2E tests: pass (78, scoped to 13 files: auth, cache-warmth, claude-version, embedded, gauges, ingest-envelope, ingest, masthead-indicators, masthead-update-dot, resilience, subagent-status, usage-model, usage-reset) · Daemon tests (race): pass (every package `ok`, `go test -race -count=1 ./...`) · Web tests: pass (3037 in 106 files) · Daemon build: pass · Web build: pass · Lint: pass (`golangci-lint` 0 issues; web lint clean) — all read from `/var/folders/8t/36s1xtwj1xjfn1pg_jrwztjw0000gn/T/gates-usage-bar-consistency-c1`. Also green there: render-test 421 passed, check-render-fixtures "up to date (106 scenarios)", render-lint, e2e-lint, contrast (0 failures in 3 themes), versions, kb check (0 problems), features-scope, comment checks and ledger. `WARN size` (6 hits) is review-maintainability's.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass (02-test.log, run as `go test -race -count=1 ./...`) |
| D2 | `go build ./...` | pass (01-build.log, empty, exit 0) |
| D3 | `make lint` | pass (03-lint.log, "0 issues.") |
| D4 | `make check-render-fixtures` | pass (06-render-fixtures.log) |
| W1 | `make web-build` | pass (04-web-build.log) |
| W2 | `make web-test` | pass (05-web-test.log, 3037/3037) |
| W3 | `make web-lint` | pass (09-web-lint.log) |
| R1 | `make render-test` | pass (08-render-test.log, 421 passed) |
| E1 | `make e2e` | pass, scoped (21-e2e.log, 78 passed over 13 specs; the full sweep runs at Completion) |
| DOC | doc upkeep + Doc Delta vs what shipped | **FAIL** — #105 is still open in `TODO.md:140` (the plan's Doc upkeep asks for the tick and the move to `docs/history/todo-done.md`); and the Doc Delta misses a usage-spec sentence that this plan makes false (Major 2). Both ADRs are present, `proposed`, carry `refs: plan:usage-bar-consistency` and describe what shipped; no `deviation:` lines; the log `doc-delta:` lines are in `doc-delta.md`. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| V1 | no `any` in new web code | pass | `git diff main...HEAD -- '*.ts'` has no `: any`, `as any` or `<any>`; the e2e focus test casts through `unknown` to a named shape |
| V2 | `internal/usage` free of Claude Code vocabulary | pass | `rg "five_hour\|seven_day\|utilization\|resets_at" internal/usage` hits only the SQLite column names `five_hour_pct`/`seven_day_resets_at` in test queries (Muster's own schema). Mapping lives in `internal/claudecode/usageapi.go` and `internal/server/usagepoll.go` `toUsageBucket`; server tests build bodies through `claudecodetest.UsageAPIBucketsBody` |
| V3 | no comment in `aggregator.go` claims a single writer | pass | `aggregator.go` read whole; the single-writer comments in `modelscoped.go` and `usage.go` were removed too |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — `five_hour`/`utilization`/`resets_at` parsed only in `internal/claudecode/usageapi.go` |
| 2 | Terminal-output state parsing | pass — none |
| 3 | Blocking hook handler | pass — ingest path unchanged; `Record` still runs on the worker |
| 4 | Bare tmux / resize-pane | pass — no tmux in the diff |
| 5 | Payload logging | pass — the two new log lines log only `err` from the store or aggregator |
| 6 | Empty-gauge dishonesty | pass — past reset and null both return `UNKNOWN_VIEW_MODEL` (no fill, no resets) |
| 7 | Identity on `session_id` | pass — account usage is not session-keyed |
| 8 | Settings trespass | pass — none |
| 9 | Real `claude` outside canary | pass — Go tests use `httptest` stubs; e2e uses `FakeUsageAPI` and the token-file seam |

## Issues

### Critical

None.

### Major

1. **[daemon-impl]** REQ-9's cross-source de-dup never fires on real data, because the two sources state the same window's reset at different precision — `internal/usage/aggregator.go` `sameBucket` (`a.ResetsAt.Equal(b.ResetsAt)`, `a.UsedPct == b.UsedPct`). The measured shapes: the status line's `resets_at` is a Unix epoch integer (kb:fact/rate-limits-wire-shape, captured `1786897200`, a whole minute), and the usage call's is RFC3339 with microseconds (kb:fact/usage-api-oauth-shape, captured `13:39:59.522275+00:00`). A status value and a call value for one window can only be `Equal` when the API's microseconds are zero. So with a session posting and the poller running, every call that follows a status post is a "change" and every status post that follows a call is another: each writes a `usage_sample` row and sends a `usage` message, which REQ-9 and kb:adr/usage-sample-dedup-by-value exist to prevent. D8 passes only because `aggregator_sources_test.go` `ahead()` truncates both sources' resets to the same whole second. Two further consequences, both conditional on how the status line rounds the header value (not measured):
   - `wireTime` sends whole seconds, so the call's value goes out as `13:39:59Z` and reads `(13:39)`. If the status line rounds up to `13:40:00`, it reads `(13:40)`, and the reset suffix flips by a minute each time the newer source changes.
   - `watchResets` arms on whichever reset is current. When the call's value is newest, the wake fires at `13:39:59.52`, which may be before the server's window rolls over. The call then gets the old window back, REQ-3 refuses it, and the bar reads `unknown` until the next 5-minute tick. That turns edge case 3 ("server lag") into the normal case.

   A fix must make this true: one window's 5h/7d values, offered once by each source in its measured form (epoch seconds vs RFC3339 micros), are deduplicated (no row, no message), and the masthead shows one reset for them. The comparison rule needs one measured pair, a status post and a call captured for the same window (`/interface-probe`), before choosing between truncation, rounding or a tolerance. Then add a D8 case using the two measured forms.

2. **[orchestrator]** The Doc Delta misses a `docs/features/usage/spec.md` § Honesty sentence that this plan makes false: "Rate limits are unknown before a session's first response and absent entirely under API-key authentication." Under REQ-6 the start-up call fills 5h/7d before any session responds (E2's setup assertion and E4 show this with no status post). Only the API-key half is still true, because the call fails without OAuth (edge case 11). `doc-reconcile` copies the delta word for word, so this sentence will stay unless the delta gains a "stops being true" line. The fact behind it (kb:fact/unknown-before-first-response) is still true of the status line itself.

### Minor

1. **[orchestrator]** `docs/protocol.md` § `ws.usage` (already merged on this branch from the plan's Protocol Contract) describes `sampledAt` as "when the last bucket value was adopted". The code also re-stamps it on a model-only change (`adopt` sets `next.sampledAt = &now` whenever a bucket is known and the model changed). The same section's prose says so ("…apart from `sampledAt`, which the daemon re-stamps for every recorded sample"), and daemon-tests flagged it. The field comment should read "when the last change was adopted". This is doc-reconcile's wording to fix, not a code change.
2. **[orchestrator]** `docs/diagrams/context.md` still describes the Anthropic usage API as answering "the per-model usage poll" (prose) and as `"Reports per-model weekly usage"` (the `System_Ext` label). Since this plan, the API feeds the 5h and 7d bars too. `kb for` does not name this diagram for any changed file, so it is not a DIAG fail. The label should name all three bars.

### Notes

1. **[note]** D5 (`TestUsageFeature_PollingDisabledHasNoWatcher`) checks the structure, not the behaviour. It asserts `srv.usage.poller == nil` and that the bucket is held, but it never lets a reset instant pass. With no poller there is nothing that could make a call, so the claim holds by construction.
2. **[note]** The plan's "Existing tests this breaks" said `usage-model.spec.ts` would not break. REQ-5's per-model unknown made its 2026-09-01 `RESETS_AT` read `unknown`. e2e-specs moved it to 2099 (Repairs #1), and every assertion still verifies its requirement, so the repair is honest. The plan defect was caught at authoring.
3. **[note]** For review-maintainability: `internal/server/usagewire.go` `toWireUsage`'s comment still cites the superseded `kb:adr/usage-model-window-polled-from-oauth-api` and calls the Aggregator "the status-line Aggregator". Code comments are out of my scope; I mention it only because the ADR flips to superseded at Completion.
