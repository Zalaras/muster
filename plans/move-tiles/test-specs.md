# E2E Test Specs: move-tiles

**Plan**: move-tiles
**Mode**: validate (attempt 2)
**Verdict**: pass
**Tests created**: 9 (7 new + 2 retargeted, replacing 1 removed)
**Live run**: 40/40 passing (own files); 104/104 passing (full suite)

## Tests

| File | Test Name | Requirement | What It Verifies |
|------|-----------|-------------|------------------|
| web/e2e/views.spec.ts | dragging a tile's header onto another tile reorders forward, preserves tmux geometry, and clears drag classes (E1, E3, E4) | REQ-3, REQ-5, REQ-6, REQ-7/INV-6 | 4 live tiles at 2×2; drag tile[0]'s `.thead` onto tile[2] → DOM order becomes [1,2,0,3] (Edge Case 2 forward); `.dragging`/`.drop-target` count 0 after drop; every tile's tmux `#{window_width}×#{window_height}` unchanged, read fresh on both sides |
| web/e2e/views.spec.ts | dragging a tile's header onto an earlier tile reorders backward (E2) | REQ-3 | Edge Case 2 backward case: drag tile[3] onto tile[1] → [0,3,1,2] |
| web/e2e/views.spec.ts | clicking a strip card at capacity places the promoted tile into the demoted tile's former index (E7, REQ-1) | REQ-1 | 5 sessions at 2×2 (4 live + 1 stripped); click the strip card; promoted title lands at exactly the demoted title's pre-promotion index, every other index unchanged |
| web/e2e/views.spec.ts | a drag released over the strip leaves the tile order unchanged (E8) | REQ-5 (negative), Edge Case 3 | Drag a tile's `.thead` onto a strip card; grid order identical before/after; no leftover `.dragging`/`.drop-target` |
| web/e2e/views.spec.ts | a drag still reorders the grid while the daemon is down (E9, REQ-8) | REQ-8 | Kill the scratch daemon, wait for the `role=alert` banner, then drag; order still updates per Edge Case 2's forward case — ordering is client-only state |
| web/e2e/views.spec.ts | a tile's state dot title tracks the state word, and updates on a real state change (E10, REQ-9) | REQ-9 | `.sdot[title]` reads "started" initially, then "needs input" after a synthesized UserPromptSubmit + Notification(permission_prompt) |
| web/e2e/actions.spec.ts | a priority change updates a live tile's chrome but never moves it in the Tiles grid (REQ-2, E5) | REQ-2 | Retargets the old m4-reconcile "Tiles-grid re-sort" test: a Notification making tile B `needs_input` flips its `s-blocked` class but `#tiles-grid article.tile .nm` order is byte-identical before/after |
| web/e2e/actions.spec.ts | a focused tile-footer action button survives a drag-drop reorder (REQ-10, E6) | REQ-10 | Same focus-capture/restore contract as the old test, but the reorder trigger is now a real drag-drop (2 tiles, drag A onto B → [B,A]) instead of an auto-sort; focused End button in tile B stays focused and operable |

## Fixture Changes

No new hook/status-line payload builders — this plan needs no new wire shapes (Protocol Contract: none). Reused existing `envelopedSessionStart`, `rawUserPromptSubmit`, `rawNotification(..., "permission_prompt")` from `helpers/payloads.ts` (already synthesized from canary-fields.md by earlier plans).

