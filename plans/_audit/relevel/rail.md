# E2E re-levelling — rail (2026-10-20)

The rail feature's seven E2E files classified and moved, per `../test-audit-2026-10-20-relevel.md`
§ Method. Counts below are tests as Playwright runs them (`for`-loops expanded); the file
headings count declarations. Three facts decided most borderlines: the dashboard adopts
`railSort`, `railDensity`, `railActivity` and `view` only from the daemon's broadcast
(`web/src/features/rail.ts`, `views.ts`), so a test that switches one by click is a journey only
where the *round-trip* is the point; a drag or key that would have sent nothing is a property once
the request log proves nothing was sent; and the right-click menu, context menu, focus and card
click are all client-side.

Every property moved keeps its title, its computed-property checks, its widths and its host views.
The DOM locators, the request log, the menu locators, the card-row locators, the density control,
the context row and the drag helper moved to `web/render/helpers/rail.ts`; the Settings-dialog
locators to `web/render/helpers/theme.ts`. The E2E helpers `railorder.ts`, `railcards.ts`,
`rail-menu.ts`, `gauges.ts` and `theme.ts` re-export them, so a locator is written once for both
tiers. One render spec `web/render/rail.spec.ts` carries all four source files' sections (39 tests).

## `rail-order.spec.ts` — 22 tests → 16 E2E, 6 render, 0 vitest

| Test | Criteria | Level | Reason |
|---|---|---|---|
| three launched sessions appear in the rail in creation order with Manual selected | E2 | journey | a launch |
| dragging the third card onto the first reorders the rail | E3 | journey | an order PUT, daemon oracle |
| a dragged order persists after a reload | E4 | journey | persistence |
| clicking Pin moves a card to the top of the pinned block | E5 | journey | a pin PUT adopted from the broadcast |
| pinning a second card places it below the first pinned card | E6 | journey | pin PUTs |
| unpinning the first pinned card places it after the remaining pinned card | E7 | journey | pin PUTs |
| dragging an unpinned card onto a pinned card pins it at that position | E8 | journey | order PUT |
| a state change in manual mode leaves the rail order unchanged | E9 | journey | a hook changes state |
| switching to Attention resorts unpinned cards by need… | E10, E11 | journey | prefs PUT + a hook |
| **rail cards are draggable in both sort modes** | — | **property** | the `draggable` attribute per sort — `shortcuts-rail`, `shortcuts-rail-attention` |
| the Attention selection persists after a reload | E12 | journey | prefs persistence |
| a second window sees a pin and a reorder without reloading | E13 | journey | second window, broadcast |
| **the Tiles strip order matches the rail order minus live tiles** | E14 | **property** | strip order for a snapshot — `rail-strip-order` |
| clicking Pin does not change the focused session | E15 | journey | pin PUT; focus unchanged across it |
| a Pin click while the daemon is down leaves the card unpinned… | E16 | journey | daemon down |
| pinning from the Tiles strip pins the session the same as the rail | REQ-13 | journey | pin PUT |
| **the pin button is hidden until hover/focus reveals it, but always visible once pinned** | REQ-8 | **property** | hover/focus reveal and the pinned-stays-visible rule — `shortcuts-rail-pinned` |
| **the rail sort select keeps focus and node identity across a render tick** | — | **property** | tick survival of a client-side control — `shortcuts-rail` |
| **Opt+Cmd+1 follows the manual rail order even when the needs-input session is not first** | — | **property** | the chord over a static arrangement — `shortcuts-rail` |
| Opt+Cmd+1 follows the rail order after a drag reorder | — | journey | the chord tracks a drag the daemon round-trips |
| Opt+Cmd+1 follows the rail order after a pin | — | journey | the chord tracks a pin the daemon round-trips |
| **Opt+Cmd+1 selects the pinned card in Attention mode, ahead of the neediest unpinned session** | — | **property** | the chord's pinned-block rule over a static arrangement — `rail-pinned-attention` |

