# Browser review: Usage Bar Consistency

**Plan**: usage-bar-consistency
**Verdict**: approved
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
