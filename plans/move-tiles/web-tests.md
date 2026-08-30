# Web Tests: move-tiles

**Plan**: move-tiles
**Verdict**: pass

## Summary

This is a re-run against web-impl's **Fix Attempt 2** (`web/src/render/tiledrag.ts` gained
a delegated `mousedown` listener that captures the focused control via `render/focus.ts`'s
`captureFocusedControl` before the browser's own blur-on-mousedown default action can run,
and threads it through `onMove`'s new third parameter, `focusedBeforeDrag`; `web/src/main.ts`
gained `pendingTileFocus`, consumed once by `reconcileTilesGrid`).

Tests created this pass: 1 new file (`web/src/render/tiledrag.test.ts`, 4 tests) covering
the new mousedown → dragstart → drop sequencing logic. No existing test file was modified
— the `live.ts`/`tiles.ts` coverage from the prior pass is untouched and still green.

Tests created: 18 files total (1 new) | Total suite: 450 tests | Passing: 450 | Failing: 0

`npx tsc --noEmit` — clean (exit 0). `npx vitest run` — 18 test files passed, 450/450
tests passed. `npm run build` — succeeds (`vite build` completes, `dist/` produced).

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `render/tiledrag.test.ts` | captures the snapshot on mousedown inside `.thead`, before dragstart, and hands it to `onMove` on drop | Fix Attempt 2's core sequencing: `captureFocusedControl(gridEl)` called on `mousedown`, result passed as `onMove`'s 3rd arg | **new, pass** |
| `render/tiledrag.test.ts` | does not capture a snapshot when the initiating mousedown lands outside any `.thead` | mousedown guard mirrors `dragstart`'s own `.thead` guard; no capture call, `onMove` gets `null` | **new, pass** |
| `render/tiledrag.test.ts` | consumes the snapshot once: a later drag with no fresh mousedown never reuses a prior drag's snapshot | the exact defect class named in the task ("snapshot is consumed once, not reused by a later render") — verifies `clearDragState()` resets the module-local `focusedBeforeDrag` after every completed drag | **new, pass** |
| `render/tiledrag.test.ts` | clears the snapshot on an aborted drag (`dragend` without `drop`, e.g. Escape) — it does not leak into the next drag | Edge Case 4 (Escape mid-drag) interaction with the new snapshot state | **new, pass** |
| `sessions/live.test.ts` | `promote` — demotes in place at the worst member's own index (first/middle/last-slot) | REQ-1/W3 | pass |
| `sessions/live.test.ts` | `promote`/`applyDensity` — no-op / shrink preserve input order exactly | REQ-1/W4 | pass |
| `sessions/live.test.ts` | `moveTile` — forward and backward drag match plan edge case 2; identity for self-drop/departed ids; adjacent moves | REQ-3/W6/W7 | pass |
| `sessions/live.test.ts` | `applyDensity` — INV-7 table: every §3.4 state × first/middle/last slot leaves order unchanged | REQ-2/W5 (18 parameterized cases) | pass |
| `render/tiles.test.ts` | `updateTile` — `.sdot.title` = state badge word, one case per §3.4 state; updates every pass; no `className` side effect | REQ-9 | pass |

(Full per-case breakdown for `live.test.ts`/`tiles.test.ts` is unchanged from the prior
report — see git history of this file; this pass did not touch those two files.)

## Scope Note: what stayed out of Vitest, and why

`tiledrag.ts`'s actual DnD class toggling (`.dragging`/`.drop-target` add/remove on
`dragenter`/`dragleave`/`dragend`) and `main.ts`'s `pendingTileFocus` consume-once line
(`reconcileTilesGrid`'s `const focused = pendingTileFocus ?? captureFocusedControl(...); pendingTileFocus = null;`)
were deliberately **not** additionally unit-tested, per docs/conventions.md's "interaction
and rendering are Playwright's job" and this codebase's own precedent (no `main.test.ts`
exists — `main.ts` runs `requireElement` against a full real `#app` DOM at module-import
time, and `reconcileTilesGrid` is entangled with the tile-build/surface-mount pipeline;
standing up fakes for that would be the DOM-simulation harness the agent brief says not to
build). This is not a coverage gap left silently: it is exactly what
`e2e/actions.spec.ts`'s REQ-10/E6 test exercises end-to-end in a real browser, and
web-impl's Fix Attempt 2 report shows it passing repeatedly (2/2 four times back-to-back,
23/23 in the full file, plus a deliberate revert-and-reproduce check confirming the fix
closes the actual reported mechanism). What I added instead is the one piece of
*sequencing* logic that a real-browser E2E test can't isolate on its own (it only ever
asserts the end state, not that the capture specifically happened on `mousedown` rather
than by coincidence) and that is cleanly testable as glue logic with `vi.fn()` mocks —
exactly the "logic hiding in DOM code, test the seam" case the brief calls out, not a
DOM-rendering test.