## `rail-menu.spec.ts` — 18 tests → 10 E2E, 8 render, 0 vitest

| Test | Criteria | Level | Reason |
|---|---|---|---|
| **right-clicking a live rail card opens a menu at the pointer with Stop…, each group…, and the browser's own menu is cancelled** | REQ-1, REQ-2, E1 | **property** | the menu's items, its pointer position and the cancelled contextmenu — `groups-titled` |
| **right-clicking an ended resumable rail card offers Resume, Remove…, Move to, Pin/Unpin, no Stop…** | REQ-2, E2 | **property** | menu items for an ended and a pinned card — `rail-menu-cards` |
| **an ended session with no Claude session id has no Resume item at all…** | REQ-3 | **property** | the unbound card's menu — `rail-menu-cards` |
| **no rail card renders a Stop, Resume or Remove button, live or ended, at rest/hover/focus/current** | REQ-6, INV-3, E3 | **property** | the absent action buttons and the kept pin, every state — `rail-menu-cards` |
| **the same menu opens on Tiles strip cards, live and ended, and no strip card renders an action button** | REQ-1, REQ-6, INV-3, E4 | **property** | the strip card's menu and buttons — `rail-strip-menu` |
| Stop… opens the Stop confirm: cancelling sends nothing…, confirming ends only that session… | REQ-4, E5, INV-4 | journey | the Stop round-trip, tmux liveness |
| Remove… opens the Remove confirm: cancelling sends nothing…, confirming removes only that session | REQ-4, INV-4 | journey | the DELETE |
| Resume resumes the ended session at once… | REQ-4, INV-4 | journey | a resume |
| Move to a group, New group… and No group change the session's group… | REQ-5, INV-4 | journey | PUT group / POST groups |
| Pin and Unpin in the menu act as the card's pin control does… | REQ-5, INV-4 | journey | pin PUT |
| with the daemon down the card menu still opens, every item disabled… | REQ-10, E6 | journey | daemon down, restart |
| **Escape closes the card menu and returns focus to the card, and right-clicking a second card replaces the first menu** | REQ-8, E7 | **property** | client-side menu close/open and focus — `rail-menu-cards` |
| a click outside closes the card menu…, and choosing an item closes it | REQ-8 | journey | choosing Pin is a PUT, read back (borderline, below) |
| **right-clicking a card while the rail's ⋯ menu is open closes that menu and opens the card's** | REQ-8, edge 13 | **property** | two client-side menus — `groups-titled` |
| a session removed from another page while its menu is open closes the menu | REQ-11, E8 | journey | a second page's remove broadcast |
| Shift+F10 and the ContextMenu key open the focused card's menu… and the keys move it with Move to | REQ-9, E9, INV-4 | journey | the Move to is a PUT (borderline, below) |
| **the card keeps its node and focus through opening/closing its menu from the keyboard, and the open menu keeps its focused item across a render tick** | REQ-9, REQ-8 | **property** | tick survival, no API — `rail-menu-cards` |
| right-clicking a card in Select mode opens the same single-session menu and the selection stays | REQ-7 | journey | the menu's No group is a PUT, read back (borderline, below) |

## `rail-cards.spec.ts` — 14 tests → 6 E2E, 8 render, 0 vitest

