# Daemon Tests: Stale Dirs, Models and Branches

**Plan**: stale-dirs-models-branches
**Verdict**: pass
**Pack**: kb: pack 47713 words (budget 20000)

## Summary

Tests created: about 290 test and subtest results across 8 new or rewritten test groups (`go test -v` PASS lines, parents included) | Passing: all | Failing: 0

`go build ./...` exits 0, `make test` is green (every package `ok`), `make lint` reports `0 issues.`, `dead-refs: 1128 references checked, 0 missing`.

Mutation check, run in a throwaway `git archive` copy (deleted afterwards), each mutation failed the named test:

| Mutation | Test that failed |
|---|---|
| `mainAgentCwd` stops honouring the subagent marker | `TestInterpret_CwdIgnoredForSubagents` |
| `tick` polls dead sessions | `TestRepoPoll_DeadSessionIsNotPolled` |
| `SetRepoState` drops the stale-reading guard | `TestSetRepoState/a_location_for_a_dead_session_is_dropped`, `.../a_reading_derived_from_a_directory_that_has_since_changed_or_cleared_is_dropped` |
| `adoptClaudeDir` reports a change for an unchanged directory | `TestAdoptClaudeDir`, `TestApplyAndApplyStatus_AdoptCwdAndNudgeOnce` |

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/claudecode/interpret_cwd_test.go` | `TestInterpret_Cwd` | D1: 12 hook events (11 the state machine reads, plus `CwdChanged`) x 6 payloads: non-empty `cwd`, absent, empty, `new_cwd` alone never read, reset-cd shape (`cwd` wins over stale `new_cwd`), worktree path | pass |
| `internal/claudecode/interpret_cwd_test.go` | `TestInterpret_CwdNeverChangesTheTransition` | adding `cwd` changes nothing but `StateInput.Cwd`, for every event | pass |
| `internal/claudecode/interpret_cwd_test.go` | `TestInterpret_CwdIgnoredForSubagents` | D2 / INV-4: marked events, `SubagentStart`/`SubagentStop` with and without a marker | pass |
| `internal/claudecode/interpret_cwd_test.go` | `TestInterpret_CwdNotTakenFromAStatusLineEventType`, `TestInterpret_CwdMalformedPayloadIsNil` | `status_line` type stays inert; non-JSON never invents a directory | pass |
| `internal/claudecode/interpret_cwd_test.go` | `TestInterpretStatus_Cwd` | REQ-3 status half: `current_dir` over `cwd`, fallback, `project_dir` never read, empty/absent, the added-dirs shape from kb:fact/cwd-follows-claude-mid-session | pass |
| `internal/claudecode/claudecodetest/claudecodetest.go` | `EnvelopedHookInDirectory` (helper) | enveloped hook with a directory, so tests outside `internal/claudecode` never spell the key (D16) | n/a |
| `internal/gitutil/gitutil_test.go` | `TestGitRunner_TopLevel`, `TestTopLevel_RealGit` | argv, trim, empty and error give nil; real repo root and subdir, linked worktree has its own top level, plain and missing dir nil | pass |
| `internal/session/location_test.go` | `TestElsewhere` | D4 / INV-1: 14 rows (same dir, subdir, `.claude/worktrees`, sibling worktree, other repo, nil launch top, non-git inside/outside, name-prefix sibling, root launch dir) | pass |
| `internal/session/location_test.go` | `TestAdoptClaudeDir`, `TestLocationEqual` | REQ-3 absent/empty rule and change report; value comparison of derived locations | pass |
| `internal/session/machine_test.go` | `TestApplyBind_ModelRule` | D3 / REQ-9 / INV-3: 6 model rows x {Bind, ClearRebind} x 5 states; same id keeps the same pointer and confirmed name; displayName never empty | pass |
| `internal/session/machine_test.go` | `TestApplyInput_Bind/a_different_model_id_shows_as_itself...`, `TestApplyInput_ClearRebind/a_clear-rebind_naming_a_new_model...` | the two sanctioned rewrites to the REQ-9 rule | pass |
| `internal/session/repo_test.go` | `TestApplyAndApplyStatus_AdoptCwdAndNudgeOnce` | D5: both entry points persist a changed dir and nudge once, after the persist; same/empty/absent nudge nothing and never clear | pass |
| `internal/session/repo_test.go` | `TestApplyStatus_CwdOnlyChangePersistsWithoutBroadcasting` | a dir-only status change persists, no upsert | pass |
| `internal/session/repo_test.go` | `TestApply_PersistFailureRollsBackCwdAndDoesNotNudge` | closed store: `ClaudeDir` rolled back, no nudge | pass |
| `internal/session/repo_test.go` | `TestRecordLaunchAndResume_ClearClaudeDirAndLocation` | D9 / REQ-7: memory cleared, column back to NULL | pass |
| `internal/session/repo_test.go` | `TestCheckLiveness_DeadSessionHasNoLocationButKeepsItsDirectory` | REQ-5 dead half: location nil, `ClaudeDir` and branch kept | pass |
| `internal/session/repo_test.go` | `TestLoadAll_RestoresClaudeDirButNotTheDerivedLocation` | D7 manager half: `claude_dir` and refreshed branch survive restart, location does not | pass |
| `internal/session/repo_test.go` | `TestRepoTargets_ListsEverySessionWithItsDirectories` | alive, dead, with/without Claude dir | pass |
| `internal/session/repo_test.go` | `TestSetRepoState` (9 subtests) | change persists and broadcasts once; detached HEAD nil; worktree flag alone; identical re-derivation is no change; dead drops location; stale `ClaudeDir` (moved again, resume) drops it; unknown session; persist failure rolls back with no broadcast; bystander untouched, only the changed session broadcasts | pass |
| `internal/server/reporefresh_test.go` | `TestRepoPoll_BranchFollowsCheckouts` | REQ-1 / D6: checkout seen as one upsert and persisted, unchanged tick silent, detached HEAD gives repo null | pass |
| `internal/server/reporefresh_test.go` | `TestRepoPoll_WorktreeFlagIsRefreshed` | flag read with the branch | pass |
| `internal/server/reporefresh_test.go` | `TestRepoPoll_KeepsLastKnownWhenTheDirectoryIsGone` | REQ-2: deleted dir and dir replaced by a file keep repo and location, no upsert | pass |
| `internal/server/reporefresh_test.go` | `TestRepoPoll_DeadSessionIsNotPolled` | D17 / edge 27: dead keeps stale branch while an alive twin in the same tick updates; first tick after resume re-reads | pass |
| `internal/server/reporefresh_test.go` | `TestRepoPoll_OnlyTheMovedSessionGetsALocation` | D6 bystander, edge 20: two sessions on one launch dir, one moves | pass |
| `internal/server/reporefresh_test.go` | `TestRepoPoll_ClaudeLocationMatrix` | INV-1 from every source state: 13 places x {alive, dead} with real git (same dir, subdir, `.claude/worktrees` worktree and its subdir, sibling worktree, detached worktree, other repo, three non-git rows, two symlinked spellings, no report) | pass |
| `internal/server/reporefresh_test.go` | `TestRepoPoll_LocationFollowsTheMoveAndClears` | user flows 2 and 3, location branch change | pass |
| `internal/server/reporefresh_test.go` | `TestRepoPoll_CancelledContextReadsNothing` | cancelled tick reads nothing | pass |
| `internal/server/reporefresh_test.go` | `TestReadRepoState_OkIsFalseWhenTheReadingCannotBeTrusted` (3 subtests) | cycle 2 Major 1: `readRepoState` returns `!ok` for a directory that does not exist and for an already-cancelled context on a real checkout; `ok` and branch `main` for a live context on a real checkout | pass |
| `internal/server/reporefresh_test.go` | `TestRepoPoll_RestartRederivesTheLocationFromTheRecordedDirectory` | D7: fresh manager over the same store, null until first tick, then non-null | pass |
| `internal/server/reporefresh_test.go` | `TestRepoPoll_NoTimerStillTicksAtStartAndOnNudge` | D8: `Poll 0` loop ticks at start and a nudge derives the location | pass |
| `internal/server/reporefresh_test.go` | `TestRunTicked_NonPositiveIntervalRunsNoTimer` | interval 0 and negative: start tick plus one per refresh, no `NewTicker` panic, exits on cancel | pass |
| `internal/server/reporefresh_test.go` | `TestNew_ClaudeDirChangeNudgesTheRepoPoll` | REQ-6 at the composition root: nudge reaches the channel, once per burst, none for an unchanged dir | pass |
| `internal/server/reporefresh_test.go` | `TestStopLivenessPoll_AlsoStopsTheRepoPoll` | the repo loop exits after `StopLivenessPoll` | pass |
| `internal/server/reporefresh_test.go` | `TestIngest_MainAgentHookDirectoryBecomesClaudeLocation` | ingest to Interpret to Apply to nudge to tick to wire, `directory` stays the launch dir | pass |
| `internal/server/sessionwire_test.go` | `TestToWireSession_ClaudeLocationKeyIsAlwaysPresent`, `TestToWireSession_ClaudeLocationShape`, `TestToWireSession_RepoFollowsTheRefreshedBranch`; `claudeLocation` added to the field list of `TestSessionWire_JSONShapeHasNoUnexpectedNulls` | D10: key present and null for 4 states; object shape with and without repo; `claudeDir` never on the wire; `directory` stays the launch dir | pass |
| `internal/store/session_test.go` | `TestUpdateSession_RoundTripsEveryField` (extended) | `claude_dir` round trip and clear to NULL | pass |
| `cmd/musterd/main_test.go` | `TestParseFlags_RejectsInvalidValues` (3 new subtests, default pin), `TestBuildServerConfig_MapsEveryFlagOntoTheServerConfig` (pins `RepoRefresh.Poll`) | `-repo-poll`: negative is a flag error, 0 valid, duration parsed, default 5s, wired | pass |

## Handoff Received

Every sanctioned break named in `daemon-implementation.md`'s `## Handoff`:

