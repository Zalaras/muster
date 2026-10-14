# E2E Test Specs: Rail card menu, drag into groups, and cache warmth

**Plan**: rail-card-organise
**Mode**: validate (attempt 1)
**Pack**: kb: pack 34857 words (budget 30000) — over the 30000-word budget, the generator warned; sections: rules 969 · features 6306 · touched 12115 · decisions 7004 · facts 4835 · lessons 3619
**Verdict**: pass
**Tests created**: 42 new (rail-menu 18, rail-drag-groups 11, cache-warmth 13) + 9 existing tests adapted to the plan's delta (see Deleted Tests)
**Live run**: 42/42 passing (the three plan files); full suite 840/840 passing; soak N=10 green on all nine changed spec files

Collection gate: `npx playwright test --list` from `web/`: `Total: 840 tests in 56 files`, no error. `sh scripts/e2e-lint.sh`: `e2e-lint: clean` (biome included); `npx tsc --noEmit`: clean.

## Tests

(Authoring note, superseded by the validate run in the Live run column:) All new-behaviour tests were `collection-only`: run once against the current tree to check the harness mechanics, they fail on the absent behaviour (no `data-cache`, no `role="menu"` on a card, `.acts-row` still in the template, selected cards `draggable="false"`) and on nothing in the spec itself. The one pin is marked.

### web/e2e/rail-menu.spec.ts (fixture: `daemon`)

| File | Test Name (short) | Requirement | What It Verifies | Live run |
|------|-------------------|-------------|------------------|----------|
| rail-menu.spec.ts | right-clicking a live rail card opens a menu at the pointer with Stop…, each group in rail order, New group…, No group and Pin | REQ-1, REQ-2, E1 | item labels and order against the daemon's group order; no Resume…/Remove…; ticks (`aria-current`); panel within 40 px of the pointer; the `contextmenu` event was `defaultPrevented` | ran-green 18/18; soak N=10: 180 passed |
| rail-menu.spec.ts | right-clicking an ended resumable rail card offers Resume…, Remove…, the Move to items and Pin or Unpin, and no Stop… | REQ-2, E2 | ended labels and order; No group ticked when ungrouped; `Unpin` on a pinned card | ran-green 18/18; soak N=10: 180 passed |
| rail-menu.spec.ts | an ended session with no Claude session id has no Resume… item at all | REQ-3 | `toHaveCount(0)` for Resume… (not disabled); the bound twin has it | ran-green 18/18; soak N=10: 180 passed |
| rail-menu.spec.ts | no rail card renders a Stop, Resume or Remove button … and the pin control stays | REQ-6, INV-3, E3 | no button named Stop/End/Resume/Remove and no `.acts-row` on a live, an ended and an ended-unbound card at rest, hover, focus, current, after a tick | ran-green 18/18; soak N=10: 180 passed |
| rail-menu.spec.ts | the same menu opens on Tiles strip cards, live and ended, and no strip card renders a Stop, Resume or Remove button | REQ-1, REQ-6, INV-3, E4 | two strip cards (one ended): no buttons, menus Stop… / Resume…+Remove… | ran-green 18/18; soak N=10: 180 passed |
| rail-menu.spec.ts | Stop… opens the Stop confirm: cancelling sends nothing …, confirming ends only that session … | REQ-4, E5, INV-4 | `Stop session?` dialog, no request on cancel, exactly one `POST …/end`, neighbour alive with its pane | ran-green 18/18; soak N=10: 180 passed |
| rail-menu.spec.ts | Remove… opens the Remove confirm … | REQ-4, INV-4 | `Remove session?` dialog, no request on cancel, exactly one `DELETE`, bystander kept | ran-green 18/18; soak N=10: 180 passed |
| rail-menu.spec.ts | Resume… resumes the ended session at once as the Focus header's Resume does, with no confirm dialog … | REQ-4, INV-4 | no `#end-dialog`/`#remove-dialog`, session alive, other ended session still ended | ran-green 18/18; soak N=10: 180 passed |
| rail-menu.spec.ts | Move to a group, New group… and No group change the session's group as the Focus header's control does … | REQ-5, INV-4 | one `PUT /api/sessions/group`, end-of-section order, New group dialog (cancel creates nothing, Create joins), bystanders' group and pin | ran-green 18/18; soak N=10: 180 passed |
| rail-menu.spec.ts | Pin and Unpin in the menu act as the card's pin control does … | REQ-5, INV-4 | `PUT …/pin` once, pin control `aria-pressed`/name flip, other session untouched | ran-green 18/18; soak N=10: 180 passed |
| rail-menu.spec.ts | with the daemon down the card menu still opens, every item disabled … after a restart enabled again | REQ-10, E6 | every `menuitem` `toBeDisabled()` on live and ended cards, a forced click sends nothing, items enabled after restart | ran-green 18/18; soak N=10: 180 passed |
| rail-menu.spec.ts | Escape closes the card menu and returns focus to the card, and right-clicking a second card replaces the first menu | REQ-8, E7 | `toBeFocused` on the card, one menu at a time | ran-green 18/18; soak N=10: 180 passed |
| rail-menu.spec.ts | a click outside closes the card menu … and choosing an item closes it | REQ-8 | outside click sends nothing; a choice closes | ran-green 18/18; soak N=10: 180 passed |
| rail-menu.spec.ts | right-clicking a card while the rail's ⋯ menu is open closes that menu and opens the card's | REQ-8, edge 13 | exactly one menu, the card's | ran-green 18/18; soak N=10: 180 passed |
| rail-menu.spec.ts | a session removed from another page while its menu is open closes the menu | REQ-11, E8 | second page removes the session, menu count 0, neighbour's menu still opens | ran-green 18/18; soak N=10: 180 passed |
| rail-menu.spec.ts | Shift+F10 and the ContextMenu key open the focused card's menu with its first item focused, and the keys alone move it … | REQ-9, E9, INV-4 | first item focused, menu beside the card, ArrowDown walk to a group and to No group, Enter, third session untouched | ran-green 18/18; soak N=10: 180 passed |
| rail-menu.spec.ts | the card keeps its node and focus through opening and closing its menu from the keyboard, and the open menu keeps its focused item across a render tick | REQ-9, REQ-8 | node tags on the card and the first item, > 1 s hold | ran-green 18/18; soak N=10: 180 passed |
| rail-menu.spec.ts | right-clicking a card in Select mode opens the same single-session menu and the selection stays as it was | REQ-7 | labels equal the plain menu, "2 selected" and checkboxes unchanged, a choice acts on that one session | ran-green 18/18; soak N=10: 180 passed |

