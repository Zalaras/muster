# Browser review: Rail card menu, drag into groups, and cache warmth

**Plan**: rail-card-organise
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 13140 words (budget 30000)
**Rig**: `make web-build build` at 45f533fe (dirty: plan-dir review files only) → `bin/musterd`, driven per test through `web/e2e/helpers/fixtures.ts` `daemon` (data dir `$TMPDIR/muster e2e-XXXX`, space-bearing; private `-tmux-socket` inside it, killed at teardown), stub `claude` at `$TMPDIR/muster e2e-stub-cd75a542396fd84f`; headless Chromium, throwaway spec `web/e2e/zz-review-browser-c2.spec.ts` (deleted; `git status --porcelain` shows nothing of mine).

Scope: a delta re-review. Cycle 1 approved the full matrix (`review.browser.cycle1.md`). The web changes since ba934267 are three refactors: menu enablement now reads `card.ts`'s `actionEnabled`/`stopResumeButton`, card draggability is now a per-id predicate the controller passes (`draggable: (id) => !selecting || selectedIds.has(id)`), and `remainingText`/`remainingSeconds` moved to `sessions/format.ts`. I re-measured the cells those three touch. I did not re-drive the other cycle-1 cells, because their code did not change.

Gates log read, not re-run: `17-e2e` 840 passed and `04-web-build` is green, so the app I drove is the one that ships. The one red line, `11-kb-check` (a fact record's verified version bound), belongs to the orchestrator and shows nothing in the app.

Hosts: **focus** = the Focus view's rail; **tiles** = the Tiles strip; **pop-out** = `/doc.html`, which renders no cards, menus or headers, so every pop-out cell is N/A for that reason (as in cycle 1). States: **none** = no cache yet / no waiting member; **data**; **down** = scratch daemon SIGTERMed (`daemon.kill()`).

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-2 | focus | data | live bound card: Stop… enabled; no Resume…/Remove… | pass | items `Stop…, New group…, No group, Pin`, all `disabled` false, cursor pointer, display flex/visible/opacity 1; oracle `/api/state` id 1 alive, `claudeSessionId` set |
| REQ-2 | focus | data | live card with no Claude id: Stop… still enabled (Resume rule doesn't leak onto Stop) | pass | id 3 `claudeSessionId` null: `Stop…` enabled, pointer |
| REQ-2/3 | focus | data | ended bound: Resume…, Remove… both enabled | pass | `Resume…, Remove…, New group…, No group, Pin`, all enabled; Remove… danger colour rgb(194,70,70) |
| REQ-3 | focus | data | ended without a Claude id: Resume… absent, Remove… enabled | pass | `Remove…, New group…, No group, Pin`; oracle id 5 `claudeSessionId` null |
| REQ-4 | focus | data | in-flight Stop: the card's menu reopened mid-request is all disabled, still so after a tick, enabled again after | pass | `/end` held open by a route: `Stop…, New group…, No group, Pin` all `disabled` true, colour rgb(90,96,112), cursor default; same after 1.2 s; released: card `.ended`, menu `Resume…, Remove…, …` all enabled |
| REQ-2 | tiles | data | strip menu: live, ended-bound and ended-unbound entries match the rail | pass | strip held `rb2-t-4` (live), `rb2-t-endb`, `rb2-t-endu`: `Stop…`/`Resume…, Remove…`/`Remove…` + Move to + Pin, all enabled |
| REQ-10 | focus | down | every item disabled for live, ended-bound, ended-unbound | pass | all entries `disabled` true, rgb(90,96,112), cursor default; a real pointer click on the first entry of each opened 0 dialogs; `trackMutationBodies` recorded 0 requests |
| REQ-10 | tiles | down | every strip-menu item disabled, all three kinds | pass | the same three strip cards: every entry `disabled` true, cursor default |
| §6.7 | focus/tiles | down | daemon-down shown loudly | pass | `role=alert` "musterd unreachable — …" visible in both views |
| REQ-1 | focus/tiles | data | menu inside the viewport | pass | every opened menu box inside vp 1280×720 (lowest: 30,548–220,712) |
| REQ-15 | focus | data | outside Select mode every rail card `draggable="true"` | pass | `[[1,true],[2,true],[3,true],[4,true]]` |
| REQ-15 | focus | data | Select mode, nothing selected: every card `draggable="false"` | pass | all four `"false"` |
| REQ-15 | focus | data | select A by a real click: only A `"true"`, settled across a tick | pass | `[[1,true],[2,false],[3,false],[4,false]]` at once and after 1.2 s |
| REQ-15 | focus | data | real press-and-drag on unselected B to bravo's header: no drag, nothing sent | pass | 0 `dragstart`, header got no `.drop-target`, 0 requests, bravo DOM `[3]`, "1 selected" kept |
| REQ-16/17 | focus | data | real drag of selected A to bravo's header moves the selection; mode and selection stay | pass | `dragstart` on card 1; header `.drop-target` during the drag; `PUT /api/sessions/group {ids:[1],groupId:2}`; bravo DOM `[3,1]` = oracle (1→2, 3→2); "1 selected", Select `aria-pressed` true |
| REQ-15 | focus | data | the predicate follows the selection after a move and a second pick, and resets on leaving Select | pass | after move `1` true, others false; select D (ungrouped): `1`,`4` true, `2`,`3` false (after 1.2 s); Select off: all four `"true"` |
| REQ-12–20 | tiles | data | strip cards never draggable | pass | strip cards 5 and 6: `draggable="false"` |
| REQ-12–20 | tiles | any | drag behaviour | N/A — Out of scope: no drag in the Tiles strip |
| REQ-27 | focus | data | hover text across the s/m boundary on the page clock | pass | 5m cache 61 s out: `cache warm · cold in 2m` → +1 s `cold in 1m` → +2 s `cold in 59s`; 59 s out: `59s`→`58s`→`57s`; 1h cache: `cold in 60m`, +52 min `cold in 8m` (cooling, `text-decoration-line: underline`) |
| REQ-26 | focus | none | no cache: plain timer, `cache unknown` | pass | started member: `data-cache="unknown"`, title `cache unknown`, rgb(166,171,188) = `--fg-dim` |
| REQ-24/27 | focus | data | past expiry: plain, `cache cold` | pass | the 59 s cache at +60 s: `data-cache="cold"`, title `cache cold`, rgb(166,171,188), no underline |
| REQ-29 | focus | data | header timer follows the latest-entered waiting member | pass | oracle `stateSince` id 2 19:12:09 > id 1 19:12:08; header `data-cache="cooling"` = card 2's, card 1 `warm` (see Note 2) |
| REQ-30 | focus | data | header hover counts warm members and the nearest expiry | pass | `3 of 3 warm · next cold in 59s` → `58s` → `57s`; +60 s `2 of 3 warm · next cold in 1s`; +52 min `1 of 3 warm · next cold in 8m`; the started (unknown) member is never counted |
| REQ-29 | focus | none | no waiting member, no extra timer | N/A here — unchanged code; cycle 1 measured `.gsum .gt` count 0 |
| REQ-31 | focus | data | popover row timers inside the popover, visible | pass | popover 8,152–228,298; four `[data-cache]` rows at x 184–215, y 202–290, visibility visible, opacity 1; states warm/unknown/warm/warm |
| REQ-27 | tiles | data | strip timer hover text | pass | `rb2-w-a` strip card `cache warm · cold in 60m`; `rb2-w-f` (no cache) `cache unknown` |
| REQ-28 | tiles | down | strip hover keeps counting from the last-known expiry with the daemon gone | pass | +30 s after the kill: `cold in 60m` (3570 s, which rounds up to 60m) |
| REQ-28 | focus | down | rail and header keep counting with no frames | pass | +30 s: 59 s cache `cooling`/`cold in 29s`, 61 s cache `cooling`/`cold in 31s`, header `3 of 3 warm · next cold in 29s`; +70 s: both `cache cold`, header `1 of 3 warm · next cold in 59m` |
| all | pop-out | any | — | N/A — `/doc.html` renders no session cards, menus or group headers |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** If you open a card menu while the daemon is down, it closes itself at the next reconnect attempt, with no input. I opened it untouched three times; it was gone after 2.07 s, 3.9 s and 8.0 s, and each close fell on the next `/ws` open (backoff 1/2/4/8 s). The cause is `app.on("status", () => menu.close())` (`web/src/features/railmenu.ts:50`). It runs on every non-connected status emission (`web/src/features/connection.ts:108`), not only on the transition away from connected. This is the codebase-wide pattern: groups menu, popover, confirm dialogs, settings, issue and update all subscribe the same way. So I'm not filing it as a card-menu defect. Fixing only the card menu would make it diverge from those siblings. REQ-10 still holds: every item is disabled whenever the menu is open. Whether the menus and dialogs opened while the daemon is down should survive reconnect retries is a cross-cutting question for the backlog. Separately, clicking a disabled entry closed the menu in some repeats and not in others. That variance is the same retry timing, not the click: the click sent 0 requests and opened 0 dialogs every time.
2. **[note]** `stateSince` has whole-second resolution. When two waiting members enter their states within the same second, the header timer's "latest-entered" pick falls to the tie-break. In my first warmth run, every hook post landed in one second and the header followed the first-driven member. With a 1.5 s gap it followed the later one, which is correct. A real user can't tell the difference, and this code did not change this cycle.
3. **[note]** The masthead's Focus/Tiles switch does not change the view while the daemon is down. The click lands, but the view preference goes through the daemon. That is pre-existing behaviour outside this plan. I mention it only because it is why I measured the focus-down and tiles-down cells from separate daemons.
4. **[note]** The status-line `prompt_cache.expires_at` is parsed as an integer (`strconv.ParseInt`, `internal/claudecode/status.go:179`). A fractional value leaves `cache` null, which shows as `unknown`. My first fixture posted `59.2` and got `unknown`. The measured wire shape is integer seconds, so this is no defect.