- `internal/session/machine_test.go`: `TestApplyInput_Bind/leaves_DisplayName_at_its_launch_value_when_Model_already_existed` rewritten to expect `{id, displayName: id}` (REQ-9); `TestApplyInput_ClearRebind/keeps_updating_the_model_id_on_a_clear-rebind` rewritten the same way. Both renamed for the new rule.
- `internal/store/migrate_test.go` (`TestMigrate_AppliesInitSchema`, `TestMigrate_SecondCallIsANoOp`) and `internal/store/store_test.go` (`TestOpen_SecondOpenOnSamePathDoesNotReapplyMigrations`): migration count and max version 11 became 12, comments name `0012_claude_dir`.
- `internal/store/session_test.go` `TestUpdateSession_RoundTripsEveryField`: gained `ClaudeDir`, plus a clear back to NULL.
- `internal/server/server_test.go` `TestNew_RegistersLifecycleFeaturesInStartOrder`: six lifecycle features, `repoRefresh` last.
- `cmd/musterd/main_test.go`: `buildServerConfig` pin gained `repoPoll` and `cfg.RepoRefresh.Poll`.
- The `TestHandleTerminal_TakeoverNeverLeavesTwoClientsAttachedAtOnce` flake the impl log mentions did not recur in the two full `make test` runs here (server package ok, 109 s).

