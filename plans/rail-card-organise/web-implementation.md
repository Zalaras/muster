# Web Implementation: Rail card menu, drag into groups, and cache warmth

**Plan**: rail-card-organise
**Mode**: initial
**Pack**: kb: pack 37744 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/protocol/session.ts` | edited | `Session.cache: {expiresAt, ttlSeconds} \| null`, a required key (parse rejects a missing one, a non-positive or non-integer `ttlSeconds`, an unparseable `expiresAt`) |
| `web/src/sessions/cache.ts` | created | Pure warmth derivation: `cacheWarmth` (state, fraction, hover), `remainingText`, the waiting-member set, `latestEntered`, `groupWarmthHover` (REQ-24–28, 29, 30) |
| `web/src/sessions/card.ts` | edited | View-model loses `actions`, gains `warmth`; `cardTimerText` extracted so the card and the popover rows share the timer text |
| `web/src/sessions/sections.ts` | edited | `headerTimer(section, now)` (REQ-29/30); popover rows carry `{title, timer, warmth}` per session (REQ-31) |
| `web/src/sessions/railorder.ts` | edited | `moveCard` takes the set of carried cards; new `planDrop` returns the group-only or order request, or null (REQ-12–18) |
| `web/src/render/warmth.ts` | created | `applyWarmth`: `data-cache` and the `--warmth` custom property on a timer element |
| `web/src/render/menu.ts`, `anchored.ts` | edited | `open(opener, entries, {at, label})`: open at a point, name the panel, replace instead of toggle; `placeAtPoint`; a menu with no enabled item focuses the panel so Escape works |
| `web/src/render/sessions.ts` | edited | No `.acts-row`/`reconcileActsRow`; timer carries `data-cache`, `title`, tint; `contextmenu` and ContextMenu/Shift+F10 raise `onMenu`; `draggable` true when `options.draggable` or selected |
| `web/src/render/railsections.ts`, `grouppopover.ts` | edited | Header extra timer (`.gsum .gt`, present only while picked); popover `.pl` lines = title `.pt` + timer `.tt` |
| `web/src/render/tiles.ts`, `features/tiles.ts` | edited | Strip cards get `onMenu`; Tiles deps take `railMenu` |
| `web/src/features/railmenu.ts` | created | The one controller both views' cards ask for their menu; owns one `createMenu()` |
| `web/src/features/railmenuitems.ts` | created | Pure derivation of the menu's Stop/Resume/Remove and Pin items and their disabled state (REQ-2, REQ-3, REQ-10, W5) |
| `web/src/features/groups.ts` | edited | `moveToEntries` (the one Move to builder, now used by the header menu, the Focus control, the selection bar and the card menu), `moveSessions`, `reorderSection` (both settle into the action-error line, REQ-20) |
| `web/src/features/rail.ts` | edited | Drops go through `planDrop`; cards draggable in both sorts and, in select mode, when selected; drag carries the selection |
| `web/src/features/actions.ts` | edited | `inFlight(id)` tracks Stop, Resume, Remove (single and batch) awaiting the daemon |
| `web/src/main.ts` | edited | `initRailMenu` registered in one line; passed to tiles and rail |
| `web/index.html` | edited | `.acts-row` leaves `session-card-template` (the dead-surface rows stay) |
| `web/src/style.css` | edited | Card `.acts-row` rules go; `--warmth` tint and dotted underline; `.gt`; popover `.pl` |

## Decisions

- REQ coverage (web side): REQ-1–11 menu (railmenu, railmenuitems, menu.ts, sessions.ts); REQ-12–20 drag (railorder, rail.ts, groups.ts); REQ-24–32 warmth (cache.ts, card.ts, sections.ts, railsections, grouppopover, style.css). REQ-19 is unchanged code (header drag in `groups.ts`). REQ-21–23 are the daemon's; REQ-33 daemon-tests'. None deliberately skipped.
- Orchestrator calls followed: `Resume…` acts at once (no dialog), `Stop…`/`Remove…` confirm; in manual order a drop on a header or body stays `PUT /api/sessions/group`, only a drop among cards uses `PUT /api/sessions/order` with `groupId`.
- Testable UI Elements: every row honoured as written (labels `Stop…`, `Resume…`, `Remove…`, `No group`, `New group…`, `Pin`/`Unpin`; `role="menu"`, `role="menuitem"`, `aria-current="true"` ticks; `.timer` keeps `aria-label="time in state"`, gains `data-cache` and `title`). No row unimplementable.
- The card menu is named `Actions for <title>` (the plan hint: `menu.ts` would otherwise name it `Move to` from its header).
- The keyboard opens the menu at a point just under the card's top-left, not under the card as an opener, so the card gets no `aria-expanded`/`aria-haspopup`; both ways in go through one `at` path, and a second right-click replaces the menu. A pointerdown on the opener card counts as outside.
- `actions.inFlight`: the Focus header has no in-flight state (`rg -n "inFlight|in flight" web/src` finds only the update view), so the plan's W5 "or while an action on that session is in flight" needed it added; it is a `Set` in `actions.ts`, read when the menu opens (the menu is discarded on close, never touched by the tick).
- Tint: `color-mix(in oklab, var(--fg) var(--warmth), var(--fg-dim))` with `--warmth` the remaining share in percent; `--fg-dim` is every timer's usual colour (card, header, popover), so unknown and cold need no rule. No colour literal, no state colour; `make contrast`: `instrument/dark/light: 46 pairs, 0 failures`. The Light theme was not measured in a browser (only the dark default, by the straight-line spec).
- Boundaries: remaining time is `(expiresAt - now)` in seconds, the underline when `remaining * 100 <= ttl * 15`, hover minutes are `ceil(ceil(remaining) / 60)` from 60 s up, else whole seconds up. The page-clock specs cover 46 s / 45 s / 1 s / 0 and 61 / 60 / 59 s and passed.
- Select-mode drag: carried set is `selectedIds` iff `selecting` and the dragged card is in it, else the one card; a drop onto a carried card is nothing. A press released without moving is a click (REQ-15), so `dragTo(card, sameCard)` toggles it.
- Disconnected: `rail.ts`'s `drop` returns before planning when not connected; menu items are all disabled by `cardMenuItems`.
- Evidence (smoke, not a gate): see Handoff for the three plan spec files; the 8 reds are spec defects measured below. Other suites run unchanged against the new bundle: `64 passed` (rail-cards, rail-order, focus-marker, groups-select), `98 passed, 1 failed` then `groups.spec.ts` popover test fixed (below), `299 passed`, `336 passed` (the rest of the suite).
- design: `features/railmenu.ts` + `features/railmenuitems.ts` follow `groups.ts`/`groupsdialogs.ts` and `actions.ts`/`actionscopy.ts`: a controller with a structural `RailMenuDeps` and `init<Name>(app, deps)`, and the pure part beside it as `<owner><concern>.ts` (one caller, so `features/`, per `features/CLAUDE.md`). Precedent grep: `rg -n "contextmenu|ContextMenu" web/src --glob '!*.test.ts'` found nothing before this change; the menu is the one builder (`render/menu.ts`), not a second. It lives apart from `groups.ts` because both Focus and Tiles ask it and it owns no group state; it gets the Move to entries from `groups.ts` rather than copying them.
- design: `groups.ts` `openMoveMenuFor` is now `moveToEntries` + `menu.open`, so the header menu, Focus control, selection bar and card menu share one entry list (reuse before add; the plan hint). The entries carry `disabled: false` where they carried no key.
- design: `sessions/cache.ts` is `sessions/`'s pure shape (`card.ts` exemplar: derive functions, no DOM), used by `card.ts` (card timer) and `sections.ts` (header and popover), so it sits in `sessions/` not `features/`. `render/warmth.ts` is the one DOM writer of `data-cache`/`--warmth` for the three timer hosts. State touched by more than one render pass: the card's `data-cache`/`--warmth` are rewritten each pass from the view-model (nothing cached); the header `.gt` node is created when a waiting member exists and removed otherwise, text/title/warmth rewritten in place each pass (it is a read-only readout; no memo key to list); the popover is built on open and not ticked.
- design: `planDrop` in `sessions/railorder.ts` is the one place a drop becomes a request (group-only vs order), keeping DOM work in `dragreorder.ts` (unchanged) and `rail.ts` a thin caller; `moveCard` gained a default-valued `carried` set, so its existing 3-argument callers and tests are untouched, and the single-card path still runs through `insertAtDragTarget`.
- design: `render/dragreorder.ts` is unchanged: the carried ids are the caller's decision at drop time, so the module keeps no Session/selection knowledge (the plan's Affected Files listed it; not needed).
- Size warnings kept on purpose: `web/src/features/groups.ts` 512 lines (was 475) — `moveToEntries`/`moveSessions`/`reorderSection` use this module's `settle` and dialogs, so splitting them out would add a seam for three small functions. `web/src/sessions/card.ts` 498 after my edit (it was 499), no warning.
- deviation: none.
- doc-delta: `docs/design/design-system.md` §5 Rail card says the `current` card has "its action row shown unconditionally (same reveal as hover/focus-within)"; no card has an action row now. §5 Menu says the opener "carries `aria-haspopup="menu"` and `aria-expanded`" and the menu is "anchored below its opener": the card menu opens at a point, names itself `Actions for <title>`, and its card carries neither attribute.
- doc-delta: the plan's Doc Delta says a drag "released where it started changes nothing"; in Select mode a press released without moving is the click that toggles (REQ-15), so a drag that never leaves the card cannot be told from a click.
- doc-delta: the group popover now lists each session as a `.pl` line (title `.pt`, timer `.tt`), and the header summary's extra timer is `.gsum .gt`; `web/src/features/CLAUDE.md` lists `railmenu.ts`/`railmenuitems.ts` among its modules.

## Handoff

**Build status**: both fail on sanctioned test files only. `npx tsc --noEmit` reports 14 test files (all 153 vitest failures trace to them) and nothing under non-test sources; `npx vite build` exits 0 (the E2E bundle was built with it), `npm run -s lint` clean, `make contrast` 0 failures. The cause: `Session.cache` is a required key and `CardOptions`/`StripOptions` gained `onMenu`, `CardViewModel.actions` and `PopoverRowModel.titles` are gone, `popoverModel` takes `now`.

**E2E smoke**: `npx playwright test e2e/rail-menu.spec.ts e2e/rail-drag-groups.spec.ts e2e/cache-warmth.spec.ts` → `8 failed, 34 passed (1.7m)`; every one of the 8 is a spec-locator or spec-logic defect, each re-run with only the defect removed and passing (below). `groups.spec.ts` "hovering a header shows a tooltip …" failed once with `.pt` text `e9-need00:00`; fixed by making the timer a sibling of `.pt` (it now passes).

Sanctioned test breakage (web-tests; the reason in each):
- `web/src/sessions/testfixtures.ts` (`makeSession` needs `cache: null`) and the inline `Session` literals in `api/launch.test.ts`, `api/sessions.test.ts`, `ws.test.ts`, `features/actionscopy.test.ts`, `render/dead.test.ts`, `render/mainhead.test.ts`, `render/tiles.test.ts`, `render/sessions.test.ts`, `sessions/card.test.ts`, `sessions/live.test.ts`, `sessions/sort.test.ts`, `sessions/store.test.ts`: `cache` is required. Raw wire fixtures in `protocol/session.test.ts`, `protocol/messages.test.ts`, `api/*.test.ts`, `ws.test.ts` need the `cache` key (`parseSession` rejects a session without it).
- `sessions/card.test.ts:587,595`: `actions` is gone from the view-model.
- `render/sessions.test.ts`: the card fixture's `.acts-row`; `onMenu` in `CardListOptions`. `render/tiles.test.ts`: `onMenu` in `StripOptions`.
- `sessions/sections.test.ts:666,684,685,690`: `popoverModel(section, now)` and `sessions: {title, timer, warmth}[]` replaces `titles`.
- New unit tests to write: `sessions/cache.ts` (W1–W4), `features/railmenuitems.ts` (W5), `planDrop`/`moveCard` with a carried set (W6), `parseSession` `cache` cases, `headerTimer`.

Spec defects for validate mode (the implementation matches the plan and the orchestrator's calls; each was re-run with only the defect removed):
1. `rail-menu.spec.ts:593` (Escape / right-click a second card): the first menu, opened at the pointer in the middle of a card, covers the next card's centre, so `click({button: "right"})` on it never finds an unobstructed point (`<button class="mi" …> from <div role="menu" … aria-label="Actions for menu-e12-live"> subtree intercepts pointer events`). Right-click at a position outside the menu.
2. `rail-drag-groups.spec.ts:230` (REQ-17): expects a manual-order drop on `groupHead(charlie)` to send `PUT /api/sessions/order {ids:[c1,a1], pinnedCount:0, groupId}`; received `PUT /api/sessions/group {ids:[a1], groupId:2}`. It contradicts the test at `:145` (`a drop on a header sends one group request`, green) and the orchestrator's call.
3. `rail-drag-groups.spec.ts:93` (attention, E11): with four cards the target `du` sits below the 720 px viewport; Playwright scrolls the rail after the mouse is down, so `dragstart` fires on `dz` (logged: `dragstart card s-start 3 dz` while dragging `dy`). With `test.use({ viewport: { width: 1280, height: 1600 } })` the same test passes.
4. `rail-drag-groups.spec.ts:390` (both sorts): `dragTo(u1, u1)` moves nothing, so it is the click that REQ-15 makes toggle the selection (`#select-bar .cnt` reads `Select sessions` afterwards). A drag that returns to its own card needs real movement.
5. `cache-warmth.spec.ts:264` (E17): `railCard(page, "state-ended")` is `hasText`, so it matches `state-ended` and `state-ended-unknown` (strict mode violation on two elements). With an exact-title card locator the whole test passes.
6. `cache-warmth.spec.ts:714` (E19): `.pr` is the per-state block, so `tip.locator(".pr").filter({hasText: "pop-warm"}).locator("[data-cache]")` resolves to both idle sessions' timers. Scoped to the session line (`.pl`) it passes.
7. `cache-warmth.spec.ts:353` (strip): `liveTile(page, titles[0])` is not visible because the five idle sessions' oldest, `strip-warm-0`, is the one the 2×2 Tiles view puts in the strip. With only that wait removed the strip assertions (`data-cache`, `title`, fade, cold) pass.

## Fix Attempt 1 (review cycle 1)

**Failures addressed**: maintainability Major 1 (`cardMenuItems` re-derived the enable rule and action vocabulary), Minor 2 (`remainingText` outside `format.ts`), Minor 3 (draggability decided in two places).

**Changes made**:

| File | What |
|------|------|
| `web/src/features/railmenuitems.ts` | Stop/Resume choice comes from `stopResumeButton`; each entry's `action` is `ACTION_BY_LABEL[label]` (type `SessionAction`); `disabled` is `state.busy \|\| !actionEnabled(label, claudeSessionId, connected)`. Remove goes through the same `entry`. Pin and Move keep `!connected \|\| busy` (they have no `CardAction` label). |
| `web/src/sessions/format.ts` | gains `remainingSeconds(untilIso, now)` and `remainingText(seconds)` beside `elapsedSeconds`/`formatAge`. |
| `web/src/sessions/cache.ts` | imports both from `format.ts`; local copies deleted. |
| `web/src/sessions/cache.test.ts` | import repoint only (`remainingText` now from `./format`). |
| `web/src/render/sessions.ts` | `CardOptions.draggable` is `(id: number) => boolean`; render writes `options.draggable(session.id)` and no longer ORs in `isSelected`. |
| `web/src/features/rail.ts` | the controller owns the answer: `draggable: (id) => !selecting \|\| selectedIds.has(id)`, with `selectedIds` read once per pass and shared with `railSections.render`. |
| `web/src/render/tiles.ts` | strip passes `draggable: () => false`. |

**Blast radius** (every consumer re-checked): `CardOptions.draggable` writers are `features/rail.ts` and `render/tiles.ts` only (`rg -n "draggable:" web/src`), reader is `render/sessions.ts:229`; `remainingText`/`remainingSeconds` callers are `cache.ts` only; `cardMenuItems` caller is `features/railmenu.ts` only (signature unchanged).

**Evidence**: `npx playwright test e2e/rail-drag-groups.spec.ts e2e/groups-select.spec.ts e2e/rail-menu.spec.ts e2e/cache-warmth.spec.ts` → `64 passed (42.9s)` against `make build` output; this covers the card `draggable` attribute in select mode (selected true, unselected false, all true on leaving), the menu's enabled/disabled items with the daemon down, and the warmth hovers. `npx vitest run` fails only in `src/render/sessions.test.ts` (36 tests), see Handoff.

**Decisions**:
- design: `draggable` becomes a per-id predicate rather than a boolean plus a render-side override; precedent is `selection.onToggle`/`selectedIds` already travelling in `CardOptions` as controller-supplied values. Render applies the value it is handed.
- design: `remainingText` keeps its name when moved to `format.ts` (so `cache.test.ts` needs an import repoint only); it is the countdown sibling of `formatAge`.

## Handoff (fix 1)

**Build status**: `npx tsc --noEmit` fails on a sanctioned test file only: `web/src/render/sessions.test.ts` (3 type errors at lines 381, 1037, 1062); `vite build` and `make build` succeed. `npm run build` is therefore red until web-tests repairs it.
**Test files needing changes**: `web/src/render/sessions.test.ts`: `baseOptions` (`draggable: false` → `draggable: () => false`) and the `reconcileCards — draggable attribute` block (`draggable: true` → `() => true`; add a case where the predicate is true for one id only and the attribute follows per card). The select-mode "selected card stays draggable" behaviour in `render/sessions` is no longer the renderer's; tests that asserted it through `selection.selectedIds` alone need the predicate instead.
