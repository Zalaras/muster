# Daemon Tests: Effort

**Plan**: effort
**Verdict**: pass
**Pack**: kb: pack 38313 words (budget 30000) — WARN pack exceeds budget of 30000 words

## Summary

Tests created: 34 new test functions in 6 new files (about 300 table rows and subtests, 204 of them the D7 cross-table) plus edits to 8 existing files | Passing: all | Failing: 0.

Review cycle 1 fix wave (commit `(review cycle 1)`): daemon-impl's Fix Attempt 2 (kb:adr/focus-effort-dismiss-404-uses-shared-body, the developer's decision) made the dismiss route serve the shared `{"error":{"code":"unknown_session","message":"unknown session id"}}` through `parseSessionID` / `writeUnknownSession`, the contract's old `no session with that id` is gone. `internal/server/effort_test.go`: the route-specific-message test is renamed `TestHandleDismissEffortWarning_UnknownSessionIs404WithTheSharedBody` and asserts the shared body (`wantUnknownSessionBody`) for an unknown and a malformed id; `TestHandleDismissEffortWarning_UnknownSessionCodeIsUnknownSession` is deleted, its only assertion (`unknown_session` code) being a subset of the shared-body check. `internal/server/respond_unknown_session_test.go`: the shared-envelope table gains `handleDismissEffortWarning/unknown` and `/malformed id`, so the route is pinned byte-identical with the other session routes.

