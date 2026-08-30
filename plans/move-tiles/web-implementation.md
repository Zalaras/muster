# Web Implementation: move-tiles

**Plan**: move-tiles
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/sessions/live.ts` | modified | `promote` no longer sorts its result — it replaces the worst-ranked live member's own slot in place (REQ-1/W3). `applyDensity` shrink keeps survivors' relative order instead of re-sorting before truncating (REQ-1/W4); grow/backfill unchanged (append by §3.4 order). Added `moveTile(live, draggedId, targetId)` — pure insert-and-shift reorder (REQ-3/W6/W7). Module header comment updated to describe the slot-stable rule instead of the removed re-sort. |
| `web/src/render/tiledrag.ts` | created | `installTileDrag(gridEl, onMove)` — delegated `dragstart/dragover/dragenter/dragleave/drop/dragend` listeners on the grid (REQ-4/REQ-5/REQ-6). Only a `dragstart` whose target is inside `.thead` starts a tile drag; `dragover` only `preventDefault()`s while a tile drag from this grid is active (foreign drags fall through untouched — edge case 10). Manages `.dragging`/`.drop-target` classes, clearing both on drop/dragend. No `Session`/store import — maps DOM to numeric ids only, calls `onMove(draggedId, targetId)` (W10). |
| `web/src/render/tiles.ts` | modified | `updateTileChrome` sets `.sdot.title = stateBadgeText(session.state)` every render pass (REQ-9). |
| `web/index.html` | modified | `tile-template`'s `.thead` gains `draggable="true"` (REQ-4) — the only draggable element in the whole file (verified: `rg -c 'draggable="true"' web/index.html` → `1`). |
| `web/src/style.css` | modified | `.thead { cursor: grab }`, `.tile.dragging .thead { cursor: grabbing }`, `.tile.dragging { opacity: .6 }`, `.tile.drop-target { outline: 1px solid var(--line2); outline-offset: -1px }` — all placed next to the existing `.tile`/`.thead` rules. Only the pre-existing `--line2` neutral token is used; no state token touched (W11). |
| `web/src/main.ts` | modified | Imports `moveTile` and `installTileDrag`. Calls `installTileDrag(tilesGridEl, (draggedId, targetId) => { tilesLive = moveTile(tilesLive, draggedId, targetId); render(); })` once at startup, alongside the other button/keydown wiring — the existing `reconcileTilesGrid`'s `insertBefore` + focus capture/restore loop (unchanged) does the actual DOM move and satisfies REQ-10, so no second DOM mover was added (Implementation Notes). Updated the `tilesLive` state comment to note order is now user-owned. |

## Decisions

- No Testable UI Elements row was left unimplemented — all six (`.thead[draggable]`, `.tbody-slot` non-draggable, `.dragging`, `.drop-target`, `.sdot[title]`, grid-order oracle) map directly onto native attributes/classes already described above.
- `dragleave` clears `.drop-target` only when the pointer's `relatedTarget` is outside the current drop-target tile — prevents flicker when moving between a tile's own child elements (header/body) while hovering it; this is standard DnD delegation practice and doesn't change any table-specified behavior, it's only an internal debounce so REQ-6's class stays present ("while a tile drag hovers it") rather than blinking off between child elements.
- Left `promote`'s and `applyDensity`'s exported signatures unchanged (same params, same return type) — only their internal ordering behavior changed, per REQ-1's explicit instruction that call sites in `main.ts` are unchanged.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0.

**Sanctioned breakage (expected per plan's Implementation Notes)**: `web/src/sessions/live.test.ts` has 5 failing tests that encode the removed re-sort behavior — I did not touch this file (impl agents may not edit tests). Full run: `npx vitest run` → `5 failed | 406 passed (411)`, all 5 failures isolated to this one file. The failing cases, with their current (correct, new) vs. expected (stale, old) output:

1. `promote — ... > re-sorts the result into §3.4 order even though the demoted member wasn't last in the input array` (line 83) — got `[7,1,2,3]`, test wants `[1,2,3,7]`. New behavior is correct: `promote([4,1,2,3], 7, all)` demotes 4 (worst, at index 0) and puts 7 in its slot → `[7,1,2,3]`.
2. `> is a no-op (re-sorted) when the id is already live` (line 87) — got `[4,1,3,2]` (input unchanged), test wants `[1,2,3,4]`.
3. `> is a no-op (re-sorted) when the id isn't a known session` (line 91) — got `[3,1,2]` (input unchanged), test wants `[1,2,3]`.
4. `> demoting an already-stale live id (not in the session list) demotes that one first` (line 104) — got `[1,7,2]` (999 was at index 1, replaced in place), test wants `[1,2,7]`.
5. `applyDensity — shrink > re-sorts before truncating, so an out-of-order live set still keeps its best members` (line 133) — got `[1,2,4,3]` (survivors 1,2,4,3 keep their relative order from the input, dropping worst-ranked 5,6), test wants `[1,2,3,4]`.