### web/e2e/rail-drag-groups.spec.ts (fixture: `daemon`)

| File | Test Name (short) | Requirement | What It Verifies | Live run |
|------|-------------------|-------------|------------------|----------|
| rail-drag-groups.spec.ts | in attention order dragging a pinned card onto another group's header changes only its group … | REQ-12, REQ-13, INV-4, E10 | exactly one `PUT /api/sessions/group {ids:[p], groupId}`, pin kept, lands in the pinned block, bystanders' group and pin | ran-green 11/11; soak N=10: 110 passed |
| rail-drag-groups.spec.ts | in attention order a card dropped among another group's cards joins that group, and one dropped on or among Ungrouped's leaves its group … | REQ-12, REQ-13 | three group-only requests with exact bodies (`groupId: null` for Ungrouped) | ran-green 11/11; soak N=10: 110 passed |
| rail-drag-groups.spec.ts | in manual order a drop among a section's cards sends one order request … a drop on a header sends one group request … | REQ-12, REQ-14 | order body `{ids:[m2,m1,m3], pinnedCount:0, groupId}` for among-cards; header drop via the group endpoint as today | ran-green-at-authoring — `1 passed (2.9s)` |
| rail-drag-groups.spec.ts | in attention order a drop inside the card's own section … changes nothing and sends nothing | REQ-13, E12 | cards `draggable="true"`, three drops, no request, order and rows unchanged | ran-green 11/11; soak N=10: 110 passed |
| rail-drag-groups.spec.ts | outside Select mode a drag carries only the dragged card, even after a selection was made and left | REQ-17, INV-4 | order body lists only the section's cards and the dragged one | ran-green 11/11; soak N=10: 110 passed |
| rail-drag-groups.spec.ts | in Select mode a click on an unselected card selects it, and dragging one of two selected cards … moves both … | REQ-15, REQ-16, E11 | click toggles, `draggable` true iff selected, one group request with both ids (one ended, from two groups), mode and selection stay | ran-green 11/11; soak N=10: 110 passed |
| rail-drag-groups.spec.ts | in manual order a selection dropped among a section's cards lands contiguously … in the cards' current display order | REQ-16 | selected y then x, body ids `[x,y,t1,t2]`, one request | ran-green 11/11; soak N=10: 110 passed |
| rail-drag-groups.spec.ts | in manual order an unselected card in Select mode is not draggable, and a drag released where it started, outside the rail or by an unselected card sends nothing … | REQ-15, REQ-18, E12 | attributes, four no-op drags, no request, selection kept, Done restores | ran-green 11/11; soak N=10: 110 passed |
| rail-drag-groups.spec.ts | in attention order … (same title, attention) | REQ-15, REQ-18, E12 | as above in attention order | ran-green 11/11; soak N=10: 110 passed |
| rail-drag-groups.spec.ts | in manual order a drop onto a group deleted meanwhile shows the daemon's refusal in the action-error line … | REQ-20, E13 | stale header held by withholding the `groups` frame, the drop reached the daemon, `#action-error` visible and non-empty, rows unchanged | ran-green 11/11; soak N=10: 110 passed |
| rail-drag-groups.spec.ts | in attention order … (same title, attention) | REQ-20, E13 | as above in attention order | ran-green 11/11; soak N=10: 110 passed |

