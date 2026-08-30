# Plan: move-tiles

**Created**: 2026-08-29
**Status**: completed
**Work Type**: web
**E2E Scope**: new-specs
**Description**: Tiles grid becomes slot-stable and user-orderable — drag a tile by its title bar to reorder (insert-and-shift); the state dot gains a hover label.

## Overview

The Tiles grid (m2-terminal) currently re-sorts its live tiles by attention priority on
every render — `promote`/`applyDensity` in `web/src/sessions/live.ts` re-sort `tilesLive`
by §3.4 order, so tiles jump around as states change (the same reorder behind the
m4-reconcile focus-on-reorder Minor). The user has no say in where a tile sits. This plan
(TODO.md "Pre-v1 Cleanup", second bullet) does two things:

1. **Slot-stable grid.** Membership rules stay exactly as m2 settled them (top-N by
   attention at view entry and density growth; promotion by strip click / ⌘1–9; a dead
   tile keeps its slot). What changes is *ordering*: the grid never reorders itself. A
   promoted session lands in the demoted tile's slot; a removed/departed tile's slot
   closes and the rest shift left; backfill appends at the end. Only the user reorders.
2. **Drag to reorder.** The tile header (`.thead`) is the drag handle — never the
   terminal body. Dropping on another tile inserts the dragged tile at that position and
   shifts the others (tab-bar semantics, chosen 2026-08-29 over swap). Order is per-window
   and ephemeral, exactly like `tilesLive` membership (protocol §5.5 / main.ts INV-4 —
   nothing is persisted, no protocol change).

The TODO bullet's "status icons in the title" is **already shipped**: `tile-template`'s
`.sdot` is coloured per state by `web/src/style.css` (design-system §3 tokens: amber
needs-input, rose failed, teal working, violet planning, muted started, idle). The
green/orange/red palette floated in the bullet would violate §3 ("a state colour may only
mean that state") and is not adopted. The one addition here: the dot gets a `title` with
the state word, so a hover explains the colour (a tile otherwise carries no state text).

This amends ux-flows §3.7's sentence "Live tiles are the top N by attention, **in the same
order §3.4 defines**" — decided with Damian 2026-08-29; the orchestrator records it (see
Doc upkeep). Decision debated and settled at planning: scope = grid only (sidebar
pin/drag is its own plan); persistence = per-window ephemeral; auto-sort = none, ever;
drop = insert-and-shift.

## Requirements

### Must Have
- [ ] REQ-1: **Slot-stable membership functions.** `promote` places the promoted id in the
      demoted (worst-§3.4-ranked) member's slot and otherwise preserves order; it never
      re-sorts. `applyDensity` preserves the order of surviving members: shrink drops the
      lowest-priority members (by §3.4) but keeps the survivors' relative order; grow and
      backfill append by §3.4 order at the end; an unknown id is removed and the rest
      shift left. `initialLive` is unchanged (top-N in §3.4 order).
- [ ] REQ-2: **A priority change never moves a tile.** With membership unchanged, a state
      transition on any live session (e.g. a `Notification` making it `needs_input`) leaves
      every tile in its DOM slot; only chrome (dot/border/timer) updates.
- [ ] REQ-3: **Pure reorder function.** `moveTile(live, draggedId, targetId)` in
      `web/src/sessions/live.ts`: removes `draggedId` and re-inserts it at `targetId`'s
      index (insert-and-shift, dragging forward or backward), preserving set membership
      and length. Identity result (same array contents) when `draggedId === targetId` or
      either id is not in `live`.
- [ ] REQ-4: **Drag handle is the header only.** `.thead` of every tile (live *or* dead) is
      `draggable="true"`; the tile body (`.tbody-slot`, xterm) and footer are not. The
      header shows `cursor: grab` (`grabbing` while dragging).
