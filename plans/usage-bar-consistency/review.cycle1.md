# Review: usage-bar-consistency

**Plan**: usage-bar-consistency
**Verdict**: needs-changes
**Cycle**: 1
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser approved, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Usage Bar Consistency

**Plan**: usage-bar-consistency
**Part verdict**: needs-changes
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

## Browser review

# Browser review: Usage Bar Consistency

**Plan**: usage-bar-consistency
**Part verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 8912 words (budget 30000)
**Rig**: `make web-build build` at f54f26d1 (`bin/musterd` v0.25.3-18-gf54f26d1-dirty; the dirt is `orchestration-state.json`), committed `startDaemon` fixture, so each daemon had a space-bearing data dir (`…/T/muster e2e-7f4ae213-*`), a private `tmux.sock` inside it and the shared E2E stub `claude`. `FakeUsageAPI` stood in for `/api/oauth/usage` through `-usage-api-url` and `-usage-token-file`. Headless Chromium at 1280×800, one throwaway spec (7 tests, all green, 30.6 s) run in the foreground. Afterwards I deleted the spec. The fixture teardown killed each tmux server and removed each data dir, and `git status --porcelain` shows nothing of mine.

Gates log (`gates-usage-bar-consistency-c1`): 0 failed lines. `web-build` and `e2e` (78 passed) are green, so the app I drove is the one that ships.

## Matrix

