# Web Tests: General Cleanup

**Plan**: general-cleanup
**Verdict**: pass
**Pack**: `kb:pack plan=general-cleanup role=web-tests features=ingest,lifecycle,surfaces,actions,connection,theme,reader,triage,launch`

## Summary

Tests created: 25 | Passing: 25 | Failing: 0 (full suite: 41 files, 1669 tests, all passing)

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `app.test.ts` | carries connection verbatim from state.connection, with connected always the derived (connection === 'connected') (REQ-8, W1) | frame.connection equals state.connection and frame.connected === (connection === "connected") across all three statuses | pass |
| `focusrestore.test.ts` | isRestorableControl: true for button/select inside #app, case-insensitive tag, false for button outside #app, textarea (edge case 10), anchor, body, null | `isRestorableControl` per W2 | pass (7 cases) |
| `focusrestore.test.ts` | shouldRestoreFocus: true only for {activeIsBody:true, stillInDocument:true, disabled:false}; false for each single condition flipped (edge cases 8, 9, 11) and all-false | `shouldRestoreFocus` decision table per W2 | pass (5 cases) |
| `notice.test.ts` | deriveNotice is "connecting…" for status "connecting" across 4 loadingPath/bodyRendered/noticeText combinations | independence from other inputs while never-connected | pass (4 cases) |
| `notice.test.ts` | deriveNotice is the unreachable text for status "reconnecting" across 4 combinations | independence from other inputs while disconnected | pass (4 cases) |
| `notice.test.ts` | deriveNotice for status "connected": full loadingPath × bodyRendered cross (4 cells) plus absent-noticeText (null) fallthrough | W3's connected-status rules, including the "no data yet" case (null noticeText) | pass (6 cases) |
| `notice.test.ts` | classifyDocChanged: refetch on same path, dots on null openPath, dots on differing path (edge case 7) | W4 | pass (3 cases) |

## Implementation Bugs

None found. `RenderFrame.connection`, `shouldRestoreFocus`/`isRestorableControl`, and `deriveNotice`/`classifyDocChanged` all match the plan's stated behaviour exactly, including the boundary/absent cases (null `loadingPath`, null `noticeText`, `openPath === null`).

## Test Run Output

```
$ npx tsc --noEmit
(no output — clean)

$ npm test
 RUN  v5.0.0 /Users/damian/Documents/code/Projects/muster/web
 Test Files  41 passed (41)
      Tests  1669 passed (1669)
   Start at  15:38:25
   Duration  2.17s

$ npm run build
✓ built in 1.67s
(pre-existing chunk-size warnings only, unrelated to this plan)
```

## Notes

- W5/W6 (`make web-build`, `make web-test`) are Automated Checks the orchestrator runs;
  this agent instead ran the equivalent `web/` commands directly (`npx tsc --noEmit`,
  `npm test`, `npm run build`) since the Go tree is mid-edit under a concurrent daemon-impl
  run and `make` targets were out of scope for this step.
- No existing test file needed changes: no import path this plan moved renamed a symbol
  another test imports, and `web-implementation.md` records no other test-visible surface
  change beyond W1-W4's targets.
- `web/vitest.config.ts` untouched — the three new/edited files already match its
  `src/**/*.test.ts` include.
