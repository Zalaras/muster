# Web Tests: Title crop and Stop/Resume button

**Plan**: title-crop-stop-resume-button
**Verdict**: pass
**Pack**: kb: pack 10391 words (budget 30000)

## Summary

Tests created: 13 (8 table rows + 5 renderer tests) | Passing: 13 | Failing: 0. Full suite: 91 files, 2503 tests pass. `npx tsc --noEmit`, `npm run build` and `npm run lint` are clean.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `sessions/card.test.ts` | stopResumeButton table (8 rows) | W3: label, action, disabled, reason for every `{alive, claudeSessionId, connected}` cell | pass |
| `render/mainhead.test.ts` | reads Stop, enabled, data-action end | live session -> Stop | pass |
| `render/mainhead.test.ts` | disables Resume with a reason when no bound id | REQ-5 / E5 shape | pass |
| `render/mainhead.test.ts` | enables Resume with no reason when id bound | enabled Resume | pass |
| `render/mainhead.test.ts` | disabled under either label while connection is down | E6 shape | pass |
| `render/mainhead.test.ts` | rewrites the same node in place, clearing a stale reason | alive<->dead flip keeps node identity | pass |
| `render/mainhead.test.ts` | no-session pins (unchanged) | W5 | pass |

## Handoff Received

`web/src/render/mainhead.test.ts`: `fakeMainheadElements` now builds one `stopResumeBtn` instead of `endBtn`/`resumeBtn`; `fakeButton` gained a `dataset` object; the "Resume disabled reason" block was rewritten as "the single Stop/Resume button" against the one node. The table W3 asked for is in `sessions/card.test.ts`.

## Notes

None. `orchestration-state.json` left untouched.

## Test Run Output

```
Test Files  91 passed (91)
     Tests  2503 passed (2503)
```