Hosts: focus and tiles. Both views share the one masthead, but I measured every cell in each view separately. The pop-out (`/doc.html`, HTTP 200) has no `#usage-5h`, `#usage-7d` or `#usage-model-week` (G), so every pop-out cell is N/A for the same reason. "Readout" below means the `#usage-*` span. I measured its `.num` text, the counts of `.bar`, `.bar i` and `.resets`, the `.warn` count, its computed display, visibility and opacity, its box against the masthead box (0,0–1280,46), and the masthead's `scrollWidth` against its `clientWidth`. No `[hidden]` element in the masthead computed to anything other than `display: none` in any sample.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| States: no data | focus | no data | start-up call held: 5h, 7d and model read `unknown` with no track and no suffix | pass | A: `.num` "unknown" ×3, bars 0, fills 0, resets 0, num opacity 1, visibility visible; `/api/state` fiveHour/sevenDay/modelScoped null |
| States: no data | tiles | no data | same | pass | A.nodata.tiles: identical counts; boxes 663–920 inside masthead 0–1280 × 0–46 |
| REQ-6 / E4 | focus | data | start-up call fills 5h and 7d with no status post | pass | A.data.focus: "5h 20% (02:00 Thu)", "7d 30% (02:00 Thu)", fills 1, resets 1; oracle `/api/state` usedPct 20/30 |
| REQ-6 / E4 | tiles | data | same | pass | A.data.tiles: same text and counts |
| REQ-1 / E1 | focus | data | Refresh (pointer) shows the call's 5h and 7d over the status post's | pass | E: 61%/77% (status) → click → 38%/52%; one `usage` WS frame |
| REQ-1 / E1 | tiles | data | Refresh (keyboard Space) shows the call's values | pass | B: tiles view, 500 → 200 (12/41), Space on the focused button → "5h 12%", "7d 41%"; oracle 12/41 |
| Refresh button keeps focus | tiles | data | `activeElement` identity a tick after a keyboard activation | pass | B.kbFocusKept true, tagged node still active after 1.2 s |
| REQ-2 (status after call) | focus | data | a newer status post wins over the call value | pass | E: call 30/40 → status 61/23 → readouts 61%/23% |
| REQ-2 (call after status) | focus | data | a newer call wins over the status value | pass | E.callWins 38%/52% after the status post's 61/77 |
| REQ-2 | tiles | data | — | N/A — same masthead node; REQ-2 is daemon adoption, view-independent (tiles readouts measured in B, D) | |
| REQ-3 | focus | data | a status post with a past 5h reset leaves 5h unchanged and still adopts its future 7d | pass | E.pastRefused: 5h stays 61% (99% refused), 7d 77%; oracle fiveHour 61 / 2099 |
| REQ-3 | tiles | data | — | N/A — daemon adoption, view-independent | |
| REQ-5 / Flow 1 (5h) | focus | data | 5h at 100% turns `unknown` when its reset passes, with no daemon message | pass | B: unknown 24 ms after the reset; bars 0, fills 0, resets 0, warn 0 (was warn 1 at 100%); 7d unchanged "55% (02:00 Thu)" |
| REQ-5 (5h) | tiles | data | same, settled | pass | B.past.tiles, after a further 1.2 s: same counts |
| REQ-5 (7d, 5h ahead) | tiles | daemon-down | 7d turns `unknown` from the client clock while the daemon is down, and 5h keeps its value | pass | C: daemon SIGTERMed and banner shown before the reset; 7d unknown 137 ms after its reset, bars 0, resets 0; 5h "70% (02:00 Thu)" |
| REQ-5 (7d) | focus | daemon-down | same | not measured — see Note 2 | |
| REQ-5 (per-model) | focus | data | the model readout turns `unknown` past its window's reset | pass | D: unknown 678 ms after reset (within one 1 s tick), bars 0, fills 0, resets 0 |
| REQ-5 (per-model) | tiles | data | recovered value after the reset call | pass | D.recovered.tiles "Fable 20% (02:00 Thu)" |
| Model select keeps focus | focus | data | select reached by Tab keeps `activeElement` identity across the known → unknown → known transitions | pass | D.focusKeptAcrossUnknown true, D.focusKeptAcrossRecovery true; reached by keyboard Tab |
| REQ-4 / E2 (5h) | focus | data | the daemon calls at the reset instant | pass | B.callAfterResetMs 3 (first request after the reset, 3 ms after it) |
| REQ-4 (per-model) | focus | data | the daemon calls at the per-model reset instant, and the result shows | pass | D.callAfterResetMs 3; held → released → "Fable 20%"; oracle modelScoped 20 / 2099 |
| REQ-7 / E3 / Edge 4 | focus | data | a failed reset-time call leaves 5h `unknown`, never back to 100% | pass | B.past.settled (1.5 s after `title="unreachable"` landed): 5h unknown, fills 0; 7d 55% |
| REQ-7 / Flow 3 | tiles | data | a failed Refresh (pointer) keeps 5h `unknown` | pass | B.refreshFail.tiles: request made, 5h still unknown, 7d 55% |
| Edge 5 (`-usage-poll 0`) | focus | data | the reset passes, 5h reads `unknown` and stays so | pass | F: unknown 493 ms after reset, still unknown 2.5 s later; oracle still fiveHour 100 / past reset (no call) |
| Edge 5 | tiles | data | same | pass | F.past.tiles same |
| REQ-9 | focus | data | a call returning the status line's exact values sends no `usage` message | pass | E.dedup.newUsageMsgs 0 (endpoint was hit); E.change.newUsageMsgs 1 for a real change |
| Daemon-down (values) | focus | daemon-down | readouts keep the last snapshot, and the daemon-down state is surfaced | pass | A.down: banner `role=alert` display block, opacity 1, "musterd unreachable — …"; readouts 20%/30%/61% unchanged |
| Daemon-down | tiles | daemon-down | same | pass | C.down.beforeReset.tiles: values kept, alert visible |
| Placement (all states) | focus, tiles | all | readouts inside the masthead; masthead does not overflow | pass | every sample: masthead 0,0–1280,46; scroll 1280/1280; readout boxes y 16–30 |
| Honesty §6 rule 1 | focus, tiles | no data, past reset | no empty or 0% track for unknown | pass | fills 0 and bars 0 in every unknown sample |
| Edge 10 (clock equals reset) | focus | data | strict `<` | N/A — a live clock cannot be pinned to the exact reset instant; covered by W2 and the render tier | |
| REQ-8 (`usage_sample` rows) | — | — | — | N/A — no visible consequence (`review-work`'s, D9) | |
| Any cell | pop-out | any | — | N/A — `/doc.html` hosts no usage readout (G: hasUsage false) | |
| §7 terminal rules | — | — | — | N/A — the plan touches no terminal surface | |

## Issues

### Critical
None.

### Major
None.

### Minor
None.

### Notes
1. **[note]** With `-usage-poll 0` the Refresh usage button still renders as enabled (display block, opacity 1, `disabled` false), while `POST /api/usage/refresh` answers 404 in that mode. This behaviour predates this plan and the plan does not change it. I am not asking for a change here; it may belong in the backlog.
2. **[note]** View switches have no effect while the daemon is down: clicking Tiles or Focus leaves `aria-pressed` unchanged for 15 s. This also predates the plan. Because of it, the daemon-down cells were measured in the view that was active at the kill (5h and values in focus, 7d past-reset in tiles), not in both views. Both views render the same masthead node, and the 7d past-reset cell passed in tiles.
3. **[note]** After a reset passes and before a fresh value arrives, `/api/state` still carries the old bucket (for example fiveHour 100 with a past `resetsAt`). The dashboard shows `unknown`. The protocol says exactly this ("still on the wire … clients render it unknown"), so this is a statement, not a defect.
4. **[note]** While the daemon is down, the readouts show their last values with no age label. Design-system §6 rule 8 ("stale is labelled") covers this. The daemon-down banner is prominent, the behaviour predates the plan, and REQ-5 now turns any bar unknown once its reset passes even with the daemon down, so no change is requested.
5. **[note]** When a readout switches between a percentage and `unknown`, the neighbouring readouts shift horizontally (for example the 5h box left edge moved from 351 to 455). That is the existing rendering of unknown, and the masthead stays one row of 46 px with no overflow.

## Maintainability review

# Maintainability review: Usage Bar Consistency

**Plan**: usage-bar-consistency
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 11351 words (budget 30000)
**Scope**: 16 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (12 code files, 4 generated `CLAUDE.md` trailers)

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| cmd/musterd/main.go | (one help string changed; no sibling question) | n/a | filelen 540, funlen `parseFlags`, `run`: all pre-existing, size unchanged (540 lines on main too) | pass (Note 1) |
| internal/claudecode/usageapi.go | status.go (`StatusBucket`, epoch→UTC), usageapi.go's own `parseResetsAt` | yes (reuse `StatusBucket`) | none | pass: `interpretWindow` reuses `parseResetsAt` and `StatusBucket`, and follows `InterpretUsageReport`'s skip-don't-fail shape |
| internal/claudecode/status.go | usageapi.go | n/a (comment-only change) | none | pass |
| internal/claudecode/claudecodetest/claudecodetest.go | promptreply.go, transcripts.go | daemon-tests table row | filelen 710 (694 on main), funlen `statusLineFullPayload` (untouched); no reason given | Minor 4 |
| internal/server/usage.go | usagewire.go, usagepoll.go, themepoll.go, shellactivity.go | yes | none | pass |
| internal/server/usagepoll.go | bgloop.go, themepoll.go, shellactivity.go, reporefresh.go, ingest.go (`processStatus`) | yes (watcher as second `bgLoop`; `toUsageBucket`) | none | Minor 1 |
| internal/server/renderfix_scenarios.go | renderfix_scenarios_usage.go | n/a (fixture epochs) | none | pass |
| internal/server/renderfix_scenarios_usage.go | renderfix_scenarios.go | n/a (one constructor arg) | funlen `driveCacheWarmthHover`: pre-existing, untouched, named in Decisions | pass (Note 2) |
| internal/usage/aggregator.go | modelscoped.go, usage.go | yes (two writers, `writeMu` + `mu`) | none | Major 1 |
| internal/usage/modelscoped.go | aggregator.go | n/a (comment-only change) | none | pass |
| internal/usage/usage.go | aggregator.go, modelscoped.go | n/a (comment-only change) | none | Minor 2 |
| web/src/sessions/usage.ts | format.ts, cache.ts, context.ts | yes (rule inside the one derivation) | none | Minor 3 |
| internal/claudecode/CLAUDE.md, internal/server/CLAUDE.md, internal/usage/CLAUDE.md, web/src/sessions/CLAUDE.md | — | n/a | none | generated trailer and doc text belong to review-work; nothing about shape here |

**Shared state (question 3).** `Aggregator.state` now has two writers: the ingest worker through `Record` and the poller goroutine through `RecordFetch`. The `design:` line names both writers and the guard. `writeMu` serialises a whole `adopt`. `state` is written only while both locks are held, so `adopt` can read `prev := a.state` under `writeMu` alone (aggregator.go:77), and `Current()` reads it under `mu` alone. Every writer holds the guard. `TestAggregator_ConcurrentWritersLoseNothingAndRowsMatchBroadcasts` (aggregator_sources_test.go:366) runs 20 + 20 concurrent writers, and the gates' `test` line runs `go test -race -count=1 ./...` (02-test.log:1). Lock order is acyclic: `adopt` holds `writeMu` while `OnChange` takes `ModelScoped.mu`; `ModelScoped.onChange` runs with no lock held and takes only `Aggregator.mu`. `hub.broadcast` never blocks (ws.go:104). The poller's `changed` channel is buffered (size 1), so a holder change between `nextReset`'s read and the `select` is not lost (usagepoll.go:67–76). I found no unguarded interleaving introduced by this branch.

**Layers (question 4).** The composition roots are untouched. `handleUsageRefresh` is unchanged (decode/delegate/encode). Only `internal/claudecode` names `five_hour`/`seven_day`/`utilization`; `rg -n "five_hour|seven_day|utilization" internal web/src` outside it finds only the store's column names.

## Issues

### Critical

### Major

1. **[daemon-impl]** Two new private types, one a field-for-field copy of an existing type — `internal/usage/aggregator.go:42-54`. This goes against conventions § Design, "Reuse before add", and question 7 (every new type has a `design:` line). The Decisions `design:` line says "no new type for the second writer", but the branch adds `aggregateState` and `arrival`. `aggregateState` is `Snapshot` (usage.go:35-41) minus `Source`, which `snapshotOf` (aggregator.go:132-134) fills with a constant:
   ```
   internal/usage/aggregator.go:42  type aggregateState struct { fiveHour *Bucket; sevenDay *Bucket; model *Model; sampledAt *time.Time }
   internal/usage/usage.go:35       type Snapshot struct       { FiveHour *Bucket; SevenDay *Bucket; Model *Model; SampledAt *time.Time; Source string }
   ```
   As written, any field added to the account snapshot must change three places: `Snapshot`, `aggregateState` and `snapshotOf`. Neither new type has a `design:` line. A fix must make one of these true: (a) the Aggregator holds its state in one existing type, so `Current()` needs no hand-copy; or (b) a `design:` line for each of `aggregateState` and `arrival` states why `Snapshot`/`Sample` cannot serve, with a reason the code bears out.

### Minor

1. **[daemon-impl]** The `claudecode.StatusBucket` → `usage.Bucket` mapping now exists twice — `internal/server/usagepoll.go:162-167` (`toUsageBucket`, new) and `internal/server/ingest.go:204-205` (inline, already there). This goes against conventions § Design, "Reuse before add" and "One owner per concept". The `design:` line says the new helper "mirrors `processStatus`": it found the existing mapping and copied it rather than reusing it.
   ```
   internal/server/usagepoll.go:166:	return &usage.Bucket{UsedPct: b.UsedPct, ResetsAt: b.ResetsAt}
   internal/server/ingest.go:204:		FiveHour: usage.Bucket{UsedPct: acct.FiveHour.UsedPct, ResetsAt: acct.FiveHour.ResetsAt},
   internal/server/ingest.go:205:		SevenDay: usage.Bucket{UsedPct: acct.SevenDay.UsedPct, ResetsAt: acct.SevenDay.ResetsAt},
   ```
   Graded Minor, not Major, because each copy is one struct literal with no logic to drift. A fix must make true: both seams convert through one mapping, so a field added to `Bucket` changes one place.

2. **[daemon-impl]** `Sample.SampledAt` is now a dead field — `internal/usage/usage.go:31`. On main, `Record` wrote it (`s.SampledAt = time.Now().UTC()`, main aggregator.go:55) and `snapshotLocked` read it (main aggregator.go:110). After this branch nothing in non-test code reads or writes it: `rg -n "SampledAt" internal cmd --glob '!*_test.go'` shows only the field declaration, `Snapshot.SampledAt`, `aggregateState.sampledAt` and the wire. No test sets or reads `Sample.SampledAt` either: aggregator_test.go:92 reads a `Snapshot`. Every caller now builds a `Sample` with a field it cannot use. A fix must make true: `Sample` carries no field without a reader.

3. **[web-impl]** `resetHasPassed` reimplements an existing helper — `web/src/sessions/usage.ts:33-35`. This goes against conventions § Design, "Reuse before add". `sessions/format.ts:20` already owns "seconds from now to an ISO instant", and `sessions/cache.ts:18` uses it to decide expiry. `usage.ts` already imports from `./format` (line 10).
   ```
   web/src/sessions/format.ts:20:  export function remainingSeconds(untilIso: string, now: Date): number { return (Date.parse(untilIso) - now.getTime()) / 1000; }
   web/src/sessions/usage.ts:34:     return Date.parse(bucket.resetsAt) < now.getTime();
   ```
   The two agree today, NaN case included: both compare false. A future fix to one, such as NaN handling, will not reach the other. Graded Minor for the same reason as Minor 1. A fix must make true: the past-reset test is expressed through the one ISO-instant helper `format.ts` owns.

4. **[daemon-tests]** File-length warning on a grown file with no reason — `internal/claudecode/claudecodetest/claudecodetest.go:1`, 710 lines (694 on main; this branch's `UsageAPIBucketsBody`/`UsageBucketOpt` add 16). Gates log 19-size.log names it, alongside the pre-existing `statusLineFullPayload` funlen at :572. `daemon-tests.md` line 55 says "no `dupl` warning names my files", but its check was `make size-warn | grep -i "usage\|dupl"`, which cannot match a `filelen` line for this path. This is kb:adr/process-size-linters-warn-never-fail and question 6: no reason means Minor. A fix must make true: Decisions gives a reason that holds for keeping this helper file over 500 lines, or the file is restructured along a real seam. A split that only silences the count does not count.

### Notes

1. **[note]** `cmd/musterd/main.go`: filelen (540) and funlen (`parseFlags` 53 statements, `run` 47) are all pre-existing; this branch changes one flag's help string, and the file is 540 lines on main too. The daemon-impl Decisions line "No size warning on a file I touched" is inaccurate for this file. Nothing got worse, so no change is requested.
2. **[note]** `internal/server/renderfix_scenarios_usage.go:277` `driveCacheWarmthHover` funlen is pre-existing and untouched (the branch changes only line 406's constructor call). Decisions names it as such, and that reason holds.
3. **[note]** Pre-existing, not introduced here: the two holders' `OnChange` closures each read the *other* holder's `Current()` (usage.go:49, :61, unchanged context). That allows this interleaving. The ingest worker commits aggregator A3 and its `OnChange` reads `modelScoped.Current()` = M1. The poller's `ModelScoped.Record` then commits M2 and broadcasts (A3, M2). The ingest worker resumes and broadcasts (A3, M1) last, so clients show M1 until the next change. `writeMu` orders the aggregator's own broadcasts, not broadcasts across holders. Main has the same shape, so this is recorded here and not filed.
4. **[note]** `snapshotOf` (aggregator.go:133) hands readers the state's own `*Bucket`/`*Model` pointers, where main's `snapshotLocked` copied into fresh locals. This is safe today: `adoptBucket` copies every adopted bucket, and nothing mutates one in place. `ModelScoped.snapshotLocked` (modelscoped.go:137) aliases its slice the same way, so the two siblings now match.
5. **[note]** `fetchSource = defaultModelScopedSource` (aggregator.go:22) labels the aggregator's call-sourced rows with a constant named for the per-model holder. The `design:` line states the reuse, and the value is one concept, "came from the OAuth call". Only the name reads oddly from the aggregator's side.
6. **[note]** `watchResets` (usagepoll.go:65) allocates a one-hour timer on every pass, even when no reset is known and `wake` stays nil. Correct, just a shape a reader has to stop and check.
7. **[note]** `UNKNOWN_VIEW_MODEL` (web/src/sessions/usage.ts:25) is one shared object returned to every caller. Its one production caller, `renderUsageBucket` (render/masthead.ts:68), only reads it, so this is fine as long as that stays true.
8. **[note]** No new package-level dependency edge: `internal/server` → `internal/usage`/`internal/claudecode` already exist, so `kb:diagram/daemon-components` and `kb:diagram/web-components` need no change from this diff.