| Test | Criteria | Level | Reason |
|---|---|---|---|
| **ended sessions sort after every live session, most recently ended first** | REQ-9 | **property** | the ended order for a snapshot — `rail-ended-order` |
| the mainhead's End button activates via keyboard Enter and Space | REQ-7, REQ-11, Major 5 | journey | ends the session through the dialog |
| **the mainhead's End button keeps focus and node identity across a render tick…** | Major 1, Major 2 | **property** | tick survival, cancels (no round-trip) — `rail-menu-cards` |
| **an ended card's Remove… menu item keeps focus and node identity across a render tick…** | Major 1, Major 5 | **property** | tick survival, cancels — `rail-menu-cards` |
| **an ended rail card has no action row and no action button at rest, on hover or with focus** | Minor 2/3 | **property** | the absent row, every state — `rail-menu-cards` |
| a focused card control survives a rail re-sort triggered by a real priority change | Minor 1 | journey | a hook drives the re-sort |
| **a Stop with one running shell shows '1 background task' on an idle card** | E5 | **property** | the background line for a snapshot — `rail-bg-tasks` |
| **a Stop listing two running tasks, one finished, counts only the running and pluralises** | E5 | **property** | same — `rail-bg-tasks` |
| a later Stop with an empty background_tasks list removes the line | E6 | journey | two hooks change the count over time |
| **an ended card shows no background line even though its last Stop listed a running task** | REQ-6, INV-C | **property** | the line's absence on a dead card — `rail-bg-tasks` |
| a live rail card has no End button, on hover and while current | E7, REQ-7, INV-D | journey | the absence holds across a `working` hook (borderline, below) |
| **a live strip card in Tiles has no End button** | E8, REQ-7, INV-D | **property** | the strip card's buttons — `tiles-five` |
| ending from the mainhead ends only that session, and its card's menu then offers Resume and Remove… | E9, REQ-7 | journey | a Stop round-trip |
| a status line that changes a card's context percent updates its context row in place | REQ-1, E1 | journey | the live status update is the point |

## `rail-layout.spec.ts` — 12 tests → 2 E2E, 10 render, 0 vitest

| Test | Criteria | Level | Reason |
|---|---|---|---|
| **the masthead's New session button opens the dialog from Focus and Tiles… and no other launcher exists** | E2, INV-3 | **property** | the one button per view — `empty`, `empty-tiles` |
| **an empty rail still shows the sort select and the density control with a zero count** | edge 22 | **property** | the empty state — `empty` |
| clicking Compact echoes to body[data-rail-density], persists across a reload, a second window and the daemon being down | E7 | journey | prefs PUT, reload, second window, daemon down |
| **a long title wraps in comfortable density and clamps to one line in compact, with title attributes** | E11, E13 | **property** | the layout per density — `rail-density*` |
| **in compact density a long title is truly ellipsized within the card, not overflowing it** | Major 1, REQ-4 | **property** | the ellipsis geometry — `rail-density-compact` |
| a card's Pin button keeps focus and node identity when a density button is clicked | E12, REQ-15 | journey | the density re-render is driven by the prefs round-trip |
| **a long activity line clamps to three lines in comfortable and runs past three in expanded** | E1, REQ-1 | **property** | the clamp per density — `rail-density*` |
| **card height is never greater in comfortable than in expanded…** | E2, INV-1 | **property** | the density ramp — `rail-density*` |
| **a compact card renders a visible context gauge track when context is known** | E3 | **property** | the gauge per density — `rail-density-compact` |
| **a compact card with unknown context renders the word and no gauge track** | E6 | **property** | the unknown branch — `rail-density-compact` |
| **a card with no activity text renders no activity line in compact or expanded, and compact drops a populated one** | E4 | **property** | the line per density — `rail-density*` |
| **the title renders above the state row on a rail card and on a Tiles strip card** | E5, INV-4 | **property** | the row order, both hosts — `rail-density`, `tiles-five` |

## `rail-unread.spec.ts` — 9 tests → 6 E2E, 3 render, 0 vitest