## Implementation Bugs

None.

## Notes

- Declined coverage: none. Items I checked were not left to another suite. Plan items not unit-covered by design: edge cases 11, 14 and 18 (straggler and hook loss), which the plan itself marks untested.
- D17 ("runs no git command for a dead session") is proven by its observable effect, not by counting subprocesses: a dead session keeps a stale branch while an alive session in the same tick updates. `gitutil`'s run seam is package-private, so the server package cannot inject a counting runner. The effect is the property the plan states ("keeps its last-known repo"), and the mutation above (`tick` polling dead sessions) fails it. If a literal "no subprocess" assertion is wanted, `reporefresh.go` would need an injectable git reader; I do not call that a defect.
- Real git in server tests: `reporefresh_test.go` runs `git` in per-test temp repos with `-c user.name=bob -c user.email=bob@example.com` per command (never `git config`). The matrix subtests run in parallel to keep the whole matrix near 3 s.
- Hard rule D16: the tests outside `internal/claudecode` never spell the working-directory payload keys. They go through `StateInput.Cwd`, `StatusUpdate.Cwd` and the new `claudecodetest.EnvelopedHookInDirectory`.
- Deviation checks from the impl log, both covered: the repo poll keeps `claudeLocation` as last known when the launch directory is gone (`TestRepoPoll_KeepsLastKnownWhenTheDirectoryIsGone`); `-repo-poll 0` still runs one tick at start (`TestRepoPoll_NoTimerStillTicksAtStartAndOnNudge`).
- Size warnings from `make size-warn` that name my files, all funlen on table or subtest-driven functions, kept on purpose: `TestRepoPoll_ClaudeLocationMatrix` (113 lines, one fixture builder per row), `TestSetRepoState` (145 lines, nine subtests). `machine_test.go` and `main_test.go` warnings pre-exist. No `dupl` line names my files.
- Files left alone: web-tests' uncommitted `web/src/**/*.test.ts`, and `plans/stale-dirs-models-branches/orchestration-state.json`.

## Fix Attempt 1 (review cycle 2)

Issue: correctness Major 1 `[daemon-tests]`, the Critical 2 guard had no test that fails without it.

Added `TestReadRepoState_OkIsFalseWhenTheReadingCannotBeTrusted` to `internal/server/reporefresh_test.go`: one table, three rows, calling `readRepoState` directly (no new seam). Mutation proof in a throwaway `git archive HEAD` copy plus this test file, tree untouched:

| Mutation of `return state, ctx.Err() == nil && isDir(t.Directory)` | Result |
|---|---|
| `return state, true` | FAIL: `directory_that_does_not_exist_is_untrusted` and `already-cancelled_context_..._is_untrusted` |
| `isDir` only (ctx check removed) | FAIL: `already-cancelled_context_..._is_untrusted` |
| `ctx.Err() == nil` only (`isDir` removed) | FAIL: `directory_that_does_not_exist_is_untrusted` |
| unmutated copy | ok |