### web/e2e/cache-warmth.spec.ts (fixture: `daemon`)

| File | Test Name (short) | Requirement | What It Verifies | Live run |
|------|-------------------|-------------|------------------|----------|
| cache-warmth.spec.ts | an idle session's timer is tinted and hovers as warm, turns cooling … and plain cold past expiry | REQ-24, REQ-25, REQ-27, REQ-28, E14 | wire `cache` oracle, `data-cache`, `title`, computed tint against `--fg`/`--fg-dim`, `text-decoration-line`/`-style`, at 60m / 8m / cold, clock moved with no post | ran-green 13/13; soak N=10: 130 passed |
| cache-warmth.spec.ts | the tint is a straight line … an unknown or cold timer is that usual grey | REQ-24, REQ-26, REQ-28 | colour at f = 1, 0.5, 0.25 within 3 levels; unknown and cold equal `--fg-dim` | ran-green 13/13; soak N=10: 130 passed |
| cache-warmth.spec.ts | the underline starts at exactly 15% … a 5-minute lifetime at 45 s, and the hover counts whole minutes up … | REQ-25, REQ-27 | 46 s warm / 45 s cooling / 1 s / 0; 61 s → 2m, 60 s → 1m, 59 s → 59s | ran-green 13/13; soak N=10: 130 passed |
| cache-warmth.spec.ts | a session with no prompt_cache shows an unknown plain timer, a later post without one changes nothing, and /clear returns a warm session to unknown | REQ-21, REQ-22, REQ-26, E16 | wire null, kept on an absent post, cleared by SessionEnd+SessionStart `clear`, refilled by the next post | ran-green 13/13; soak N=10: 130 passed |
| cache-warmth.spec.ts | every state shows an unknown plain timer before a first reply and a tinted one once the cache is known, an ended card included | INV-2, REQ-24, REQ-26, E17 | seven states plus an ended one that never had a cache; ended `ended <age>` text tinted | ran-green 13/13; soak N=10: 130 passed |
| cache-warmth.spec.ts | a Tiles strip card's timer carries the same warmth as its rail card | REQ-24 | strip card `data-cache`, `title`, tint, then cold | ran-green 13/13; soak N=10: 130 passed |
| cache-warmth.spec.ts | the cache is kept by Stop and Resume, by liveness death and by a compaction … | REQ-22, INV-5 | wire `cache` equal before/after each, ended card tinted | ran-green 13/13; soak N=10: 130 passed |
| cache-warmth.spec.ts | a live session's warmth is the same after a daemon restart and after a dashboard reload … | REQ-22, REQ-32, E15 | kill, restart, reload; `data-cache`, `title`, tint, wire | ran-green 13/13; soak N=10: 130 passed |
| cache-warmth.spec.ts | a changed cache is broadcast as exactly one session upsert and an unchanged or absent one as none | REQ-21, REQ-23 | WS `sessionUpsert` frame counts across identical pair, changed expiry, absent block | ran-green 13/13; soak N=10: 130 passed |
| cache-warmth.spec.ts | the timer keeps fading from the last-known expiry while the daemon is down | REQ-28 | daemon killed, clock moved, cooling then cold | ran-green 13/13; soak N=10: 130 passed |
| cache-warmth.spec.ts | a group header shows one extra timer for the waiting member that entered its state last … | REQ-29, REQ-30, E18 | picked member by `stateSince` (ties avoided with `waitForNextClockSecond`), `1 of 2 warm · next cold in 30m`, working/ended excluded, collapsed, none for a working-only section | ran-green 13/13; soak N=10: 130 passed |
| cache-warmth.spec.ts | a header's hover reads every warm, all cold or unknown … | REQ-30 | `2 of 2 warm`, `all 2 cold`, `cache unknown`, then `1 of 2 warm` and cooling after the clock moves | ran-green 13/13; soak N=10: 130 passed |
| cache-warmth.spec.ts | the header popover shows a state timer beside every session's title … | REQ-31, E19 | per-row `data-cache`, tint, underline, no `title`, text equals the card's | ran-green 13/13; soak N=10: 130 passed |

