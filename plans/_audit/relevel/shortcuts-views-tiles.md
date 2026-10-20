# Re-levelling batch: shortcuts, views, tiles

Render specs `web/render/shortcuts.spec.ts` (helper `helpers/shortcuts.ts`) and
`web/render/tiles.spec.ts` (helper `helpers/tiles.ts`); the tile and strip locators moved out
of `web/e2e/helpers/terminal.ts` into `web/render/helpers/surfaces.ts` (owned by surfaces),
which the E2E helper re-exports. Scenarios in `renderfix_scenarios_shortcuts.go` and
`renderfix_scenarios_tiles.go`. Written by the orchestrating session from the porting
agent's tree after the agent's session ended; counts are Playwright `--list` counts.

## `shortcuts.spec.ts` — 14 tests → 1 E2E, 13 render

Every chord is a real key press by its physical code (`KeyN`, `Digit0`–`Digit9`) and the
settled state is asserted after the clock advances. The view and the rail's sort are prefs
adopted only from the broadcast, so they come from the fixture.

| Test | Criteria | Level | Reason |
|---|---|---|---|
| pressing Opt+Cmd+N in Focus opens the launch dialog | E1 | **property** | dialog opens client-side — `shortcuts-rail` |
| pressing Opt+Cmd+N in Tiles opens the launch dialog | E2, INV-5 | **property** | `tiles-*` |
| pressing Opt+Cmd+N with the dialog already open leaves it open and keeps the Title field | E3, edge 2 | **property** | dialog state |
| pressing Opt+Cmd+1 in Focus focuses the rail's first displayed card, in manual and attention modes | E4 | **property** | `shortcuts-rail`, `shortcuts-rail-attention` |
| pressing Opt+Cmd+1 in Tiles promotes the rail's first displayed session into the grid | E5 | **property** | grid membership is per-window client state |
| pressing Opt+Cmd+0 focuses the longest-blocked needs-input session, ignoring a pinned session ahead of it in manual mode | E6, INV-4 | **property** | `shortcuts-rail-pinned` |
| pressing Opt+Cmd+0 in Tiles does not demote another tile when the neediest session is already live | edge 6 | **property** | `tiles-four` |
| pressing Opt+Cmd+0 with sessions present but none alive stays on the explicitly focused session… | edge 4 | **property** | `ended-pair` |
| pressing Opt+Cmd+0 with no sessions is a silent no-op | E7, edge 3 | **property** | `empty` |
| pressing Opt+Cmd+N with focus inside a session's terminal opens the dialog without leaking the keystroke to the terminal | E8, INV-3 | **property** | the terminal's socket is silent; the leak would show in the DOM |
| pressing Opt+Cmd+1 with focus inside the launch dialog's Title field does not insert a digit into it | INV-3 | **property** | dialog field |
| the Focus and Tiles empty placeholders name the new Opt+Cmd+N chord | E9 | **property** | `empty`, `empty-tiles` |
| the launch dialog heading names ⌥⌘N via its kbd chip, excluded from the accessible name | E10 | **property** | dialog markup |
| pressing Opt+Cmd+0 in Tiles promotes the neediest session into the grid | INV-5 | journey | the session becomes the neediest only after the grid filled, which only a hook can produce (Tiles membership is sticky) |

## `views.spec.ts` — 5 tests → 5 E2E, 0 render

| Test | Criteria | Level | Reason |
|---|---|---|---|
| the masthead switcher persists the chosen view across a reload | E5 | journey | pref PUT and reload |
| the chosen view survives a daemon restart | E6 | journey | restart |
| Cmd+\ toggles the view and Opt+Cmd+1 focuses the top-priority session regardless of launch order | E7 | journey | the toggle is a pref PUT whose broadcast is awaited |
| every accepted PUT /api/prefs re-broadcasts the full object to every other UI socket | INV-4 | journey | broadcast contract |
| GET /api/state's prefs snapshot carries the full prefs object before and after a density PUT | — | journey | API contract |

## `tiles.spec.ts` — 17 tests → 12 E2E, 5 render

