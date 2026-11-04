# Web Tests: Popped-out note enhancements

**Plan**: popped-out-note-enhance
**Verdict**: pass
**Pack**: kb: pack 15117 words (budget 30000)

## Summary

Tests created: 3070 total in suite (107 files) | Passing: 3070 | Failing: 0

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `notespanelstate.test.ts` | places memory / queries | W1 round-trip, W2 old key ignored, W3 malformed entries dropped, W5 withoutAbsent, withPlace/withoutPlace, throwing storage | pass |
| `notesgeometry.test.ts` | defaultPlacement | W4 relative to slot, clamped into window, never below 260x150 | pass |
| `noteswindows.test.ts` | openOrFocus | W6 blocked popup returns false, focus instead of second open, reopen after close | pass |
| `noteswindows.test.ts` | parseNoteQuery | W7 missing, empty, negative, fractional, non-numeric, signed -> null; bare integer -> id | pass |

## Handoff Received

`notespanelstate.test.ts` rewritten for `loadPlaces`/`savePlaces`/`withPlace`/`withoutPlace`/`withoutAbsent`/`isPopped`/`rectOf` and the `muster.note-places` key.

## Notes

`defaultPlacement` is tested with a single clamp table (viewport edges and tiny window). The geometry clamp ordering (move in before shrinking) is `clampRect`, already covered by the existing `clampRect` table. No dupl repetition kept.

## Test Run Output

```
Test Files  107 passed (107)
Tests  3070 passed (3070)
tsc --noEmit clean; npm run build ok; npm run lint clean
```