## Verification

Read `web/src/render/tiledrag.ts` in full (by symbol, not stale line numbers) and
`web/src/main.ts`'s `pendingTileFocus` declaration + `reconcileTilesGrid` body to confirm
the Fix Attempt 2 description matches the actual code:

- `tiledrag.ts`: new `focusedBeforeDrag` module-local, set inside a `mousedown` listener
  guarded by the same `.thead` check as `dragstart` (calls `captureFocusedControl(gridEl)`
  from `./focus`), read into `preDragFocus` inside the `drop` handler right before
  `clearDragState()` (which also resets `focusedBeforeDrag = null` unconditionally), and
  passed as `onMove`'s third argument. `installTileDrag`'s `onMove` type gained the third
  parameter `focusedBeforeDrag: FocusedControl | null`.
- `main.ts`: `let pendingTileFocus: FocusedControl | null = null;` at module scope; the
  `installTileDrag(...)` callback (`tilesLive = moveTile(...); pendingTileFocus = focusedBeforeDrag; render();`)
  stores it; `reconcileTilesGrid` reads `pendingTileFocus ?? captureFocusedControl(tilesGridEl)`
  and immediately sets `pendingTileFocus = null` — consumed exactly once, so a later
  unrelated `render()` (the 1s tick, a chrome-only update) falls back to a live capture
  instead of replaying a stale drag's snapshot.

Confirmed `sessions/live.ts`'s `moveTile` is unchanged since the prior report (still reads
`targetIndex` from the original `live` array via `live.indexOf(targetId)` before filtering
out the dragged id — Fix Attempt 1's fix, already covered by the existing `moveTile` table).

Ran the full suite, the new file in isolation, and the build:

```
$ npx tsc --noEmit
(clean, exit 0)

$ npx vitest run src/render/tiledrag.test.ts
 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  22:04:08
   Duration  206ms

$ npx vitest run
 Test Files  18 passed (18)
      Tests  450 passed (450)
   Start at  22:04:15
   Duration  860ms

$ npm run build
> tsc --noEmit && vite build
✓ 30 modules transformed.
dist/index.html                   9.24 kB │ gzip:  2.12 kB
dist/assets/index-bbIaWQ5B.css   19.50 kB │ gzip:  4.30 kB
dist/assets/index-DBl0NzwL.js   372.09 kB │ gzip: 96.15 kB │ map: 892.08 kB
✓ built in 160ms
```

No regressions: the 446 tests passing before this pass still pass, plus 4 new ones, for
450/450.

## Test Run Output

```
$ npx vitest run
 RUN  v4.1.10 /Users/damian/Documents/code/Projects/muster/web

 Test Files  18 passed (18)
      Tests  450 passed (450)
   Start at  22:04:15
   Duration  860ms (transform 1.37s, setup 0ms, import 2.02s, tests 319ms, environment 2ms)
```

## Notes for the orchestrator

- Verdict: `pass`. No implementation changes were needed or requested in this pass.
- New file `web/src/render/tiledrag.test.ts` uses the same minimal-fake-DOM technique
  `render/focus.test.ts` already established for this exact seam (patch `globalThis.Element`
  with a hand-rolled stand-in supporting only `closest`/`dataset`/`classList`; mock
  `./focus`'s `captureFocusedControl` since its own logic is already covered by
  `focus.test.ts`). This is not a jsdom/DOM-simulation suite — no `jsdom` dependency exists
  in `web/package.json` or `node_modules`, and none was added.
- No test file was edited; no implementation file was touched.
