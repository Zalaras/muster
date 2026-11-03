# Web Implementation: sweep-2026-11-03-2

**Plan**: sweep-2026-11-03-2
**Mode**: initial
**Pack**: kb: pack 25511 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/features/railmenuitems.ts` | edited | REQ-4/5: `readToggle` yields one Mark as read/unread item by `unread` (card) or "any unread" (selection); two fixed items gone |
| `web/src/features/railmenu.ts` | edited | REQ-3/5: card menu = toggle \| Stop/Resume, Remove \| Pin \| Move to; selection menu = toggle \| Stop, Remove \| Move to |
| `web/src/features/focus.ts` | edited | REQ-1: `renderView` wraps the old body (`renderFrame`); records whether the strip held focus, and after the frame, if the strip is hidden, `focusSelected(id)` then falls back to `⋯`; `focusSelected` added to the structural `getSurfaces()` type |
| `web/src/style.css` | edited | REQ-2: `.ghead .disc` 20x20, `--fg-muted` (`--fg` on header hover, `--disabled-fg` disabled), `::before` a 9x6 `currentColor` box clipped to a triangle, rotated -90deg collapsed |

## Decisions

- REQ-1 to REQ-5 all implemented as planned; no deviation, no Testable UI Elements table (fix shape).
- design: the focus restore is a thin `renderView` wrapper over the unchanged render body, so every return path of the body is covered without touching each one. Precedent: notes `close()` (`deps.surfaces.focusSelected` then header fallback); `rg focusSelected web/src` shows launch/notes/rail already take `surfaces: { focusSelected }` structurally, focus.ts now does the same.
- design: focus is lost when `activeElement` is null, `body`, or still inside the (now hidden) strip, so Chrome's lazy focus fixup cannot hide the loss.
- design: `cardMenuItems`/`selectionMenuItems` take `unread` as an optional field (`Partial<Pick<Session,"unread">>`), missing treated as read, because the committed unit tests pass sessions without it. `marks` keeps its array shape (now length 1).
- `.ghead .disc` carries no `[hidden]` rule need: the caret is never hidden via the attribute.
- doc-delta: `design-system.md` § Section header should name the 20px caret button with a ~9x6 triangle (already in plan Doc Delta).

## Handoff

**Build status**: `npx tsc --noEmit`, `npm run build`, `npm run -s lint`, `make contrast` exit 0; vitest `railmenuitems.test.ts` 41 passed.
**E2E smoke**: NOT RUN. `make web-build build` succeeded, but `npx playwright test e2e/effort-header.spec.ts e2e/rail-menu.spec.ts e2e/actions.spec.ts e2e/rail-cards.spec.ts` hit `gatelock: busy after 4m0s` three times: pid 10622 (`gatelock run --exclusive --wait 45m -- gates.sh sweep-2026-11-03-1`, the neighbouring sweep's gates) held the gate. The orchestrator must run `make e2e SPECS=...` when the lock is free; the keyboard-Dismiss focus fix (REQ-1) is therefore not yet measured in a browser.
**Render run**: `render/groups.spec.ts render/rail.spec.ts render/focus.spec.ts`: 136 passed, 2 failed (below).
Sanctioned breakage (render tests; web-tests/render-tests must update, I may not edit them), both in `web/render/rail.spec.ts`:
- `:522` "the card keeps its node and focus through opening and closing its menu from the keyboard..." expects `Stop…` focused after Shift+F10; the first item is now the read toggle, so it must target the toggle.
- `:634` "an ended card's Remove… menu item keeps focus ... Enter and Space" presses ArrowDown once and expects `Remove…` focused; with the toggle first, Remove… is the third item (toggle, Resume or none, Remove…), so the walk count must change.
