# Plan: shell-pane-fixes

**Status**: completed
**Shape**: fix
**Work Type**: web
**E2E Scope**: new-specs
**Fixture plan**: shell-activity.spec.ts daemon (per test, as every test in the file — indicator assertions depend on which session is auto-focused)
**Features**: surfaces
**Description**: The shell wheel's sub-line accumulation is a pure function the unit tests call directly, and the shell activity spinner stops spinning under `prefers-reduced-motion: reduce`.

## Symptom

From `TODO.md` § Shell pane, "Shell terminal follow-ups" (filed from
`plans/terminal-fixes-cleanup/proposed-backlog.md`, no issue):

> - **Unit-test the real wheel accumulator** — `shellkeys.test.ts`'s `accumulateFrame`
>   mirrors `pane.ts`'s private sub-line accumulation instead of calling it, so reverting the fix
>   in `pane.ts` leaves those tests green (only the `shell-scroll.spec.ts` E2E catches it). Lift
>   the step into `shellkeys.ts` as a pure `(accum, deltaY) => { accum, lines }` that `pane.ts`
>   calls. From `plans/terminal-fixes-cleanup/`.
> - **Reduced-motion rule for the activity spinner** — `shellact-spin` (0.7 s infinite) is
>   the stylesheet's only animation, and nothing in `web/src` or `docs/design` handles
>   `prefers-reduced-motion`. Stop or slow the spin under it. From
>   `plans/terminal-fixes-cleanup/`.

## Findings

- Accumulator — held as written. `web/src/terminal/shellkeys.test.ts:133` defines a local
  `accumulateFrame` that re-implements the step in `TerminalSurface.flushWheelScroll`
  (`web/src/terminal/pane.ts:198-206`, private, reading the private `wheelAccumDeltaY`).
  Measured: with `pane.ts` temporarily reverted to zero the accumulator every frame (the
  terminal-fixes-cleanup review cycle 1 bug), `npx vitest run src/terminal/shellkeys.test.ts`
  reported `Tests 23 passed (23)`. File restored afterwards.
- Spinner — held as written. `.shellact[data-act="busy"]` runs `animation: shellact-spin 0.7s
  linear infinite` (`web/src/style.css:1063`, keyframes `:1088`), the only `@keyframes` in the
  stylesheet; no `prefers-reduced-motion` anywhere in `web/src` or `docs/design`; no TypeScript
  `animate()` call. The three 120 ms transitions (`style.css:1287`, `:2849`, `:4040`) are left
  alone. Busy stays distinguishable when still: open circle vs. the done tick's shape, and
  `data-act` changes.
- Decided with the developer: stop the spin (no animation), not slow it.

## Requirements

### Must Have
- **REQ-1**: `shellkeys.ts` exports a pure function taking the accumulated `deltaY` and one more
  `deltaY` and returning the new accumulator and the `lines` to send (`0` → no frame, accumulator
  carries the whole sum; non-zero → the accumulator keeps only the remainder,
  `sum + lines * PIXELS_PER_LINE`). `pane.ts` calls it for its flush step; no second copy of the
  arithmetic remains in `pane.ts` or the tests. Behaviour unchanged: the same `scroll` frames go
  out for the same wheel events.
- **REQ-2**: Under `prefers-reduced-motion: reduce`, the shell activity indicator's busy state
  runs no animation (computed `animation-name` is `none`) on the Focus mainhead and in a tile
  footer; it still shows the busy shape, and the tick once done. Without the preference the spin
  is unchanged.

## Affected Files
### Web (web-impl)
- `web/src/terminal/shellkeys.ts` — REQ-1: the exported pure accumulator step.
- `web/src/terminal/pane.ts` — REQ-1: `flushWheelScroll` calls it instead of doing the arithmetic
  inline.
- `web/src/style.css` — REQ-2: one `@media (prefers-reduced-motion: reduce)` rule setting
  `animation: none` on `.shellact[data-act="busy"]`.
### Existing tests this breaks
- `web/src/terminal/shellkeys.test.ts`: the local `accumulateFrame` mirror goes; its two tests call
  the exported function instead (the Proof agent rewrites them in the red pass).

## Proof

1. Written by **web-tests** in `web/src/terminal/shellkeys.test.ts`: the two accumulation tests
   call the new export from `./shellkeys` (sub-line deltas accumulate until one rounds to a line;
   the remainder carries rather than resetting). Red today: the export does not exist.
2. Written by **e2e-specs** in `web/e2e/shell-activity.spec.ts`: new test *"under reduced motion
   the busy spinner does not spin, on the mainhead and in a tile footer"* —
   `page.emulateMedia({ reducedMotion: "reduce" })`, run a silent `sleep` in the shell, assert the
   busy indicator is visible with computed `animation-name` `none` in both places, then the tick
   once done. Red today: `animation-name` is `shellact-spin`.

## Edge Cases
1. Reduced motion off → spinner still spins → E2 (the existing shell-activity tests, which run with no preference emulated, plus a positive `animation-name` `shellact-spin` assertion in the new test's file).
2. Accumulated sum beyond the 200-line clamp → remainder carries to the next frame, as today → W1.

## Acceptance Criteria
### Automated Checks
```checks
W1 cd web && npx vitest run src/terminal/shellkeys.test.ts
E1 cd web && npx playwright test shell-activity.spec.ts -g "reduced motion"
E2 cd web && npx playwright test shell-activity.spec.ts shell-scroll.spec.ts
W2 make web-lint
W3 make web-test
W4 make web-build
E3 make e2e
```
### Reviewer-Verified
- `pane.ts`'s `flushWheelScroll` holds no accumulator arithmetic of its own beyond storing what the
  pure function returns.

## Doc Delta
**surfaces** — becomes true: the shell segment's busy spinner stands still when the system asks for
reduced motion.

## Out of scope
Nothing.