- [ ] REQ-5: **Drop on a tile reorders.** Dropping a tile drag on another tile (anywhere on
      that tile, header or body) applies `moveTile` and re-renders; the grid's DOM order
      matches the new `tilesLive` order. Dropping anywhere else (strip, empty grid area,
      outside the grid) or pressing Escape is a no-op.
- [ ] REQ-6: **Visual drag feedback.** The dragged tile carries class `dragging`; the tile
      currently under the pointer carries class `drop-target` and an inset outline in
      `--line2` (neutral; never a state colour — design-system §3). Both classes are
      cleared on drop/dragend/dragleave.
- [ ] REQ-7: **Reorder is geometry-neutral (INV-6).** A reorder opens/closes no terminal
      socket and never changes any session's tmux window size — same density, same slot
      size, `surfaceDiff` is empty. Asserted with the tmux oracle (`#{window_width}` /
      `#{window_height}` before == after for every live tile).
- [ ] REQ-8: **Reorder works with the daemon down.** Ordering is client-only state; a drag
      while the banner shows still reorders the grid.

### Should Have
- [ ] REQ-9: **State dot hover label.** `.sdot` gets `title` = the state badge word from
      `stateBadgeText` (`"needs input"`, `"working"`, …), updated in `updateTileChrome`
      every pass. No size/colour change.
- [ ] REQ-10: **Focus survives a drop.** A focused tile-footer action button (in any tile,
      not just the dragged one) is still focused after the reorder's DOM moves — the
      existing `captureFocusedControl`/`restoreFocusedControl` step in
      `reconcileTilesGrid` covers it; keep that path (don't bypass the reconciler with an
      ad-hoc DOM move).

### Nice to Have
- (none — keyboard reorder deferred, see Implementation Notes)

## Protocol Contract

No protocol changes. Order is per-window client state like `tilesLive` (protocol §5.5
prefs carry only `view` + `density`; unchanged).

## Schema Changes

No schema changes required.

## UI Specifications

Design authority: `docs/design/mockups/d-tiled.html` + design-system §4/§5 for the tile
itself (unchanged chrome). Drag affordance/feedback is new and uses only neutral tokens.

### Views
- **Tiles** — grid order is now stable and user-defined. Header is a drag handle. Strip is
  unchanged (still §3.4-sorted, still promotes on click).

### DOM
- `tile-template` unchanged in structure. `.thead` gains `draggable="true"`. `.sdot` gains
  `title="<state word>"`.
- Classes added at runtime: `article.tile.dragging` (source), `article.tile.drop-target`
  (hover target). CSS: `.thead { cursor: grab }`, `.tile.dragging .thead { cursor: grabbing }`,
  `.tile.dragging { opacity: .6 }`, `.tile.drop-target { outline: 1px solid var(--line2); outline-offset: -1px }`.
- Event wiring lives in a new module `web/src/render/tiledrag.ts`:
  `installTileDrag(gridEl, onMove: (draggedId, targetId) => void)` — delegated
  `dragstart`/`dragover`/`dragenter`/`dragleave`/`drop`/`dragend` listeners on the grid
  (so newly built tiles need no per-tile wiring). Identifies tiles via
  `closest("article.tile")` + `dataset.sessionId`. `dragstart` accepts only events whose
  target is inside a `.thead`; sets `dataTransfer.setData("text/plain", id)` and
  `effectAllowed = "move"`. `dragover` calls `preventDefault()` only while a tile drag is in
  progress (module-level `draggingId`), so foreign drags (files, text) are refused.
- `main.ts`: `tilesLive = moveTile(tilesLive, from, to); render();` in the `onMove`
  callback. `promote`/`applyDensity` call sites unchanged (their semantics change inside
  `live.ts`).

### User Flows
1. Tiles view, ≥2 live tiles. Press on a tile's header, drag over another tile (it gains
   the `drop-target` outline), release → the dragged tile now occupies that position; the
   tiles between shift by one. Terminals keep running, nothing resizes, nothing reconnects.
