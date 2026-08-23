# Web Tests: M2 — Terminal panes

**Plan**: m2-terminal
**Verdict**: pass

## Fix Attempt 1 (review-cycle-1, wave 2)

**Failure addressed**: Critical 5 `[web-impl]` — the review required a test update as
part of the fix ("the fix needs the test updated too"), which only web-tests may make.

`renderTileGeometry`'s signature changed from `(refs, geometry)` to
`(refs, alive, geometry)`, and the marker text changed from `live`/`ended` to
`live`/`stopped`, driven by `session.alive` rather than geometry nullability. The old
`web/src/render/tiles.test.ts` locked the previous (wrong) geometry-derived behavior and
failed to compile against the new signature (`TS2554: Expected 3 arguments, but got 2` at
the two `it` blocks, confirmed in `web-implementation.md`'s Fix Attempt 1 verification
output).

**What changed in `web/src/render/tiles.test.ts`**:
- Both existing `renderTileGeometry` cases updated to the 3-arg call and corrected
  expectations (`"live"`/`"stopped"`, never `"ended"`).
- Added a case for the exact bug the finding named: `alive: false` with a **non-null**
  geometry (the "died while attached" case) still asserts `live"` — proving the marker
  no longer reads off `geometry`'s nullability.
- Added the mirror case: `alive: true` with **null** geometry, asserting `"live"` — the
  marker is driven solely by `alive`, in both directions.
- Added a new `describe("updateTile — ...")` block (`updateTile` was also introduced
  this wave, per `web-implementation.md`'s Critical 2 fix) covering: chrome fields
  written from the shared view-model onto existing nodes, re-derivation on a second call
  (no stale title/state left behind), and that `bodySlot` is never touched. This follows
  the file's existing convention (`renderTileGeometry`'s `fakeRefs`) of exercising
  template-free DOM mutation via fake elements with `querySelector`/`textContent`, since
  `updateTileChrome` mutates already-built chrome in place rather than cloning a
  `<template>` (which stays Playwright's job per this file's header comment).

No other implementation files from this wave (`main.ts`'s `reconcileTilesGrid`/
`updateTile` wiring, the `#sizenote` placeholder ordering, `reportPrefsFailure`, the
`pane.ts` cssVar fallbacks) exposed new template-free pure logic beyond what
`renderTileGeometry`/`updateTile` already cover — `reconcileTilesGrid` is DOM
orchestration glue in `main.ts` with no independent logic to isolate (same reasoning as
the existing "Notes on scope" section below), `reportPrefsFailure` is a two-line
`console.error` wrapper with no branching worth a dedicated case beyond what
`api.test.ts`'s existing `putPrefs` coverage already implies, and the sizenote-ordering
and cssVar-fallback fixes are DOM-timing/CSS behavior that Playwright's
`terminal.spec.ts`/`views.spec.ts` already exercise.

## Summary

Tests created/added (cumulative): 73 new `it`/`it.each` cases across 3 new test files +
6 modified files (68 from the initial pass + 5 added in this fix wave: 2 corrected +
2 new `renderTileGeometry` cases + 3 new `updateTile` cases, net +5 after removing none).
Full suite: **268 passing, 0 failing, 13 test files**. `npx tsc --noEmit`, `npm test`,
and `npm run build` all exit 0.