| Test | Criteria | Level | Reason |
|---|---|---|---|
| a Stop for an unwatched session sets its unread marker; a Stop for the watched one never does | E3, REQ-9 | journey | the watcher's answer at turn close |
| clicking an unread card clears the marker, and /api/state reports unread:false | E4 | journey | an attach + MarkSeen round-trip |
| a session watched only by a second window is not marked unread when its turn closes | edge 4 | journey | two windows, the watcher registry |
| attaching one session never clears a different session's unread marker | INV-2 | journey | an attach |
| a new prompt on an unread idle session clears its marker with no attach at all | edge 5 | journey | a hook clears it |
| **the attention-mode rail order is needs input, failed, unread idle, started, planning, working, then read idle** | E5, REQ-11 | **property** | the band order for a snapshot — `rail-attention-order` |
| **Opt+Cmd+0 focuses the unread idle session over a merely working one** | E6 | **property** | the chord's preference over a snapshot — `rail-unread-pair` |
| after a daemon restart with the tmux pane gone, an unread session reconciles to ended, keeps its marker, and sorts last | E10 | journey | restart + reconcile (borderline, below) |
| **a read idle title drops to --fg-muted while a working and an unread idle title both stay --fg** | REQ-9 | **property** | the title colour tokens for a snapshot — `rail-attention-order` |

## `rail-drag-groups.spec.ts` — 11 tests → 8 E2E, 3 render, 0 vitest

| Test | Criteria | Level | Reason |
|---|---|---|---|
| in attention order dragging a pinned card onto another group's header changes only its group… | REQ-12, REQ-13, INV-4, E10 | journey | a group PUT |
| in attention order a card dropped among another group's cards joins that group… | REQ-12, REQ-13 | journey | group PUTs |
| in manual order a drop among a section's cards sends one order request… | REQ-12, REQ-14 | journey | an order PUT |
| **in attention order a drop inside the card's own section… changes nothing and sends nothing** | REQ-13, E12 | **property** | a no-op drag the request log proves — `rail-groups-pinned-attention` |
| outside Select mode a drag carries only the dragged card… | REQ-17, INV-4 | journey | a group PUT |
| in Select mode a click selects, and dragging two selected cards onto a header moves both… | REQ-15, REQ-16, E11 | journey | a group PUT |
| in manual order a selection dropped among a section's cards lands contiguously… | REQ-16 | journey | an order PUT |
| **in {manual, attention} order an unselected card in Select mode is not draggable, and a drag that sends nothing leaves the selection** (×2) | REQ-15, REQ-18, E12 | **property** | the `draggable` attribute per selection and no-op drags — `groups-titled`, `groups-titled-attention` |
| in {manual, attention} order a drop onto a group deleted meanwhile shows the daemon's refusal… (×2) | REQ-20, E13 | journey | a held frame and a daemon refusal |

## `rail-activity.spec.ts` — 6 tests → 3 E2E, 3 render, 0 vitest

| Test | Criteria | Level | Reason |
|---|---|---|---|
| **Settings offers a Rail card shows fieldset with four radios… defaulting to Turn-aware** | REQ-13 | **property** | the fieldset for the default pref — `empty` |
| in Turn-aware mode a prompt-submit gives the card an on: line and the following Stop replaces it | E9 | journey | hooks drive the turn |
| choosing Your prompt in Settings turns an idle card's line into a you: line, and persists across a reload | E8 | journey | a prefs PUT adopted from the broadcast + reload |
| a synthetic background-completion prompt-submit leaves the card's on: line unchanged | E13 | journey | hooks |
| **Both mode shows only the sides that have data, and hides both when neither does** | edge 23, 24 | **property** | per-side show/hide for a snapshot — `rail-activity-both` |
| **Turn-aware mode on a failed session shows the last reply's claude: line, not an on: line** | edge 25 | **property** | the failed-turn last-reply rule for a snapshot — `rail-activity-failed` |

## Scenarios added

All in `internal/server/renderfix_scenarios_rail.go`, appended in `init`. Existing fixtures are
byte-identical (`make check-render-fixtures`: 52 scenarios up to date).