New reusable DOM/gesture helpers added to `web/e2e/helpers/terminal.ts` (additive, no existing export changed):
- `tileDragHandle(page, title)` — the `.thead[draggable="true"]` locator, the sole drag source per REQ-4/Testable UI Elements.
- `tileStateDot(page, title)` — the `.sdot` locator, for REQ-9's `title` attribute.
- `tilesGridOrder(page)` — reads `#tiles-grid article.tile .nm` in DOM order, exactly the "Grid order" oracle the plan's Testable UI Elements table names. Every reorder assertion in both spec files goes through this one helper.
- `dragTileOnto(page, draggedTitle, targetTitle)` — thin wrapper over `tileDragHandle(...).dragTo(liveTile(...))`, per the plan's Implementation Notes recommendation to use `locator.dragTo`.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 | clicking a strip card at capacity places the promoted tile into the demoted tile's former index (E7) |
| REQ-2 | a priority change updates a live tile's chrome but never moves it in the Tiles grid (E5) |
| REQ-3 | dragging forward (E1/E3/E4 test), dragging backward (E2 test) |
| REQ-4 | exercised as the drag source in every drag test (`.thead` is the only draggable element used); no standalone assertion needed beyond the W9 grep check (web-owned) |
| REQ-5 | forward/backward drag tests (positive), "drag released over the strip" (negative) |
| REQ-6 | forward-drag test's class-clear assertion (E4) |
| REQ-7/INV-6 | forward-drag test's tmux geometry cross-check (E3) |
| REQ-8 | a drag still reorders the grid while the daemon is down (E9) |
| REQ-9 | a tile's state dot title tracks the state word (E10) |
| REQ-10 | a focused tile-footer action button survives a drag-drop reorder (E6) |

REQ-1's "otherwise preserves order" half and REQ-3's identity cases (self-drop, unknown ids) are unit-level (`live.test.ts`, W6/W7) — not re-asserted at E2E per the plan's own split between unit and E2E acceptance criteria.

## Notes

- **Retargeting, not deletion.** Per the plan's Affected Files entry for `web/e2e/actions.spec.ts`, the old test "a focused tile-footer action button survives a Tiles-grid re-sort triggered by a real priority change (REQ-12, cycle-4 Minor 2)" asserted the auto-sort this plan removes and could never pass again once the plan ships. It was replaced (not merely edited) by two independent tests that together cover strictly more: the priority-doesn't-move half (REQ-2, new) and the focus-survives-a-drop half (REQ-10, same assertion strength as before, now triggered honestly by a drag instead of a hook-driven auto-sort). No assertion from the old test was weakened — the focus-restore check, the Enter-still-works check, and the dialog check all carry over verbatim.
- **Playwright DnD approach.** Used `locator.dragTo(target)` throughout, per the plan's own Implementation Notes ("`locator.dragTo(target)` drives HTML5 DnD in Chromium"). Not yet run live — if `dragTo` proves flaky against the real implementation in validate mode, the plan explicitly leaves `page.mouse` step sequences or a manual `DataTransfer` dispatch as e2e-specs' call; that repair, if needed, will be recorded under `## Repairs` in the validate-mode log.
- **Order oracle.** Every reorder assertion reads titles via `tilesGridOrder()` (`#tiles-grid article.tile .nm`), matching the plan's Testable UI Elements table verbatim ("the order oracle for every reorder assertion") — never a footer-string pattern match, per the m2/m3 lesson about vacuous pattern checks.
- **Not yet covered / left to validate mode:** a dead-tile drag (Edge Case 5) and a two-window ephemeral-order-doesn't-sync check (Edge Case 9) are not in the plan's E1–E10 acceptance list; not added here to avoid over-scoping the authoring pass. If review flags them as must-have E2E coverage, they can be added in a fix wave without disturbing the tests above.
- No wire-format field was invented — this plan touches no protocol/hook shapes; every payload builder used was already measured/vetted by earlier plans.

## Test Run Output

Not run (authoring mode). Collection gate:

```
$ npx playwright test --list
Total: 104 tests in 11 files
```

No errors, no duplicate titles. `npx tsc --noEmit -p .` also clean after adding an explicit `SessionObject[]` annotation to avoid an implicit-`any[]` evolving-array error inside a `.map()` closure in the new E1/E3/E4 test.

## Validate Attempt 1

Rebuilt per instructions (`make build web-build` — clean, `tsc --noEmit` over `web/e2e/`
included and clean) before running.

