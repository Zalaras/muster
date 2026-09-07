# Web Tests: v1 Cleanup

**Plan**: v1-cleanup
**Verdict**: pass

## Summary

Tests created: 1 file, 12 tests | Passing: 12 | Failing: 0

## Scope note

The plan's web-tests file list names exactly two files: `web/src/terminal/notice.test.ts`
(new) and `web/src/render/dead.test.ts` ("existing mirror assertions must still pass
unchanged"). Everything else the web-implementation touched (`api.ts`/`launch.ts` comment
corrections, `style.css`'s `--edge` swap, `pane.ts`'s delegation) is non-logic per
`docs/conventions.md`'s Vitest/Playwright split — no new test needed there, and none is
listed in the plan. REQ-16/17/18 (E2E comment/variable/cleanup-guard corrections) are
`e2e-specs`'s harness-only edits per `plans/v1-cleanup/test-specs.md` — confirmed by
reading that file; no overlap with my scope.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `notice.test.ts` | un-hides the target and sets its text | default "outcome" kind shows text | pass |
| `notice.test.ts` | auto-hides after exactly 5s | REQ-13: outcome auto-hide timing, boundary at 4999/5000ms | pass |
| `notice.test.ts` | passing null clears an already-shown notice immediately | explicit clear, no timer wait | pass |
| `notice.test.ts` | calling with null when nothing was ever shown is a safe no-op | no pending timer to clear | pass |
| `notice.test.ts` | edge case 6: a second outcome replaces a first and resets the timer | stale timer must not fire on new text | pass |
| `notice.test.ts` | inflight: shows the text and un-hides the target | same visibility behaviour as outcome | pass |
| `notice.test.ts` | inflight: never auto-hides, no matter how much time passes | REQ-13's core distinction — no timer armed | pass |
| `notice.test.ts` | edge case 6: an outcome after an inflight notice replaces it and DOES auto-hide from the outcome call | in-flight → outcome transition | pass |
| `notice.test.ts` | edge case 7: showNotice(null) while inflight clears it and leaves no timer armed for later content | inflight → clear → later notice unaffected | pass |
| `notice.test.ts` | a second inflight call replaces the first's text and still arms no timer | inflight → inflight | pass |
| `notice.test.ts` | edge case 8: two targets' auto-hide timers do not interfere | WeakMap keying, offset timers | pass |
| `notice.test.ts` | clearing one target's notice does not touch another target's pending timer | WeakMap keying, explicit clear | pass |

`dead.test.ts` was not modified — its existing `showDeadSurfaceNotice` describe block
(un-hide/set-text, 5s auto-hide, null-clears, replace-resets-timer, no-op-when-nothing-
shown, safe-no-op-when-`noticeEl`-undefined) passes unchanged through the new delegation
to `notice.ts`, confirmed by the full run below. `renderDeadSurface` and `loadPane`
describe blocks are untouched by this plan and also pass.

## Declined coverage

None — REQ-12/REQ-13 are the only requirements assigned to web-tests, and both are covered
directly against the extracted module (not just indirectly through `dead.ts`'s delegation).

## Test Run Output

```
$ npx tsc --noEmit
(no output — clean)

$ npx vitest run src/terminal/notice.test.ts
 RUN  v4.1.10 /Users/damian/Documents/code/Projects/muster/web
 Test Files  1 passed (1)
      Tests  12 passed (12)
   Duration  277ms

$ npm test
 RUN  v4.1.10 /Users/damian/Documents/code/Projects/muster/web
 Test Files  29 passed (29)
      Tests  1053 passed (1053)
   Duration  1.94s

$ npm run build
> tsc --noEmit && vite build
✓ built in 233ms
```

All three gates (`tsc --noEmit`, `npm test`, `npm run build`) are green.
