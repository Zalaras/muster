# Plan: sweep-2026-11-03-2

**Status**: completed
**Shape**: fix
**Work Type**: web
**E2E Scope**: new-specs
**Fixture plan**: effort-header.spec.ts daemon (launch opus at max, then post high, as `warnedSession`); rail-menu.spec.ts daemon (the existing per-test sessions and group)
**Render fixtures**: groups-titled-collapsed, groups-titled, rail-menu-cards
**Features**: focus, rail, groups, actions
**Touches**: theme
**Description**: A keyboard Dismiss of the effort warning puts focus in the session's terminal (or the header's ⋯); the group header caret is drawn as a 9×6 px triangle in a 20×20 button; the card menu reads read-toggle | Stop/Resume, Remove | Pin | Move to, with one Mark as read/unread item that toggles by state.

## Symptom

### e4 — Focus lands nowhere after a keyboard Dismiss of the effort warning

> - [ ] **Focus lands nowhere after a keyboard Dismiss of the effort warning** — pressing Dismiss
>   on the Focus header's effort-mismatch strip with the keyboard hides the strip and leaves focus
>   on the page itself. Focus should land somewhere sensible in the header. From `plans/effort/`.

No GitHub issue.

### e5 — Group arrow for minimise and maximise is too small to see

> - [ ] **Group arrow for minimise and maximise is too small to see** ([#113](https://github.com/Zalaras/muster/issues/113)) — The
>   group arrow used to minimise and maximise a group is too small to see. Expected: The group arrow
>   should be large enough to see clearly and use to minimise or maximise a group.
>   Filed 2026-10-26 from musterd 0.26.0 / Claude Code 2.1.293, focus view, session started.
>   Labels: bug, rail, ux.

### e6 — Adjust right click menu order

> - [ ] **Adjust right click menu order** ([#115](https://github.com/Zalaras/muster/issues/115)) — In
>   the right click menu, the Move To entry, including its No group option, sits above other items
>   instead of at the bottom. Expected: The Move To entry, including the No group option, should
>   appear at the bottom of the right click menu.
>   Filed 2026-11-02 from musterd 0.27.2 / Claude Code 2.1.293, focus view, session working.
>   Labels: enhancement, rail, ux.

## Findings

Full research: `plans/sweep-2026-11-03/research/<id>.md`, `## Answers` included.

**e4.** Reproduced with a scratch E2E spec (session set up as `effort-header.spec.ts`'s
`warnedSession`): after focusing Dismiss and pressing Enter, the strip goes and
`document.activeElement` is `BODY`. Cause: `web/src/features/focus.ts:166-171` wires Dismiss to
`deps.effort.dismiss(id)`, which sends the DELETE and leaves focus alone; the later `sessionUpsert`
(`effortWarning: null`) renders `renderMainhead` → `renderEffortStrip`
(`web/src/render/effortstrip.ts:21`) which sets `strip.hidden = true`, and Chrome drops the focused
button's focus to `<body>`. Precedent: the notes panel's `close()` (notes controller)
records `hadFocus`, then `surfaces.focusSelected(id)`, then falls back to a header control.
Developer's answer ("Your recommendation"): focus goes to the selected session's terminal
(`surfaces.focusSelected`), falling back to the header's Session actions `⋯` (`#mainhead .acts .more`)
when no terminal takes focus (Docs selected, ended session); only when the strip held focus as it
hides; a failed Dismiss leaves the strip shown and focus on the button.

**e5.** Measured in the render harness on `groups-titled-collapsed`: `.ghead .disc` is a 16×16
button drawing `▾` (U+25BE, fallback font) at 10px; its ink is 3×6 px collapsed and 6×4 px expanded.
Colour is fine (7.58:1); size is the problem. Cause: `web/src/style.css` `.ghead .disc`
(`font-size: 10px`, `::before { content: "▾" }`), copied from the groups mockup. Developer's answer
("A"): a CSS-drawn triangle (no font glyph) on `::before`, about 9 px wide × 6 px tall expanded and
6×9 rotated when collapsed, in `--fg-muted` with `--fg` on header hover, button 20×20. Row-click
fold behaviour unchanged; the group name stays non-folding (kb:adr/rail-group-name-click-does-not-fold).

**e6.** The existing render tests (`web/render/rail.spec.ts:269`, `:312`) pin today's order: Stop…/
Resume, Remove… | Move to (groups, New group…, No group) | Pin/Unpin | Mark as read, Mark as unread.
One builder (`cardEntries`, `web/src/features/railmenu.ts`) serves the rail card, the Tiles strip
card and the Focus header ⋯; `openSelection` serves a selected card in Select mode. The order is the
accepted kb:adr/rail-card-menu-offers-remove-and-marks-whatever-the-state (which also chose "two
fixed mark items always shown"). Developer's answer: "Unread, Read | Stop/Resume, Remove | Pin |
Move To", and make the read marks one item that toggles like Stop/Resume. Resolved: single-card menu
= [read toggle] | Stop… or Resume, Remove… | Pin/Unpin | Move to: groups, New group…, No group
(items absent for a state are omitted, e.g. no-Claude-id ended card: toggle | Remove… | Pin | Move
to). The toggle reads "Mark as read" when the session is unread, "Mark as unread" when it is read.
Selection menu: [toggle] | Stop… (any live), Remove… | Move to; its toggle reads "Mark as read"
when any selected session is unread, else "Mark as unread", and still sends one per-session request
per selected id. A new ADR supersedes the old one, restating everything else unchanged.

## Requirements

### Must Have
- **REQ-1**: With keyboard focus on the effort strip's Dismiss, a successful Dismiss (strip hides)
  leaves keyboard focus in the selected session's terminal; when no terminal takes focus (Docs
  selected, or an ended session) focus lands on the header's Session actions `⋯`, never on `body`.
  When the strip hides without having held focus, focus is not moved. A failed Dismiss (strip stays)
  leaves focus on Dismiss. (e4)
- **REQ-2**: A group section header's caret is drawn without a font glyph as a solid triangle whose
  ink is at least 8 px on its long side and at least 5 px on its short side (about 9×6 expanded,
  6×9 collapsed), pointing down when expanded and right when collapsed, inside a caret button at
  least 20×20; its colour is `--fg-muted`, `--fg` while the header is hovered; disabled stays
  `--disabled-fg`. Folding by the caret or the header's free space is unchanged. (e5)
- **REQ-3**: A single card's menu (rail card, Tiles strip card, Focus header `⋯`) lists, in order,
  separated into blocks: one read toggle | Stop… or Resume (whichever applies), Remove… | Pin or
  Unpin | Move to (header, groups in rail order, New group…, No group). (e6, #115)
- **REQ-4**: The read toggle is one item: "Mark as read" when the session is unread, "Mark as
  unread" when it is read; choosing it sends the matching request. The two fixed mark items are gone.
  (e6)
- **REQ-5**: The Select-mode selection menu lists the read toggle | Stop… (any live), Remove… | Move
  to. Its toggle reads "Mark as read" when any selected session is unread, otherwise "Mark as
  unread", and sends one per-session request per selected id. Everything else about the menus
  (enablement while disconnected or busy, Remove on live sessions, selection behaviour) is
  unchanged. (e6)

## Affected Files
### Web (web-impl)
- `web/src/features/focus.ts` — REQ-1: in `renderView`, record whether the effort strip contains
  `document.activeElement` before `renderMainhead`; once the frame has rendered (after the slot is
  mounted, every return path), if it did and the strip is now hidden, call
  `deps.getSurfaces().focusSelected(session.id)`; if focus is then `null`/`body` (or no session),
  focus `moreBtn`. Add `focusSelected(id: number): void` to the structural `getSurfaces()` type in
  `FocusDeps`. `main.ts` already passes the whole surfaces handle.
- `web/src/style.css` — REQ-2: `.ghead .disc` 20×20, colour `--fg-muted`, `.ghead:hover .disc`
  `--fg`; `.ghead .disc::before` a `currentColor` box clipped to a triangle (`clip-path`), about 9×6,
  rotated −90deg when collapsed (existing transition kept).
- `web/src/features/railmenuitems.ts` — REQ-4, REQ-5: `cardMenuItems` takes `unread` and yields one
  toggle item; `selectionMenuItems` takes `unread` and yields one toggle item by "any unread".
- `web/src/features/railmenu.ts` — REQ-3, REQ-5: `cardEntries` and `openSelection` assemble the new
  block order.
### Existing tests this breaks
- `web/render/rail.spec.ts`: the order arrays at `:284` and `:327` and the Unpin-before-marks check
  at `:351` (render-tests, Proof).
- `web/render/focus.spec.ts:774`: expects "Mark as unread" in the header ⋯ menu; holds only if the
  fixture session is read (render-tests checks and adjusts).
- `web/src/features/railmenuitems.test.ts`: the "offers Mark as read and Mark as unread" cases
  (web-tests rewrites to the toggle).
- `web/e2e/rail-menu.spec.ts`: full-order assertions (`:453`, `:472`), the keyboard ArrowDown walk
  (`:364`-`:415`), both marks enabled (`:300`), and the mark journeys (`:584`, `:642`) that click the
  item that is no longer shown for that state (e2e-specs).

## Proof

1. **e4 — e2e-specs**, `web/e2e/effort-header.spec.ts`, beside "Dismiss is reachable and activates
   from the keyboard (REQ-9)": "a keyboard Dismiss puts focus in the session's terminal": after
   `page.keyboard.press("Enter")` and `expect(effortStrip(page)).toHaveCount(0)`,
   `expect.poll(() => activeElementInsideTerminal(page, <title>)).toBe(true)` — red today (`BODY`).
   Second case: Docs selected (or the session stopped) before the keyboard Dismiss, then
   `#mainhead .acts .more` is focused — red today (`BODY`). (E1)
2. **e5 — render-tests**, `web/render/groups.spec.ts`, fixture `groups-titled-collapsed`: "a section
   header's caret is drawn large enough to see, collapsed and expanded (#113)": a small `inkBox`
   helper (screenshot the caret, bbox of pixels differing from its ground, in
   `web/render/helpers/style.ts`) gives a long side ≥ 8 and short side ≥ 5 for Alpha (collapsed) and
   Bravo (expanded) — red today (3×6, 6×4); the caret's bounding box ≥ 20×20 — red today (16×16);
   collapsed ink taller than wide, expanded wider than tall. (R1)
3. **e6 — render-tests**, `web/render/rail.spec.ts`: the live-card test (`:269`, renamed) expects
   `[<toggle>, "Stop…", "Remove…", "Pin", "Alpha", "Bravo", "New group…", "No group"]` where
   `<toggle>` follows the fixture session's `unread` — red today; the ended-card test (`:312`) the
   same shape with Resume; the pinned-card check becomes Unpin before the groups; a card whose
   session is unread shows "Mark as read" and not "Mark as unread" (and the reverse) if a fixture
   holds one. (R2) **web-tests**, `web/src/features/railmenuitems.test.ts`: `cardMenuItems` yields
   one mark item labelled by `unread`; `selectionMenuItems` yields "Mark as read" when any is unread,
   else "Mark as unread" — red today (two items). (W1) **e2e-specs** updates
   `web/e2e/rail-menu.spec.ts` for the new order and the toggle (E2).

## Edge Cases
1. The strip hides while Docs is the selected surface → E1 (Focus falls to `⋯`)
2. A failed Dismiss (strip stays) → untested: the existing E13/REQ-9 tests in `effort-header.spec.ts` already keep focus on Dismiss after a refused Dismiss; the fix moves focus only on hide
3. The strip hides (another window dismissed) while focus is elsewhere → untested: the rule reads `hadFocus` before the render; reviewer-verified
4. A collapsed caret still points right after the clip-path change → R1
5. A selection mixing unread and read sessions → W1 (toggle reads Mark as read)
6. An ended card with no Claude id → R2 — order is toggle | Remove… | Pin | Move to; the existing no-Resume test asserts `[0]` and is updated

## Acceptance Criteria

### Automated Checks
```checks
E1 make e2e SPECS='e2e/effort-header.spec.ts'
E2 make e2e SPECS='e2e/rail-menu.spec.ts'
R1 cd web && npm run -s render:lint && npx playwright test -c playwright.render.config.ts render/groups.spec.ts
R2 cd web && npm run -s render:lint && npx playwright test -c playwright.render.config.ts render/rail.spec.ts render/focus.spec.ts
R3 make render-test
W1 cd web && npx vitest run src/features/railmenuitems.test.ts
W2 make web-test
L1 make web-lint
```

### Render
- **R1**: fixture `groups-titled-collapsed` (Alpha collapsed, Bravo expanded).
- **R2**: fixtures `groups-titled` (live `alpha-one` in Alpha) and `rail-menu-cards` (ended plain,
  pinned and unbound cards).

### Reviewer-Verified
- The focus restore in `focus.ts` runs only when the strip held focus before the render and is
  hidden after it, and on every return path of `renderView`.
- The caret is drawn without a font glyph and the row's fold behaviour and markup are unchanged.

## Doc Delta
**focus** — becomes true: a Dismiss that hides the strip while it holds focus returns focus to the
selected terminal, or to the header's Session actions `⋯` when none shows
(`docs/features/focus/spec.md`, the "Dismiss clears both" sentence).
**rail** — becomes true: the card menu reads one Mark as read/unread toggle by the session's state,
then Stop… or Resume and Remove…, then Pin or Unpin, then Move to last; the selection menu reads the
toggle (Mark as read when any is unread), Stop…, Remove…, then Move to. Stops being true: "Move to,
Pin or Unpin, then Mark as read and Mark as unread, always" and the selection's "Move to and the
marks"; the citation moves to the new superseding ADR
(`docs/adr/rail-card-menu-read-toggle-first-move-to-last.md`, proposed on this branch, superseding
kb:adr/rail-card-menu-offers-remove-and-marks-whatever-the-state and restating its other decisions).
**groups / design system** — becomes true: `docs/design/design-system.md` § Section header names the
caret's size (20px button, about 9×6 px triangle).

## Out of scope
- The reader tree caret (the reader's file nav, `▸/▾` at `--fs-xs`) uses the same small glyphs; no issue covers it.