### Existing tests adapted to the plan's delta (collection-only; each asserts the new truth)

| File | Test Name | Requirement | Live run |
|------|-----------|-------------|----------|
| web/e2e/rail-cards.spec.ts | an ended card's Remove… menu item keeps focus and node identity across a render tick and activates via keyboard Enter and Space | REQ-7, REQ-11, Major 1, Major 5 (plan REQ-6, REQ-9) | ran-green; soak N=10 (file): 130 passed |
| web/e2e/rail-cards.spec.ts | an ended rail card has no action row and no action button at rest, on hover or with focus | REQ-7, REQ-11, Minor 2/3 (plan REQ-6) | ran-green; soak N=10 (file): 130 passed |
| web/e2e/rail-cards.spec.ts | ending from the mainhead ends only that session, and its card's menu then offers Resume… and Remove… in that order | E9, REQ-7 (plan REQ-2) | ran-green; soak N=10 (file): 130 passed |
| web/e2e/terminal.spec.ts | choosing Resume… or Remove… from an ended card's menu never selects the session or moves focus into a terminal | REQ-5, INV-3 (plan REQ-4) | ran-green; soak N=10 (file): 200 passed |
| web/e2e/terminal.spec.ts | clicking an ended session's card shows the dead surface … (E5, REQ-6) | unchanged assertions; its ended signal is now the card's `ended` class, not the Resume button | ran-green; soak N=10 (file): 200 passed |
| web/e2e/focus-marker.spec.ts | .card.current renders on --bg-hover with an --edge ring without hovering, and carries no action row | REQ-2 (plan REQ-6) | ran-green; soak N=10 (file): 70 passed |
| web/e2e/rail-order.spec.ts | rail cards are draggable in both sort modes; the Attention step of "switching to Attention resorts …" asserts `draggable="true"` | plan REQ-12 | ran-green; soak N=10 (file): 220 passed |
| web/e2e/groups.spec.ts | cards and headers are both draggable in attention sort | REQ-25, E10 (plan REQ-12, REQ-19) | ran-green; soak N=10 (file): 460 passed |
| web/e2e/groups-select.spec.ts | in manual sort a selected card in select mode is draggable and an unselected one is not … | REQ-12, REQ-24, E12 (plan REQ-15) | ran-green; soak N=10 (file): 220 passed |

## Deleted Tests

None deleted. Nine existing tests were rewritten or retitled because the approved delta contradicts their old expectation; nothing outside the delta was touched.