### Own-file run

```
npm run e2e -- e2e/views.spec.ts e2e/actions.spec.ts
```

39/40 passed. One failure:

```
1) [chromium] › e2e/actions.spec.ts:1220:1 › a focused tile-footer action button survives a drag-drop reorder (REQ-10, E6)

  Error: expect(locator).toBeFocused() failed
  Locator:  liveTile("tile-drag-focus-b").locator(".tfoot").getByRole("button", { name: "End" })
  Expected: focused
  Received: inactive
```

### Root-cause investigation (not a repair — this is the "my defect or theirs" gate)

I built a throwaway diagnostic spec (`web/e2e/_diag.spec.ts`, deleted before finishing —
never part of the delivered suite) that focused a tile-footer End button, then drove the
drag with raw `page.mouse.down()` / `move()` / `up()` instead of `dragTo`, reading
`document.activeElement` after each step:

```
ACTIVE AFTER MOUSEDOWN: BODY.#
ACTIVE AFTER MOVE: BODY
ACTIVE AFTER UP: BODY
```

Focus is lost the instant `mousedown` fires on tile A's `.thead` — **before** `dragstart`,
before `drop`, before `onMove`/`moveTile`/`render()` ever run. This is standard browser
behaviour, not a Playwright artifact or a timing race: `mousedown` on a target with no
implicit or explicit focusability (a bare `<div class="thead">`) makes Chromium blur
whatever element currently holds focus and move `document.activeElement` to `<body>`,
synchronously, as part of the mousedown's default action — regardless of which tile the
mousedown lands on. A real mouse user grabbing tile A's header after having clicked
tile B's End button hits this exact blur before their drag even begins.

`reconcileTilesGrid` calls `captureFocusedControl(tilesGridEl)` (`web/src/main.ts:453`)
synchronously at the *top* of the render pass triggered by the `drop` event's `onMove`
callback — by which point `document.activeElement` is already `<body>`, so
`captureFocusedControl` returns `null` and `restoreFocusedControl` is a no-op. The
capture/restore pair genuinely does work for the mechanism it was built for (m4-reconcile:
an async `Notification`-driven reorder that never touches the mouse), but that mechanism
cannot see a focus loss that happened *before* the render pass it wraps — and a drag
initiation is exactly that: the blur is caused by the drag's own `mousedown`, not by the
`insertBefore` the capture/restore pair guards.

The plan's own Edge Case 13 anticipated a *related* but narrower loss ("a pointer drag
begins with mousedown on a header, which already blurs the textarea") and scoped it to
the dragged tile's own contents, concluding "Action-button focus is restored (REQ-10)" for
everything else. That conclusion doesn't hold: `mousedown`'s focus blur is global to the
document, not scoped to the tile it lands on, so *any* previously focused control anywhere
in the grid — not just something inside the dragged tile — is blurred the same way, and
`captureFocusedControl`'s placement can never observe it.

This satisfies the "their defect" test verbatim: my spec asserts exactly what the plan's
Testable-behaviour text (REQ-10, Edge Case 13, the acceptance criterion E6) promises, using
a real mouse-driven drag identical to what a person would do, and the implementation's
observable behaviour contradicts it. I did not weaken, adjust, or route around the
assertion — `toBeFocused()` on the exact button/`.tfoot`/`liveTile` locators the plan and
the rest of the suite already use for this control.

### Full-suite sweep

```
make e2e
```

103/104 passed — the only failure is the one above; no other spec exhibited plan-superseded
behaviour needing a repair, and collection stayed clean:

```
$ npx playwright test --list
Total: 104 tests in 11 files
```

## Repairs

No spec edits were made. **No assertion was deleted, skipped, or weakened.**

## E2E Implementation Bugs