These need rewriting by web-tests to the slot-stable contract (REQ-1/W3/W4), plus new `moveTile` and INV-7 tables — exactly as the plan's Affected Files and Implementation Notes anticipated. No other test file is affected (`tiles.test.ts` already passes unchanged with the new `.sdot` `title`).

None of this touches daemon code or the protocol; `internal/claudecode` untouched.

## Fix Attempt 1

**Failures addressed** (from `plans/move-tiles/web-tests.md`):
- `moveTile — forward drag matches plan edge case 2 ([1,2,3,4] drop 1 on 3 → [2,3,1,4])` — was returning `[2,1,3,4]`.
- `moveTile — one-slot-forward adjacent move ([1,2,3,4] drop 2 on 3 → [1,3,2,4])` — was a no-op, returning `[1,2,3,4]` unchanged.

**Root cause** (per web-tests.md, confirmed by re-reading `moveTile`): `targetIndex` was computed from `withoutDragged` (the array *after* filtering out `draggedId`). When the dragged id sits before the target in the original array, removing it shifts every later index down by one, so the target's index read from `withoutDragged` is one less than its true position — the dragged tile then lands one slot too early. Backward drags (dragged id after target) happen not to be affected, since removing an element doesn't shift the indices of elements before it — which is why only the forward direction was broken and the backward W6 case passed.

**Change made** (`web/src/sessions/live.ts`, `moveTile`): read `targetIndex` from the original `live` array (`live.indexOf(targetId)`) *before* filtering out the dragged id, then splice that index into `withoutDragged` as before. Added a comment explaining why the original-array read is required and why the bug was direction-asymmetric. No other line of `moveTile` changed — identity behaviour for self-drop / departed dragged id / departed target id is untouched (those return early before `targetIndex` is ever computed).

```ts
  // Target's index must be read from the ORIGINAL array, before the dragged id is
  // removed. Removing it first (and indexing into the shortened array) shifts every
  // index after the dragged id's original slot down by one, which only happens to be
  // harmless for backward drags (dragged id after target — nothing before the target
  // moves) but silently lands forward drags one slot too early (dragged id before
  // target — the removal shifts the target's own index down by one before it's read).
  const targetIndex = live.indexOf(targetId);
  const withoutDragged = live.filter((id) => id !== draggedId);
  const result = [...withoutDragged];
  result.splice(targetIndex, 0, draggedId);
  return result;
```

Hand-verified against both plan worked examples and both adjacent cases before running the suite:
- `moveTile([1,2,3,4], 1, 3)` → `targetIndex = live.indexOf(3) = 2`; `withoutDragged = [2,3,4]`; `splice(2,0,1)` → `[2,3,1,4]` ✓ (plan edge case 2, forward)
- `moveTile([1,2,3,4], 4, 2)` → `targetIndex = live.indexOf(2) = 1`; `withoutDragged = [1,2,3]`; `splice(1,0,4)` → `[1,4,2,3]` ✓ (plan edge case 2, backward — unchanged from before)
- `moveTile([1,2,3,4], 2, 3)` → `targetIndex = live.indexOf(3) = 2`; `withoutDragged = [1,3,4]`; `splice(2,0,2)` → `[1,3,2,4]` ✓ (adjacent forward)

No test file was edited.

**Evidence**:

```
$ npx tsc --noEmit
(clean, exit 0)

$ npx vitest run
 Test Files  17 passed (17)
      Tests  446 passed (446)
   Start at  21:33:35
   Duration  835ms

$ npm run build
> tsc --noEmit && vite build
vite v8.2.1 building client environment for production...
✓ 30 modules transformed.
dist/index.html                   9.24 kB │ gzip:  2.12 kB
dist/assets/index-bbIaWQ5B.css   19.50 kB │ gzip:  4.30 kB
dist/assets/index-tBaZ8OOV.js   371.93 kB │ gzip: 96.09 kB │ map: 888.24 kB
✓ built in 168ms
```

**Build status**: `npx tsc --noEmit`, `npx vitest run`, and `npm run build` all exit 0. All 446 tests pass (the two previously-failing `moveTile` cases plus the other 444 unaffected). No test file changes made.

## Fix Attempt 2

**Failure addressed** (from `plans/move-tiles/test-specs.md`'s Validate Attempt 1): "A tile-drag's initiating `mousedown` blurs any focused control in the grid (not just the dragged tile) to `<body>` before `reconcileTilesGrid`'s `captureFocusedControl` ever runs, so `restoreFocusedControl` has nothing to restore" — REQ-10, Edge Case 13, Acceptance E6. Failing test: `web/e2e/actions.spec.ts:1220` ("a focused tile-footer action button survives a drag-drop reorder (REQ-10, E6)").

**Root cause, confirmed against the validate agent's own diagnostic trace** (`ACTIVE AFTER MOUSEDOWN: BODY`): the browser's own default action for `mousedown` blurs whatever element currently holds focus (to `<body>`) synchronously, as part of that same `mousedown`'s dispatch — before `dragstart` fires, before `drop` fires, and therefore before `main.ts`'s `reconcileTilesGrid` ever calls `captureFocusedControl(tilesGridEl)`. By the time the reconciler's existing capture/restore pair runs, focus is already lost and unrecoverable from a live `document.activeElement` read. This is a single, exact-point defect (one browser-default-action ordering issue), not a class with multiple code paths: the only place `document.activeElement` is ever read for this purpose is `reconcileTilesGrid`'s one `captureFocusedControl` call, and the only thing that ever triggers a tile-grid DOM reorder is `installTileDrag`'s one `drop` handler (per REQ-2, priority changes no longer move DOM at all — that's this same plan's REQ-1/REQ-2, already shipped and re-verified below). There is no second reorder trigger, no second focus-capture call site, and no second drag-initiation path (only `.thead` starts a drag, per the existing `dragstart` guard) — so closing this one point closes the defect for every tile, not just the one named in the repro.

**Fix** (`web/src/render/tiledrag.ts`, `web/src/main.ts`): capture the focused control on the drag's initiating `mousedown` — the event *handler* for `mousedown` still runs before the browser applies that mousedown's own default blur action, so `document.activeElement` is still correct at that exact moment, for any tile's focused control, not just the one under the pointer.

- `tiledrag.ts`: added a delegated `mousedown` listener on the grid (same `.thead` guard as `dragstart`) that calls the existing `captureFocusedControl(gridEl)` helper (from `render/focus.ts`, already used by `reconcileTilesGrid` — no new capture logic, no Session/store knowledge added, W10 intact) and stores the result in a new module-local `focusedBeforeDrag`. `installTileDrag`'s `onMove` callback signature gained a third parameter, `focusedBeforeDrag: FocusedControl | null`, read from that local right before `clearDragState()` resets it (also reset in `clearDragState()` itself, so a stale snapshot never survives past the drag it was taken for, successful or aborted).
- `main.ts`: new module-level `pendingTileFocus: FocusedControl | null`. The `installTileDrag` callback now stores the passed-through `focusedBeforeDrag` into it before calling `render()`. `reconcileTilesGrid`'s focus line changed from `const focused = captureFocusedControl(tilesGridEl);` to `const focused = pendingTileFocus ?? captureFocusedControl(tilesGridEl); pendingTileFocus = null;` — preferring the pre-blur snapshot when a drag supplied one, always consuming (clearing) it so it can never leak into a later, unrelated render pass (e.g. the 1s tick, or a `Notification`-driven chrome update that no longer moves DOM per REQ-2 but still calls `render()`).

This keeps the actual DOM move entirely inside `reconcileTilesGrid`'s existing `insertBefore` loop — no second DOM mover was added, per the constraint.

**Why this doesn't need a `preventDefault()` on `mousedown`**: an earlier option considered (per the task's own suggestion) was calling `event.preventDefault()` on `mousedown` to suppress the browser's blur default action outright. Capturing the pre-blur snapshot instead was chosen because it doesn't touch the browser's native drag-initiation sequence at all (no risk of the more invasive `preventDefault` interfering with `dragstart` firing on some engine), and because `restoreFocusedControl` already no-ops safely when focus wasn't actually lost (`if (!captured || document.activeElement === captured.element) return;` in `render/focus.ts`), so handing it a snapshot on every `.thead` mousedown — even ones that don't turn into a completed drag — is inert by construction.

