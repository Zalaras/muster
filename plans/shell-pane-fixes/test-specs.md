# E2E Test Specs: shell-pane-fixes

**Plan**: shell-pane-fixes
**Mode**: authoring (red-first)
**Pack**: kb: pack 9272 words (budget 30000)
**Verdict**: authored
**Tests created**: 2
**Live run**: 1/2 passing (the red-first test fails on the assertion the plan names; the pin passes)

## Tests

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/shell-activity.spec.ts | under reduced motion the busy spinner does not spin, on the mainhead and in a tile footer (REQ-2) | REQ-2 | With `reducedMotion: "reduce"` emulated, a busy shell's indicator (mainhead, then tile footer) is visible with computed `animation-name` `none`, then becomes the done tick | ran-red-at-authoring (below) |
| web/e2e/shell-activity.spec.ts | without a reduced-motion preference the busy spinner still spins, on the mainhead and in a tile footer (REQ-2, edge case 1) | REQ-2 (unchanged behaviour) | No emulation: busy indicator's computed `animation-name` is `shellact-spin` in both places | ran-green-at-authoring (1 passed) |

## Deleted Tests

None

## Fixture Changes

No changes needed. A local `busyAnimationName` helper in the spec reads `data-act` and the computed `animation-name` in one evaluate, so the animation is only judged while the indicator is still busy (the done tick has no animation and would pass `none` vacuously).

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-2 | both tests above |

## Handoff

- `make web-build` fails in this tree right now: `tsc --noEmit` reports `src/terminal/shellkeys.test.ts(7,3): TS2305: Module './shellkeys' has no exported member 'accumulateWheelDelta'` (web-tests' red test for REQ-1, expected until web-impl lands). I built with `npx vite build` (tsc skipped) then `make build`; the product code is unchanged so the dashboard under test is the current one.
- `gatelock` was held by `gates.sh search-bar-text-length` (another worktree) for about 25 minutes; waited it out rather than bypass.

## Test Run Output

```
$ cd web && npx playwright test shell-activity.spec.ts -g "reduced motion|without a reduced"
  ✓  without a reduced-motion preference the busy spinner still spins, ... (REQ-2, edge case 1) (4.2s)
  ✘  under reduced motion the busy spinner does not spin, on the mainhead and in a tile footer (REQ-2) (4.3s)

    Error: expect(received).toEqual(expected) // deep equality
      Object {
        "act": "busy",
    -   "name": "none",
    +   "name": "shellact-spin",
      }
    > 453 |     expect(await busyAnimationName(mainheadIndicator)).toEqual({ act: "busy", name: "none" });
  1 failed, 1 passed
```

(`-g "reduced motion"` as in E1 selects only the red test.)

## Notes

The spin lasts `sleep 15` so both views are read well inside the busy window.
