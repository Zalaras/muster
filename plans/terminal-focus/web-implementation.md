# Web Implementation: terminal-focus

**Plan**: terminal-focus
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/terminal/pane.ts` | modified | Added `TerminalSurface.focus(): void` (REQ-3): no-op when disposed or `term` is null (dead session), otherwise delegates to `Terminal.focus()`. Never touches the socket. |
| `web/src/render/sessions.ts` | modified | Widened the card `onClick` callback type to `(id: number, source: "pointer" \| "keyboard") => void` throughout (`buildSessionCardElement`, `reconcileCards`, `renderSessions`). The card's `click` listener now passes `"pointer"`; the Enter/Space `keydown` branch passes `"keyboard"` (REQ-8). Updated the two doc comments describing `onClick`. |
| `web/src/main.ts` | modified | The rail callback inside `render()` now calls `surfaces.get(id)?.focus()` after `render()` returns, only when `source === "pointer"` (REQ-1, REQ-2, REQ-4, REQ-6). No other line in the file changed. |
| `docs/design/ux-flows.md` | modified | §3.1 Main bullet gains "...and puts the cursor in the pane." (REQ-9). |

## Decisions

- No deviations from the plan's implementation shape — `pane.ts`'s `focus()`, `sessions.ts`'s `source` discriminator, and `main.ts`'s three-line rail callback were implemented exactly as specified in "Implementation shape (for web-impl; no framework)".
- `render/tiles.ts` needed no change, confirmed: `renderStrip`'s `onPromote: (id: number) => void` still type-checks against the widened `reconcileCards` `onClick` parameter (`npx tsc --noEmit` exits 0 with no changes to `tiles.ts` — TS allows a function with fewer parameters to satisfy a type expecting more).
- W7's automated check (`git diff main -- web/src/main.ts | grep -c -E '^[-+].*(focusNth|addEventListener\("keydown")'`) initially failed at 1 because my first draft of the added comment used the literal word "focusNth" in prose (not code). Reworded to "the ⌘1-9 shortcut" — re-ran the exact check command, now 0. No behavioural change, comment wording only.
- All Testable UI Elements table rows were already-existing elements (rail card, terminal container, pin button, End button, rail sort select) — nothing new to name; all implemented as specified, no row flagged unimplementable.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0.
No test files needed changes — none of my edits invalidated an import path.

Automated checks re-verified locally:
- `W6 git diff --quiet main -- web/src/render/tiles.ts` → exit 0 (untouched).
- `W7 test "$(git diff main -- web/src/main.ts | grep -c -E '^[-+].*(focusNth|addEventListener\("keydown")')" -eq 0` → count is 0.
- `make web-test` → 22 files / 653 tests passed.
- `npm run build` → tsc + vite build succeed.