| Old test | What changed | Why |
|----------|--------------|-----|
| rail-cards.spec.ts "an ended card's Remove button keeps focus and node identity …" | the control is now the menu's `Remove…` item reached with Shift+F10 / ContextMenu; the focus-tag, tick hold, Enter and Space steps are all kept | plan REQ-6: no Remove button on a card |
| rail-cards.spec.ts "an ended rail card's action row sits at opacity 0 until hover or focus-within reveals it" | **the opacity-reveal assertions are replaced by absence assertions** (`.acts-row` count 0, no action button at rest, hover, focus); the setup (another card current, pointer away) is kept | plan REQ-6 removes the row, so there is nothing to reveal. This one is a deliberate strength change forced by the delta; the orchestrator and reviewer may veto if they want the reveal pinned somewhere else (the dead-surface `.endcap .acts-row` in actions.spec.ts:230 and tiles.spec.ts:130 are a different surface and are untouched) |
| rail-cards.spec.ts E9 | `.acts-row button` text check becomes the menu's first two items | plan REQ-2 |
| terminal.spec.ts "clicking Resume or Remove on an ended card never selects …" | Remove/Resume buttons become menu items; both steps and both focus assertions kept | plan REQ-6 |
| terminal.spec.ts E5 | the "card is ended" wait was `getByRole("button", {name: "Resume"})`; now `toHaveClass(/ended/)` | plan REQ-6 |
| focus-marker.spec.ts `.card.current … acts-row visible` | the opacity-1 row check becomes "no row, no action button" | plan REQ-6 |
| rail-order.spec.ts (two places), groups.spec.ts "cards are not draggable in attention sort" | `draggable="false"` in attention order becomes `"true"` | plan REQ-12, kb:adr/rail-cards-drag-in-both-sort-modes-selection-together |
| groups-select.spec.ts "in manual sort a card in select mode has draggable false …" | selected card is `draggable="true"`, unselected `"false"`; the old "selected u1 dragged onto Sink moves nothing" assertion is dropped because that drag now moves it (covered by rail-drag-groups.spec.ts E11) and replaced by "an unselected card dragged onto a header or a card moves nothing" with the group of both cards checked | plan REQ-15 |

## Fixture Changes

New helper modules (additive; no change to `playwright.config.ts`, `fixtures.ts`, `gatelock.ts` or `e2e-lint.sh`):

- `web/e2e/helpers/rail-menu.ts` — `cardMenu`, `cardMenuItem`, `menuItemLabels`, `openCardMenu`, `trackContextMenuEvents`, `launchEndedSession`, `bindClaude`, `trackMutationBodies`, `stateSession`. No wire payloads of its own: sessions are launched through the real endpoint and bound with `envelopedSessionStart`.
- `web/e2e/helpers/cache-warmth.ts` — `promptCacheBlock`/`postStatus`: the `prompt_cache` block carries every key of kb:fact/prompt-cache-status-shape (`warm`, `ttl`, `expires_at` in Unix seconds, `caching_observed`, `requests`, `hit_ratio`, `cache_write_tokens`, `recache_tokens_if_cold`, `misses`, `miss_recache_tokens`, `expected_rebuilds`, `last_miss_at`, `last_miss_cause`, `miss_causes`); `ttl: "5m"` is kb:fact/haiku-main-cache-ttl-5m-on-2-1-299 (its post carries `version: "2.1.299"`, the `"1h"` ones `"2.1.296"`); added to the existing `envelopedStatusLineFull` body, so a post without the block is the measured "absent until a request" shape; every post is sent twice (kb:fact/status-posts-arrive-in-pairs). `useWarmthClock` fixes the page clock with `page.clock.setFixedTime` (deterministic: no wall-clock read; a temporary check showed the fixed time survives `page.reload()` and leaves the 1 s render tick on real timers). Colour oracles (`rgbOf` via a canvas pixel, so `color-mix`/`color()` serialisations all compare), `trackUpserts` (WS frames), `wireCache` (`GET /api/state`, throws when the `cache` key is missing).

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 | rail-menu: live card menu at the pointer (+ `defaultPrevented`); Tiles strip menus |
| REQ-2 | rail-menu: live card menu, ended resumable menu |
| REQ-3 | rail-menu: no Resume… without a Claude session id |
| REQ-4 | rail-menu: Stop…, Remove…, Resume… tests; terminal.spec adapted test |
| REQ-5 | rail-menu: Move to / New group… / No group, Pin / Unpin |
| REQ-6 | rail-menu: no action buttons (rail), Tiles strip; adapted rail-cards, focus-marker; existing E7/E8 in rail-cards.spec.ts stay |
| REQ-7 | rail-menu: Select mode menu |
| REQ-8 | rail-menu: Escape + replace, outside click + choice, rail ⋯ open, tick survival |
| REQ-9 | rail-menu: Shift+F10 / ContextMenu walk, node and tick survival; adapted rail-cards keyboard test |
| REQ-10 | rail-menu: daemon down |
| REQ-11 | rail-menu: removed from another page |
| REQ-12 | rail-drag-groups: attention header, among-cards and Ungrouped drops; manual among-cards and header drops; adapted draggable-in-both-sorts tests |
| REQ-13 | rail-drag-groups: attention pinned drop, group-only requests, own-section no-op |
| REQ-14 | rail-drag-groups: manual order body |
| REQ-15 | rail-drag-groups: Select-mode click, draggable attributes (both sorts) |
| REQ-16 | rail-drag-groups: attention selection drop (ended included), manual contiguous drop |
| REQ-17 | rail-drag-groups: outside Select mode carries one card |
| REQ-18 | rail-drag-groups: released on itself, outside the rail, unselected card (both sorts). "A section the filter hides" cannot be targeted, so it is not drivable |
| REQ-19 | existing groups.spec.ts "dragging a group header above another section …" (both sorts), unchanged (E20) |
| REQ-20 | rail-drag-groups: deleted group (both sorts) |
| REQ-21 | cache-warmth: /clear test (absent post keeps), upsert test, wire oracle in E14 |
| REQ-22 | cache-warmth: kept by Stop, Resume, death, compaction; cleared by /clear; restart |
| REQ-23 | cache-warmth: upsert count test |
| REQ-24 | cache-warmth: E14, straight line, every state, strip card, popover |
| REQ-25 | cache-warmth: E14, 15% boundary test |
| REQ-26 | cache-warmth: straight line, /clear, every state |
| REQ-27 | cache-warmth: E14, boundary test (minutes up, seconds) |
| REQ-28 | cache-warmth: E14 (clock moved, no post), daemon down |
| REQ-29 | cache-warmth: header test (pick, working/ended excluded, collapsed, none) |
| REQ-30 | cache-warmth: header test, hover test (all three texts) |
| REQ-31 | cache-warmth: popover test |
| REQ-32 | cache-warmth: restart + reload |
| REQ-33 | not an E2E criterion: the canary harness tier (daemon-tests) |
| INV-2 | cache-warmth: every-state test |
| INV-3 | rail-menu: no action buttons (rail and strip) |
| INV-4 | rail-menu: Stop / Remove / Move to / Pin / keyboard tests with bystanders; rail-drag-groups: bystander assertions |
| INV-5 | cache-warmth: kept-across test, /clear test |
| Acceptance E1-E20 | E1/E2 menu tests, E3 + E4 button tests, E5 Stop test, E6 daemon down, E7 Escape/replace, E8 other page, E9 keyboard, E10-E13 drag spec, E14-E19 cache-warmth, E20 existing groups.spec.ts |

