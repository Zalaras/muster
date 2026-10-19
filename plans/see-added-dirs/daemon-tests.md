# Daemon Tests: See added directories

**Plan**: see-added-dirs
**Verdict**: pass
**Pack**: kb: pack 23364 words (budget 30000)

## Summary

Tests created: 34 new test functions in 7 new files (plus 5 rows/assertions in 4 sanctioned existing files) | Passing: all | Failing: 0

Gates, all run from the repo root in the foreground:

- `go build ./...` exit 0.
- `make lint` 0 issues.
- `make test`: the Makefile's own run exited 75 twice (`gatelock: busy after 4m0s`, held exclusively by other worktrees' gates, "not a test failure"). The same command through the same lock, `bin/gatelock run --shared --wait 9m -- go test -count=1 ./...`, acquired the lock and exited 0; every package `ok` (output below).
- `go test -race -count=1` on the new session and server tests: ok.
- D11: `! rg -n '"added_dirs"' cmd/ internal/ --glob '!internal/claudecode/**' --glob '!**/*_test.go'` prints nothing, exit 0.

Fails-on-broken-code, proven in a throwaway extract of `HEAD` (`git archive`, in the scratchpad) with the new test files copied in: 25 single-line mutations of the implementation, 22 killed by the new tests. The three that survived are explained under Notes (one was an invalid mutation that did not compile, re-run valid and killed; two are redundant guards that each cover the other). Killed: alive guard in `adoptAddedDirs` removed (25 failing subtests), `markEnded` no longer clears (16), `RecordLaunch` and `RecordResume` no longer clear (2 each), launch-directory drop removed (82), dedupe removed, relative join removed, symlink resolution removed (11), held reading dropped, absent key treated as empty list, no nudge on list change, no broadcast on list change, reading applied to dropped directories, `SetRepoState` no-op check ignoring the list, stale-epoch guard removed, failed-write restore skipping `AddedDirs`, row mapping dropping the list, poll skipping added dirs, poll reading gone directories (both checks removed), wire emitting null, store writing `[]` instead of NULL, store corrupt column returning garbage, `InterpretStatus` dropping the key.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/claudecode/status_addeddirs_test.go` | TestInterpretStatus_AddedDirs | measured `workspace.added_dirs` shapes (launch entry spelled `/tmp/...`, order verbatim), `[]` vs absent vs null vs no workspace stay distinct | pass |
| same | TestInterpretStatus_AddedDirsLeavesTheWorkingDirectoryAlone | reading the list does not disturb `Cwd` from the same object | pass |
| `internal/session/addeddirs_test.go` | TestResolvePath | symlink, trailing slash, nonexistent kept cleaned (REQ-2) | pass |
| same | TestNormalizeAddedDirs | D1, D3 (trailing slash, symlink either side, any position), D4 (relative join, dedupe incl. symlink spelling, first position), empty entry, held reading kept | pass |
| same | TestAdoptAddedDirs | D2 absent key, D7 dead never adopts, change report for first/same/reordered/added/emptied, held reading survives re-report | pass |
| same | TestApplyStatus_AddedDirs | manager level: one upsert and one nudge per real change, none on repeat or keyless post, persisted paths only, D15 null repo on the post's upsert | pass |
| same | TestApplyStatus_AddedDirsAreSessionScoped | a post never touches another session's list or row | pass |
| same | TestApplyStatus_AddedDirsPersistFailureRollsBack | failed persist restores the list, no broadcast | pass |
| same | TestAddedDirs_ClonesAreNeverWrittenThrough | list replaced, never mutated under a held Clone | pass |
| same | TestRecordLaunchAndResume_EmptyAddedDirs | REQ-3 launch and resume empty it (row NULL), bystander untouched, next post restores | pass |
| same | TestAddedDirs_ClearPairInEitherOrder | D6: 10 orderings of SessionEnd(clear), SessionStart(new id) and posts; list is always the last post, session alive, row agrees | pass |
| same | TestAddedDirs_SurviveADaemonRestart | D8/REQ-4: paths restored in order, no readings, with readings / after /clear / none ever, bystander kept | pass |
| same | TestRepoTargets_CarryAddedDirPaths | poll snapshot carries paths for alive sessions only | pass |
| `internal/session/addeddirsinvariants_test.go` | TestAddedDirsInvariants_EveryDeathFromEveryState | INV-1/D5/D7: 7 source states x 3 death paths (Stop, liveness, reconcile) = 21, memory and store empty, post-death post and reading refill nothing and broadcast nothing, coexisting session keeps list and reading | pass |
| same | TestAddedDirsInvariants_LaunchDirectoryNeverListed | INV-2: 5 spellings of the launch directory x 3 starting lists | pass |
| `internal/session/addeddirsrepo_test.go` | TestSetRepoState_AddedRepos | REQ-5/D9/D10: set, unchanged (no broadcast), new branch, worktree flag, nil clears, absent keeps, empty reading, list moved on (only still-listed take their reading, new stays nil), all dropped; bystander untouched, row holds paths only | pass |
| same | TestSetRepoState_AddedReposPersistFailureRollsBack | failed persist restores readings | pass |
| same | TestSetRepoState_AddedReposOfADeadOrResumedSession | D10 death half: reading taken before a death (and a resume) dropped whole, resumed session's own reading applies | pass |
| `internal/store/session_addeddirs_test.go` | TestSession_AddedDirsColumn | JSON array in order, awkward characters, nil and empty are NULL, new row NULL | pass |
| same | TestSession_AddedDirsClearBackToNull | held list cleared back to NULL | pass |
| same | TestListSessions_EachRowReadsItsOwnAddedDirs | list query scans the column in position, rows do not share | pass |
| same | TestSession_CorruptAddedDirsColumnReadsAsNone | corrupt column reads as none, load of other rows unaffected | pass |
| `internal/server/sessionwire_addeddirs_test.go` | TestToWireSession_AddedDirsKeyIsAlwaysAnArray | `addedDirs` present and `[]` never null from five session shapes | pass |
| same | TestToWireSession_AddedDirsShape | entry shape, repo null, wire order, `directory` stays the launch directory | pass |
| same | TestToWireSession_AddedDirsDoNotAliasTheSession | wire entries are copies | pass |
| `internal/server/reporefresh_addeddirs_test.go` | TestRepoPoll_AddedDirsGetTheirReading | D9/D15: real git checkouts listed with null repo before any tick, one tick reads checkout, worktree (flag true), plain dir (null), detached (null); unchanged tick silent; later checkout is one upsert | pass |
| same | TestRepoPoll_AddedDirGoneKeepsItsLastReading | D9/edge 12: deleted or replaced by a file keeps entry and reading, others in the tick still read, no broadcast | pass |
| same | TestRepoPoll_AddedDirsAreReadPerAliveSession | three sessions, shared directory read for both, dead session untouched in a tick that ran, only the owner broadcasts a change | pass |
| same | TestRepoPoll_RestartRereadsAddedDirs | D8/E4 daemon half: paths survive, readings return on the start-up tick | pass |
| same | TestRepoPoll_AddedDirsNudgeReadsThemAtOnce | with no timer, a post's upsert is followed by the reading's upsert via the nudge | pass |
| same | TestReadAddedRepos, TestReadAddedRepos_SubdirectoryNamesItsCheckoutsTopLevel, TestReadRepoState_CarriesTheAddedDirsReading | git half as a table: checkout, plain, detached, missing, file, mix; subdirectory names the top level | pass |
| same | TestNew_AddedDirsChangeNudgesTheRepoPoll | `server.New` wiring: a changed list nudges, an unchanged one does not | pass |

## Handoff Received

- `internal/store/migrate_test.go` (`TestMigrate_AppliesInitSchema` count, version and comment; `TestMigrate_SecondCallIsANoOp`): 16 to 17, the migration list comment gains `0017_added_dirs`.
- `internal/store/store_test.go` (`TestOpen_SecondOpenOnSamePathDoesNotReapplyMigrations`): 16 to 17, comment likewise.
- `internal/store/session_test.go` (`TestUpdateSession_RoundTripsEveryField`): `AddedDirs` set to two paths (one with a space) and asserted back.
- `internal/server/sessionwire_test.go` (`TestSessionWire_JSONShapeHasNoUnexpectedNulls`): `addedDirs` joins the required-key list. Whole-wire fixtures elsewhere in that file still pass untouched; the new key is covered by `sessionwire_addeddirs_test.go`.
- `internal/session/repo_test.go` `RepoTarget{...}` literals (`:276-277`): not changed; they compare with `AddedDirs` nil and pass, and the field is covered by `TestRepoTargets_CarryAddedDirPaths`.

## Implementation Bugs (if verdict = implementation-bug)

None blocking. One defect found that is not this plan's diff, recorded under Notes.

## Notes

- **Pre-existing `gitutil.IsWorktree` defect: fixed in cycle 1, now pinned.** The original wave-1 note (a subdirectory of an ordinary checkout read `IsWorktree: true`) is closed by daemon-impl's fix 1; see Fix Wave 2 below for the tests.
- **Observation, unmeasured shape.** `workspace.added_dirs` of the wrong type (a string, or numbers) decodes to a non-nil pointer to an empty or blank list, which the session package reads as "reported none" and empties the list. Claude Code only ever sent a list of strings in the measured captures, so no test pins it either way.
- **Surviving mutants.** (a) The `isDir` pre-check and the `isDir` re-check in `readAddedRepos` each cover the other; removing both is killed (7 failing subtests), removing either alone survives, the re-check's mid-read window cannot be hit through `tick` on demand (same limitation the existing `TestReadRepoState_OkIsFalseWhenTheReadingCannotBeTrusted` documents). (b) "stale epoch reading applied" first survived because my mutation was a no-op textually; the real one (`if false {` for the alive and epoch guard) is killed.
- **`funlen` warning on `TestSetRepoState_AddedRepos` (97 > 60)**: the length is the table rows (nine named cases with their expected lists); collapsing them into shared helpers would hide the per-row expectation, so it stays. No `dupl` line names my files.
- **Declined coverage, with the covering test:** edge case 14 (hook loss) is "loss is the absence of an input", covered by D2's `TestAdoptAddedDirs/"D2: key absent keeps the list"` and `TestApplyStatus_AddedDirs`' keyless post asserting `[]string{infra, docs}` unchanged. D11 is the plan's grep gate, run above, not a Go test.
- The Makefile's `make test` could not hold the shared gate lock within its 4-minute wait (other worktrees' gates held it exclusively, exit 75 both times); the lock-respecting equivalent above is the evidence.
- No other agent's files were edited. `plans/see-added-dirs/orchestration-state.json` was already modified by the orchestrator and is left out of my commit.

## Fix Wave 2 (review cycle 1)

**Pack**: kb: pack 27989 words (budget 30000)

Issues addressed: correctness Major 2, maintainability Minor 4, and the Fix Attempt 1 Handoff's `gitutil` test and long-list regression.

| File | Test | What it pins | Status |
|------|------|--------------|--------|
| `internal/server/reporefresh_addeddirs_test.go` | TestReadAddedRepos_SubdirectoryNamesItsCheckoutsTopLevel | now a table: ordinary checkout 1 and 2 levels down `IsWorktree` false, linked worktree 1 and 2 levels down true; name and branch of the top level (Major 2) | pass |
| same | TestReadAddedRepos_MoreDirectoriesThanWorkers | 24 directories (3 x `addedReadWorkers`) all read, each under its own key (slot reuse) | pass |
| same | TestReadAddedRepos_ExpiredContextLeavesEveryDirectoryOut | an expired ctx reports no directory, so each keeps its last-known reading | pass |
| same | TestReadRepoState_WedgedAddedDirectoryKeepsTheLaunchReading | browser Major 1: two wedged added checkouts (fake `git` first on `$PATH` that hangs in a directory named `wedge`, otherwise the real git); added read hits its own deadline, `ok` true, launch branch `moved` applies, readable siblings kept, wedged directories absent from `AddedRepos` (waits one `repoReadTimeout`, about 6 s: package server has no seam to shorten it) | pass |
| `internal/gitutil/gitutil_test.go` | TestIsWorktree_FromASubdirectory | real git, ordinary vs linked worktree, root / 1 / 2 levels down | pass |
| same | TestIsWorktree_ComparesResolvedPaths | fake runner fed the measured spellings: absolute git-dir vs relative common-dir, symlinked spelling, a true worktree, dot-dot, one/three/empty lines, failing git | pass |
| `internal/session/repo_test.go`, `internal/server/reporefresh_test.go` | (rename) | `OnClaudeDirChange` to `OnRepoPollNeeded` at `repo_test.go:36`, `reporefresh_test.go:77`, and the `repoHarness` comment (Minor 4) | pass |

**Fails on old code**, proven in a throwaway `git archive` of `4bca4ec0` (the commit before the impl fix) in the scratchpad, with these test files copied in, the two renames reverted and a one-line `const addedReadWorkers = 8` shim (the constant is new):
- `TestIsWorktree_FromASubdirectory/ordinary_checkout,_one_level_down` and `_two_levels_down`: `expected: false / actual: true`; the `ComparesResolvedPaths` table fails on argv (the old code made two calls) and on the linked-worktree row.
- `TestReadAddedRepos_SubdirectoryNamesItsCheckoutsTopLevel/ordinary_checkout,_one_level_down` and `_two_levels_down`: `IsWorktree:false` expected, `IsWorktree:true` actual. The linked-worktree rows pass on old code (as expected).
- `TestReadAddedRepos_ExpiredContextLeavesEveryDirectoryOut`: `Should be empty, but was map[...infra:<nil> ...002:<nil>]`.
- `TestReadRepoState_WedgedAddedDirectoryKeepsTheLaunchReading`: `Should be true: the added read's deadline does not discard the launch directory's reading`.
- `TestReadAddedRepos_MoreDirectoriesThanWorkers` passes on both (a guard on the new worker pool, not a regression of the old code).

**Gates** (foreground, repo root): `go build ./...` exit 0; `make lint` `0 issues.`; `make test` every package `ok`, including `internal/gitutil 9.273s`, `internal/server 116.189s`, `internal/session 42.779s`.

## Test Run Output

```
bin/gatelock run --shared --wait 9m -- go test -count=1 ./...
ok  	github.com/Zalaras/muster/cmd/musterd	64.257s
ok  	github.com/Zalaras/muster/internal/claudecode	14.164s
ok  	github.com/Zalaras/muster/internal/server	119.964s
ok  	github.com/Zalaras/muster/internal/session	44.330s
ok  	github.com/Zalaras/muster/internal/store	14.967s
(every other package ok; exit 0)

make lint  ->  golangci-lint run  0 issues.
go build ./...  ->  exit 0
```