| Scenario | Holds | Used by |
|---|---|---|
| `rail-menu-cards` | one live bound card (`menu-live`), ended `menu-plain`, ended pinned `menu-pinned`, ended grouped `menu-group` (group `review`), ended unbound `menu-unbound` (no Claude id); manual | the menu's items per card kind, the no-button rule, the tick-survival dialogs, Escape/second-right-click |
| `rail-ended-order` | one live card, two ended a second apart; `railSort: attention` (`withPrefs`) | the ended-cards order |
| `rail-strip-order` | six idle sessions, the last pinned; Tiles | the strip order minus live tiles |
| `rail-strip-menu` | six idle sessions, the last ended; Tiles | the strip card's menu and buttons |
| `rail-pinned-attention` | `shortcuts-rail-pinned`'s state under `railSort: attention` | ⌥⌘1 selects the pinned card ahead of the neediest |
| `rail-bg-tasks` | one shell, two-running-one-finished, a running-then-ended card, and a card with none | the background-task line (count, plural, absence on a dead card) |
| `rail-density`, `-compact`, `-expanded` | a wrapping title, a three-line reply, a short and a long reply, a known and an unknown context; one per density (`withPrefs`) | every density-layout property, the compact gauge, the empty/populated activity line, the row order |
| `rail-unread-pair` | a working card and an unread idle one | ⌥⌘0 prefers the unread idle one |
| `rail-attention-order` | one session per attention band, launched in the reverse of the order; the read-idle one marked seen; `railSort: attention` | the band order, the read-idle title colour |
| `rail-groups-pinned-attention` | `groups-titled` with `alpha-one` pinned; `railSort: attention` | a no-op drag inside a card's own section |
| `rail-activity-both` | a card with no turn, one mid-turn, one with a closed turn; `railActivity: both` | Both mode's per-side show/hide |
| `rail-activity-failed` | a failed turn after a successful one | the failed-turn last-reply rule |

The rig gained `endedTitled`, `pin`, `stoppedWith`, `markSeen`, `promptWith` and the `sixTiles`
list; `claudecodetest.RawUserPromptSubmit` (with `PromptSubmitOpts`) was added so a scenario can
submit a prompt carrying its text and permission mode, which no existing builder did. `make
gen-render-fixtures` grew from 38 to 52 scenarios; a full generation measured ~49 s wall under a
load average of ~13.

## Deleted Tests

Every removed test below now lives in `web/render/rail.spec.ts` under the same title (verbatim),
except the activity and some rail-cards titles whose "Stop/prompt" wording stayed the same.

