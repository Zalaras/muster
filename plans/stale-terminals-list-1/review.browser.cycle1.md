# Browser review: stale-terminals-list-1

**Plan**: stale-terminals-list-1
**Verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 8534 words (budget 30000)
**Rig**: `make web-build build` at 36f51774 → `bin/musterd`, driven via the committed `web/e2e/helpers/fixtures` scratch daemon (fresh space-bearing temp data dir, private per-test `tmux -S` socket killed on teardown, `-claude-bin` E2E stub). Headless Chromium through a throwaway spec (since deleted). Gates log `gates-stale-terminals-list-1-c1c` had no red lines (render 509 passed, e2e 255 passed, D2 ok).

**Method for the race.** The plan says the natural race cannot be reproduced end to end (Findings, "What did not hold"). I produced it in the real app instead: `page.routeWebSocket` proxied the dashboard's `/ws` to the real daemon, recorded every `terminals`/`snapshot` frame, and injected a stale `terminals` frame (`rev` = reply `rev` − 1, holding the pre-call list) straight after each real HTTP reply. I then let at least one render pass go by (≥ 1.2 s) and read what had settled. For REQ-8 I used `page.route` to rewrite a real spawn reply's `n`/`rev`.

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 | wire (/ws) | data | `rev` on every `terminals`, +1 per broadcast across sessions, in order | pass | two sessions: frames `[sid,rev]` = `[1,1] [2,2] [2,3] [1,4]`; one session: revs `[1,2,3,4]` |
| REQ-2 | wire | no data | snapshot / `GET /api/state` carry `terminalsRev` 0 on a fresh daemon | pass | /ws snapshot `terminalsRev: 0`; authenticated `/api/state` 200 `terminalsRev: 0`, `terminals: {}` |
| REQ-2 | wire | data | `/api/state.terminalsRev` = latest broadcast, lists match | pass | after close: `terminalsRev 4`, `{"1":[shell 1]}` = frame rev 4 |
| REQ-3 | wire | data | each route's reply `rev` = the session's latest broadcast `rev` | pass | POST shell rev 1 = frame 1; POST shells 2 = frame 2; PUT name 3 = frame 3; DELETE 4 = frame 4 |
| REQ-3 | wire | data | per-session, not global; no-change answers unchanged rev; last close answers the empty list's rev | pass | after B reached rev 3, A's no-change `POST …/shell` answered `created:false, rev:1`; A's last-terminal DELETE answered `{rev:4}` = frame `[1,4,0 terminals]` |
| REQ-4 | focus | data | DELETE from the panel × answers `200 {rev}` | pass | `DELETE 200 {"rev":4}`; row gone; missing terminal still `404 no_shell` |
| REQ-4 | tiles | data | same from a tile's panel | pass | `tile DELETE 200 {"rev":4}`, row `shell 2` count 0 |
| REQ-5 | focus | data | a list at the seen rev applies | pass | injected at rev = seen with shell 2 named `eqprobe` → the switch title read `eqprobe` |
| REQ-5 | focus | data | a stale list changes nothing (list, count, name, shown, selected, busy) | pass | injected stale list with `busy:true` for shell 2 / the old name → title, count and rows unchanged (rows below) |
| REQ-5 | focus | data → daemon restart | snapshot resets the seen rev; later low revs apply (edge case 6) | pass | seen 2 before restart; new daemon's snapshot `terminalsRev 0`; New terminal → reply rev 1, frame rev 1 applied: `shell` pressed, title `shell 1`, region visible |
| REQ-6 | focus | no data | stale `[]` after `select('shell')`'s reply keeps shell selected | pass | `shellPressed true, title "shell 1", claudePressed false`, region display flex/visible/opacity 1, box 300,95 980×599 |
| REQ-6 | tiles | no data | same in a tile | pass | `shellPressed true, title "shell 1"`; region box 2,117 637×256 inside tile 1,85 638×317 |
| REQ-6 | focus | data | stale `[1]` after `newTerminal`'s reply keeps shell 2 shown | pass | title `shell 2`, count `2`, region visible; panel rows `shell 1, shell 2` |
| REQ-6 | tiles | data | same in a tile | pass | title `shell 2`, count `2`, region visible inside tile box |
| REQ-7 | focus | data | stale list after rename is ignored | pass | PUT 200 rev 3; stale rev 2 list with `shell 2` → title `renamed`, row `renamed` 1, row `shell 2` 0 |
| REQ-7 | focus | data | stale list after closing the shown terminal is ignored | pass | stale rev 3 `[1, renamed]` → title `shell 1`, count hidden, row `renamed` 0 |
| REQ-7 | tiles | data | stale list after close is ignored | pass | stale rev 3 `[1,2,3]` after DELETE rev 4 → title `shell 1`, count `2`, row `shell 2` 0; `/api/state` = `[1,3]` |
| REQ-7 | tiles | data | rename ignored stale list | not measured — Note 1 | |
| REQ-8 | tiles | data | `newTerminal` reply at/below seen whose n is missing → not shown, no notice | pass | real reply n 3 rev 3 rewritten to n 99 rev 1 → title still `shell 2`, count `3` (real list), no notice visible |
| REQ-8 | focus | no data | `select('shell')` ended reply → the list's terminal, else stay | pass | real reply n 1 rev 1 rewritten to n 99 rev 0; the real list `[1]` at rev 1 arrived first, so the list holds one → `shell 1` shown (REQ-8's "the terminal its list gives") |
| REQ-8 | focus | no data | `select('shell')` ended reply with an empty list stays on claude | not measured — Note 2 | |
| REQ-9 | focus | data | a `terminals` frame without `rev` is ignored as malformed | pass | injected `{terminals: []}` with no rev → title `shell 2`, count `2` unchanged; console errors/warnings: none |
| REQ-9 | focus/tiles | data | DELETE 200 body read as success | pass | no failure notice; row removed in both hosts |
| Keeps focus | focus | data | a stale frame doesn't move focus | pass | Terminals opener focused, stale frame injected, 1.2 s later `document.activeElement` was the same node (Note 3) |
| §6 daemon-down | focus | daemon-down | daemon-down shown prominently | pass | `#banner` display block, visible, box 0,46 1280×32: "musterd unreachable — hook output in open panes is Muster's absence, not session failure."; Terminals opener disabled |
| all | pop-out (`/doc.html`) | any | — | N/A — the pop-out is the reader, which has no surface switch or Terminals panel | |
| Edge 7, 8 | any | any | — | N/A — plan marks them untested (fault injection between tmux calls; sub-ms double click) | |

## Issues

### Critical
None.

### Major
None.

### Minor
None.

### Notes
1. **[note]** Rename followed by a stale list was measured in focus only, not in tiles. The tile and focus hosts share the same panel and the same `surfaces.ts` handler, and close was measured in both.
2. **[note]** The REQ-8 `select('shell')` branch where the list is empty when an ended reply arrives was not reached in the browser. The daemon's real `[1]` frame always got there before the routed (rewritten) reply, so the "list holds one" branch ran instead. `surfacesrev.test.ts` covers the empty-list branch at unit level.
3. **[note]** Focus for the keeps-focus cell was set with `locator.focus()`, not with Tab. The defect class (an element rebuilt each render) does not depend on how focus arrived.
4. **[note]** Outside this plan: while the daemon is down the surface switch still shows the last-known `shell 2` and count `2` with no age. The banner covering daemon-down is prominent, as §6 requires, and the opener is disabled. This is unchanged behaviour, recorded only for the matrix.
5. **[note]** The only visible element matching `.notice` in every run was the issue-capture dialog's static help text ("Files a public issue…"), not a failure notice.
