# Web Tests: Plain terminal session

**Plan**: plain-terminal-session
**Verdict**: pass

## Summary

Tests created: 50 | Passing: 50 | Failing: 0 (full suite: 1046/1046 passing)

## Scope decisions

- **`web/src/terminal/surfaceswitch.ts` is the plan's designated testable seam**
  (Implementation Notes → Testability) and had zero prior coverage. Covered exhaustively:
  `DEFAULT_SURFACE_STATE`/`getSurfaceState`, `selectSurface`, `setShellRunning`,
  `shellEnded`, `forgetSession`, `isSurfaceAttachable`, `surfaceKey`/`parseSurfaceKey`,
  and `updateSurfaceSegment` (against hand-built fakes, not real DOM — see below).
- **`web/src/api.ts`'s new `createShell`** (protocol §3.16) got the same decoding
  coverage as every existing POST-with-error-envelope function in `api.test.ts`
  (`endSession`, `resumeSession`, `removeSession`): success body, each of the three
  documented error codes (404/409/500), malformed-success-body fallbacks (missing
  `target`, missing `created`, wrong type for `created`), a non-JSON error body, and
  addition to the existing rejected-fetch `network_error` parametrized case list.
- **`buildSurfaceSegment` (in `surfaceswitch.ts`) is out of scope.** It calls
  `document.createElement` directly — real DOM construction with no jsdom/happy-dom
  installed in this project's Vitest setup (confirmed: neither package is in
  `node_modules`; `vitest.config.ts` specifies no `environment`, so it runs under plain
  Node with no `document` global at all). This is the exact category `tiles.test.ts`'s
  own header comment already excludes for `buildTile` ("clone real `<template>` DOM ...
  Playwright's job"). The Testable UI Elements table's `role="group"`/button-name/pip-
  presence assertions are covered by the plan's Playwright spec
  (`web/e2e/plain-shell.spec.ts`), not duplicated here.
- **`render/mainhead.ts`'s and `render/tiles.ts`'s integration points were left to their
  existing test files, unchanged, deliberately.** Both only gained a conditional
  pass-through call to `updateSurfaceSegment` (mainhead.ts) or real DOM construction via
  `buildSurfaceSegment`/`renderTileFooterActions`'s tail-slicing (tiles.ts — itself
  DOM-template-cloning, the same excluded category as `buildTile`). I checked
  `mainhead.test.ts` and `tiles.test.ts` directly: neither builds a fixture with a
  `surfaceSegment`/`actsEl` populated with real segment DOM, and both already declare
  (in their own header comments) that anything touching a real `<template>` clone or a
  full render pass with DOM children belongs to Playwright. `updateSurfaceSegment` itself
  — the actual logic behind that pass-through — is fully covered directly, so the
  mainhead/tiles glue is a one-line unconditional call with no branching value of its own
  to pin.
- **`web/src/terminal/pane.ts`'s new `SurfaceKind`-based branching** (WS path selection,
  aria-label prefix, the `kind === "claude"` dead-overlay guard, the
  `kind === "shell" && event.code === 4001` `onShellEnded` gate) has no test file at all
  (none existed before this plan either) — it's fully embedded in the `TerminalSurface`
  class's constructor/socket-event-handler, which is DOM+WebSocket-driven with no jsdom
  available, matching the pre-existing precedent that `pane.ts` has zero Vitest coverage
  and is exercised entirely through `web/e2e/terminal.spec.ts` /
  `web/e2e/plain-shell.spec.ts`. Not an implementation bug — it's the established split
  for this exact file, not something this plan changed.
- **`main.ts`'s `handleSurfaceSelect`/`handleShellEnded`/render-pass surface diffing** —
  no test file exists for `main.ts` (never has; it's the DOM entry point per its own
  design). The pure state transitions it drives (`selectSurface`, `setShellRunning`,
  `shellEnded`, `isSurfaceAttachable`, `surfaceKey`/`parseSurfaceKey`) are exactly what's
  covered in `surfaceswitch.test.ts` above; the orchestration around them (async API
  calls, socket construction, DOM lookups) is not separable from `main.ts`'s closure
  state without a jsdom environment this project doesn't have.

