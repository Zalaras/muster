# Web Tests: diff-viewer

**Plan**: diff-viewer
**Verdict**: pass
**Pack**: kb: pack 22825 words (budget 30000)

## Summary

Tests created: 93 | Passing: 93 | Failing: 0 (full `npm test`: 3360 passed)

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `web/src/api/diff.test.ts` | summary / diff / review decoders | valid bodies, null `oldPath`/line numbers, empty review, 7+9+7 malformed-body rows rejected, 500/404/413 envelopes, network error, request paths | pass |
| `web/src/api/diff.test.ts` | writes | PUT body, DELETE no body, POST both tick lists, 204 = success | pass |
| `web/src/features/diffbutton.test.ts` | diffButtonText / pickScope / titles / whatChanged / diffErrorText | button text per state (uncommitted, branch prefix, comments, closed/open), absent (null) for no summary / non-repo / clean, staleness text | pass |
| `web/src/features/diffmodel.test.ts` | buildFileModel / changeKey / fileTick / progress | change grouping, hunk boundaries, key stable across line shifts and distinct per content, 256-char limit, tick states | pass |
| `web/src/features/diffplace.test.ts` | placeComment | placed, shifted, nearest duplicate, partial, out-of-order, outdated, old side | pass |
| `web/src/features/diffwords.test.ts` | wordDiff | changed words only, rejoin, null for rewritten/identical/empty/over 400 tokens | pass |

## Handoff Received

None (impl log: no existing tests broken).

## Notes

- `npx tsc --noEmit` and `npm run build` currently fail on one error outside my files: `web/render/diff.spec.ts(1,56): 'viewer' is declared but its value is never read` — render-tests' uncommitted file, in progress beside me. My files type-check clean. Needs re-running once render-tests commits.
- DOM-bound modules (`diffviewer.ts`, `diffcomments.ts`, `diffreviewui.ts`, `diff.ts`) are covered by E2E/render tiers, not here.

## Test Run Output

```
Tests  3360 passed (3360)
tsc: render/diff.spec.ts(1,56): error TS6133 (not mine)
```

## Fix Attempt (review cycle 1)

**Verdict**: pass. `npx tsc --noEmit` clean for my files; `npm test` 3373 passed. `npm run build` fails only on `web/render/diff.spec.ts` lines 286-288 (render-tests' file, TS2532), not mine.

- Handoff repaired: `diffmodel.test.ts` no longer imports `entryLine` (reads `Entry.line`); new rows for `Entry.sign`, `Change.counts`, `FileModel.counts`/`path` (incl. rename `old → new`).
- Correctness Major 3 (`hidden-pause-untested`): new `features/diff.test.ts` drives `initDiff` with a stubbed `document` (`hidden`), fake timers and a mocked `fetchDiffSummary`: no request over 20 s while hidden; one request for the focused id on `visibilitychange` to visible; 5 s polling while visible; no polling in grid or with no focused session. It fails if the `!document.hidden` guard is dropped.
- New `features/diffreviewui.test.ts`: tick posts chain (second post waits for the first, sends the later state, ordered calls); failed post keeps keys pending, shows the failure, retries next flush; no empty post; `reopened` cleared on tick/untick.
- `diffbutton.test.ts`: `MINUS`/`signedCounts`. `diffplace.test.ts`: `commentHeading` (the `lineLabel` rows already existed).

**Handoff**: not unit-testable as built: comment upsert-by-id (`tracked`/`upsert` are closures inside `createComments`, which needs the viewer's DOM refs) and `applyReview`'s keep-comments-when-a-write-overlapped rule (closure inside `createViewer`). Falsify at render level (`web/render/diff.spec.ts`: comment write racing a Refresh), or extract them as pure functions (`upsertComment(list, c)`, `keepComments(writes, now)`) for a unit test.
