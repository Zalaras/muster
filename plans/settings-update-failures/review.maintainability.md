# Maintainability review: Settings update failures

**Plan**: settings-update-failures
**Verdict**: approved
**Cycle**: 4
**Pack**: kb: pack 21844 words (budget 8000)
**Scope**: 22 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`, the same set as cycle 3. Since the cycle 3 review (`8f0dc8e`), five non-test files changed: `internal/selfupdate/failure.go` (comment only), `web/src/features/connection.ts`, `web/src/features/updaterestart.ts` (comments only), `web/src/main.ts` and `web/src/wsapp.ts`. I re-read each changed hunk in the context of its whole file. For unchanged files, cycle 3's reading still holds.

## Cycle 3 findings, re-checked

| Cycle 3 | State now | Evidence |
|---|---|---|
| Minor 1: mismatch suppression decided in two places (`wsapp.ts` and `connection.ts`) | resolved | `ConnectionDeps` gains `reloading(): boolean` (`connection.ts:33`). `showProtocolMismatch()` opens with `if (deps.reloading()) return;` (`connection.ts:175`). `wsapp.ts:84` is back to `onProtocolMismatch: () => connection.showProtocolMismatch()`, which is byte-identical to main's line 25. It has the same one-line delegation shape as `onSessionRemoved` two entries above it. `dashboardWsHandlers` drops its `updateRestart` parameter and the `UpdateRestartHandle` import. The headers now agree on one home: `connection.ts:4-7` ("Also owns whether a mismatched hello actually shows the mismatch screen … via `ConnectionDeps.reloading`"), `updaterestart.ts:4-8` ("the one cross-feature contact point … the sole decider of whether a mismatched hello shows the mismatch screen") and `wsapp.ts:5-6` ("this module only calls into whatever `WsAppConnection` the caller already built"), which is true again. `main.ts:85-88` passes both deps in one object literal. That is a composition-root registration, not logic (kb:adr/process-composition-roots-registration-only). `rg -n "initConnection\(" web/src web/e2e` finds one construction site (`main.ts:85`). The Fix Attempt 3 `design:` line states why this is a guard clause. |
| Minor 2: `INV-2` in `failure.go:77-78` | resolved | The comment now states the invariant itself ("no URL reaches the wire …") and cites `kb:adr/update-failure-one-sentence-chain-in-log`. `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts' \| grep '^+' \| grep -nE "REQ-[0-9]\|INV-[0-9]\|\bW[0-9]+\b\|\bD[0-9]+\b\|\bE[0-9]+\b"` prints nothing. |
| Note 1: `updaterestart.ts:4-6` "one contact point" untrue | resolved | The claim is true again because of the Minor 1 fix. |
| Note 3: `dashboardWsHandlers` carries two `Pick<>` feature slices | resolved | Only the `actions` slice remains (`wsapp.ts:65-69`). |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| cmd/musterd/main.go | preflight.go, onexit.go | n/a (unchanged since cycle 3) | filelen 502, reason holds; funlen `parseFlags` 41 / `run` 44 were already over on main | pass |
| internal/selfupdate/apply.go | verify.go, lock.go, release.go | yes | — | pass (unchanged) |
| internal/selfupdate/failure.go | verify.go, release.go, apply.go | yes | — | pass |
| internal/selfupdate/install.go | exeversion.go, semver.go | yes | — | pass (unchanged) |
| internal/selfupdate/release.go | apply.go | yes | — | pass (unchanged) |
| internal/selfupdate/CLAUDE.md | — | n/a | — | pass |
| internal/server/server.go | ingest.go, shells.go, themepoll.go | yes | funlen `New` 41 (41 on main), reason holds | pass (unchanged) |
| internal/server/update.go | updatewire.go, usage.go | n/a | — | pass (unchanged) |
| internal/server/updatemanager.go | updatewire.go, usagepoll.go, bgloop.go | yes | filelen 551, reason holds | pass (unchanged) |
| internal/server/ws.go | ingest.go, bgloop.go, internal/boundedwait/boundedwait.go | yes | — | pass (unchanged) |
| internal/server/CLAUDE.md | — | n/a | — | pass |
| cmd/musterd/CLAUDE.md | — | n/a | — | pass |
| web/src/app.ts | wsapp.ts | yes | — | pass (unchanged) |
| web/src/features/connection.ts | connectionrestore.ts, connectionversion.ts, updaterestart.ts | yes (Fix Attempt 3: guard clause) | — | pass |
| web/src/features/updaterestart.ts | update.ts, connection.ts, actions.ts | yes | — | pass (Note 1) |
| web/src/features/CLAUDE.md | — | n/a | — | pass |
| web/src/main.ts | (composition root) | yes (Fix Attempt 3) | — | pass |
| web/src/render/banner.ts | render/masthead.ts, render/issue.ts | yes | — | pass (unchanged) |
| web/src/render/CLAUDE.md | — | n/a | — | pass |
| web/src/style.css | (itself) | n/a | — | pass (unchanged) |
| web/src/ws.ts | wsapp.ts | yes | — | pass (unchanged) |
| web/src/wsapp.ts | ws.ts, features/connection.ts, features/actions.ts | yes | — | pass (Note 1) |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** Two comment lines this branch edited were not re-wrapped, and they run past the ~100-column width their neighbours keep:
   - `web/src/features/updaterestart.ts:9` (106 columns)
   - `web/src/wsapp.ts:4` (106 columns; main's version of the line ends at "mismatch)")

   Biome does not reflow comments, so lint stays green. No change requested.
2. **[note]** Carried over from cycle 3 Note 2: the URL-leak guard `strings.Contains(…, "://")` still appears twice in `internal/selfupdate/failure.go` (the `networkCause` path and the `DescribeCheckFailure` fallback). The two replacement phrases are deliberately different, and `design:` lines explain why. If URL detection ever gets stricter, give it one named home. No change requested now.
3. **[note]** Concurrency: nothing new this cycle. `reloading()` is still single-threaded page state. `dispatch` sets it in the `helloArrived` handler and reads it synchronously afterwards (`ws.ts:129-131`); it is now read inside `connection.ts` instead of `wsapp.ts`. The gates' `go test -race -count=1 ./...` passed `internal/server` (152.6s) and `internal/selfupdate` (5.8s) (`02-test.log`).
4. **[note]** The size warnings (`14-size.log`, 10 hits) are identical to cycle 3's. No `dupl` hit. The test funlen hits are outside this diff. For review-work: the test name `TestHandleCheckUpdate_ExactREQ8Message` (`internal/server/updatereclassify_test.go:441`) still carries a plan ID (cycle 2 Note 8).
