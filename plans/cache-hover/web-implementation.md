# Web Implementation: cache-hover

**Plan**: cache-hover
**Mode**: initial
**Pack**: kb: pack 23462 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/render/cardtip.ts` | created | `createCardTip()` hover-panel controller: timer `mouseenter` opens a `role="tooltip"` panel after `POPOVER_DELAY_MS`; `refresh()` repositions it to the timer's current box and re-reads the timer's `aria-description`; closes on card `mouseleave`, card `pointerdown`, and in `refresh` when the timer has no layout (removed or hidden). REQ-1, REQ-2 |
| `web/src/render/sessions.ts` | modified | card timer writes `aria-description` instead of `title` (REQ-3); `CardOptions.cardTip` optional, `attach`ed once when a card is built |
| `web/src/render/tiles.ts` | modified | `StripOptions.cardTip` threaded into the strip's `CardListOptions` (REQ-1 on the strip) |
| `web/src/features/rail.ts` | modified | one controller per rail, passed in `cards`, `refresh()` after `railSections.render`, `close()` on `status` beside the group popover |
| `web/src/features/tiles.ts` | modified | one controller for the strip, same refresh/close wiring |
| `web/src/style.css` | modified | `.cardtip` shares `.pop`'s base block (ground, edge, shadow, font, `pointer-events: none`) and overrides width/padding/colour (REQ-4) |

## Decisions

- design: `render/cardtip.ts` takes `grouppopover.ts`'s shape (`createX()` controller, instance-only state, `attach` once per built element, panel appended to `document.body`, placed by `placeAnchored`, delay from the exported `POPOVER_DELAY_MS`). Precedent grep: `rg "opover|placeAnchored" web/src` found only the group popover and the menu; neither could host a single-line text panel without a PopoverModel, so the controller is separate and reuses its constant and placement. State owner: the controller instance (pending timer, panel, anchor); render passes only call `refresh`.
- design: the panel's text source is the timer's `aria-description`, written by `applyCardText` each tick, so the accessible description and the hover text cannot disagree and `refresh` needs no getter.
- design: close is keyed to the card's `mouseleave`, not the timer's, so a card sliding under a still pointer keeps the panel; the timer's `mouseleave` only cancels a pending open. A `mouseenter` on the timer already anchoring the open panel is ignored, so a re-enter does not close and reopen it.
- design: `CardOptions.cardTip` and `StripOptions.cardTip` are optional (like `selection?`), because `render/sessions.test.ts` and `render/tiles.test.ts` build options without it and their fake timers cannot host listeners; both real hosts pass one.
- design: `.cardtip` is its own class (not `.pop`) so group-popover selectors (`.pop .pl .tt…`) and any `.pop` locator never match it; it shares only the base declarations via a grouped selector.
- Placement is `placeAnchored` below the timer, flipping above only when it does not fit the viewport; in that near-bottom case it covers the card's title row (the plan's reviewer-verified "never covers the title" holds below the timer, not in the flip case).
- Not measured here: edge cases 2 and 3 (hovered card removed; rail scroll under a still pointer). Removal closes via `refresh` (no layout); a scroll is followed by the next render tick (<= 1 s).
- Plan Hints: none listed. No new runtime dependency.
- Size: no size warning on a touched file (`make size-warn` hits are all pre-existing files).
- doc-delta: the Doc Delta stands. `web/src/render/CLAUDE.md` "Owns" prose lists `grouppopover.ts`/`anchored.ts`; it could add `cardtip.ts` (not edited, per the no-docs rule).

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0; `npm run -s lint` clean; `make contrast` 0 failures; `npx vitest run` 2714 passed.
**E2E smoke**: `npx playwright test cache-warmth.spec.ts` — 14 passed (21.4s), including the new hover test and the nine `aria-description` rewrites (red at authoring).
None. No test files need changes. The Tiles strip hover is covered only by the shared builder and the strip `aria-description` assertion.

## Fix Attempt 1

**Failures addressed**: review cycle 1 Major (web-impl, review-browser): in the daemon-down state the card tip closed on every failed-reconnect `status` event and a pending open was cancelled, so it could not be kept open.
**Changes made**: removed `cardTip.close()` from the `status` handlers in `web/src/features/rail.ts` and `web/src/features/tiles.ts`. The panel's text is computed in the client from the timer's `aria-description` and `refresh()` (every render tick) already closes it when the anchor is removed or has no layout, so a status transition has nothing to correct. Sweep of every path that closes the tip: card `mouseleave`, card `pointerdown`, `refresh` on a removed/hidden anchor, and `mouseenter` on a different timer; the two `status` closes (rail, tiles) were the only ones tied to connection state, both removed. Group popover wiring left as is (out of scope); placement unchanged (developer chose option A).
**Decisions**: none new.
**Verification**: `npx tsc --noEmit`, `npm run build`, `npm run -s lint` exit 0; `make web-build build`; `npx playwright test cache-warmth.spec.ts` — 14 passed (18.5s). The reviewer's browser repro (0 tips over 6 s while down) was not re-run here; the regression spec the e2e agent adds covers it.
