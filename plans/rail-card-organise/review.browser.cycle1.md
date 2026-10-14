# Browser review: Rail card menu, drag into groups, and cache warmth

**Plan**: rail-card-organise
**Verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 13140 words (budget 30000)
**Rig**: `make web-build build` at 063587c0 (dirty: `orchestration-state.json` only) → `bin/musterd`, driven per test through `web/e2e/helpers/fixtures.ts` `daemon` (data dir `$TMPDIR/muster e2e-XXXX`, space-bearing; private `-tmux-socket` per run, killed at teardown), stub `claude` at `$TMPDIR/muster e2e-stub-cd75a542396fd84f`; headless Chromium, throwaway spec `web/e2e/zz-review-browser.spec.ts` (deleted; `git status --porcelain` shows nothing of mine).

Gates log read, not re-run: `17-e2e` 840 passed, `04-web-build` green, so the app I drove is the one that ships. The one red line, `11-kb-check` (two fact records' verified bound 2.1.300 > ceiling 2.1.296), is orchestrator-owned and has nothing visible in the app.

Hosts: **focus** = the Focus view's rail; **tiles** = the Tiles strip (the plan scopes strip cards to the menu and the timer; groups, headers, popovers and drag do not exist there, kb:spec/groups "the Tiles grid and strip ignore groups", Out of scope "Drag in the Tiles strip"); **pop-out** = `/doc.html`, which renders no session cards, headers or menus, so every pop-out cell is N/A for that reason and not repeated below. States: **none** = no data yet (empty rail, or `cache` null); **data**; **down** = scratch daemon SIGTERMed (`daemon.kill()`).

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 | focus | data | right-click opens the card menu, at the pointer, inside the viewport | pass | `role=menu` "Actions for rb-live-a", display block/visible/opacity 1; box 149,217–339,435 in vp 1280×720; the ended card's menu was clamped to bottom 712 ≤ 720−8 |
| REQ-1 | focus | data | menu at the viewport's bottom edge stays inside it | pass | vp 1000×480, right-click at y 476 on a card cut off at 480: menu 293,227–483,472 (clamped), menu is not a scroller (sh 243 = ch 243) |
| REQ-1 | tiles | data | strip card right-click opens the menu inside the viewport | pass | strip 0,605–1280,720; card 0,606–640,720; menu 319,548–509,712 |
| REQ-1 | focus/tiles | none | — | N/A — no card exists with no session; `nodata-empty`: 0 cards, 0 menus, 0 `.gt` |
| REQ-2 | focus | data | live: Stop… / groups in rail order / New group… / No group / Pin; tick on the current group | pass | items `Stop…, review(aria-current=true), docs, New group…, No group, Pin` |
| REQ-2 | focus | data | ended: Resume…, Remove…, Move to, Pin; no Stop… | pass | items `Resume…, Remove…, review, docs, New group…, No group(current), Pin` |
| REQ-2 | tiles | data | strip menu lists the same entries | pass | `Stop…, New group…, No group(current), Pin` (no groups exist in that test) |
| REQ-3 | focus | data | Resume… absent without a Claude id | N/A here — covered by `rail-menu.spec.ts` (green at gate); not re-measured, see Note 4 |
| REQ-4 | focus | data | Stop… opens the Stop confirm; Cancel sends nothing and the session stays alive | pass | dialog "Stop session? rb-live-c — …" box 420,262–860,458; after Cancel `/api/state` alive true |
| REQ-4 | focus | data | Remove… opens the Remove confirm; Cancel sends nothing | pass | dialog "Remove session? rb-mx-ended — …"; 0 mutations after Cancel |
| REQ-4 | focus | data | Resume… acts | pass (see Note 2) | one `POST /api/sessions/3/resume`, 0 dialogs; the Focus header's own control reads `Resume` and opens none either |
| REQ-4 | tiles | data | Stop… from the strip menu by keyboard opens the confirm | pass | Enter on the focused `Stop…` → 1 dialog "Stop session? rb-strip-0 …" |
| REQ-5 | focus | data | Move to → a group by keyboard moves only that session | pass | Shift+F10, ArrowDown to `docs`, Enter: `/api/state` rows `[1,2]`; bystanders `[2,null]`, `[3,null]` unchanged; focus back on the card |
| REQ-5 | focus | data | Pin by pointer acts as the pin control | pass | `/api/state` pinned true; card `.pin` aria-pressed "true"; next menu reads `Unpin` |
| REQ-6 / INV-3 | focus | data | no Stop/Resume/Remove button on a live or ended card, plain, hovered (settled 600 ms) or focused | pass | every card's only button is `Pin` (opacity 0 plain, 1 hovered) for live A, ended B, live C |
| REQ-6 / INV-3 | tiles | data | none on a strip card, live or ended, hovered | pass | live strip card and ended `rb-td-ended` strip card: only `Pin` |
| REQ-7 | focus | data | right-click in Select mode opens the single-session menu, selection unchanged | pass | `#select-bar .cnt` "1 selected" before and after; menu "Actions for rb-live-c" |
| REQ-8 | focus | data | Escape closes and returns focus to the card, held across a tick | pass | activeElement `ARTICLE[data-session-id=1]`, same marked node after 1.3 s |
| REQ-8 | focus | data | a second right-click replaces the menu | pass | one menu, label changed to "Actions for rb-live-c" |
| REQ-8 | focus | data | right-click while the header ⋯ menu is open replaces it | pass | header menu (Rename…Delete group…) → one menu "Actions for rb-live-c" |
| REQ-8 | focus | data | a click outside closes | pass | 0 menus after a click at 1260,700 |
| REQ-8 | tiles | data | Escape returns focus to the strip card | pass | activeElement `ARTICLE[data-session-id=1]` in the strip |
| REQ-9 | focus | data | Shift+F10 opens with the first item focused, focus held across a tick | pass | activeElement `menuitem "Stop…"`, same marked node after 1.3 s; menu 16,291 under card bottom 287 |
| REQ-9 | focus | data | the ContextMenu key opens it | pass | menu open, activeElement `menuitem "Stop…"` |
| REQ-9 | focus | data | Shift+F10 on a card cut off at the viewport bottom: menu inside the viewport | pass | vp 1000×480, card 341–480: menu 16,227–206,472 (clamped; see Note 1) |
| REQ-9 | tiles | data | Shift+F10 on a strip card, first item focused across a tick | pass | `menuitem "Stop…"` before and after 1.3 s; menu 16,548–206,712 |
| REQ-10 | focus | down | every item disabled; a menu open at the kill closes | pass | open menu closed when the daemon died (0 menus); reopened: 5/5 items `disabled`, colour rgb(90,96,112), cursor default; a forced click sent 0 requests |
| REQ-10 | tiles | down | every strip-menu item disabled | pass | `Stop…, New group…, No group, Pin` all `disabled` |
| §6.7 | focus/tiles | down | daemon-down shown loudly | pass | `role=alert` "musterd unreachable — hook output in open panes is Muster's absence, not session failure." display block/visible/opacity 1, box 0,46–1280,78 |
| REQ-11 | focus | data | a session removed while its menu is open closes the menu | pass | after `DELETE /api/sessions/{id}`: 0 menus, 0 cards for it |
| REQ-12/13 | focus | data | attention: a drop on another group's header joins it through one group request | pass | real mouse drag; `PUT /api/sessions/group {ids:[1],groupId:2}`; header got `.drop-target` during the drag; section bravo DOM `[1,3]` = oracle |
| REQ-13 | focus | data | attention: a drop inside the card's own section sends nothing, nothing moves while dragging | pass | bravo DOM `[1,3]` before, during dragover and after; 0 requests |
| REQ-14 | focus | data | manual: a drop among a section's cards sets group and position | pass | drop on C's upper half: `PUT /api/sessions/order {ids:[2,1,3],pinnedCount:0,groupId:1}`; alpha DOM `[2,1,3]` matches the oracle |
| REQ-15 | focus | data | Select mode: unselected `draggable="false"`, selected `"true"`; a real press-and-drag on an unselected card starts no drag | pass | attrs false → true after the click; manual mouse drag on unselected D: 0 `dragstart`, 0 requests (see Note 3) |
| REQ-16 | focus | data | a selection (one ended, from two groups) dropped on a header moves all of it; mode and selection stay | pass | `PUT /api/sessions/group {ids:[2,5],groupId:3}`; `/api/state` both in 3; "2 selected" after |
| REQ-17 | focus | data | outside Select mode a drag carries one card | pass | the REQ-12 drop listed `ids:[1]` only |
| REQ-18 | focus | data | a drag released outside the rail changes nothing | pass | drop at 800,400 in the main slot: 0 requests, 0 `.dragging` left |
| REQ-18/E12 | focus | down | a drag while the daemon is down sends nothing | pass | 0 requests; the card is not in the target section |
| REQ-19 | focus | data | headers reorder by drag in attention order | pass | `PUT /api/groups/order {order:[2,1,0]}`; `/api/state` positions swapped |
| REQ-20 | focus | data | a drop on a group deleted meanwhile shows the error and moves nothing | pass | `groups` frame withheld; `PUT /api/sessions/group` refused; `#action-error` "unknown group", not hidden, display block/visible, box 0,59–1280,91; `/api/state` groupId null; card not in the stale section |
| REQ-12–20 | tiles | any | — | N/A — Out of scope: no drag in the Tiles strip; strip cards measured `draggable` false by `render/tiles.ts` |
| REQ-24 | focus | data | warm timer tinted on the fg→fg-dim line (dark) | pass | covered by `cache-warmth.spec.ts` colour oracles (green at gate); my down-state reading: rgb(176,180,194) at warmth 14.9% between fg (232,230,225) and fg-dim (166,171,188) |
| REQ-24 / W8 | focus | data | Light theme: dark foreground fading to grey, not white on white | pass | Light: f=1 timer (28,30,38) = `--fg` (dist 0); f=0.5 (50,53,64) vs mix (50.5,53.5,65), dist 1; `--fg-dim` (73,77,92) on card bg (237,236,231) |
| REQ-24/25 | tiles | data | strip card timer tinted and underlined in the last 15% | pass | 30 s of 5m: `data-cache="cooling"`, title `cache warm · cold in 30s`, `text-decoration: underline dotted` |
| REQ-26 / INV-2 | focus | none | started session with no cache: plain timer, word on hover | pass | `data-cache="unknown"`, title `cache unknown`, colour (166,171,188) = `--fg-dim`; no `--warmth` |
| REQ-27 | focus/tiles | data | hover text formats | pass | `cold in 49s`→`45s` (real clock), `cold in 30s`, `cold in 9m`, `cold in 5m` read off the `title` |
| REQ-28 | focus | down | keeps fading on the tick with no messages, from the last-known expiry, on the real clock | pass | posted 49 s of 5m, killed the daemon: `warm`/`cold in 49s` → `cooling`/`cold in 45s`, underline dotted, `--warmth` 14.9% with no frame received |
| REQ-28 | tiles | down | strip timer keeps fading while down | pass | 48 s of 5m → `cooling`, `cache warm · cold in 45s` after the kill |
| REQ-29 | focus | data | header extra timer after the dots, inside the header, picks the latest-entered waiting member | pass | dots' right edges 154–223, `.gt` 232–263, `.gsum` 124–263 (sw 139 = cw 139, no overflow), ⋯ at 269–291, head 0–299; picked the failed member (latest `stateSince`): `cooling`, same text as its card |
| REQ-29 | focus | data | collapsed section keeps the timer | pass | collapsed head 0,114–299,148: `.gt` count 1, box 232,125–263,136 |
| REQ-29 | focus | none | no waiting member → no extra timer | pass | `.gsum .gt` count 0 with only a started member |
| REQ-30 | focus | data | hover counts known-warmth members | pass | `2 of 2 warm · next cold in 5m` (idle warm + failed cooling; needs_input unknown not counted) |
| REQ-31 | focus | data | popover timer beside every title, inside the popover | pass | popover 8,152–308,325 in vp 1100×800; four `.pl` rows: `.pt` 9–254, `.tt` 264–295, all visible/opacity 1; `data-cache` unknown/cooling(underline)/unknown/warm; no `title` |
| REQ-31 | focus | data | the popover opens from the keyboard too | pass | caret focused → `role=tooltip` visible |
| REQ-29–31 | tiles | any | — | N/A — the strip has no group headers (kb:spec/groups) |
| REQ-32 | focus | data | warmth the same after a daemon restart and a reload | pass | before: `cooling`, `cache warm · cold in 9m`, rgb(175,179,193); after `daemon.restart()` + `page.reload()`: identical |
| §7.1 | tiles | data | opening the strip menu adds no live client | pass | 4 `/ws/terminal/` sockets open for 4 tiles after the menu and the dialog |
| REQ-21–23, REQ-33 | — | — | daemon adoption, broadcast, canary | N/A — no display of their own; their visible effect is REQ-24–32 above (review-work owns them) |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** The card menu closes on any `scroll` (`web/src/render/menu.ts` `onViewportChange`, the pre-existing anchored-menu rule). In one run, Shift+F10 pressed within the same frame as Escape's return of focus to a card cut off at the viewport's foot was closed by the trailing `scroll:sessions` event. Three repeats with a frame between the two passed, and nobody types that fast, so I'm not asking for a change.
2. **[note]** `Resume…` carries an ellipsis but acts at once, with no dialog: one `POST …/resume`, 0 dialogs. The Focus header's own control reads `Resume`, without the ellipsis, and also opens no dialog. So the behaviour matches the Focus header as REQ-4 asks, but the label promises a dialog that never comes. The Testable UI Elements table fixes the label as `Resume…`, so dropping the ellipsis would be an orchestrator wording call, not a fix for an agent.
3. **[note]** `locator.dragTo` on an unselected card in Select mode started the drag on a selected neighbour 4/4 times (`dragstart` on card 2 while dragging card 4) and moved the selection. The cause is Playwright scrolling the rail after the mouse goes down. A real press at the same card, after `scrollIntoViewIfNeeded`, hit card 4 (`draggable="false"`) and fired no `dragstart` and no request. So the product is correct. Any spec that `dragTo`s a card the rail must scroll to has this hazard; it is the same one web-impl's spec defect 3 names.
4. **[note]** Not re-measured by me, but each is asserted by a spec that was green in this cycle's gate (`17-e2e`): REQ-3 (Resume… absent without a Claude id, `rail-menu.spec.ts`), the exact 15% underline boundaries (`cache-warmth.spec.ts`), `/clear` returning a session to unknown (E16), and the manual-order contiguous selection drop (REQ-16, `rail-drag-groups.spec.ts`).
5. **[note]** Unknown and cold warmth look the same, today's plain grey timer; only the hover tells them apart (`cache unknown` / `cache cold`). This is the plan's stated rule (REQ-26, the States table). It does not break §6: the plain timer is the timer's pre-feature look, not a "cold" claim, and the word is there on hover.
