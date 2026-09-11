# Web Tests: Code Breakup

**Plan**: code-breakup
**Verdict**: pass

## Summary

Tests created: 22 (new file) | Passing: 1446/1446 (full suite) | Failing: 0

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `app.test.ts` | starts with the documented defaults | initial `AppState` (view/density/railSort/focusedId/connection) | pass |
| `app.test.ts` | starts with an empty store | `createApp()` wires a fresh `SessionStore` | pass |
| `app.test.ts` | calls a single listener with the emitted args | `on`/`emit` basic dispatch | pass |
| `app.test.ts` | calls multiple listeners for the same event in registration order | event bus fan-out order (REQ-3) | pass |
| `app.test.ts` | isolates events: a listener for one event is never called for another | event bus isolation | pass |
| `app.test.ts` | emitting an event with no registered listeners is a no-op, not a throw | `emit` with no listeners | pass |
| `app.test.ts` | a listener added by another listener during emit is not invoked in that same emit call | `list.slice()` snapshot semantics in `emit` | pass |
| `app.test.ts` | keeps calling every registered listener, in order, across repeated emits | fan-out stability across multiple emits | pass |
| `app.test.ts` | runs render phases in registration order | `onRender` / `render()` phase order (REQ-3) | pass |
| `app.test.ts` | re-runs every phase, in the same order, on each render() call | repeated `render()` calls | pass |
| `app.test.ts` | a phase registered has no effect on renders that already ran, but fires on the next | phase registration timing | pass |
| `app.test.ts` | passes every phase the same frame instance for a given render() call | single `RenderFrame` per `render()` | pass |
| `app.test.ts` | derives sessions from the store's current values | `RenderFrame.sessions` derivation | pass |
| `app.test.ts` | reflects store mutations made between renders | frame re-derivation on each render | pass |
| `app.test.ts` | stamps now as a Date instance | `RenderFrame.now` derivation | pass |
| `app.test.ts` | derives connected as true only when state.connection is 'connected' | `RenderFrame.connected` derivation across all three `ConnectionStatus` values | pass |
| `app.test.ts` | sets state.focusedId | `focus(id)` | pass |
| `app.test.ts` | accepts null to clear focus | `focus(null)` | pass |
| `app.test.ts` | emits focusChanged with the new id | `focus()` → `focusChanged` payload | pass |
| `app.test.ts` | emits focusChanged synchronously before focus() returns, ahead of any render the caller triggers next | REQ-3's "focus() emits focusChanged before any render" | pass |
| `app.test.ts` | does not itself trigger a render pass | `focus()` never calls `render()` | pass |
| `app.test.ts` | state.focusedId is already updated by the time focusChanged listeners run | ordering of state write vs. event emission | pass |

Plus two non-test fixes made as part of this step (no new test rows, existing suites re-verified green):

- `api.test.ts`: two comment lines fixed to cite `features/launch.ts` instead of the pre-move `render/launch.ts` (web-impl flagged these in its Handoff; the module they describe, `setPermissionMode`/`selectedPermissionMode`, is confirmed live at `web/src/features/launch.ts:108` and `:119`).
- `issue.test.ts`: moved from `web/src/render/issue.test.ts` to `web/src/features/issue.test.ts` (git mv) to sit beside the module it tests (`features/issue.ts`), per the plan's UI Specifications and this repo's "test beside the module" convention; its import shortened from `../features/issue` to `./issue` accordingly.

## Implementation Bugs

None. `app.ts` is a clean, DOM-free module — every behaviour REQ-12 names (event bus fan-out/order,
render-phase order, `focus()` ordering, frame derivation) was directly testable with no seams or
mocks needed.

No other pure logic was extracted from `main.ts` per `web-implementation.md`'s Changes table beyond
`app.ts` and `dom.ts`. `dom.ts` (`requireElement`/`requireElements`) is a two-line DOM-lookup
wrapper, not decoding/derivation/formatting logic, and per this agent's brief and
`docs/conventions.md` it belongs to Playwright (a missing required element fails every E2E test at
page load, which already covers it) rather than a DOM-simulation unit test. The one piece of
"prefs adoption decision" logic the plan's REQ-12 wording evokes — `tiles.ts` comparing incoming
`prefs.view`/`density` against its own closure-held `lastView`/`lastDensity` rather than
`app.state` — lives inside a DOM-bound controller (`features/tiles.ts`), which this agent's brief
excludes from unit testing; `web-implementation.md`'s Decisions section already names the E2E specs
(`tiles.spec.ts`/`views.spec.ts`, including the density-promotion and reconnect-echo cases) that
cover it, and re-running `make web-test`/`make web-build` after `app.ts` confirms nothing else in
the extraction is untested pure logic.

## Test Run Output

```
$ make web-test
cd web && npm test

> muster-web@0.0.0 test
> vitest run

 RUN  v4.1.11 /Users/damian/Documents/code/Projects/muster/web

 Test Files  31 passed (31)
      Tests  1446 passed (1446)
   Start at  18:15:21
   Duration  2.11s (transform 2.62s, setup 0ms, import 4.04s, tests 1.47s, environment 5ms)

$ make web-build
cd web && npm run build

> muster-web@0.0.0 build
> tsc --noEmit && vite build

vite v8.3.0 building client environment for production...
transforming...
✓ 58 modules transformed.
rendering chunks...
computing gzip size...
../internal/webui/assets/index.html                  16.06 kB │ gzip:   3.90 kB
../internal/webui/assets/assets/index-B9UVH72K.css   30.63 kB │ gzip:   6.28 kB
../internal/webui/assets/assets/index-BpMo6705.js   409.34 kB │ gzip: 106.31 kB │ map: 1,121.12 kB

✓ built in 194ms
```

`npx tsc --noEmit` (from `web/`) exits 0 with no output. `python3 .claude/skills/orchestrate/scripts/dead-refs.py` (from project root) reports `338 references checked, 0 missing`.
