# Browser review: terminal-ended-rule-1

**Plan**: terminal-ended-rule-1
**Verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 8561 words (budget 30000)
**Rig**: `make web-build build` at f1542bbe (dirty only in `orchestration-state.json`); `bin/musterd` per test via `helpers/fixtures.ts` `daemon` (fresh space-bearing temp data dir, private `-tmux-socket` path, shared E2E stub `claude`); headless Chromium, throwaway spec `web/e2e/zz-reviewbrowser.spec.ts` run in the foreground under the gate lock (8/8 ran, 3.3 min), then deleted. Gates log: 0 failed lines (`22-e2e` 114 passed, `04-web-build` built).

The race needed to observe REQ-1 was made deterministic. `page.routeWebSocket` held this session's `terminals` frames, and `page.route` held the `POST …/shells` 201 until the rename or close reply had landed. Each run's wire trace was logged to confirm the reply ordering. Rename case: spawn `rev 2`, rename reply `rev 3`, lists `rev 2`/`rev 3` held. Close case: spawn `rev 3`, close reply `rev 4`, lists `rev 3`/`rev 4` held. On the pre-fix rule (`rev <= seenRev`), both orderings read the spawn as ended (2 ≤ 3, 3 ≤ 4), so these cells can fail for the defect. Every input is real: a pointer click on ▾ → New terminal, ✎ → typing → Enter, and × on a row. The oracle is tmux `#{session_attached}` on each terminal target plus `GET /api/state` `terminals[id]`. Both were read after a ≥1.2 s settle.

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 (rename reply before list) | focus | data, lists held | new terminal shown | pass | after release + 1.2 s: `shell` aria-pressed=true; region `flex/visible/1` box 300,95 980×599 inside host 300,46 980×674; tmux `muster-1-shell-2` attached=1, `muster-1-shell` attached=0; /api/state `1:renamed,2:shell 2` |
| REQ-1 (rename reply before list) | focus | data, settled after lists flushed | stays on new terminal | pass | +1.5 s: title "shell 2", pressed=true, count "2", shell-2 attached=1, shell-1 attached=0 |
| REQ-1 (rename reply before list) | tiles | data, lists held | new terminal shown | pass | pressed=true; region `flex/visible/1` 2,117 636.5×255.5 inside tile 1,85 638.5×316.5; shell-2 attached=1, shell-1 attached=0 |
| REQ-1 (rename reply before list) | tiles | data, settled | stays on new terminal | pass | title "shell 2", count "2", shell-2 attached=1 |
| REQ-1 (close reply before list) | focus | data, lists held | new terminal shown | pass | pressed=true; region visible, inside host; `muster-1-shell-3` attached=1; /api/state `2:shell 2,3:shell 3` |
| REQ-1 (close reply before list) | focus | data, settled | stays on new terminal | pass | title "shell 3", shell-3 attached=1, shell-2 attached=0 |
| REQ-1 (close reply before list) | tiles | data, lists held | new terminal shown | pass | pressed=true; region 2,117 636.5×255.25 inside tile; shell-3 attached=1 |
| REQ-1 (close reply before list) | tiles | data, settled | stays on new terminal | pass | title "shell 3", shell-3 attached=1, shell-2 attached=0 |
| REQ-1 (`select('shell')`, rename/close reply first) | focus, tiles | data | shown | not measured — see Note 2 | |
| REQ-1 (first `shell`, list held) | focus | no data (no terminals) | terminal 1 shown before its list arrives | pass | pressed=true, region `flex/visible/1` inside host, `muster-1-shell` attached=1; settled title "shell 1" |
| REQ-1 (first `shell`, list held) | tiles | no data | terminal 1 shown | pass | pressed=true, region inside tile, shell-1 attached=1; settled title "shell 1" |
| REQ-1 (rename/close reply before list) | any | no data | — | N/A — a rename or close needs an existing terminal | |
| REQ-1 (spawn really ended: list without `n` applied at a higher rev) | focus | data | not switched to | pass | spawn rev 2 held; `muster-1-shell-2` killed; list `rev 3 n=[1]` applied; reply released → title "shell 1", shell-1 attached=1, /api/state `1:shell 1` |
| REQ-1 (spawn really ended) | tiles | data | not switched to | pass | same sequence: title "shell 1", shell-1 attached=1 |
| Edge 1 (reply rev = applied rev, terminal present) | focus, tiles | data | not ended | pass | close-case setup: un-held New terminal → title "shell 2" shown in both hosts |
| REQ-2 / REQ-3 (failed follow-up listing) | focus, tiles | data | fresh rev; forced broadcast | not measured — see Note 1 | |
| any | pop-out `/doc.html` | any | — | N/A — the pop-out hosts the reader only, never a terminal | |
| daemon-down | focus | daemon SIGTERMed | surfaced prominently | pass | `role=alert` banner `block/visible/1` at 0,46 1280×32, "musterd unreachable — hook output in open panes is Muster's absence, not session failure."; shell segment left on "shell 2" |
| daemon-down | tiles | daemon SIGTERMed | surfaced prominently | not measured — see Note 3 | |
| §7 one live client per target | focus, tiles | data | one client | pass | in every settled cell, exactly one terminal target has attached=1 and the previously shown one has 0 |

## Issues

### Critical
None.

### Major
None.

### Minor
None.

### Notes
1. **[note]** REQ-2 and REQ-3 were not measured in the browser. They fire only when the daemon's pane listing fails right after a terminal route. The running app gives no user-reachable way to make that happen without fault injection in `shellActivityPoller`'s lister, short of killing the tmux server and with it every terminal. Their evidence is `D1` (`TestPollerRev_FailedFollowUpListingAnswersAFreshRevAndForcesNextBroadcast`), which belongs to `review-work`.
2. **[note]** The `select('shell')` variant was not measured, for focus or tiles. To hit the race, `shell` must be clicked while a rename or close reply from this same window is in flight, with no terminal remembered as last shown in this window. That needs a terminal to exist, the window to have no last-shown memory of it, and the panel to act before the segment click resolves. I could not set that up through real input. `surfacesrev.test.ts` covers it at wire level.
3. **[note]** The daemon-down banner was measured in focus only. It is a single masthead-level `role=alert` element spanning the full width (0,46 1280×32), not part of either host, and this plan does not touch it.
4. **[note]** For the gap between the spawn reply and the first applied list, the `shell` button has `title=null`, because the terminal's name comes from the list. Once the list lands it settles to "shell N". This is transient, and existing behaviour this plan does not change. No change requested.
