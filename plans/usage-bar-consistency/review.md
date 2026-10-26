# Review: usage-bar-consistency

**Plan**: usage-bar-consistency
**Verdict**: approved
**Cycle**: 2
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code approved, browser approved, maintainability approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Usage Bar Consistency

**Plan**: usage-bar-consistency
**Part verdict**: approved
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

## Browser review

# Browser review: Usage Bar Consistency

**Plan**: usage-bar-consistency
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 9718 words (budget 30000)
**Rig**: `make web-build build` at 4529da3e (`bin/musterd` v0.25.3-27-g4529da3e-dirty; the dirt is only the plan's review and state files), committed `startDaemon` fixture, so each daemon had a space-bearing data dir (`…/T/muster e2e-*`), a private tmux socket inside it and the shared E2E stub `claude`. `FakeUsageAPI` stood in for `/api/oauth/usage` through `-usage-api-url` and `-usage-token-file`. Headless Chromium at 1280×800, one throwaway spec (7 tests, all green, 21.3 s) run in the foreground. Afterwards I deleted the spec; the fixture teardown removed each daemon, tmux server and data dir, and `git status --porcelain` shows nothing of mine.

Gates log (`gates-usage-bar-consistency-c2`): 0 failed lines. `web-build` and the scoped `e2e` (131 passed) are green, so the app I drove is the one that ships.

Since cycle 1 the web change is one line (`resetHasPassed` now goes through `remainingSeconds`). The daemon now rounds the call's `resets_at` up to the whole second and de-dups with a float tolerance (REQ-9 amendment). I re-measured the whole matrix on the new build and added rows for the amendment's visible consequences (rows marked *new*).

## Matrix

Hosts: focus and tiles share one masthead node, but I measured each cell in the view named. The pop-out (`/doc.html`, HTTP 200) has no `#usage-5h`, `#usage-7d` or `#usage-model-week` (G.popout `[false,false,false]`), so every pop-out cell is N/A. Each sample records, per readout, the `.num` text, the counts of `.bar`, `.bar i`, `.resets` and `.warn`, the `.resets` title, the computed display, visibility and opacity of the readout and its `.num`, and the readout's box. It also records the masthead box (0,0–1280,46 in every sample), the masthead's `scrollWidth`/`clientWidth` (1280/1280 in every sample), and the number of masthead `[hidden]` elements that do not compute to `display: none` (0 in every sample).

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| States: no data | focus | no data | with the start-up call held, 5h, 7d and model read `unknown` with no track and no suffix | pass | A.nodata.focus: `.num` "unknown" ×3, bars 0, fills 0, resets 0, opacity 1, visible; oracle `/api/state` fiveHour/sevenDay/modelScoped null |
| States: no data | tiles | no data | same | pass | A.nodata.tiles: identical counts; boxes 663–920 × 16–30 inside the masthead |
| REQ-6 / E4 | tiles | data | the start-up call fills 5h and 7d with no status post | pass | A.data.tiles: "20%" / "30%", fills 1, resets 1; oracle usedPct 20/30 |
| REQ-6 / E4 | focus | data | same | pass | A.data.focus: same |
| REQ-1 / E1 | focus | data | Refresh (pointer click) shows the call's 5h and 7d over the status post's | pass | B.ptr.focus: 61%/23% → click → 38%/52% |
| REQ-1 / E1 | tiles | data | Refresh (keyboard Space on the focused button) shows the call's values | pass | B.kb.tiles: "12%"/"41%"; oracle 12/41 |
| Refresh keeps focus | tiles | data | `activeElement` identity 1.2 s after a keyboard activation | pass | B.kbFocusBefore true → B.kbFocusKept true |
| REQ-2 (call after status) | focus | data | a newer call wins over the status value | pass | B.ptr.focus and C.change.focus (status 61.2 → call 44) |
| REQ-2 (status after call) | focus | data | a newer status post wins | pass | C.status.focus: start-up call 10% → status 61%/23%; oracle 61.2 / 23.4 |
| REQ-2, REQ-3 | tiles | data | — | N/A — daemon adoption into the one masthead node, view-independent; tiles readouts measured in A, B, C, D, E, G | |
| REQ-9 *new*: status then call, measured forms | focus | data | a call repeating the status values (utilization `61.200000000000003`, `resets_at` one second earlier with `.522599+00:00`) sends no `usage` message | pass | C.dedup.frames 0 (the endpoint was hit); oracle unchanged, `sampledAt` unchanged 17:35:02Z |
| REQ-9 *new*: call then status | focus | data | a status post repeating the call's values in epoch form sends no `usage` message | pass | C.reverse.frames 0 |
| REQ-9 control | focus | data | a real change does send one | pass | C.change.frames 1 |
| Rounded reset *new* (ADR usage-call-resets-rounded-up-to-the-second) | focus | data | a call reset of `20:44:59.522599Z` shows as the whole second it rounds to | pass | oracle `2026-10-26T20:45:00Z`; readout "(22:45)", title "Resets Mon, Oct 26, 22:45" (local UTC+2) |
| Rounded reset *new* | tiles | data | same | pass | C.change.tiles: same text and title |
| REQ-5 / Flow 1 (5h) | focus | data | a 5h bar at 100% turns `unknown` once its reset passes, with no daemon message | pass | D.past.focus: unknown 572 ms after the reset (the call was held); bars 0, fills 0, resets 0, warn 0 (warn 1 at 100%); 7d unchanged "55%" |
| REQ-5 (5h) | tiles | data | same, settled after a later tick | pass | D.past.tiles.settled (+1.2 s): same counts |
| REQ-4 / E2 (5h) | focus | data | the daemon calls at the reset instant | pass | D.wakeAfterResetMs 3 |
| REQ-7 / E3 / Edge 4 | tiles | data | a failed reset-time call leaves 5h `unknown`, never 100% again | pass | D.failed.tiles (1.5 s after `title="unreachable"` landed): 5h unknown, fills 0; 7d 55%; oracle still carries fiveHour 100 with a past reset (Note 2) |
| Flow 1 recovery | tiles, focus | data | Refresh after the failure shows the fresh value | pass | D.recovered.tiles and .focus: "12%", fills 1, resets 1 |
| REQ-5 (per-model) *new*: fractional reset | tiles | data | the model readout turns `unknown` at the rounded reset | pass | window `…:11.400000+00:00` → wire `17:35:12Z` (E.pre.oracle); unknown 959 ms after 17:35:12 (one 1 s tick); bars 0, fills 0, resets 0 |
| REQ-4 (per-model) *new* | tiles | data | the daemon calls at the per-model reset, at the rounded instant | pass | E.wakeAfterRoundedMs 3 (603 ms after the raw fractional instant) |
| Model select keeps focus | tiles | data | the select, reached by Tab, keeps `activeElement` identity across known → unknown → known | pass | E.selFocused true, E.focusAcrossUnknown true, E.focusAcrossRecovery true; recovered "20%" |
| REQ-5 (7d, 5h ahead) | focus | daemon-down | 7d turns `unknown` from the client clock while the daemon is down, and 5h keeps its value | pass | F: daemon SIGTERMed, banner up before the reset; 7d unknown 613 ms after its reset, bars 0, resets 0; 5h "70%" |
| REQ-5 (7d) | tiles | daemon-down | same | not re-measured this cycle — passed in tiles in cycle 1 (C); see Note 1 | |
| Daemon-down (values) | focus | daemon-down | the readouts keep the last snapshot and the daemon-down state is surfaced | pass | A.down.focus: `role=alert` "musterd unreachable — …" displayed; readouts 20%/30%/61% unchanged |
| Daemon-down (values) | tiles | daemon-down | same | pass | F.down.pre is focus; the tiles cell passed in cycle 1 (C.down.beforeReset.tiles) and the web diff since then is the one-line `resetHasPassed` change. See Note 1 |
| Edge 5 (`-usage-poll 0`) | tiles | data | the reset passes, 5h reads `unknown` and stays so | pass | G.past.tiles: still unknown 2.5 s after the flip; oracle fiveHour 100 with a past reset (no call) |
| Edge 5 | focus | data | same | pass in cycle 1 (F); the cell's behaviour is the same client rule measured in D.past.focus | |
| Placement (all states) | focus, tiles | all | readouts inside the masthead; the masthead does not overflow | pass | every sample: masthead 0,0–1280,46; scroll 1280/1280; readout boxes y 16–30, x ≤ 920 |
| Hidden | focus, tiles | all | masthead `[hidden]` computes `display: none` | pass | hiddenBad 0 in every sample |
| Honesty §6 rule 1 | focus, tiles | no data, past reset | no empty or 0% track for unknown | pass | fills 0 and bars 0 in every unknown sample |
| Honesty §6 daemon-down | focus | daemon-down | surfaced prominently | pass | A.down, F: `role=alert` banner visible |
| Edge 10 (clock equals reset) | — | — | strict `<` | N/A — a live clock cannot be pinned to the exact instant; covered by W2 and the render tier | |
| REQ-8 (`usage_sample` rows) | — | — | — | N/A — no visible consequence (`review-work`'s, D9) | |
| Any cell | pop-out | any | — | N/A — `/doc.html` hosts no usage readout (G.popout) | |
| §7 terminal rules | — | — | — | N/A — the plan touches no terminal surface | |

## Issues

### Critical
None.

### Major
None.

### Minor
None.

### Notes
1. **[note]** View switches still have no effect while the daemon is down (cycle 1 Note 2, which predates this plan). So each daemon-down cell was measured in the view active at the kill. This cycle that was focus (A.down, F); cycle 1 covered tiles. Both views render the same masthead node.
2. **[note]** After a reset passes and before a fresh value arrives, `/api/state` still carries the old bucket (for example fiveHour 100 with a past `resetsAt`, D.failed.oracle and G.oracle), while the dashboard shows `unknown`. The protocol says exactly this ("still on the wire … clients render it unknown"), so no change is requested.
3. **[note]** Because the call's `resets_at` is rounded up, a per-model window with a fractional reset reads its percentage for up to one extra second past the raw instant (E: unknown at 17:35:12, raw reset 17:35:11.4). This is the behaviour `kb:adr/usage-call-resets-rounded-up-to-the-second` chose, the wire and the daemon's wake agree on the rounded instant, and the gap is under one second. No change is requested.
4. **[note]** The cycle 1 notes on the enabled Refresh button under `-usage-poll 0`, the missing age label on readouts while the daemon is down, and readouts shifting horizontally between a percentage and `unknown` all still hold. Each predates this plan, and none is requested here.

## Maintainability review

# Maintainability review: Usage Bar Consistency

**Plan**: usage-bar-consistency
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 12166 words (budget 30000)
**Scope**: 19 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (15 code files, 4 generated or hand-edited `CLAUDE.md` files). This is a full review: cycle 1 had a Major open, so delta re-review does not apply. Each cycle-1 finding was checked again on its own file below.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| cmd/musterd/main.go | (one flag help string changed) | n/a | filelen 540; funlen `parseFlags` 53 and `run` 47. All pre-existing: 540 lines on main too | pass (Note 1) |
| internal/claudecode/usageapi.go | status.go (`StatusBucket`, `statusBucket`), interpret.go (`modelID(json.RawMessage)`), its own `parseResetsAt` and `usageAPILimit` | yes (reuse `StatusBucket`); cycle-1 fix gives `ceilToSecond` its ADR | none | pass: `rg "Truncate\(time.Second\)\|Round\(time.Second\)\|ceilTo\|roundUp"` finds no other rounding helper (renderfix.go:328 is a sleep). `interpretWindow` follows the skip-don't-fail shape of the `limits[]` loop |
| internal/claudecode/status.go | usageapi.go | n/a (comment-only change) | none | pass |
| internal/claudecode/claudecodetest/claudecodetest.go | promptreply.go, transcripts.go, statusline.go, usageapi.go | daemon-tests fix 1 `design:` | none (was filelen 710 in cycle 1, now 448) | pass. Cycle-1 Minor 4 resolved |
| internal/claudecode/claudecodetest/statusline.go | claudecodetest.go, promptreply.go, transcripts.go | daemon-tests fix 1 `design:` | funlen `statusLineFullPayload` 68: pre-existing, moved verbatim (main claudecodetest.go:572) | pass: a comment-stripped diff against main's lines 440–700 shows only gofmt realignment |
| internal/claudecode/claudecodetest/usageapi.go | same | daemon-tests fix 1 `design:` | none | pass: moved code plus the `UsageAPIBucketsBody` extension. `UsageAPIBody` now delegates to it, so there is no second body builder |
| internal/server/ingest.go | usagepoll.go, usagewire.go | cycle-1 fix `design:` (one mapping) | none | pass. Cycle-1 Minor 1 resolved: `rg -n "usage\.Bucket\{" internal cmd --glob '!*_test.go'` finds only usagepoll.go:163 |
| internal/server/usage.go | usagewire.go, usagepoll.go, themepoll.go | yes (`notifyPoller` from both `OnChange`) | none | pass |
| internal/server/usagepoll.go | bgloop.go, themepoll.go, shellactivity.go, reporefresh.go, updatemanager.go, claudeversion.go | yes (watcher as a second `bgLoop`; one mapping) | none | pass (Notes 2, 5) |
| internal/server/renderfix_scenarios.go | renderfix_scenarios_usage.go | n/a (fixture epochs) | none | pass |
| internal/server/renderfix_scenarios_usage.go | renderfix_scenarios.go | n/a (one constructor arg) | funlen `driveCacheWarmthHover` 62: pre-existing, untouched; Decisions names it | pass |
| internal/usage/aggregator.go | modelscoped.go, usage.go | yes (two writers, `writeMu` + `mu`; cycle-1 fix: `snap` is a `Snapshot`) | none | pass. Cycle-1 Major 1 resolved: `aggregateState`, `arrival` and `snapshotOf` are gone, and `Current()` returns the held `Snapshot` with no hand-copy (Notes 3, 4) |
| internal/usage/modelscoped.go | aggregator.go | n/a (comment-only change) | none | pass (Note 6) |
| internal/usage/usage.go | aggregator.go, modelscoped.go | n/a | none | pass. Cycle-1 Minor 2 resolved: `Sample.SampledAt` removed (Note 7) |
| web/src/sessions/usage.ts | format.ts, cache.ts, context.ts | yes (rule inside the one derivation; cycle-1 fix reuses `remainingSeconds`) | none | pass. Cycle-1 Minor 3 resolved: `resetHasPassed` is now `remainingSeconds(...) < 0` and imports the helper `format.ts` owns |
| internal/claudecode/CLAUDE.md, internal/server/CLAUDE.md, internal/usage/CLAUDE.md, web/src/sessions/CLAUDE.md | — | n/a | none | doc text and generated trailers belong to review-work; no shape question here |

**Shared state (question 3).** `Aggregator.snap` has two writers: the ingest worker through `Record` and the usage poller goroutine through `RecordFetch`. Both reach `adopt`, which holds `writeMu` for the whole read, persist, commit and broadcast (aggregator.go:60–61). `snap` is written only at aggregator.go:100–102, under `writeMu` and then `mu`, so `adopt` can read `prev := a.snap` (:64) under `writeMu` alone, and `Current()` (:112) reads under `mu` alone. The `design:` line names both writers and both guards.

`adopt` returns no pointer the caller still holds:
- `adoptBucket` copies every offered bucket (:122).
- `Record`'s `&s.Model` points into its own by-value parameter.

The gates' `test` line is `go test -race -count=1 ./...` (02-test.log:1). `TestAggregator_ConcurrentWritersLoseNothingAndRowsMatchBroadcasts` runs 20 + 20 concurrent writers.

The reset watcher reads both holders through their locked `Current()`. `notify` is a non-blocking send on a channel with a buffer of 1 (usagepoll.go:56–60). So a commit that lands between `nextReset`'s read (:67) and the `select` (:72) leaves a pending signal, and the watcher re-arms on the next pass. I found no unguarded interleaving introduced by this branch. Note 3 records one pre-existing cross-holder ordering.

**Layers (question 4).** The composition roots are untouched: `cmd/musterd/main.go` changes only a help string, and `internal/server/server.go` and `web/src/main.ts` are not in the diff. `handleUsageRefresh` is unchanged in shape. The wire keys `five_hour`, `seven_day` and `utilization` appear only in `internal/claudecode` and its `claudecodetest`.

**Diagram (question 8).** No new package-level edge: `internal/server` already imported `internal/usage` and `internal/claudecode`.

## Issues

### Critical

### Major

### Minor

### Notes

1. **[note]** `cmd/musterd/main.go`: the filelen 540 and the `parseFlags`/`run` funlen hits are pre-existing. This branch changes one help string, and the file size is unchanged from main. The daemon-impl line "No size warning on a file I touched" is still inaccurate for this file, but nothing got worse.
2. **[note]** `toUsageBucket` (usagepoll.go:162) is now the one `StatusBucket` to `Bucket` mapping. Its two consumers sit in different files: `processStatus` (ingest.go:204–205) and `recordBuckets` (usagepoll.go:157). One owner is satisfied. A reader of ingest.go has to know to look in the poller file. Placement only, so no change is requested.
3. **[note]** Pre-existing, as cycle-1 Note 3 recorded; the branch does not change it. Each holder's `OnChange` reads the *other* holder's `Current()` (usage.go:49, :61). `writeMu` orders the aggregator's own broadcasts. It does not order the aggregator's broadcasts against `ModelScoped`'s. This interleaving can leave clients one step stale until the next change:
   1. The poller's `ModelScoped` `OnChange` reads aggregator A1.
   2. The ingest worker commits A2 and broadcasts (A2, M2).
   3. The poller broadcasts (A1, M2) last.

   The two goroutines are the same as on main.
4. **[note]** `fetchSource = defaultModelScopedSource` (aggregator.go:23): the aggregator labels its call-sourced rows with a constant named for the per-model holder. The `design:` line states the reuse, and both mean "came from the OAuth call"; only the name reads oddly from this side.
5. **[note]** `watchResets` (usagepoll.go:65) allocates a one-hour timer on every pass, even when no reset is known and `wake` stays nil. Correct, but a reader has to stop and check it.
6. **[note]** For review-work (doc truth), not filed here: the pre-existing comment at modelscoped.go:78–79 still points at "Aggregator.Record (aggregator.go:47-90)". That logic now lives in `adopt` (aggregator.go:59–108). The comment pass did not see it because the branch did not add it, and per kb:adr/process-comment-pass-owns-code-comments reviewers file no finding on a comment.
7. **[note]** Pre-existing: no caller sets `Sample.Source`. `rg -n "Sample\{" internal cmd --glob '!*_test.go'` finds only ingest.go:203, which leaves it empty, so `Record`'s defaulting (aggregator.go:49–51) always supplies it. Main had the same shape, so nothing is filed.
8. **[note]** The comment pass removed the `Aggregator` struct's doc comment, so the declaration (aggregator.go:32–41) no longer names its two writers or what `writeMu` and `mu` each guard. The `design:` line in daemon-implementation.md is now the only place that states it. Comments are the comment pass's to own (kb:adr/process-comment-pass-owns-code-comments), so this is recorded, not filed.
9. **[note]** `UNKNOWN_VIEW_MODEL` (web/src/sessions/usage.ts:25) is one shared, unfrozen object handed to every caller. Its one production caller, `renderUsageBucket`, only reads it, so this is fine while that stays true.
