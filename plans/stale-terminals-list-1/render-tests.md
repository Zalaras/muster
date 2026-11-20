# Render Tests: Stale Terminals List 1

**Plan**: stale-terminals-list-1
**Verdict**: pass
**Pack**: kb: pack 11733 words (budget 30000)

## Summary

Tests created: 0 (one repair) | Passing: 509 | Failing: 0

## Tests

| File | Test Name | Criterion | What It Verifies | Status |
|------|-----------|-----------|------------------|--------|
| `terminals.spec.ts` | the panel lists shell 1 idle and build running ... (R5, REQ-11) | repair | shell POST stub now replies with `rev: 3` (the terminals-two snapshot's `terminalsRev`) | pass |

## Fixtures used

- `terminals-two`: snapshot with `terminalsRev` 3, shell 1 idle and build running.

## Handoff

None

## Notes

No other route stub under web/render/ answers a terminal route (only `/note` stubs exist elsewhere).
`make web-build` fails on `tsc` in web/src/features/surfaces.test.ts (web-tests' mid-repair file), so `make render-test` could not run. The bundle was built with `npx vite build` and the suite run with `npm run render-test` from web/ (render-lint included, no gate lock; another worktree held it exclusive).

## Test Run Output

```
509 passed (8.1m)
```
