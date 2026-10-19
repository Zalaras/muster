# Web Tests: shell-pane-fixes

**Plan**: shell-pane-fixes
**Verdict**: authored
**Pack**: kb: pack 4733 words (budget 30000)

## Summary

Red-first. Tests rewritten: 2 (in `web/src/terminal/shellkeys.test.ts`) | Failing (red): 2 | Other tests in file: 21 passing

Export name for web-impl: `accumulateWheelDelta(accumDeltaY: number, eventDeltaY: number): { accumDeltaY: number; lines: number }` exported from `web/src/terminal/shellkeys.ts`. Tests import it as that name and read both result fields.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `shellkeys.test.ts` | a run of sub-line deltas too small to scroll individually accumulates until one does | 0-line frames keep the whole sum; fifth -2 gives 1 line | fail (red) |
| `shellkeys.test.ts` | the remainder below a whole line carries into the next frame rather than resetting to 0 | -24 gives 1 line, remainder -4, then -4 gives 0 lines, accumulator -8 | fail (red) |

## Handoff Received

None

## Notes

The local `accumulateFrame` mirror and the now-unused `PIXELS_PER_LINE` import are removed. `npx tsc --noEmit` reports one error, TS2305 (no exported member `accumulateWheelDelta`). That is the plan's stated red (the export does not exist yet), and it is the only error.

## Test Run Output

```
FAIL  src/terminal/shellkeys.test.ts > accumulateWheelDelta — sub-line wheel accumulation ... > a run of sub-line deltas ...
TypeError: accumulateWheelDelta is not a function
FAIL  ... > the remainder below a whole line carries into the next frame ...
TypeError: accumulateWheelDelta is not a function
 Tests  2 failed | 21 passed (23)
```

## Review cycle 2 fix (review.code.cycle1.md issue 1)

Added `shellkeys.test.ts` > "a sum past the 200-line clamp carries the unconsumed pixels to the next frame": `accumulateWheelDelta(0, -5000)` gives `lines === 200` and `accumDeltaY === -1000`; the next call `(-1000, 0)` drains it to `lines === 50`, `accumDeltaY === 0`. Covers plan edge case 2 (W1).

Red proof: temporarily changed the return in `accumulateWheelDelta` to zero the accumulator when the clamp hit (`Math.abs(lines) === 200 ? 0 : ...`):

```
FAIL  src/terminal/shellkeys.test.ts > accumulateWheelDelta ... > a sum past the 200-line clamp carries the unconsumed pixels to the next frame
AssertionError: expected +0 to be -1000 // Object.is equality
 Tests  1 failed | 23 passed (24)
```

Restored with `git checkout`; `git diff web/src/terminal/shellkeys.ts` is empty. Green run: `npx vitest run src/terminal/shellkeys.test.ts` gives `Tests  24 passed (24)`; `npx tsc --noEmit` clean.