## Repairs

Validate attempt 1. web-impl's smoke run named seven suspected spec defects; each was re-measured (8 reds reproduced identically on the first run: `8 failed, 34 passed (1.7m)`) and all seven were spec defects. The plan pins none of the markup involved.

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | rail-menu: Escape closes the card menu ... right-clicking a second card replaces the first menu (REQ-8, E7) | `locator.click: Test timeout of 60000ms exceeded` — `<button class="mi"> from <div role="menu" aria-label="Actions for menu-e12-live"> subtree intercepts pointer events` | The menu opens at the pointer and covers the next card's centre, where the default click lands | Open the first menu at `{x: 8, y: 8}`, read the menu and ended-card boxes, right-click the ended card at an x just right of the open menu (asserted to lie inside the card) | REQ-8/E7: a second right-click replaces the menu (`toHaveCount(1)`, `Resume…` visible, `Stop…` count 0), Escape closes it and focus returns to the ended card. Nothing removed |
| 2 | rail-drag-groups: outside Select mode a drag carries only the dragged card ... (REQ-17, INV-4) | expected `PUT /api/sessions/order {ids:[c1,a1], pinnedCount:0, groupId}`; received `PUT /api/sessions/group {ids:[a1], groupId:2}` | The spec contradicted its own REQ-14 test and the orchestrator's decision (header drop in manual order stays on `/group`; kb:anchor/sessions.order with `groupId` is for a drop among cards) — handoff item 2 of the authoring log | Expect exactly one `PUT /api/sessions/group` with `ids: [a1.id]` and `groupId: charlie.id` | REQ-17/INV-4: exactly one request, carrying only the dragged card (the other selected-then-left card a2 stays in alpha: `sectionCardIds(alpha) == [a2]`, charlie `[c1, a1]`). The endpoint changed to the sanctioned one; the carried set is still pinned by the body |
| 3 | rail-drag-groups: in attention order a card dropped among another group's cards joins that group ... (REQ-12, REQ-13) | Ungrouped never became `[y, u]`: `dragstart` fired on `dz` while dragging `dy` | Four cards and three headers outgrow the 720 px viewport; the target below the fold makes Playwright scroll the rail after the mouse is down | `page.setViewportSize({ width: 1280, height: 1600 })` before `goto` | REQ-12/13: every request and membership assertion unchanged |
| 4 | rail-drag-groups: in manual / attention order an unselected card in Select mode is not draggable, and a drag released where it started ... (REQ-15, REQ-18, E12), both sorts | `#select-bar .cnt` read `Select sessions`, expected `1 selected` | `dragTo(u1, u1)` never moves, so it is the click REQ-15 makes toggle the selection | New `dragWithin` helper: press, move past the drag threshold inside the card, return, release; it polls a capture `dragstart` counter to 1, so the drag is shown to have started | REQ-15/18: no request, order and group rows unchanged, selection still `1 selected` and the card still checked. Proven red: with `event.preventDefault()` added to `dragreorder.ts`'s dragstart handler the drag degenerates to a click and both sort variants failed on `Expected: "1 selected" Received: "Select sessions"` (the sources were restored; `git status` shows only the three spec files) |
| 5 | cache-warmth: every state shows an unknown plain timer ... an ended card included (INV-2, REQ-24, REQ-26, E17) | strict mode violation: `railCard("state-ended")` matched `state-ended` and `state-ended-unknown` | `railCard` is a `hasText` substring match | Local `exactCard(page, title)`: session card with `getByLabel(/^title(, unread)?$/)` (a card's label is its title plus `, unread` — a first guess at `[aria-label=title]` failed once on an unread idle card, which is the 3rd run's reason) | INV-2/REQ-24/26/E17: every `data-cache`, `title`, fade and `ended <age>` assertion unchanged |
| 6 | cache-warmth: the header popover shows a state timer beside every session's title ... (REQ-31, E19) | `.pr [data-cache]` resolved two timers (strict mode) | `.pr` is the per-state block; the session line is `.pl` | `tip.locator(".pl").filter({ hasText: title }).locator("[data-cache]")` | REQ-31/E19: per-row `data-cache`, tint, underline, no `title`, text equal to the card's timer on both sides |
| 7 | cache-warmth: a Tiles strip card's timer carries the same warmth as its rail card (REQ-24) | `liveTile(titles[0])` not visible | The oldest card is the one the 2x2 Tiles view puts in the strip, so asserting it is a live tile was a wrong guess | Wait instead for `article.tile` count 4 and `#tiles-strip` card count 1 (stricter than the one-tile wait) | REQ-24: `data-cache`, `title`, fade at 2400/3600 and cold after the clock moves, all on the strip card |