Not covered by a unit test: tick's `if !ok { continue }` line itself. The reviewer's three tests pin `readRepoState`'s verdict, not tick's use of it, and tick cannot be driven into the stat-to-git window without a seam (the race window is the REQ-2 E2E's). Deleting that line alone is still caught only by the E2E.

Gates: `go build ./...` exit 0, `make test` all `ok` (server 109 s), `make lint` `0 issues.` The only `reporefresh_test.go` size warning is the pre-existing `TestRepoPoll_ClaudeLocationMatrix` funlen, kept on purpose above.

## Fix Attempt 2 (review cycle 2)

Issue: e2e-specs bug, `SetRepoState` wrote `Branch`/`IsWorktree` to a session that died while its reading was in flight; daemon-impl's fix (ff19fac) added the `repoEpoch` death counter and named the sanctioned break plus the missing coverage.

Handoff received: `TestRepoTargets_ListsEverySessionWithItsDirectories` now expects `Epoch: 1` on the ended session's `RepoTarget` (one death), `Epoch: 0` on the live one.

New tests (`internal/session/repo_test.go` unless noted; they drive the real `checkLiveness` -> `markEnded` death and `RecordResume`, and take each reading's epoch from `RepoTargets`):

| Test | What |
|------|------|
| `TestSetRepoState_DropsAReadingTakenBeforeTheSessionDied` (5 rows) | a reading snapshotted alive and applied after the death is dropped whole (branch, worktree flag, location), with no broadcast and no DB write: still dead with/without a recorded directory; still dead with a hand-built reading whose epoch equals the death count (only `!Alive` drops it); resumed with the recorded directory cleared by the resume; resumed with no directory on either side (only the epoch sees it). Resumed rows then apply a fresh reading (epoch 1). |
| `TestSetRepoState_ADeathThatFailedToPersistDoesNotDropAGoodReading` | `markEnded` with a cancelled context fails and rolls back; epoch is back to 0 and the earlier reading applies; after a real death the same epoch is stale. |
| `TestSetRepoState_ASessionsDeathLeavesItsNeighboursReadingsApplying` | two sessions: one dies, its reading is dropped, the survivor's epoch stays 0 and its reading applies. |
| `internal/server/reporefresh_test.go` `TestReadRepoState_CarriesTheTargetsEpochBack` | `readRepoState` stamps `state.Epoch` with the target's (0 and 3). |

Mutation proof: throwaway `git archive HEAD` copy under the scratchpad plus the two test files, this tree untouched; unmutated copy `ok`.

| Mutation | Result (FAIL) |
|---|---|
| `SetRepoState` guard without `!sess.Alive` | `...DropsAReading.../still_dead,_reading's_epoch_equals_the_death_count` |
| guard without the epoch comparison | both `resumed,...` rows |
| guard removed (`if false`) | `TestSetRepoState/a_location_for_a_dead_session_is_dropped`, all five rows, the persist-failure test, the neighbour test |
| `markEnded` without `repoEpoch++` | `TestRepoTargets_...`, both `resumed` rows, neighbour test |
| `restoreChangedFields` without the `repoEpoch` restore | `TestSetRepoState_ADeathThatFailedToPersist...` |
| `readRepoState` without `Epoch: t.Epoch` | `TestReadRepoState_CarriesTheTargetsEpochBack` |
| `RepoTargets` without `Epoch: s.repoEpoch` | `TestRepoTargets_...`, both `resumed` rows, neighbour test |

Gates: `go build ./...` exit 0, `make test` all `ok` (server 111 s, session 16 s), `make lint` `0 issues.`. `make size-warn` names `TestSetRepoState` and `TestRepoPoll_ClaudeLocationMatrix` only (both pre-existing, kept as above); the new table test was trimmed under the 60-line funlen limit. Not unit-covered: `tick`'s own use of the epoch (it only copies `RepoTarget` to `readRepoState`; the 60-way soak of `card-location.spec.ts` is the wiring proof).

## Test Run Output

```
bin/gatelock run --shared -- go test -count=1 ./...
ok  	github.com/Zalaras/muster/cmd/musterd	76.938s
ok  	github.com/Zalaras/muster/internal/claudecode	13.049s
ok  	github.com/Zalaras/muster/internal/gitutil	4.866s
ok  	github.com/Zalaras/muster/internal/server	109.176s
ok  	github.com/Zalaras/muster/internal/session	15.121s
ok  	github.com/Zalaras/muster/internal/store	10.013s
... every other package ok
golangci-lint run
0 issues.
dead-refs: 1128 references checked, 0 missing
```