| Bug | Route | Plan reference | Expected (per plan) | Actual | Failing test |
|-----|-------|-----------------|----------------------|--------|--------------|
| A tile-drag's initiating `mousedown` blurs any focused control in the grid (not just the dragged tile) to `<body>` before `reconcileTilesGrid`'s `captureFocusedControl` ever runs, so `restoreFocusedControl` has nothing to restore | `[web-impl]` | REQ-10, Edge Case 13, Acceptance E6, Testable UI Elements ("Grid order" / focus-restore path referenced via `reconcileTilesGrid`) | A focused tile-footer action button (any tile) stays focused after a drop that reorders the grid | Focus lands on `<body>` immediately on the drag's `mousedown` — before `dragstart`/`drop`/render — and is never restored | `a focused tile-footer action button survives a drag-drop reorder (REQ-10, E6)` (web/e2e/actions.spec.ts:1220) |

## Test Run Output

```
$ npm run e2e -- e2e/views.spec.ts e2e/actions.spec.ts
...
  ✘   7 [chromium] › e2e/actions.spec.ts:1220:1 › a focused tile-footer action button survives a drag-drop reorder (REQ-10, E6) (7.5s)
    Error: expect(locator).toBeFocused() failed
    Locator:  locator('article.tile').filter({ hasText: 'tile-drag-focus-b' }).locator('.tfoot').getByRole('button', { name: 'End' })
    Expected: focused
    Received: inactive
  1 failed
  39 passed (15.7s)

$ make e2e
...
  ✘    7 [chromium] › e2e/actions.spec.ts:1220:1 › a focused tile-footer action button survives a drag-drop reorder (REQ-10, E6) (7.4s)
  1 failed
  103 passed (25.0s)
```

## Notes

- The diagnostic spec used to isolate the root cause (`web/e2e/_diag.spec.ts`, raw
  `page.mouse` steps + `document.activeElement` logging) was deleted before finishing this
  attempt — it was never intended to ship and is not part of the delivered suite; the
  finding it produced is reproduced verbatim above so the next agent doesn't need to
  re-derive it.
- A plausible fix direction for web-impl (not prescribed, since fixing implementation is
  out of my scope): intercept `mousedown` on `.thead` in `tiledrag.ts` and
  `event.preventDefault()` it — this suppresses the browser's default focus-shift while
  leaving native HTML5 drag initiation intact (drag start is not gated on the mousedown's
  default action), which is the standard technique other DnD implementations use to avoid
  stealing focus. Any actual fix, and its own follow-up test repair if the mechanism
  changes shape, is web-impl's / this agent's next validate pass, not this one.
- No wire-format field was invented or touched in this attempt; no existing spec needed
  updating for sanctioned breakage — the plan's only protocol delta is "none" and the full
  sweep found nothing superseded.

## Validate Attempt 2

Rebuilt per instructions (`make build web-build` from repo root — both clean, `tsc --noEmit`
over `web/e2e/` included and clean) before running anything.

### Confirming web-impl's Fix Attempt 2

Read `plans/move-tiles/web-implementation.md`'s Fix Attempt 2: it captures the focused
control on the drag's `mousedown` (before the browser's own blur default action fires)
and threads that pre-blur snapshot into `reconcileTilesGrid`, closing the Validate Attempt
1 `[web-impl]` bug (`toBeFocused()` on the tile-footer End button after a drag-drop
reorder). Ran the previously-failing test alone first: it now passes.

```
$ npm run e2e -- e2e/actions.spec.ts -g "REQ-10, E6"
  ✓  a focused tile-footer action button survives a drag-drop reorder (REQ-10, E6)
1 passed
```

### Investigating the flagged geometry flake (E1/E3/E4)

Web-impl's Fix Attempt 2 flagged `views.spec.ts`'s
`"dragging a tile's header onto another tile reorders forward, preserves tmux geometry,
and clears drag classes (E1, E3, E4)"` as flaking intermittently, on baseline code too, and
asked me to determine whether it's a test-side timing weakness or a real defect.

Reproduced first, per instructions, before touching anything:

```
$ npx playwright test e2e/views.spec.ts -g "E1, E3, E4" --repeat-each 5 --workers 1
5 failed — every run: Error: expect(received).toBe(expected)
```

Two runs both failed 5/5 and 8/8 (a second `--repeat-each 8` pass) with the *same shape*
of mismatch every time (e.g. `Expected: "130", Received: "84"`, or later `Expected: "11",
Received: "10"`) — not the occasional off-by-one noise web-impl's own log described, but a
100% reproduction rate in this sandbox. That contradiction between "web-impl saw it flake
under load" and "I see it fail every time" was itself the first clue that this is a
deterministic race, not a load-sensitivity issue — it always loses the same race here, it
just sometimes wins it on a faster machine.

Built a throwaway diagnostic spec (`web/e2e/_diag_geo.spec.ts`, deleted before finishing —
never part of the delivered suite) that launches the same 4-tile 2x2 grid and polls one
tile's real tmux geometry (`#{window_width}`/`#{window_height}`) against its footer text
every 500ms for 10s, with no drag at all:

```
t=0ms    tmux=130x25 footer=84×11
t=500ms  tmux=84x11  footer=84×10
t=1000ms tmux=84x10  footer=84×10   <- matches, and stays matched for 9+ more seconds
```

This is the same async-refit race `expectTileGeometryMatchesTmux`'s own doc comment already
describes for a density change, but nothing in this test's original baseline capture waited
for it: it read `widthBefore`/`heightBefore` via a single synchronous `daemon.tmuxDisplay`
call immediately after `liveTile(...).toBeVisible()` — before the freshly-launched tile's
tmux window had finished its initial refit from the pre-fit spawn size (130x25) down to the
grid-fitted size (84x10). The drag + order-poll that follows takes long enough (whole
seconds) for that unrelated settle to finish on its own, which then reads back as a false
"geometry changed by the drag" failure.

First fix attempt: wait per-tile, sequentially, for each tile's footer to agree with a
fresh tmux read (reusing `expectTileGeometryMatchesTmux`) before capturing that tile's
baseline. Rebuilt and reran — **still failed 8/8**, now with a smaller but still consistent
off-by-one (`Expected: "11", Received: "10"`). A second, longer diagnostic
(`_diag_geo2.spec.ts`, also deleted) monitoring all 4 tiles simultaneously for 12s showed
all 4 settle together and stay stable — so the remaining race wasn't "never settles," it
was that the *sequential per-tile loop itself* could observe tile 0 match on its own poll
tick, move on to tile 1/2/3, and never re-check tile 0 again even though a shared reflow
across the whole grid was still in flight and could still touch tile 0 after that early
match. A third diagnostic (`_diag_geo3.spec.ts`, deleted) that instead waited for **all
four tiles to agree with tmux in the same poll callback**, then held for 2s to confirm
stability, then ran a real drag through to a matched order and held 2s again — passed
3/3 with every geometry reading identical start to finish.

### Verdict: test-side timing weakness, not an implementation defect