Two pre-existing fixtures broke by the approved protocol delta (`Prefs.density` becoming
required) were fixed as fixture value updates, per the handoff note in
`plans/m2-terminal/web-implementation.md` ("What must change: add `density: "2x2"`... a
value fix to an existing fixture, not a scope/strength change — squarely web-tests'
territory").

## Tests

| File | Test Name (representative) | What It Tests | Status |
|------|-----------|---------------|--------|
| `src/sessions/live.test.ts` (new) | `densityCount` 2x2→4 / 3x2→6 | REQ-8 grid sizes | pass |
| `src/sessions/live.test.ts` | `initialLive` top-N, fewer-than-N, empty | view-entry membership (entry) | pass |
| `src/sessions/live.test.ts` | `promote` demotes exactly the worst-ranked live member, re-sorts out-of-order input, no-op on already-live/unknown id, empty-live no-op, demotes a stale invalid id first | REQ-8 promotion (promotion) | pass |
| `src/sessions/live.test.ts` | `applyDensity` grow appends next-by-order into freed slots, skips already-live ids | density grow | pass |
| `src/sessions/live.test.ts` | `applyDensity` shrink keeps top-N of what was live, re-sorts before truncating | density shrink | pass |
| `src/sessions/live.test.ts` | `applyDensity` idempotent at capacity; does not reshuffle a user-chosen non-top-N live set | sticky-membership invariant | pass |
| `src/sessions/live.test.ts` | `applyDensity` drops a dead/removed session id and backfills from next-by-order; shrinks below N if nothing left to backfill | death | pass |
| `src/sessions/live.test.ts` | `applyDensity` backfills an under-capacity live set with a brand-new session id; leaves an at-capacity set untouched | new-session-with-free-slot | pass |
| `src/sessions/live.test.ts` | `surfaceDiff` open/close/keep for growth, shrink-to-empty, unchanged set, 1-for-1 refocus | REQ-11/INV-3 diff contract | pass |
| `src/terminal/overlay.test.ts` (new) | `overlayForCloseCode` maps 4000→superseded, 4001→ended, every other code (1000/1001/1006/1011/0/4002/3999)→disconnected | protocol §6 close-code contract | pass |
| `src/terminal/overlay.test.ts` | `overlayText` matches `/disconnected\|another window\|session ended/` for all three kinds | Testable UI Elements overlay pattern | pass |
| `src/protocol.test.ts` | fixed: `validSnapshot`/sessions-with-snapshot fixtures gain `density: "2x2"` | keeps M1-era fixtures valid under the M2 required-density delta | pass |
| `src/protocol.test.ts` | rejects `prefs.density` outside enum, rejects a snapshot missing `density` entirely, parses `density: "3x2"`, ignores unknown prefs fields alongside density | `parsePrefs` M2 refinement | pass |
| `src/protocol.test.ts` | new `describe("parseMessage — prefs")`: parses a fully-populated `prefs` message, rejects missing/invalid `prefs`/`density`, rejects non-object `prefs`, ignores unknown fields | `parsePrefsMessage` / INV-4 wire shape | pass |
| `src/ws.test.ts` | fixed: `snapshot` fixture gains `density: "2x2"`; `makeHandlers()` gains `onPrefs` | keeps existing dispatch/lifecycle tests valid | pass |
| `src/ws.test.ts` | `dispatch` routes a `prefs` message to `onPrefs` with the bare `Prefs`, not `onSnapshot`; full-socket-lifecycle test dispatches a `prefs` frame end-to-end | `onPrefs` wiring (new M2 handler) | pass |
| `src/api.test.ts` | `putPrefs` decodes a bare 204 as success without parsing a body; sends only supplied field(s) with same-origin credentials; sends both fields; decodes 400/401 error envelopes; falls back to generic error on a malformed or absent non-204 body | `PUT /api/prefs` client (REQ-10) | pass |
| `src/render/masthead.test.ts` | `renderViewSwitcher` sets `aria-pressed` on the correct button for each view | Testable UI Elements view switcher | pass |
| `src/render/masthead.test.ts` | `renderDensityControl` hides in Focus / shows in Tiles; `aria-pressed` reflects density in both views | Testable UI Elements density control | pass |
| `src/render/sessions.test.ts` | `renderFocusMain` toggles empty-state vs. terminal slot `hidden` | Focus main area state (REQ-7) | pass |
| `src/render/sessions.test.ts` | `renderSizenote` hides on `null` geometry, renders exact `<cols>×<rows> · one live client · geometry owned by this pane` text (byte-checked `×`), re-shows after being hidden | REQ-15 sizenote | pass |
| `src/render/tiles.test.ts` (new) | `renderTileGeometry` renders `cols×rows`/`live` marker when `alive`+geometry present, empty string/`stopped` marker when not `alive`+`null` geometry, `stopped` despite non-null geometry (died-while-attached), `live` despite `null` geometry | REQ-15 tile footer / review Critical 5 (marker keys off `alive`, never geometry nullability) | pass |
| `src/render/tiles.test.ts` | `updateTile` writes title/repoLine/contextText/stateClass from a fresh view-model onto existing chrome nodes, overwrites stale values on a second call, never touches `bodySlot` | review Critical 2 (in-place chrome refresh, no re-parenting) | pass |
| `src/render/tiles.test.ts` | `renderStrip` hides the strip when the session list is empty (edge case 7) | strip empty-state | pass |

## Implementation Bugs

None found.

## Notes on scope (what was deliberately NOT unit-tested, and why)

- **`web/src/terminal/pane.ts`** (`TerminalSurface`): DOM + real `WebSocket` + xterm.js
  lifecycle. The implementation already extracted its one piece of pure logic
  (close-code → overlay mapping) into `terminal/overlay.ts` specifically so it would be
  Vitest-testable without a real socket — that module is fully covered above. The rest
  (socket bridge, xterm instantiation, resize debounce timing against a real DOM
  container) is rendering/interaction and belongs to `web/e2e/terminal.spec.ts`
  (E1–E4, E11–E13), per `docs/conventions.md`'s Vitest/Playwright split. This is not an
  implementation bug — it's the correct application of the split, matching the
  pre-existing precedent in `render/sessions.test.ts` (the non-empty `renderSessions`
  branch, which clones a real `<template>`, is likewise left to Playwright).
- **`buildTile` / `renderStrip`'s non-empty branch / `buildSessionCardElement`**: all
  clone real `<template>` DOM via `document.getElementById`/`querySelector`, matching
  the exact pattern `render/sessions.test.ts` already established in M1 (see that file's
  own comment: "docs/conventions.md: rendering/DOM is Playwright's job, not Vitest's").
  Only the template-free code paths in these modules (`renderTileGeometry`, `renderStrip`
  empty branch, `renderFocusMain`, `renderSizenote`) were added to Vitest coverage here.
- **`web/src/main.ts`**: view/keyboard/socket orchestration glue. Every piece of real
  logic it calls (`sessions/live.ts`'s membership math, `sessions/sort.ts`'s ordering,
  `api.ts`'s `putPrefs`, `ws.ts`'s dispatch) is unit-tested directly; `main.ts` itself
  wires DOM elements and event listeners with no independent logic of its own to isolate,
  consistent with the "no other business logic here" note in its own file header.

## Test Run Output (fix wave 2, current)

```
$ npx tsc --noEmit
(no output — exit 0)

$ npm test
> muster-web@0.0.0 test
> vitest run

 RUN  v4.1.10 /Users/damian/Documents/code/Projects/muster/web

 Test Files  13 passed (13)
      Tests  268 passed (268)
   Start at  16:04:44
   Duration  674ms (transform 945ms, setup 0ms, import 1.30s, tests 132ms, environment 2ms)

$ npm run build
> muster-web@0.0.0 build
> tsc --noEmit && vite build

vite v8.2.1 building client environment for production...
✓ 23 modules transformed.
dist/index.html                   6.51 kB │ gzip:  1.71 kB
dist/assets/index-CHQ2aXiZ.css   15.87 kB │ gzip:  3.60 kB
dist/assets/index-DVHaMKwv.js   358.44 kB │ gzip: 92.16 kB │ map: 800.39 kB
✓ built in 152ms
```

## Test Run Output (fix wave 1, prior — kept for history)

```
$ npx tsc --noEmit
(no output — exit 0)

$ npm test
> muster-web@0.0.0 test
> vitest run

 RUN  v4.1.10 /Users/damian/Documents/code/Projects/muster/web

 Test Files  13 passed (13)
      Tests  263 passed (263)
   Start at  14:39:37
   Duration  693ms

$ npm run build
> muster-web@0.0.0 build
> tsc --noEmit && vite build

vite v8.2.1 building client environment for production...
✓ 23 modules transformed.
dist/index.html                   6.51 kB │ gzip:  1.71 kB
dist/assets/index-CHQ2aXiZ.css   15.87 kB │ gzip:  3.60 kB
dist/assets/index-zoVJTYLm.js   357.85 kB │ gzip: 91.92 kB │ map: 794.28 kB
✓ built in 154ms
```