**Verification** (real Chromium, per the task's instructed repro):

```
$ npx tsc --noEmit
(clean, exit 0)

$ npx vitest run
 Test Files  17 passed (17)
      Tests  446 passed (446)

$ npm run build
> tsc --noEmit && vite build
✓ built in 161ms

$ make build && make web-build   # from repo root
(both clean)

$ cd web && npx playwright test e2e/actions.spec.ts -g "REQ-10"
Running 2 tests using 2 workers
  ✓ ended copy reads 'ended now' ... (REQ-10, REQ-13, Major 6)
  ✓ a focused tile-footer action button survives a drag-drop reorder (REQ-10, E6)
2 passed
```

Repeated 3 more times back-to-back (2 passed each time) and once more as part of the full `e2e/actions.spec.ts` file (23/23 passed, including the REQ-10 test).

**Regression check against the removed-bug repro**: to be sure the fix actually closes the reported mechanism rather than something adjacent, I temporarily reverted only my two files' edits (kept the test files as authored) and reran the exact same test under the same load. It reproduced the *original* reported symptom precisely — drag completed (`tilesGridOrder` matched), but focus was lost:

```
Error: expect(locator).toBeFocused() failed
Received: inactive
```

Reapplying my fix and rebuilding turned this back into a pass. This confirms the fix addresses the actual reported defect, not a coincidental pass.

**Pre-existing flake observed, unrelated to this fix — flagging per the evidence rule rather than silently ignoring it**: `e2e/views.spec.ts`'s `"dragging a tile's header onto another tile reorders forward, preserves tmux geometry, and clears drag classes (E1, E3, E4)"` test failed intermittently in this sandbox (real tmux `window_width`/`window_height` off from the pre-drag baseline, e.g. `Expected: "11", Received: "10"`, or a much larger swing under heavier load). I confirmed this is not caused by my change:
- My diff adds only a read-only `mousedown` listener (`captureFocusedControl` is a pure `document.activeElement` read with no DOM writes, no `.focus()`, no layout-forcing calls) — nothing in it can plausibly alter tmux/pty geometry.
- I reverted my two files back to the pre-fix (bug-present) state and reran the same geometry test several times: it failed there too, and also passed on other runs — genuinely intermittent with or without my fix.
- The failure rate tracked host `uptime` load averages during this session (observed climbing from ~1.5 to ~3.8 and back down over a few minutes with no test activity from me in between), and failing runs consistently took ~16-18s vs. ~1-2s for passing runs of the same test — consistent with CPU contention on a shared/busy machine affecting the real xterm-fit/tmux-resize timing this test depends on, not a logic defect.
- This test is unrelated to REQ-10/E6 (it asserts geometry preservation, not focus preservation) and was not part of the issue assigned to this fix wave. Leaving it as-is; flagging here in case the E2E validate agent sees it flake again and wants to decide whether it needs a more generous poll/retry.

No test file was edited. No `web/playwright.config.ts` change was made (not needed for this fix; the observed geometry flake looks like a load-timing issue in this sandbox, not a config or port/reuse problem, so I did not touch the config per the "don't guess, don't loosen the load-bearing knobs" guidance).