This is my defect, not theirs, per the "their defect" test in the harness rules: nothing
here contradicts a Protocol Contract entry or a Testable UI Elements row, and no drag
class (`.dragging`/`.drop-target`, checked in `web/src/style.css`) affects layout box size
(`opacity` and a negative-offset `outline` don't participate in layout) — there is no
plausible mechanism by which the drag itself changes geometry. The failure was purely a
race in my own baseline-capture timing.

### Repair

Added `expectAllTileGeometrySettled(page, daemon, entries)` to `web/e2e/helpers/terminal.ts`
(additive, no existing export changed) — waits, in a single `expect.poll` callback, until
*every* named tile's footer agrees with a fresh tmux read simultaneously, closing the race
a per-tile sequential loop can't. Updated the E1/E3/E4 test to call it once over all 4
titles immediately before capturing `widthBefore`/`heightBefore`, replacing the old
per-tile `expectTileGeometryMatchesTmux` loop for that baseline capture. No assertion's
strength changed: the same `expect(widthAfter).toBe(widthBefore.get(t))` /
`expect(heightAfter).toBe(heightBefore.get(t))` checks run afterward, unmodified, against
the exact same tmux oracle read fresh on both sides — only the moment "before" is captured
moved to a point that is actually stable.

Verified the repair: 10 repeats at `--workers 2`, then 15 more at `--workers 4` (elevated
parallelism as a stand-in for host load) — 25/25 passed, 1.9-2.4s each (vs. the 16-18s the
web-impl log reported for failing baseline runs, another sign the old version was burning
most of its time serialized behind a race it was destined to lose). A further 5 repeats at
`--workers 5` (max parallelism) also passed. Total 30/30 across all repeat runs after the
fix, 0/13 before it.

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|------------------------|-----|-------------------------|
| 1 | dragging a tile's header onto another tile reorders forward, preserves tmux geometry, and clears drag classes (E1, E3, E4) | `expect(widthAfter).toBe(widthBefore.get(t))` / `heightAfter` failed deterministically in this sandbox (100% repro at 5 and 8 repeats), with the mismatch shrinking but not disappearing after a first (insufficient) fix attempt | Baseline `widthBefore`/`heightBefore` were captured before the freshly-launched grid's tmux windows finished their async initial refit (130x25 pre-fit -> grid-fitted size); a first fix (per-tile sequential `expectTileGeometryMatchesTmux` wait) still raced a shared, whole-grid reflow that could invalidate an already-"matched" tile while later tiles in the loop were still being waited on | Added `expectAllTileGeometrySettled` (`web/e2e/helpers/terminal.ts`) — one `expect.poll` that requires all 4 tiles to agree with tmux *simultaneously* — and call it once, over all 4 titles, before capturing any baseline value | REQ-7/INV-6: a pure drag-drop reorder never touches tmux geometry, still asserted via a fresh tmux read on both sides of the drag, byte-for-byte identical to the original assertion — only the baseline-capture timing changed |

No assertion was deleted, skipped, or weakened.

### Full-suite sweep

```
$ make e2e
Running 104 tests using 6 workers
...
104 passed (24.6s)
```

No pre-existing spec needed a sanctioned-breakage update — this plan's protocol delta is
"none" (web-only plan) and nothing outside `views.spec.ts`/`actions.spec.ts` touches
drag/reorder behavior.

### Collection re-verification

```
$ npx playwright test --list
Total: 104 tests in 11 files
```

No duplicate titles, no errors.

## E2E Implementation Bugs

None open. The Validate Attempt 1 finding (REQ-10/E6 focus loss on drag `mousedown`) was
closed by web-implementation.md's Fix Attempt 2 and reconfirmed live above. The E1/E3/E4
flake reported by web-impl was investigated and found to be a test-side timing weakness
(see Repairs), not an implementation defect.

## Test Run Output

```
$ npm run e2e -- e2e/views.spec.ts e2e/actions.spec.ts
Running 40 tests using 6 workers
...
40 passed (13.4s)

$ make e2e
Running 104 tests using 6 workers
...
104 passed (24.6s)

$ npx playwright test e2e/views.spec.ts -g "E1, E3, E4" --repeat-each 15 --workers 4
15 passed (11.9s)
```

## Notes

- Three throwaway diagnostic specs (`_diag_geo.spec.ts`, `_diag_geo2.spec.ts`,
  `_diag_geo3.spec.ts`) were used to isolate the geometry-settle race and deleted before
  finishing this attempt — none were ever part of the delivered suite. Their findings are
  reproduced above so a future agent doesn't need to re-derive them.
- `expectAllTileGeometrySettled` is additive and general-purpose (any test that needs a
  stable multi-tile geometry baseline before an action can reuse it) — no existing export
  in `helpers/terminal.ts` was changed.
- No wire-format field was invented or touched in this attempt; this remains a web-only
  plan with no protocol delta.
