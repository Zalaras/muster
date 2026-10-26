# Render Tests: Usage Bar Consistency

**Plan**: usage-bar-consistency
**Verdict**: pass
**Pack**: kb: pack 10885 words (budget 30000)

## Summary

Tests created: 4 (one replaces `usage.spec.ts:728`) | Passing: 4 | Failing: 0 (whole render suite 421 passed)

## Tests

| File | Test Name | Criterion | What It Verifies | Status |
|------|-----------|-----------|------------------|--------|
| `usage.spec.ts` | a bucket whose reset has passed reads unknown with no track and no reset suffix (R1, REQ-5, INV-1) | R1 | clock past both resets, and 3 days on: `unknown`, no `%`, no `i` track, no `.resets` | pass |
| `usage.spec.ts` | between the two resets only the earlier bucket reads unknown (R2, REQ-5, INV-1) | R2 | 5h unknown; 7d keeps percentage, track and reset suffix | pass |
| `usage.spec.ts` | a reset equal to the clock is not past: the percentage stays (W2, edge case 10, REQ-5) | W2/edge 10 | strict `<` boundary | pass |
| `usage.spec.ts` | the per-model bar reads unknown once its own reset has passed, while it keeps its value before (R3, REQ-5) | REQ-5 model bar | `usage-model`: model bar percentage after the 5h reset, `unknown` with no track/suffix after its own | pass |

Removed: "a stale resetsAt already in the past renders verbatim in the other-day form" (asserted the opposite of REQ-5), replaced by R1.

## Fixtures used

- `usage-known`: 5h (61%) reset at epoch+3 min, 7d (23%) at epoch+5 min, no model windows.
- `usage-model`: 5h reset +1 min, model windows reset +2 min.

## Implementation Bugs

None.

## Handoff

None. The fixtures were read as committed; tests derive instants from the fixture, so daemon-impl's move of `driveUsageKnown` resets to future instants (normalised to the same epoch walk) should not disturb them. Re-run `make render-test` after `make gen-render-fixtures` lands to confirm.

## Notes

None.

## Test Run Output

```
421 passed (4.8m)
```
