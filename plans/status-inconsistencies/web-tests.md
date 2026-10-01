# Web Tests: Status Inconsistencies

**Plan**: status-inconsistencies
**Verdict**: pass
**Pack**: kb: pack 30809 words (budget 20000)

## Summary

Tests created: 29 new cases (W1 1 reworded, W2/W3 7 rows, W4 8 cases, plus fixtures) | Full suite: 1945 passing, 0 failing. `tsc --noEmit`, `npm run build` and `biome check src` are clean.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `sessions/card.test.ts` | offers no action for a live session | W1: live `actions` is `[]` | pass |
| `sessions/card.test.ts` | offers Resume then Remove ... ended | W1: ended `["Resume","Remove"]` (existing) | pass |
| `sessions/card.test.ts` | backgroundLine (W2, W3) table, 7 rows | alive n=0 null, n=1 "1 background task", n=2/12 plural; dead n=0/1/5 null; same via `buildCardViewModel().backgroundLine` | pass |
| `protocol/session.test.ts` | parseSession backgroundTasks (W4) | accepts 0/1/7; rejects missing, negative, fractional, NaN, null, string | pass |

## Handoff Received

All 12 named files got `backgroundTasks: 0` in their Session fixtures (api/launch, api/sessions, features/actionscopy, render/dead (2 fixtures), render/mainhead, render/sessions, render/tiles, sessions/card, sessions/live, sessions/sort, sessions/store, ws). Also `protocol/messages.test.ts` and `protocol/session.test.ts` wire fixtures, which were not named but would fail `parseSession` without the now-required field. card.test.ts's live `["End"]` assertion became `[]`; sessions.test.ts had no such assertion. `render/sessions.test.ts` fake card template gained the `.bg-tasks` slot (the real template has it and `applyCardText` requires it), and three focus-restore tests that focused a live card's End button now use ended cards and the Resume button (live cards have none).

## Notes

Rendering of the `.bg-tasks` element (text, title, hidden) is left to E5/E6 in Playwright; unit tests cover the pure `backgroundLine`. I did not run a failing-on-old-code proof: the W1 assertion (`[]` vs old `["End"]`) and W4 (old parser ignored the field) are visible from the diff.

## Test Run Output

```
Test Files  77 passed (77)
     Tests  1945 passed (1945)
```