2. Drag and release over the strip or empty area → grid unchanged.
3. Strip card click / ⌘n → promoted session appears in the demoted tile's slot; all other
   tiles stay put.
4. A live tile's session goes `needs_input` → dot/border turn amber in place; no movement.

### States
- No data yet / no sessions: unchanged (`#tiles-empty`).
- Daemon down: banner shows; drag-reorder still works (REQ-8); everything else unchanged.

### Testable UI Elements

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| Live/dead tile | `article` | contains session title in `.nm` | existing (`liveTile` helper) |
| Tile drag handle | — | `article.tile .thead[draggable="true"]` | the only draggable element in a tile |
| Tile body | — | `article.tile .tbody-slot` | must **not** be `[draggable="true"]` |
| Dragging tile | — | `article.tile.dragging` | present only between dragstart and drop/dragend |
| Drop target | — | `article.tile.drop-target` | present only while a tile drag hovers it |
| State dot | — | `article.tile .sdot[title]` | `title` ∈ `started|planning|working|needs input|failed|idle` |
| Grid order | — | `#tiles-grid article.tile .nm` in DOM order | the order oracle for every reorder assertion |

### Invariants

- **INV-6 (reorder is geometry-neutral)**: for any drop, the set of open terminal sockets
  is unchanged and every live session's tmux `#{window_width}×#{window_height}` is
  identical before and after. Source states: 2×2 at capacity, 3×2 at capacity, grid with a
  dead tile, grid below capacity (2 tiles), daemon down.
- **INV-7 (order changes only by user action)**: from any grid, applying any session
  event (state change, new session launched at capacity, status-line post) yields the
  same tile order. New members (below capacity) append; departures shift left. Source
  states for unit tests: every §3.4 state as the transitioning session, at and below
  capacity, with the transitioning tile in first / middle / last slot.
- **INV-3 (existing, m2)**: geometry moves, never duplicates — still holds; a reorder is
  not a membership change.

## Affected Files

### Web
- `web/src/sessions/live.ts` — `promote`/`applyDensity` become order-preserving (REQ-1);
  new `moveTile` (REQ-3). Update the module header comment (it documents the re-sort).
- `web/src/render/tiledrag.ts` — **new**: `installTileDrag` DnD wiring (REQ-4–6).
- `web/src/render/tiles.ts` — `updateTileChrome` sets `.sdot` `title` (REQ-9).
- `web/index.html` — `tile-template` `.thead` gets `draggable="true"` (REQ-4).
- `web/src/style.css` — grab cursors, `.dragging`, `.drop-target` (REQ-4/6).
- `web/src/main.ts` — install drag on `#tiles-grid`, `onMove` → `moveTile` + render;
  update the `tilesLive` comment (order is now user-owned).
- `web/src/sessions/live.test.ts` — **web-tests only**: the "re-sorts" cases (`promote`
  ×3, `applyDensity` shrink "re-sorts before truncating", idempotent "re-sorted") encode
  the removed behaviour and must be rewritten to the slot-stable contract; add `moveTile`
  and INV-7 tables. web-impl will leave these red — expected, see Implementation Notes.
