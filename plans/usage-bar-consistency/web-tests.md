# Web Tests: Usage Bar Consistency

**Plan**: usage-bar-consistency
**Verdict**: pass
**Pack**: kb: pack 12057 words (budget 30000)

## Summary

Tests created: 5 (W1, W2 x3, clock-crossing) | Passing: 3037 of 3037 | Failing: 0

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `web/src/sessions/usage.test.ts` | W1: is unknown ... resetsAt is before now | past reset (1 ms) gives the unknown view model at 0/42/61.2/100% | pass |
| `web/src/sessions/usage.test.ts` | W2: stays a percentage when resetsAt is %s (x3) | reset equal to now, +1 s, +2 h keep percent, fill, warn, resets text | pass |
| `web/src/sessions/usage.test.ts` | turns unknown as the clock passes the reset | same bucket, now +1001 ms flips to unknown | pass |

## Handoff Received

`web/src/render/masthead.test.ts`: the 4 named fixtures (and the sibling fixture in the same describe) used `resetsAt` 2026-08-20T11:00:00Z against `now` 2026-08-23; moved to 2026-08-23T11:00:00Z so they stay known buckets.

## Implementation Bugs

None.

## Notes

R1/R2 and `web/render/usage.spec.ts:728` belong to render-tests. The per-model bar shares `buildUsageBucketViewModel` (web-impl Decisions), so W1 covers it.

## Test Run Output

```
Test Files  106 passed (106)
Tests  3037 passed (3037)
tsc --noEmit clean; npm run build ok
```