## Tests

| File | Test Name (abridged) | What It Tests | Status |
|------|-----------|---------------|--------|
| `terminal/surfaceswitch.test.ts` | DEFAULT_SURFACE_STATE is claude/no-pip | States: "no data yet" | pass |
| `terminal/surfaceswitch.test.ts` | getSurfaceState returns default for unset id / stored entry / no cross-id leak | state lookup | pass |
| `terminal/surfaceswitch.test.ts` | selectSurface switches, preserves shellRunning across switch-back, identity when already selected (both explicit and default-implicit), doesn't disturb other sessions | REQ-5/REQ-6 | pass |
| `terminal/surfaceswitch.test.ts` | setShellRunning sets/clears independent of selected, identity when unchanged (explicit and default-implicit) | REQ-1/REQ-8 | pass |
| `terminal/surfaceswitch.test.ts` | shellEnded reverts to claude+clears pip when shell was showing, still clears pip when claude was already showing (edge case 7), identity at default (explicit and default), doesn't disturb other sessions | REQ-8 | pass |
| `terminal/surfaceswitch.test.ts` | forgetSession removes entry, identity when absent, leaves others untouched | session removal cleanup | pass |
| `terminal/surfaceswitch.test.ts` | isSurfaceAttachable: claude follows alive (both directions), shell follows shellRunning regardless of alive (both directions), unset session follows alive | REQ-7 | pass |
| `terminal/surfaceswitch.test.ts` | surfaceKey/parseSurfaceKey round-trip both kinds, distinct keys per kind and per id, unrecognised kind suffix falls back to claude, malformed key (no separator) yields NaN id without throwing | INV-3 key shape | pass |
| `terminal/surfaceswitch.test.ts` | updateSurfaceSegment: no-shell state has no pip/claude pressed; running+visible shell has pip/shell pressed; running+hidden shell keeps pip (positive claim, independent of selection); pip removed once shellRunning goes false; no duplicate pip on repeated pass | States: "no data yet"/"data" | pass |
| `terminal/surfaceswitch.test.ts` | updateSurfaceSegment: both buttons disabled when connected=false regardless of state; re-enabled on reconnect; shell segment not disabled by session state, only connected | States: "daemon down" | pass |
| `api.test.ts` | createShell posts to id-scoped endpoint, decodes created:true (D1) | protocol §3.16 success | pass |
| `api.test.ts` | createShell decodes created:false (D2, idempotent) | protocol §3.16 success | pass |
| `api.test.ts` | createShell decodes 404 unknown_session | error envelope | pass |
| `api.test.ts` | createShell decodes 409 directory_missing (REQ-12/E9) | error envelope | pass |
| `api.test.ts` | createShell decodes 500 shell_spawn_failed, message verbatim (REQ-12) | error envelope | pass |
| `api.test.ts` | createShell falls back to unknown_error on missing target / missing created / non-boolean created | malformed success body | pass |
| `api.test.ts` | createShell never throws on non-JSON error body | decode safety | pass |
| `api.test.ts` | createShell added to the rejected-fetch network_error parametrized case list | REQ-13 pattern | pass |

## Implementation Bugs

None found. `surfaceswitch.ts`'s state machine matches the plan's REQ-1/REQ-4/REQ-7/REQ-8
and the States section exactly, and `createShell`'s decoding matches protocol §3.16
exactly (success shape, all three documented error codes).