| Test | Criteria | Level | Reason |
|---|---|---|---|
| a tile footer's End button survives a render tick and still opens the End dialog via a separate keyboard Enter | REQ-12, Major 1/2 | **property** | the dialog opens before any request — `tiles-four` |
| a focused tile-footer action button survives a drag-drop reorder | REQ-10, E6 | **property** | order is per-window client state (kb:adr/tiles-order-ephemeral-per-window) |
| dragging a tile's header onto an earlier tile reorders backward | E2 | **property** | DOM order after a drag |
| clicking a strip card at capacity places the promoted tile into the demoted tile's former index | E7, REQ-1 | **property** | `tiles-five` |
| a drag released over the strip leaves the tile order unchanged | E8 | **property** | DOM order |
| Tiles: End from a tile footer keeps the tile in its slot and leaves other tiles' geometry untouched | E11 | journey | End round-trip |
| Tiles: Removing a dead tile backfills its slot from the strip and broadcasts sessionRemoved | E12 | journey | Remove round-trip |
| a priority change updates a live tile's chrome but never moves it in the Tiles grid | REQ-2, E5 | journey | a hook changes the tile |
| switching density 2x2 to 3x2 promotes the next session by sort order into the grid | E8 | journey | density is a pref PUT |
| clicking a strip card promotes it and demotes exactly the lowest-priority live tile | E9 | journey | asserts tmux geometry too |
| a density change leaves a still-stripped session's tmux geometry untouched | E10, INV-3 | journey | tmux geometry |
| open terminal-socket count equals the live-surface count in Focus, Tiles, and after a promotion | E11, INV-2 | journey | socket count against a live daemon |
| a live tile stays typable across the 1s render tick | REQ-8 | journey | PTY input |
| killing one of several live tiles ends only that tile without misrouting keystrokes into another | REQ-2/4/13 | journey | kill, PTY |
| dragging a tile's header onto another tile reorders forward, preserves tmux geometry, and clears drag classes | E1, E3, E4 | journey | tmux geometry |
| a drag still reorders the grid while the daemon is down | E9, REQ-8 | journey | daemon down |
| a tile's state dot title tracks the state word, and updates on a real state change | E10, REQ-9 | journey | hook |

## Scenarios added

| Scenario | Holds | Used by |
|---|---|---|
| `shortcuts-rail` | three bound sessions in launch order — idle, idle, needs input — manual order [a, b, c] | ⌥⌘1, ⌥⌘0, ⌥⌘N |
| `shortcuts-rail-attention` | the same under `railSort: attention` (order [c, a, b]) | ⌥⌘1 in attention mode |
| `shortcuts-rail-pinned` | the same with the first idle card pinned ahead of the needs-input one | ⌥⌘0 ignoring a pinned card |
| `ended-pair` | two idle sessions ended a second apart, so "most recently ended" differs from the first in rail order | ⌥⌘0 with none alive |
| `empty-tiles` | no session, `view: tiles` | the Tiles placeholder |
| `tiles-one`, `tiles-four`, `tiles-five`, `tiles-five-pinned` | the Tiles view over one session, a full 2×2 grid with one tile needing input, and a full grid plus one strip card (pinned or not) | the tile drags, the strip promotion, the footer button, ⌥⌘1/⌥⌘0 in Tiles |

## Deleted Tests

| File | Test | Covered | Now lives in |
|---|---|---|---|
| `shortcuts.spec.ts` | the 13 property rows above, titles verbatim | each chord's effect on the page, the dialog's kbd chip, the placeholders | `web/render/shortcuts.spec.ts`, same titles |
| `tiles.spec.ts` | the 5 property rows above, titles verbatim | footer button across a tick and Enter, focus across a drag, backward drag, promotion slot, drag over the strip | `web/render/tiles.spec.ts`, same titles |

## Borderline, left in place

- `views.spec.ts` "Cmd+\ toggles the view and Opt+Cmd+1 focuses the top-priority session
  regardless of launch order" (E7): the ⌥⌘1 half is a property already covered in
  `shortcuts.spec.ts`'s render tests; the toggle is a pref PUT whose broadcast the test waits
  on. Kept whole.

## Notes

- None of the ported tile tests asserts tmux geometry; every test that did stays E2E.