- `web/e2e/actions.spec.ts` — **e2e-specs only**: the test at ~line 1131 ("survives a
  Tiles-grid re-sort triggered by a real priority change") asserts the auto-sort this plan
  removes. Retarget: the reorder trigger becomes a drag (REQ-10), and the priority change
  becomes the REQ-2 "does not move" assertion.
- `web/e2e/views.spec.ts` — **e2e-specs**: new drag/order specs (E1–E7). Existing
  promotion/density specs assert membership counts, not order — expected to pass unchanged;
  verify.

## Edge Cases

1. **Drop on self** — no-op (`moveTile` identity); classes cleared.
2. **Drag forward vs backward** — semantics: the dragged tile takes the target's slot and
   the displaced tiles shift *toward the origin*. Remove the dragged id, then insert it at
   the index the target now occupies. Forward: `[A,B,C,D]`, drop A on C → `[B,C,A,D]`.
   Backward: drop D on B → `[A,D,B,C]`. Unit-test both directions explicitly (W6).
3. **Drop on the strip / empty grid / outside** — `dragover` not prevented there, so the
   browser's drop never fires; `dragend` clears classes.
4. **Escape mid-drag** — browser fires `dragend` without `drop`; classes cleared, order
   unchanged.
5. **Dead tile dragged or dropped on** — allowed; a dead tile is a slot like any other
   (REQ-12 of m4-reconcile). Its dead-surface is not re-fetched by the move.
6. **Session removed mid-drag** (`sessionRemoved` for the dragged id) — `moveTile` finds
   `draggedId` absent → identity; `dragend` clears classes.
7. **Density shrink after a manual order** — drops the lowest-§3.4 members wherever they
   sit; survivors keep relative order (REQ-1). Grow appends.
8. **Promotion at capacity** — promoted id goes into the worst-ranked member's slot, not
   the end (REQ-1).
9. **Two windows** — order is per-window (like membership); no sync, by design.
10. **Foreign drags** (a file dragged over the grid) — `draggingId` is null → no
    `preventDefault`, no `drop-target` class, browser default.
11. **Text selection in the header** — `draggable` suppresses selection on mousedown-drag;
    acceptable (header text is metadata).
12. **Hooks/`/clear`/daemon restart** — unaffected: ordering derives from nothing in the
    event stream. Daemon restart mid-drag: the store re-snapshots; membership survives
    (`applyDensity` idempotent), order survives (REQ-1).
13. **Focus in an xterm of a shifted tile** — a pointer drag begins with mousedown on a
    header, which already blurs the textarea; `insertBefore` on a shifted tile blurs
    nothing that was focused. Action-button focus is restored (REQ-10).

## Acceptance Criteria

IDs are unique across the whole section — `W*` web, `E*` e2e. One clause per criterion.

### Web
- **W1**: `make web-build` passes.
- **W2**: `make web-test` passes.
- **W3**: `promote` at capacity returns the promoted id in the demoted member's index, all
  other indices unchanged (unit-tested from first/middle/last-slot demotions).
- **W4**: `applyDensity` shrink keeps survivors' relative order for a deliberately
  non-§3.4-ordered input.
- **W5**: `applyDensity` at capacity with valid members returns the input order unchanged
  for every §3.4 state of every member (INV-7 table).
- **W6**: `moveTile` forward and backward cases match Edge Case 2 exactly.
- **W7**: `moveTile` is identity for self-drop, unknown dragged id, unknown target id.
- **W8**: no `any` types in new web code.
- **W9**: the only `[draggable="true"]` element in `tile-template` is `.thead`.
- **W10**: `tiledrag.ts` has no `Session`/store knowledge — it maps DOM → ids and calls
  `onMove`; ordering logic lives in `live.ts` only.
- **W11**: `.drop-target`/`.dragging` styling uses no state token (`--amber`, `--rose`,
  `--violet`, `--teal`, `--idle`, `--green`).

### E2E
- **E1**: with 4 live tiles at 2×2, dragging tile 1's header onto tile 3 yields DOM order
  [2,3,1,4] (forward case of Edge Case 2).
- **E2**: from [1,2,3,4], dragging tile 4's header onto tile 2 yields [1,4,2,3] (backward case).
- **E3**: after E1's drop, every live tile's tmux `#{window_width}×#{window_height}`
  equals its pre-drop value (INV-6).
- **E4**: after E1's drop, `article.tile.dragging` and `article.tile.drop-target` each
  have count 0.
- **E5**: a `Notification` making a live tile's session `needs_input` changes its dot
  class but leaves `#tiles-grid article.tile .nm` order unchanged (REQ-2, retargets the
  m4-reconcile cycle-4 re-sort test).
- **E6**: a focused tile-footer End button stays focused across a drop that shifts its tile
  (REQ-10).
- **E7**: clicking a strip card at capacity places the promoted tile in the demoted tile's
  former index (REQ-1 promotion slot).
- **E8**: a drag released over the strip leaves the order unchanged.
- **E9**: with the daemon stopped (banner visible), a drag still reorders (REQ-8).
- **E10**: every tile's `.sdot` has a `title` equal to its state word after a state change
  (REQ-9).

### Automated Checks

```checks
W1 make web-build
W2 make web-test
W9 test "$(rg -c 'draggable="true"' web/index.html)" = "1"
E1 make e2e
```

Notes: W9 counts the whole `web/index.html` — no other template may become draggable.
W11 is Reviewer-Verified only (a rule-block grep is too brittle to run verbatim). Test
files are out of scope for every grep here. Dry-run: `rg 'draggable="true"' plans/move-tiles/plan.md`
hits this plan's own table/DOM prose — the check targets `web/index.html` only, so agents
copying plan text into code cannot trip it.

### Reviewer-Verified
- **W3–W7**: read `live.test.ts` for the stated tables (not just "tests pass").
- **W8**: no `any`.
- **W10**: `tiledrag.ts` boundary.
- **W11**: no state colour on drag feedback (read `style.css`).
- **E3**: tmux oracle actually read before *and* after (not a footer string comparison).
- **INV-7 source-state coverage**: the unit table covers every §3.4 state and first/
  middle/last slot.
- **ux-flows §3.7 / SPEC changelog / TODO** upkeep done by the orchestrator (below).

## Implementation Notes

- **Ordering of pipeline stages / red tests.** web-impl changes `promote`/`applyDensity`
  semantics, so the existing "re-sorts" cases in `live.test.ts` go red until web-tests
  rewrites them. This is expected and not a boundary violation: web-impl must not touch
  the test file; it leaves the tree compiling and notes the failing case names in its
  report. web-tests rewrites them to the slot-stable contract. Likewise the
  `actions.spec.ts` re-sort E2E is e2e-specs' to retarget (REQ-2/REQ-10).
- **Keep DOM moves inside `reconcileTilesGrid`.** The drop handler mutates `tilesLive` and
  calls `render()`; the reconciler's existing `insertBefore` + focus capture/restore does
  the rest (m2 review Critical 1/2, m4 cycle-4 Minor 2 — don't add a second DOM mover).
- **Playwright DnD.** `locator.dragTo(target)` drives HTML5 DnD in Chromium; if it proves
  flaky, `page.mouse` step sequences or `dispatchEvent('dragstart'…)` with a `DataTransfer`
  are e2e-specs' call. `dragover` must `preventDefault()` for `drop` to fire — that is
  what `installTileDrag` does while `draggingId !== null`.
- **⌘1–9 unchanged**: still indexes the §3.4-sorted list (ux-flows §3.8); in Tiles it
  promotes into the demoted slot (REQ-1).
- **Deferred** (not in this plan): keyboard reorder (⌘⇧←/→), persisting order across
  reloads (would need membership persisted too), sidebar pin/drag (separate plan, TODO
  Pre-v1 first bullet).
- **Doc upkeep (orchestrator, not impl agents):**
  - `docs/design/ux-flows.md` §3.7 and `docs/design/design-system.md` §4/§5 (Tile) —
    **already amended at approval (2026-08-29)**: slot-stable grid, header drag handle,
    `.dragging`/`.drop-target` neutral-token feedback, dot `title`. These are now the
    design authority for web-impl; the orchestrator need not touch them.
  - `SPEC.md` §11 changelog: "2026-08-29 — move-tiles: Tiles grid slot-stable + drag
    reorder; ordering decision amended; state dot already shipped, hover label added".
  - `TODO.md` Pre-v1 Cleanup second bullet → done, noting the dot was pre-existing.
- No Claude Code wire-format facts touched; `internal/claudecode` untouched (web-only).