| File | Test | What it covered | Now lives in |
|---|---|---|---|
| `rail-order.spec.ts` | rail cards are draggable in both sort modes | `draggable` per sort | `rail.spec.ts`, same title |
| `rail-order.spec.ts` | the Tiles strip order matches the rail order minus live tiles (E14) | strip order for a snapshot | same title |
| `rail-order.spec.ts` | the pin button is hidden until hover/focus reveals it, but always visible once pinned (REQ-8) | hover/focus reveal, pinned-stays-visible | same title |
| `rail-order.spec.ts` | the rail sort select keeps focus and node identity across a render tick | tick survival | same title |
| `rail-order.spec.ts` | Opt+Cmd+1 follows the manual rail order even when the needs-input session is not first | chord over a static arrangement | same title |
| `rail-order.spec.ts` | Opt+Cmd+1 selects the pinned card in Attention mode, ahead of the neediest unpinned session | chord's pinned-block rule | same title |
| `rail-menu.spec.ts` | right-clicking a live rail card opens a menu at the pointer… (E1) | menu items, pointer position, cancelled contextmenu | same title |
| `rail-menu.spec.ts` | right-clicking an ended resumable rail card offers Resume, Remove…, Move to, Pin/Unpin, no Stop… (E2) | menu items for ended/pinned | same title |
| `rail-menu.spec.ts` | an ended session with no Claude session id has no Resume item at all… (REQ-3) | the unbound card's menu | same title |
| `rail-menu.spec.ts` | no rail card renders a Stop, Resume or Remove button… (REQ-6, INV-3, E3) | absent buttons, kept pin, every state | same title |
| `rail-menu.spec.ts` | the same menu opens on Tiles strip cards… (E4) | the strip card's menu and buttons | same title |
| `rail-menu.spec.ts` | Escape closes the card menu and returns focus… second card replaces the first menu (E7) | client-side menu close/open and focus | same title |
| `rail-menu.spec.ts` | right-clicking a card while the rail's ⋯ menu is open closes that menu and opens the card's (edge 13) | two client-side menus | same title |
| `rail-menu.spec.ts` | the card keeps its node and focus through opening/closing its menu from the keyboard… (REQ-9, REQ-8) | tick survival | same title |
| `rail-cards.spec.ts` | ended sessions sort after every live session, most recently ended first (REQ-9) | the ended order | same title |
| `rail-cards.spec.ts` | the mainhead's End button keeps focus and node identity across a render tick… (Major 1, 2) | tick survival | same title |
| `rail-cards.spec.ts` | an ended card's Remove… menu item keeps focus and node identity across a render tick… (Major 1, 5) | tick survival | same title |
| `rail-cards.spec.ts` | an ended rail card has no action row and no action button at rest, on hover or with focus (Minor 2/3) | absent row, every state | same title |
| `rail-cards.spec.ts` | a Stop with one running shell shows '1 background task' on an idle card (E5) | background line | same title |
| `rail-cards.spec.ts` | a Stop listing two running tasks, one already finished, counts only the running ones and pluralises (E5) | background line, plural | same title |
| `rail-cards.spec.ts` | an ended card shows no background line even though its last Stop listed a running task (INV-C) | the line's absence on a dead card | same title |
| `rail-cards.spec.ts` | a live strip card in Tiles has no End button (E8) | the strip card's buttons | same title |
| `rail-layout.spec.ts` | the masthead's New session button opens the dialog from Focus and Tiles… (E2) | one button per view | same title |
| `rail-layout.spec.ts` | an empty rail still shows the sort select and the density control with a zero count (edge 22) | the empty state | same title |
| `rail-layout.spec.ts` | a long title wraps in comfortable density and clamps to one line in compact… (E11, E13) | layout per density | same title |
| `rail-layout.spec.ts` | in compact density a long title is truly ellipsized within the card… | ellipsis geometry | same title |
| `rail-layout.spec.ts` | a long activity line clamps to three lines in comfortable and runs past three in expanded (E1) | clamp per density | same title |
| `rail-layout.spec.ts` | card height is never greater in comfortable than in expanded… (E2, INV-1) | the density ramp | same title |
| `rail-layout.spec.ts` | a compact card renders a visible context gauge track when context is known (E3) | the gauge per density | same title |
| `rail-layout.spec.ts` | a compact card with unknown context renders the word and no gauge track (E6) | the unknown branch | same title |
| `rail-layout.spec.ts` | a card with no activity text renders no activity line in compact or expanded… (E4) | the line per density | same title |
| `rail-layout.spec.ts` | the title renders above the state row on a rail card and on a Tiles strip card (E5) | the row order, both hosts | same title |
| `rail-unread.spec.ts` | the attention-mode rail order is needs input, failed, unread idle… then read idle (E5, REQ-11) | the band order | same title |
| `rail-unread.spec.ts` | Opt+Cmd+0 focuses the unread idle session over a merely working one (E6) | the chord's preference | same title |
| `rail-unread.spec.ts` | a read idle title drops to --fg-muted while a working and an unread idle title both stay --fg (REQ-9) | title colour tokens | same title |
| `rail-drag-groups.spec.ts` | in attention order a drop inside the card's own section… changes nothing and sends nothing (E12) | a no-op drag | same title |
| `rail-drag-groups.spec.ts` | in {manual, attention} order an unselected card in Select mode is not draggable… sends nothing (E12) ×2 | `draggable` per selection, no-op drags | same titles |
| `rail-activity.spec.ts` | Settings offers a Rail card shows fieldset with four radios… (REQ-13) | the fieldset | same title |
| `rail-activity.spec.ts` | Both mode shows only the sides that have data, and hides both when neither does (edge 23, 24) | per-side show/hide | same title |
| `rail-activity.spec.ts` | Turn-aware mode on a failed session shows the last reply's claude: line… (edge 25) | the failed-turn last-reply rule | same title |