No assertion was deleted, skipped, or weakened.

## E2E Implementation Bugs

None. Every red was a spec defect; no plan-pinned element or protocol shape was contradicted.

## Handoff

1. **Resume… has no confirm dialog in the spec.** REQ-4 says `Stop…`, `Resume…` and `Remove…` "open the same confirm dialogs the Focus header opens", but the Focus header's Resume opens none today (actions.spec.ts "No confirm dialog for Resume (User Flow 3)"; kb:spec/actions: the dead surface's Resume acts at once). `rail-menu.spec.ts` "Resume… resumes the ended session at once … with no confirm dialog" asserts parity with the header. If the plan means Resume… should confirm, the plan sentence and that test change together; flagged for the orchestrator.
2. **REQ-14 "as today" and the header drop.** Today a card dropped on a section's header in manual order goes through `PUT /api/sessions/group` (end of section, pin kept); only a drop among cards uses `PUT /api/sessions/order` with `groupId`. The pin test `rail-drag-groups.spec.ts` "in manual order a drop among a section's cards …" records exactly that (ran green). web-impl should keep header drops on the group endpoint in manual order; if the plan wanted both through the order endpoint, say so.
3. **Markup the specs lean on** (the plan names some of it, not all): `.timer` with `data-cache` and `title` on rail and strip cards; the header timer is found as `.gsum [data-cache]` (inside the header summary, `data-cache` on the timer element itself); popover row timers as `[data-cache]` inside the existing `.pr` row, with no `title`; `.acts-row` absent from the card template (REQ-6 names the class); card menu items are `role="menuitem"` buttons built by `render/menu.ts`, so `.mlabel` holds the label and ticks use `aria-current="true"` (as the existing Move to menu does); `New group…` from the card menu opens a dialog whose accessible name starts `New group` with a `Group name` textbox and `Create`/`Cancel` buttons (the plan says "the existing New group dialog"; the select bar's is `New group from <n> session(s)`).
4. **Synthetic combination.** INV-2's `started` row posts a `prompt_cache` to a session that has had no hook, which real Claude Code cannot produce (a request implies a prompt hook; kb:fact/prompt-cache-status-shape: absent until a request). The plan's INV-2 names `started` among the states that must show the tint, so the spec posts it; the other six states are reachable for real. No probe needed, the combination is the plan's.
5. **No `/interface-probe` needed.** Every field in the `prompt_cache` block traces to kb:fact/prompt-cache-status-shape; `ttl: "5m"` and the `2.1.299` version to kb:fact/haiku-main-cache-ttl-5m-on-2-1-299. `warm: true` is sent even for an expired cache because a flip to false is unmeasured (that fact says so) and the dashboard must read `expires_at`, never `warm`.
6. **Not testable end to end, left to unit tests (plan W5):** an action already in flight on the session disabling its menu items (edge 14), because the daemon's own broadcast replaces the menu's inputs before a held response could be observed.
7. **Pack over budget.** `kb pack --role e2e-specs` warned 34857 of 30000 words; the touched-feature sections (12115 words) dominate. Flagging for the next pack-scope tidy; it did not block authoring.
8. Validate attempt 1: no new request. Handoff item 2 is now confirmed by the build (`PUT /api/sessions/group` for a manual-order header drop); the plan's REQ-14 "as today" wording stays ambiguous for doc-reconcile. web-impl's doc-delta that a press released without moving is the Select-mode click (REQ-15) is borne out: `dragTo(card, card)` toggles, so the spec's "released where it started" is a real moved-and-returned drag.
9. No change needed in `playwright.config.ts`, `fixtures.ts`, `gatelock.ts` or `e2e-lint.sh`.

## Test Run Output (validate attempt 1)

```
$ make web-build build
$ npm run e2e -- e2e/rail-menu.spec.ts e2e/rail-drag-groups.spec.ts e2e/cache-warmth.spec.ts   (run 1, before repairs)
  8 failed, 34 passed (1.7m)
(run 2, after repairs)    1 failed, 41 passed (33.9s)   [cache-warmth exactCard label]
(run 3, cache-warmth)     13 passed (16.0s)
$ make e2e                840 passed (8.0m)
$ make e2e-soak N=10:     cache-warmth 130 passed (2.1m) | rail-menu 180 passed (1.8m) | rail-drag-groups 110 passed (1.2m)
                          focus-marker 70 passed | groups-select 220 passed | rail-order 220 passed
                          rail-cards 130 passed | terminal 200 passed | groups 460 passed
$ npx playwright test --list    Total: 840 tests in 56 files
$ sh scripts/e2e-lint.sh        e2e-lint: clean
```

Authoring-run output follows.

```
$ npx playwright test --list
Total: 840 tests in 56 files

$ sh scripts/e2e-lint.sh
e2e-lint: clean

Regression pin, after `make web-build build`:
$ npx playwright test e2e/rail-drag-groups.spec.ts -g "in manual order a drop among" --reporter=line
  1 passed (2.9s)

New-behaviour tests, one run of the three new files against the current tree (not a gate):
  41 failed, 1 passed — each red on an absent behaviour, e.g.
  expect(locator).toHaveAttribute: locator('.timer') ... unexpected value "null"   (data-cache)
  expect(locator).toBeVisible: getByRole('menu')                                   (card menu)
  expect(locator).toHaveCount(0): ... locator('.acts-row') unexpected value "1"    (REQ-6)
  expect(locator).toHaveAttribute("draggable","true") unexpected value "false"     (selected card)
  The 1 pass ("a drop inside the card's own section ... changes nothing") was vacuous because cards
  were undraggable in attention order; it now first asserts draggable="true", so it is red today.
```

## Notes

- Fixture plan honoured: rail-menu, rail-drag-groups and cache-warmth each take the per-test `daemon` fixture (they assert group/pin changes, rail order and kill or restart the daemon). No test uses `startScratchDaemon` or a hard-coded port.
- Warmth tests fix the page clock rather than reading the wall clock, so remaining times (and the 15%, 60 s and 0 boundaries) are exact; the hover text uses the plan's middle dot.
- Right-click, the ContextMenu key, Shift+F10, arrow keys, Enter, Space and `dragTo` are the interaction paths; `selectOption`, `check` and API calls are setup only.
- REQ-33 (canary harness assertion) is daemon-tests' and has no E2E.