Note: the web-implementation.md handoff flags a suspected **daemon-side** INV-6
violation (E7/E15's e2e test failing — a nested, un-enveloped `claude` run appears to
mutate the parent session's state) discovered during web-impl's own E2E smoke check.
That is not something this Vitest suite can observe (it's an ingest/state-machine defect
in Go code, already flagged in the plan's own Handoff section for daemon-tests/review to
pick up) and is out of scope for a web unit-test verdict.

## Test Run Output

```
> muster-web@0.0.0 test
> vitest run

 RUN  v4.1.10 /Users/damian/Documents/code/Projects/muster/web

 Test Files  28 passed (28)
      Tests  1046 passed (1046)
   Start at  22:42:58
   Duration  1.53s (transform 2.24s, setup 0ms, import 3.38s, tests 748ms, environment 5ms)
```

`npx tsc --noEmit` — exit 0, no output.

`npm run build` — exit 0:
```
> muster-web@0.0.0 build
> tsc --noEmit && vite build

vite v8.2.1 building client environment for production...
✓ 42 modules transformed.
✓ built in 216ms
```

## Fix Attempt (review cycle 1)

**Issue addressed**: review.md Minor 1, paired `[web-impl]` + `[web-tests]` change.
web-impl deleted `aliveOnly`, `surfaceDiff` and the `SurfaceDiff` type from
`web/src/sessions/live.ts` (commit db9fcc3, `main.ts` was their only production caller and
no longer uses them). My half: drop the two `describe` blocks in
`web/src/sessions/live.test.ts` that exercised them, and their now-dangling import.

**Changes made**:

- `web/src/sessions/live.test.ts`: removed `aliveOnly`/`surfaceDiff` from the `./live`
  import, and deleted the `describe("aliveOnly ...")` (6 tests) and
  `describe("surfaceDiff ...")` (5 tests) blocks in full — 11 tests removed, nothing else
  in the file touched.
- Also covered in this wave, per the fix-wave prompt's second instruction: web-impl's
  `Fix Attempt 1` (Major 1) added `showDeadSurfaceNotice` to `web/src/render/dead.ts` and
  `findDeadSurfaceRefs` to `web/src/main.ts`.
  - `showDeadSurfaceNotice` has the same pure, DOM-fake-testable contract as
    `renderDeadSurface` already tested in this file (`dead.test.ts`): it only assigns
    `.hidden`/`.textContent` on an already-built ref and schedules/clears a `setTimeout`
    keyed on the notice element's own object identity, no `querySelector`/`cloneNode`
    involved. Added a new `describe` block (`web/src/render/dead.test.ts`) with 7 tests
    using `vi.useFakeTimers()` and the file's existing plain-stub-refs pattern: shows text
    and un-hides; auto-hides at exactly 5000ms (not before); `null` clears immediately
    without waiting for the timer; a second call while the first's timer is still pending
    replaces the text **and** cancels the stale timer (asserted by advancing exactly to
    where the first timer would have fired and confirming the notice is still showing the
    second text); a bare `null` call with nothing pending is a no-op; and — mirroring the
    file's own pre-existing `fakeRefs()` fixture, which `dead.ts`'s doc comment says
    predates the `noticeEl` field — a `refs.noticeEl === undefined` call is a safe no-op in
    both the text and `null` directions.
  - `findDeadSurfaceRefs` (`web/src/main.ts:514`) is **not** unit-testable as built: it is
    an unexported function entangled with `main.ts`'s module-level mutable state
    (`focusedId`, `deadSurfaceEl`, `tileElements`) and real DOM queries
    (`requireElement("#dead-surface")` at module load, `.bodySlot.querySelector(...)` at
    call time) — there is no `main.test.ts` in this repo and none of `main.ts`'s DOM-wiring
    functions have one, consistent with `docs/conventions.md`'s Vitest/Playwright split.
    This is Playwright's job, not an implementation bug: the fix-wave prompt anticipated
    exactly this case ("if it needs a real DOM ... record it as Playwright's job ... rather
    than forcing it"). Not logging a bug; the E2E half of this fix (Major 1's "measured"
    Playwright run, described in web-implementation.md's Fix Attempt 1) already covers the
    two `findDeadSurfaceRefs` branches (Focus's dead surface, a tile's dead surface) that
    matter behaviourally.

**Verdict**: pass. 1041/1041 tests pass (1046 − 11 removed + 6 added = 1041), `npx tsc
--noEmit` clean, `npm run build` exit 0.

`make web-test` output:
```
> muster-web@0.0.0 test
> vitest run

 RUN  v4.1.10 /Users/damian/Documents/code/Projects/muster/web

 Test Files  28 passed (28)
      Tests  1041 passed (1041)
   Start at  23:25:11
   Duration  1.48s (transform 2.20s, setup 0ms, import 3.28s, tests 772ms, environment 4ms)
```
