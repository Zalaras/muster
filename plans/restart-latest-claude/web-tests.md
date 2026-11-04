# Web Tests: Restart Latest Claude

**Plan**: restart-latest-claude
**Verdict**: pass
**Pack**: kb: pack 21575 words (budget 30000)

## Summary

Tests created: 89 new (3051 -> 3140 total) | Passing: 3140 | Failing: 0
`npx tsc --noEmit` clean, `npm test` 108 files passed, `npm run build` succeeded, `npm run lint` clean.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `src/protocol/session.test.ts` | claudeVersion / restartPending | null, current, behind, pending decode; wrong shapes, empty `running`, missing keys reject | pass |
| `src/protocol/batch.test.ts` | parseRestartResult | four lists decode; missing/invalid `queued` rejects | pass |
| `src/api/sessions.test.ts` | restartSessions | POST /api/sessions/restart body, report, 400, generic error on a 3-list body | pass |
| `src/features/restartplan.test.ts` | isFree / isOfferedRestart / restartReason / confirm label / buildRestartPlan / dialog model | W3: free vs busy classification, reason words, `Restart N, queue M` / `Restart N` / `Queue M`, singular/plural | pass |
| `src/features/restartnotice.test.ts` | deriveRestartNotice / buildPanelModel / Ignore storage | W1 (when it shows, Ignore, pending), W2 (label, oldest, numeric order, major/minor differ, `↻N queued`), panel counts and queued list, W4 (storage round-trip, foreign shape, throwing storage) | pass |

## Handoff Received

Added `claudeVersion: null, restartPending: false` after `effortWarning: null` in every Session literal: `src/api/launch.test.ts`, `src/api/sessions.test.ts`, `src/features/actionscopy.test.ts`, `src/render/{dead,mainhead,sessions,tiles}.test.ts`, `src/sessions/{card,live,sort,store}.test.ts`, `src/sessions/testfixtures.ts`, `src/ws.test.ts`, `src/protocol/session.test.ts` (`validSession`), and `src/protocol/messages.test.ts` (also had a literal). The 68 vitest failures were all the new required keys and are now green.

## Notes

- The handoff suggested extending `connectionversion.test.ts` and `masthead.test.ts`. The notice logic landed in the pure `restartnotice.ts` (covered above); `connectionversion.ts` is unchanged, and the masthead notice shape is DOM, which is the render tier's job (render-tests, `web/render/`). `restart.ts` (controller), `render/restartpanel.ts` and `render/restartdialog.ts` are DOM code, covered by E2E/render, not here.
- Not done by me: the impl log's report that `web/e2e/helpers/claude-restart.ts` `dialogSection` locator is wrong and the daemon-side E2E failures; those belong to e2e-validate/daemon-impl.
- Render fixture JSON modifications under `web/render/fixtures/` are render-tests' and were not committed by me.

## Test Run Output

```
Test Files  108 passed (108)
     Tests  3140 passed (3140)
```