`go build ./...` exits 0. `make lint` → `0 issues.` `make test` exits 0, every package `ok`. The canary static tier (`TestInstalledBinaryCarriesInterfaceStrings`) passed in the previous run against the installed 2.1.300 and is untouched.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/claudecode/effort_test.go` | TestValidEffort | the five levels valid; case, padding, empty, `default`, `auto` invalid; `EffortLevels` order | pass |
| `internal/claudecode/effort_test.go` | TestBuildArgv_Effort | D4/D9/D12: `--effort` after `--permission-mode` on launch, Resume button, Resume-tab; none when empty | pass |
| `internal/claudecode/effort_test.go` | TestPastSessions_Effort | D12 transcript scan: last assistant line wins, none recorded, key-less assistant line resets, non-assistant lines ignored, open string verbatim | pass |
| `internal/claudecode/effort_test.go` | TestInterpretStatus_Effort | REQ-5: reading non-nil on every post; absent / null / empty / `{}` read as nil level; levels verbatim; builder-made full post | pass |
| `internal/claudecode/effort_test.go` | TestInterpretStatus_EffortReadingsAreIndependent | the reading owns its string | pass |
| `internal/store/effort_test.go` | TestInsertSession_EffortSeeding | launch level = pending check with effort unknown; Resume-tab seed = known level, no check | pass |
| `internal/store/effort_test.go` | TestUpdateSession_EffortNullBearingShapesRoundTrip | known with NULL level; warning with NULL actual; warning cleared leaves effort | pass |
| `internal/store/effort_test.go` | TestRepo_LastEffort | `UpsertRepo` records level / NULL, overwrites; `TouchRepo` leaves it and gives a new row NULL; Get/List read it | pass |
| `internal/store/session_test.go` | TestUpdateSession_RoundTripsEveryField (extended) | the six session effort columns round trip | pass |
| `internal/session/effort_test.go` | TestApplyStatus_EffortAdoption | D5: level verbatim, no key = `{level:null}`, one upsert per change and none when unchanged, store holds it | pass |
| `internal/session/effort_test.go` | TestApplyStatus_EffortPostWithoutAnEffortReadingLeavesEffortAlone | a post with no reading neither adopts nor consumes the check | pass |
| `internal/session/effort_test.go` | TestApplyStatus_FirstReportChecksTheLaunchedEffort | D6/REQ-7, edge cases 6-9 and 20: warn iff the first report differs (null differs); default launch never; later reports never; warning stays | pass |
| `internal/session/effort_test.go` | TestApplyStatus_FirstReportWarningModelFollowsTheSessionModel | warning model = display name after the post; launch model when the post has none; null only with no model | pass |
| `internal/session/effort_test.go` | TestApplyStatus_ResumeTabSeedShowsAtOnceWithNoCheck | seeded effort known at once, no check; unseeded starts null | pass |
| `internal/session/effort_test.go` | TestClearEffortWarning | D13 at the manager: one upsert, persisted, effort kept, second dismiss silent, unknown id `ErrUnknownSession`, bystander untouched | pass |
| `internal/session/effort_test.go` | TestEffortRowRoundTrip | `sessionToRow`/`rowToSession` keep every effort shape (INV-E3/E4 on every whole-row writer) | pass |
| `internal/session/effortinvariants_test.go` | TestEffortInvariants_EveryInputFromEveryState | D7/D9/D10/D11: 12 starting states x 12 inputs (post with level / different / repeated / no key, dismiss, Resume button, Resume-button repair, `/clear` rebind, Stop, liveness death, reconcile revive, daemon restart), two bystanders present and unchanged, exact rule table plus INV-E1..E5 predicates, store round trip per cell | pass (144 cells) |
| `internal/session/effortinvariants_test.go` | TestEffortInvariants_AnotherSessionsInputNeverMovesIt | INV-E2/E3: 12 starting states x 5 inputs landed on other sessions leave the subject untouched in memory and store | pass (60 cells) |
| `internal/session/effortinvariants_test.go` | TestEffortCheck_SurvivesRestartAndClearThenFiresOnTheNextPost | edge cases 10, 11, 13, 15, 16: check survives `/clear` and restart, Resume button cancels it, warning survives resume and restart and is not re-raised | pass |
| `internal/server/effort_test.go` | TestHandleDismissEffortWarning_RequiresCookie | 401 without the cookie | pass |
| `internal/server/effort_test.go` | TestHandleDismissEffortWarning_ClearsPersistsAndBroadcastsOnce | D13: 204 empty body, row cleared and effort kept, exactly one `sessionUpsert` with `effortWarning: null`, second warned session untouched | pass |
| `internal/server/effort_test.go` | TestHandleDismissEffortWarning_NullWarningIs204WithNoBroadcast | D13/edge case 18: 204, no broadcast, repeat 204 | pass |
| `internal/server/effort_test.go` | TestHandleDismissEffortWarning_UnknownSessionIs404WithTheSharedBody | 404 body equals the shared `unknown session id` envelope (unknown and malformed id) | pass |
| `internal/server/respond_unknown_session_test.go` | TestUnknownSessionEnvelope_ByteIdenticalAcrossMigratedCallSites (two rows added) | dismiss route unknown / malformed id serve the same bytes as the other session routes | pass |
| `internal/server/effort_test.go` | TestToWireSession_EffortShapes | `effort` / `effortWarning` always present; null, `{level}`, `{level:null}`, warning with and without actual / model | pass |
| `internal/server/effort_test.go` | TestHandleCreateSession_InvalidEffortIs400AndWritesNothing | D3: six invalid values, exact message, no repo / session row / `.claude` dir | pass |
| `internal/server/effort_test.go` | TestValidateLaunchRequest_EffortCheckOrder | effort checked after directory, model, permissionMode; all five levels and nil accepted | pass |
| `internal/server/effort_test.go` | TestLauncher_InvalidEffortNeverReachesTheModelCheck | effort refused before the catalog check is asked | pass |
| `internal/server/effort_test.go` | TestLauncher_LaunchEffort | D4/D8: `--effort max` after `--permission-mode`, none for absent/null; `lastEffort` recorded and cleared by a default launch; session starts null/null | pass |
| `internal/server/effort_test.go` | TestLauncher_LaunchEffortStartsTheFirstReportCheck | launch with a level starts the check; default launch does not | pass |
| `internal/server/effort_test.go` | TestHandleListRepos_LastEffort | D8: `lastEffort` key always present, level or null | pass |
| `internal/server/effort_test.go` | TestValidateResumeRequest_EffortOnTheResumeForm | resume form: effort absent / JSON null accepted; a level or invalid value is the combination error | pass |
| `internal/server/effortresume_test.go` | TestLauncher_Resume_PassesTheRowsEffortAsFlag | D9/REQ-10: Resume button flag iff level non-null (the level it ran at, not the one asked for); effort and warning unchanged | pass |
| `internal/server/effortresume_test.go` | TestLauncher_Resume_CancelsAPendingFirstReportCheck | edge case 11 through the launcher | pass |
| `internal/server/effortresume_test.go` | TestLauncher_LaunchResume_Effort | D12/REQ-11: transcript effort in argv and seeded, none recorded = no flag / null, no check pending, new repo row NULL | pass |
| `internal/server/effortresume_test.go` | TestLauncher_LaunchResume_LeavesTheRepoLastEffortAlone | D8: Resume-tab resume leaves `lastEffort` (MRU still advances) | pass |
| `test/canary/static_test.go` | TestInstalledBinaryCarriesInterfaceStrings (needle added) | D14/REQ-14: `--effort` flag string presence | pass (installed 2.1.300) |

## Handoff Received

- `internal/store/migrate_test.go:39,43,60` and `internal/store/store_test.go:52`: migration count and max version 14 → 15, `0015_effort` added to the lineage comments. Passing.
- `internal/server/launcherpast_test.go` (`TestValidateResumeRequest`, three combination rows): message now `resumeSessionId cannot be combined with title, model, permissionMode or effort`. Passing.
- (Fix Attempt 2) `internal/server/effort_test.go` dismiss-404 test and `internal/server/respond_unknown_session_test.go`: updated to the shared body as described in the Summary. Passing.
- `internal/server/sessionwire_test.go:216`: key list gains `effort`, `effortWarning`, plus assertions that both are present and null on a minimal session. Passing.
- `internal/store/session_test.go` `TestUpdateSession_RoundTripsEveryField`: the six session effort columns added. `repo` `last_effort` is covered by the new `TestRepo_LastEffort` rather than the old repo tests.
- `internal/claudecode/claudecodetest/claudecodetest.go`: `EffortLevel` on `StatusLinePreFirstResponseOpts` and `StatusLineFullOpts` (empty = key absent, the measured shape of a model with no effort setting); `transcripts.go`: `AssistantEffortLine`. Both are used by the new tests.
- `test/canary/static_test.go` (REQ-14 / D14): `needles["--effort flag"] = "--effort"` added next to the status-line effort builder needle; `MUSTER_CANARY_OFFLINE=1 go test -tags canary -run TestInstalledBinaryCarriesInterfaceStrings ./test/canary/` → `ok` on 2.1.300. I did not run the red direction (a binary without the string); the test's own `assert.Empty(misses)` is the failing path and I changed nothing about it.
- The `kb refs` miss on `web/e2e/helpers/effort.ts:344 scripts/contrast-pairs.json` is a web file; not mine and not touched.

## Implementation Bugs (if verdict = implementation-bug)

None. The message the contract once spelled for this route (`no session with that id`) was retired by the developer's decision (kb:adr/focus-effort-dismiss-404-uses-shared-body); the implementation and tests now agree on `unknown session id`.

## Notes

- Declined coverage: none. Items the plan assigns to e2e (E1-E17) are out of scope for this step. The Resume-button repair path and reconcile's revive are covered as inputs of the D7 table (`RepairOwnedSession` clears the pending check; `reviveOwnedSession` does not), not through a full `Reconcile` run; edge case 15's restart is covered by `LoadAll` on the same store.
- The D7 table's oracle (`expectedEffort`) is written from the plan's rule text, independent of `internal/session/effort.go`, and `checkEffortInvariants` asserts INV-E1..E5 as predicates over each before/after pair, so a drifting rule table fails on the invariant as well as on the table. I did not mutate the implementation to prove the table bites (implementation files are not mine to edit).
- `dupl`/size: `make size-warn` names none of the new files (largest `internal/server/effort_test.go`, 447 lines; `internal/session/effort_test.go` was split into `effortinvariants_test.go` to stay under 500).
- `make test` waited on the shared gate lock behind another worktree's exclusive gates run (`muster-claude-version-watch`) for two 4-minute windows (exit 75, "rerun when free, this is not a test failure") and ran on the third attempt. `go test -race` of `internal/session` took 365 s and 578 s with and without the new tests under a machine load average of ~14, so the race time is load, not the new tests; the new D7 table alone is ~23 s under race.
- Web files (`web/**`) and `plans/effort/orchestration-state.json` were left alone; commit is by pathspec.

## Test Run Output

```
$ go build ./...                       -> exit 0
$ go vet ./internal/server/            -> exit 0
$ go test -race -count=1 -run 'UnknownSession|Effort' ./internal/server/
ok  	github.com/Zalaras/muster/internal/server	21.980s
$ make lint                            -> 0 issues.
$ make test                            -> exit 0
ok  	github.com/Zalaras/muster/internal/server	117.564s
ok  	github.com/Zalaras/muster/internal/session	56.907s
ok  	github.com/Zalaras/muster/internal/store	20.538s
(all other packages ok; none failing)
```