## Borderline, left in place

- `rail-menu.spec.ts` "a click outside closes the card menu…, and choosing an item closes it": the
  outside-click close is display, but the test then clicks Pin (a PUT) and reads the session's
  pinned state. Kept whole.
- `rail-menu.spec.ts` "Shift+F10 and the ContextMenu key open the focused card's menu… and the keys
  move it with Move to": the keyboard menu-open is display, but the test chooses Move to (a PUT) and
  reads `sectionCardIds`. Kept whole.
- `rail-menu.spec.ts` "right-clicking a card in Select mode opens the same single-session menu and
  the selection stays": the menu is display; the test chooses No group (a PUT) and checks the
  selection survives it. Kept whole.
- `rail-cards.spec.ts` "a live rail card has no End button, on hover and while current" (E7): the
  no-button rule is a property the render tier covers over `rail-menu-cards`, but this test also
  asserts it holds after a `working` hook, which needs the live seam. Kept as a journey.
- `rail-cards.spec.ts` "a focused card control survives a rail re-sort triggered by a real priority
  change": the focus-survival is display-ish, but the re-sort is driven by a hook changing state.
  Kept.
- `rail-cards.spec.ts` "a status line that changes a card's context percent updates its context row
  in place": the in-place DOM identity is the point of the *live update* path, not a static render.
  Kept.
- `rail-unread.spec.ts` "after a daemon restart… an unread session reconciles to ended, keeps its
  marker, and sorts last" (E10): the "sorts last" ordering is an attention property, but the test is
  a restart-and-reconcile journey. Kept whole.
- `rail-order.spec.ts` "Opt+Cmd+1 follows the rail order after a drag reorder" and "after a pin":
  the chord's indexing is a property, but each asserts it tracks a mutation the daemon round-trips
  (a drag, a pin). The static-arrangement variants moved; these two stay.

## Notes

- No implementation bug found: every port passed against the current bundle.
- The menu closes on any `scroll` event (`web/src/render/menu.ts`'s `onViewportChange`), so three
  render tests that right-click or drag the last card of a tall fixture set the viewport to
  1280×1600 first, matching `web/e2e/rail-drag-groups.spec.ts`'s E11 precedent; without it
  Playwright scrolls the card into view and the scroll closes the menu the action just opened.
- The render tier has no live terminal, so "watched/unread" state cannot be constructed by a click:
  the unread render tests read it from fixtures (`rail-attention-order`'s read-idle card is
  `markSeen`-cleared in the rig, every other session is unwatched so a closing turn lands unread).
- Gate summary lines (whole-suite, this machine):
  - `make render-test` → `225 passed (2.2m)`
  - `make web-test` → `Test Files 99 passed (99)`, `Tests 2843 passed (2843)`
  - `make e2e SPECS='<the seven rail files>'` → `51 passed (23.9s)` (e2e-lint and render-lint clean)
  - `make check-render-fixtures` → `render fixtures up to date (52 scenarios)`
  - `make web-lint` → `Checked 364 files… No fixes applied.`; `make contrast` → `0 failures` ×3;
    `make check-versions` → `all fragments fresh`; `make check-kb` → `619 records, 0 problem(s)`
  - `make check`'s unit phase: all packages green except `internal/tmux`'s
    `TestRunCommand_DescendantHoldingStdoutDoesNotHang`, a 15 s descendant-timeout test that failed
    once under the full run's load and passed alone in 2.95 s — not touched by this batch.
