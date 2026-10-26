# Browser review: Usage Bar Consistency

**Plan**: usage-bar-consistency
**Verdict**: approved
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
