# Daemon Tests: Resume and Dangerously Allow

**Plan**: resume-and-dangerously-allow
**Verdict**: pass
**Pack**: `kb: pack 36187 words (budget 20000)` — WARN exceeds budget (sections: rules 953 · features 13192 · decisions 12682 · facts 7359 · lessons 1993 · runbooks 2)

## Re-run (post daemon-impl Fix Attempt 2, pre-review)

daemon-impl's `f79ef67` reordered `scanTranscript`'s head fallback to feed chunks in
chronological file order (head, then tail) instead of tail-then-head, so the tail's
already-found value of a field the head also recorded no longer gets clobbered. Re-ran
`TestPastSessions_HeadFallbackDoesNotClobberATailFoundValue` (unchanged — it was already
a correct test of the desired behaviour, only the implementation was wrong): now passes.
Re-ran the full suite: `go build ./...` clean, `make test` all green (no FAIL), `make
lint` 0 issues. No test file needed further edits for the fix itself.

Separately fixed the wave gate's comment-checks finding on my own file,
`internal/claudecode/claudecodetest/transcripts.go` (lines then at 49 and 56, since
moved): two comments named a plan ID (`(D6)`, `D5's title precedence`) instead of stating
the why in prose or citing a kb: record alone. Reworded both to describe the actual
behaviour (a no-`cwd` transcript is treated as a stub and never listed; custom-title
beats ai-title as the title) without the plan-ID token, keeping the existing
`kb:fact/transcript-session-lines` citation on the second one since that record already
documents the precedence. Verified with
`python3 .claude/skills/orchestrate/scripts/comment-checks.py daemon-tests` and `--gates`:
both clean.

Verdict updated from `implementation-bug` to `pass` — the one bug this suite found is
fixed and confirmed by its own test; nothing else changed in the tests below.

## Fix Cycle 1 (review cycle 1, wave 2)

Addressed the one `[daemon-tests]`-tagged finding, **Correctness Major 2**: the five
`TestAliveByClaudeSessionID_*` tests never crossed a clear-rebind or a `LoadAll`, so
Correctness Major 1's fix (`AliveByClaudeSessionID` scanning `m.sessions` instead of
trusting `byClaude`) had no regression pin. Also added the tests the review named as
required-but-missing for daemon-impl's Fix Attempt 3 (Browser Critical 1/2, Maintainability
Major 2/3, and the two settled user decisions `resume-passes-any-recorded-mode` and
`pending-resume-holds-id`), and repointed the one sanctioned `TestBuildArgv` break named in
daemon-impl's Handoff.

**`internal/session/manager_test.go`** (new tests, package-local — the shared-registry
guard's own coverage):
- `TestAliveByClaudeSessionID_ClearRebindReleasesTheOldClaudeID` — bind X, rebind onto Y in
  the same pane (escalates to `KindClearRebind` inside `applyBind`), assert X no longer
  reports open and Y does. This is the exact case `byClaude` gets wrong (it never deletes
  the old mapping) and `m.sessions`-scanning gets right.
- `TestAliveByClaudeSessionID_LoadAllPicksTheAliveRowRegardlessOfCreationOrder` — a dead and
  an alive row sharing one claude id, persisted in each order, reloaded via a fresh
  `Manager.LoadAll` (a simulated restart) — table-driven over both orders, asserting the
  alive row wins either way.
- `TestAliveByClaudeSessionID_PendingResumeHoldsIDBeforeBind` — a `CreateParams.ResumeClaudeSessionID`
  row holds its claim from `CreateSession` alone, before any bind.
- `TestAliveByClaudeSessionID_ResumeBindKeepsHoldingTheID` — a `KindResumeBind` (the real
  `SessionStart{source:"resume"}` shape) still reports the row open afterward (Browser
  Critical 1's own mechanism, at the layer it actually lives).
- `TestAliveByClaudeSessionID_PendingResumeReleasesOnDeath` / `_PendingResumeReleasesWhenItBindsADifferentID`
  — the pending claim's two release paths (`pending-resume-holds-id`'s "releases … when it
  binds elsewhere or dies").
- `TestLockClaudeSession_SerializesTheCheckThenClaimRaceForOneClaudeID` — 20 goroutines race
  `LockClaudeSession` + `AliveByClaudeSessionID` + `CreateSession` for one claude id; exactly
  one may win. Verified this isn't vacuous: ran the identical test in a throwaway `/tmp`
  copy with `LockClaudeSession` stubbed to a no-op — `winners: 20` there, `winners: 1` in
  the real tree (pasted below); the throwaway copy was deleted afterward, never committed.
- `TestLockClaudeSession_DifferentClaudeIDsDoNotBlockEachOther` — the multi-instance half:
  holding the lock for one claude id must never stall a concurrent claim on another.

**`internal/server/launcherpast_test.go`** (new tests):
- `TestLauncher_LaunchResume_RecordedUnofferedModeReachesArgvVerbatim` — a transcript
  recording `dontAsk` (a mode the launch form never offers) reaches argv unchanged, pinning
  `resume-passes-any-recorded-mode`'s Option A.
- `TestLauncher_LaunchResume_AlreadyOpenIs409WhenTheOpenRowWasBoundByAResume` /
  `TestLauncher_Resume_RefusesADeadSessionWhoseClaudeIDAResumeBoundAliveSessionHolds` —
  both existing 409/`not_resumable` guards, re-run with the *other* alive row bound via
  `KindResumeBind` instead of `KindBind`: exactly the shape the old `byClaude`-trusting
  lookup missed (Browser Critical 1).

**`internal/server/launcherpastlist_test.go`** (new tests, Maintainability Major 2):
`TestListPastSessions_OrdersCapsMarksOpenAndCutsPrompt` and `_CapsAtMaxAndSetsTruncated`
call the extracted `listPastSessions` domain function directly, rather than through
`handleListPastSessions`' decode/encode indirection the existing `TestHandleListPastSessions_*`
suite already covers end to end.

**Sanctioned break, repointed**: `internal/claudecode/launch_test.go`'s `TestBuildArgv`
"an unrecognized permission mode adds no flag" subtest renamed to "…still reaches argv
verbatim" and its `want` updated to include `--permission-mode bogus`, per daemon-impl's
Handoff — `BuildArgv` now trusts the caller and emits the flag for any non-empty mode.

No implementation files touched. `go build ./...`, `make test` (all packages green, no
sanctioned failure remaining) and `make lint` (0 issues) all re-run in the foreground after
these changes; `comment-checks.py daemon-tests` and `dead-refs.py` both clean (see Test Run
Output below).

## Summary (original run)

Tests created: 61 new/extended test functions (many table-driven with several subtests) across 4 new files and 6 extended/fixed files | Passing: all but one | Failing: 1 (implementation bug, documented below and left red on purpose)

One implementation bug found in the newly-created `internal/claudecode/launchtranscripts.go` (`scanTranscript`'s head fallback, D7): it can silently revert a correctly-found tail value to a stale, earlier value of the same field type. Left as a red test per the constraints (test agents may not fix implementation code). Every other daemon acceptance criterion this plan assigns (D1–D3, D4–D6, D8–D16) is covered and green; D7 itself (the narrow "cwd resolved from head" claim) is also green — only the *side effect* of the fallback on other fields is wrong.

Also repointed the one sanctioned test-file break named in daemon-impl's Handoff
(`internal/server/sessions_test.go`'s `TestHandleCreateSession_UnknownPermissionModeMessageNamesAllFour`,
renamed to `...AllFive`, fixture value changed from `"bypassPermissions"` (now valid) to
`"bogus"`, expected message updated to name all five modes) — and fixed the one resulting
stale reference `make check-kb` found in `docs/adr/launch-permission-modes-offered-four-tabbed.md`'s
`tests:` frontmatter (superseded record, mechanical rename only, no decision text touched).

Extended `internal/claudecode/claudecodetest` with a `WriteTranscript` fixture writer plus
`CwdLine`/`CustomTitleLine`/`AiTitleLine`/`LastPromptTranscriptLine`/
`PermissionModeTranscriptLine`/`AssistantModelLine` line builders (new file
`transcripts.go`, split out from `claudecodetest.go` to keep that file under the size
threshold — its own content is otherwise untouched, confirmed by `git diff` showing no
change to it) — the sanctioned way for `internal/server`'s tests to get realistic fixture
transcripts without spelling Claude-Code-format strings outside `internal/claudecode`
(`kb:adr/ingest-wire-shaped-fixtures-via-claudecodetest`, D17). Also extended
`internal/server/fakes_test.go`'s `fakeTmux` with argv capture (`newSessionArgvs`/
`lastNewSessionArgv`), needed for D9's "spawns `--resume <id> --permission-mode <mode>`
with no `--model` and no `--name`" assertion — no existing fake captured argv at all.

`go build ./...`, `make lint` and `make check-kb` are all clean (check-kb's remaining 3
problems are pre-existing e2e-spec-ownership gaps for doc-reconcile, unrelated to this
work). `make test` is red on exactly the one documented bug.

Size: `internal/claudecode/launch_test.go`'s `TestBuildArgv` crossed the 60-statement
`funlen` warning (78) — table rows added for D1/D2, not new function bodies; warn-only
(`kb:adr/process-size-linters-warn-never-fail`). No `dupl` hits on any file I touched.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/claudecode/launch_test.go` | `TestValidPermissionMode` (9 subtests) | Every `PermissionModes` member accepted; empty/bogus/case-mismatched rejected | pass |
| `internal/claudecode/launch_test.go` | `TestPermissionModes_IncludesBypass` | `PermissionModes`' exact ordered membership, incl. `bypassPermissions` | pass |
| `internal/claudecode/launch_test.go` | `TestBuildArgv/bypassPermissions_mode_adds_--permission-mode_bypassPermissions` | D1 | pass |
| `internal/claudecode/launch_test.go` | `TestBuildArgv/an_unrecognized_permission_mode_still_reaches_argv_verbatim_(validation_is_the_caller's_job)` | Cycle-1 repoint (sanctioned break): `--permission-mode bogus` now reaches argv, per `resume-passes-any-recorded-mode` | pass |
| `internal/claudecode/launch_test.go` | `TestBuildArgv/an_empty_model_omits_--model` | D2 | pass |
| `internal/claudecode/launch_test.go` | `TestBuildArgv/an_empty_model_with_ResumeSessionID_omits_--model_but_keeps_--resume_and_--permission-mode` | D2 × resume shape | pass |
| `internal/claudecode/launch_test.go` | `TestBuildArgv_PermissionModeAlwaysExplicit/bypassPermissions_*` | bypass mode always emits exactly one `--permission-mode` | pass |
| `internal/claudecode/launchtranscripts_test.go` | `TestEncodeProjectsDirName` (8 subtests) | Folder-name encoding: dot/space/@/underscore/+/dash/non-ASCII/digits | pass |
| `internal/claudecode/launchtranscripts_test.go` | `TestCandidateFolders` (5 subtests) | Exact match, no match, file-not-dir, >200-char prefix match (D4), unreadable root | pass |
| `internal/claudecode/launchtranscripts_test.go` | `TestPastSessions_SharedFolderFiltersByCwd` | D3: `a.b`/`a-b` share a folder, filtered by cwd | pass |
| `internal/claudecode/launchtranscripts_test.go` | `TestPastSessions_LongDirectoryFoundByPrefix` | D4 end-to-end through `PastSessions` | pass |
| `internal/claudecode/launchtranscripts_test.go` | `TestPastSessions_TitlePrecedence` (5 subtests) | D5: custom-title > ai-title > nil; last line wins; empty never overwrites | pass |
| `internal/claudecode/launchtranscripts_test.go` | `TestPastSessions_LastPromptPermissionModeAndModelTakeTheLastLine` | Last-line-wins for the other three neutral fields | pass |
| `internal/claudecode/launchtranscripts_test.go` | `TestPastSessions_StubsAndNestedTreesAreNotListed` | D6: no-cwd stub, `memory/`, `<id>/subagents/` all excluded | pass |
| `internal/claudecode/launchtranscripts_test.go` | `TestPastSessions_LargeTranscriptTailMissingCwdFallsBackToHead` | D7: cwd resolved from head when tail misses it | pass |
| `internal/claudecode/launchtranscripts_test.go` | `TestPastSessions_HeadFallbackDoesNotClobberATailFoundValue` | Head fallback must not revert a tail-found value | pass (fixed by daemon-impl `f79ef67`, see Re-run above) |
| `internal/claudecode/launchtranscripts_test.go` | `TestPastSessions_AbsentOrUnreadableProjectsDirYieldsEmptyListNotError` | D8 | pass |
| `internal/claudecode/launchtranscripts_test.go` | `TestPastSessions_ANeverSeenDirectoryYieldsEmptyListNotError` | Protocol Contract's "never run here" case | pass |
| `internal/claudecode/launchtranscripts_test.go` | `TestPastSessions_LastActiveAtIsTheFilesModTime` | `LastActiveAt` sourced from the file's own mtime | pass |
| `internal/session/manager_test.go` | `TestAliveByClaudeSessionID_UnknownClaudeIDIsNotOK` | Unbound id → not ok | pass |
| `internal/session/manager_test.go` | `TestAliveByClaudeSessionID_BoundAliveSessionReturnsItsID` | Basic positive case | pass |
| `internal/session/manager_test.go` | `TestAliveByClaudeSessionID_EndedSessionIsNotOK` | A dead session's claude id never counts as open | pass |
| `internal/session/manager_test.go` | `TestAliveByClaudeSessionID_TwoAliveSessionsDoNotCrossOver` | Multi-instance: two alive sessions, ending one leaves the other's binding untouched | pass |
| `internal/session/manager_test.go` | `TestAliveByClaudeSessionID_NewAliveBindWinsOverADeadRowsStaleMapping` | D12's underlying mechanism: a new alive bind wins over a dead row's stale mapping | pass |
| `internal/session/manager_test.go` | `TestAliveByClaudeSessionID_ClearRebindReleasesTheOldClaudeID` | Cycle-1 fix: a /clear-style rebind releases the old claude id | pass |
| `internal/session/manager_test.go` | `TestAliveByClaudeSessionID_LoadAllPicksTheAliveRowRegardlessOfCreationOrder` (2 subtests) | Cycle-1 fix: a restart's `LoadAll` picks the alive row regardless of persist order | pass |
| `internal/session/manager_test.go` | `TestAliveByClaudeSessionID_PendingResumeHoldsIDBeforeBind` | `pending-resume-holds-id`: claim registered at `CreateSession`, before any bind | pass |
| `internal/session/manager_test.go` | `TestAliveByClaudeSessionID_ResumeBindKeepsHoldingTheID` | Browser Critical 1's mechanism: a `KindResumeBind` still reports the row open | pass |
| `internal/session/manager_test.go` | `TestAliveByClaudeSessionID_PendingResumeReleasesOnDeath` | `pending-resume-holds-id`: claim releases if the row dies unbound | pass |
| `internal/session/manager_test.go` | `TestAliveByClaudeSessionID_PendingResumeReleasesWhenItBindsADifferentID` | `pending-resume-holds-id`: claim releases once any bind lands | pass |
| `internal/session/manager_test.go` | `TestLockClaudeSession_SerializesTheCheckThenClaimRaceForOneClaudeID` | Maintainability Major 3: the lock serializes 20 concurrent resume claims to 1 winner | pass |
| `internal/session/manager_test.go` | `TestLockClaudeSession_DifferentClaudeIDsDoNotBlockEachOther` | Multi-instance: a different claude id is never blocked behind another's lock | pass |
| `internal/store/repo_test.go` | `TestTouchRepo_NeverBeforeSeenPathCreatesRowWithNullModelAndMode` | D15, new-directory half | pass |
| `internal/store/repo_test.go` | `TestTouchRepo_ExistingRowAdvancesMRUAndCountButNeverTouchesModelOrMode` | D15 core guarantee, crossed with an `UpsertRepo`-set model/mode | pass |
| `internal/store/repo_test.go` | `TestTouchRepo_TwoCallsIncrementLaunchCountTwice` | Plain repeat-call MRU/count bump | pass |
| `internal/server/launcherpast_test.go` | `TestValidateResumeRequest` (8 subtests) | D14 + shared directory rules | pass |
| `internal/server/launcherpast_test.go` | `TestFindPastSession` | Pure lookup helper | pass |
| `internal/server/launcherpast_test.go` | `TestLauncher_LaunchResume_SpawnsResumeArgvAndSeedsFromListing` | D9 | pass |
| `internal/server/launcherpast_test.go` | `TestLauncher_LaunchResume_NoRecordedModeOrModeSeedsDefaultAndNilModel` | D9/D16 converse: no recorded mode/model → `default` argv, nil `Model` | pass |
| `internal/server/launcherpast_test.go` | `TestLauncher_LaunchResume_UnknownIDIs404AndWritesNothing` | D10 | pass |
| `internal/server/launcherpast_test.go` | `TestLauncher_LaunchResume_AlreadyOpenIs409WithID` | D11 | pass |
| `internal/server/launcherpast_test.go` | `TestLauncher_LaunchResume_RequestCombinationIsRejectedThroughLaunch` | D14 through `Launch`'s entry point, not just the pure validator | pass |
| `internal/server/launcherpast_test.go` | `TestLauncher_LaunchResume_AdvancesMRUAndCountWithoutTouchingRememberedModelOrMode` | D15 at the launcher level | pass |
| `internal/server/launcherpast_test.go` | `TestLauncher_Resume_RefusesADeadSessionWhoseClaudeIDAnAliveSessionHolds` | D12, with a third unrelated alive session proven untouched | pass |
| `internal/server/launcherpast_test.go` | `TestLauncher_LaunchResume_RecordedUnofferedModeReachesArgvVerbatim` | `resume-passes-any-recorded-mode`: `dontAsk` reaches argv verbatim | pass |
| `internal/server/launcherpast_test.go` | `TestLauncher_LaunchResume_AlreadyOpenIs409WhenTheOpenRowWasBoundByAResume` | Browser Critical 1: 409 `already_open` when the open row was bound via `KindResumeBind` | pass |
| `internal/server/launcherpast_test.go` | `TestLauncher_Resume_RefusesADeadSessionWhoseClaudeIDAResumeBoundAliveSessionHolds` | Browser Critical 1: `not_resumable` when the other alive row was bound via `KindResumeBind` | pass |
| `internal/server/launcherpastlist_test.go` | `TestListPastSessions_OrdersCapsMarksOpenAndCutsPrompt` | Maintainability Major 2: `listPastSessions` domain function directly — order, `openSessionId`, prompt cut | pass |
| `internal/server/launcherpastlist_test.go` | `TestListPastSessions_CapsAtMaxAndSetsTruncated` | Maintainability Major 2: `listPastSessions` directly — 200-cap and `truncated` | pass |
| `internal/server/launcherpastlist_test.go` | `TestHandleListPastSessions_RequiresCookie` | Auth wiring through the real server | pass |
| `internal/server/launcherpastlist_test.go` | `TestHandleListPastSessions_MissingDirectoryIs400` / `_RelativeDirectoryIs400` / `_NonexistentDirectoryIs404` | Request validation | pass |
| `internal/server/launcherpastlist_test.go` | `TestHandleListPastSessions_UnreadableProjectsDirYieldsEmptyList` | D8 at the wire | pass |
| `internal/server/launcherpastlist_test.go` | `TestHandleListPastSessions_OrdersNewestFirstAndMarksOpenSessionID` | D16 | pass |
| `internal/server/launcherpastlist_test.go` | `TestHandleListPastSessions_TruncatesAt200` | `truncated` rule at 201 sessions | pass |
| `internal/server/launcherpastlist_test.go` | `TestHandleListPastSessions_LastPromptTruncatedToFirstLineAnd200Chars` | Wire `lastPrompt` truncation | pass |
| `internal/server/launcherpastlist_test.go` | `TestHandleListPastSessions_NullFieldsForAStub` | Null wire fields for a cwd-only stub | pass |
| `internal/server/launcherpastlist_test.go` | `TestHandleListPastSessions_NeverSeenDirectoryIs200EmptyNotFound` | Existing-but-unlisted directory → 200 empty, not 404 | pass |
| `internal/server/sessions_test.go` | `TestHandleCreateSession_UnknownPermissionModeMessageNamesAllFive` (renamed from `...AllFour`) | Sanctioned fixture repair (Handoff) | pass |

## Implementation Bugs (resolved — kept for history)

| Bug | File | Expected (per plan) | Actual (before fix) |
|-----|------|---------------------|--------|
| `scanTranscript`'s head fallback clobbered a tail-found value | `internal/claudecode/launchtranscripts.go` | `kb:fact/transcript-session-lines`: every title/prompt/mode/model field is "rewritten as it changes" — the *last* line in the file wins | When the tail carried no `cwd` (triggering the head fallback), `scanChunk(head)` ran *after* `scanChunk(tail)` on the same accumulator, so an earlier, stale line of a type the tail already found a later value for (e.g. `permission-mode`) unconditionally overwrote it. Reproduced in `TestPastSessions_HeadFallbackDoesNotClobberATailFoundValue`. |

**Fixed** by daemon-impl's `f79ef67` (Fix Attempt 2 in `daemon-implementation.md`):
`scanTranscript` now applies chunks in chronological file order (head, then tail), so the
tail's value of a shared field still wins over a stale head-side one, while a field only
the head recorded still survives. Confirmed with the exact repro plus the full
`TestPastSessions_*` family and the full suite (below) — all green.

## Test Run Output

```
$ go build ./...
(clean, no output)

$ go test -race -count=1 -run TestPastSessions_HeadFallbackDoesNotClobberATailFoundValue -v ./internal/claudecode/...
=== RUN   TestPastSessions_HeadFallbackDoesNotClobberATailFoundValue
--- PASS: TestPastSessions_HeadFallbackDoesNotClobberATailFoundValue (0.07s)
PASS
ok      github.com/Zalaras/muster/internal/claudecode  1.845s

$ make test
bin/gatelock run --shared -- go test -count=1 ./...
ok      github.com/Zalaras/muster/cmd/musterd  62.662s
?       github.com/Zalaras/muster/internal/boundedwait [no test files]
ok      github.com/Zalaras/muster/internal/claudecode  7.930s
?       github.com/Zalaras/muster/internal/claudecode/claudecodetest  [no test files]
ok      github.com/Zalaras/muster/internal/evict       3.028s
ok      github.com/Zalaras/muster/internal/ghissue     2.029s
ok      github.com/Zalaras/muster/internal/gitutil     3.845s
ok      github.com/Zalaras/muster/internal/kb  4.260s
ok      github.com/Zalaras/muster/internal/keyedlock   2.469s
ok      github.com/Zalaras/muster/internal/locate      1.602s
ok      github.com/Zalaras/muster/internal/reader      6.781s
ok      github.com/Zalaras/muster/internal/selfupdate  4.150s
ok      github.com/Zalaras/muster/internal/server      88.974s
ok      github.com/Zalaras/muster/internal/session     9.627s
ok      github.com/Zalaras/muster/internal/store       5.801s
ok      github.com/Zalaras/muster/internal/termbridge  5.825s
ok      github.com/Zalaras/muster/internal/tmux        16.181s
ok      github.com/Zalaras/muster/internal/tmux/tmuxtest       4.900s
ok      github.com/Zalaras/muster/internal/triage      4.609s
ok      github.com/Zalaras/muster/internal/tty 5.008s
ok      github.com/Zalaras/muster/internal/usage       5.089s
ok      github.com/Zalaras/muster/internal/webui       2.918s
?       github.com/Zalaras/muster/test/rig/capture     [no test files]
?       github.com/Zalaras/muster/test/rig/failapi     [no test files]
?       github.com/Zalaras/muster/test/rig/failproxy   [no test files]
ok      github.com/Zalaras/muster/tools/gatelock       3.328s
ok      github.com/Zalaras/muster/tools/kb     2.995s
ok      github.com/Zalaras/muster/tools/triage 3.252s
ok      github.com/Zalaras/muster/tools/versions       7.399s

$ make lint
golangci-lint run
0 issues.

$ python3 .claude/skills/orchestrate/scripts/comment-checks.py --gates
comment-checks: clean

$ python3 .claude/skills/orchestrate/scripts/comment-checks.py daemon-tests
comment-checks: clean
```

## Test Run Output (fix cycle 1)

```
$ go build ./...
(clean, no output)

$ make test
bin/gatelock run --shared -- go test -count=1 ./...
ok      github.com/Zalaras/muster/cmd/musterd  71.308s
?       github.com/Zalaras/muster/internal/boundedwait [no test files]
ok      github.com/Zalaras/muster/internal/claudecode  11.158s
?       github.com/Zalaras/muster/internal/claudecode/claudecodetest  [no test files]
ok      github.com/Zalaras/muster/internal/evict       1.111s
ok      github.com/Zalaras/muster/internal/ghissue     1.771s
ok      github.com/Zalaras/muster/internal/gitutil     3.486s
ok      github.com/Zalaras/muster/internal/kb  3.763s
ok      github.com/Zalaras/muster/internal/keyedlock   4.751s
ok      github.com/Zalaras/muster/internal/locate      5.310s
ok      github.com/Zalaras/muster/internal/reader      8.693s
ok      github.com/Zalaras/muster/internal/selfupdate  6.574s
ok      github.com/Zalaras/muster/internal/server      90.834s
ok      github.com/Zalaras/muster/internal/session     11.734s
ok      github.com/Zalaras/muster/internal/store       8.201s
ok      github.com/Zalaras/muster/internal/termbridge  8.893s
ok      github.com/Zalaras/muster/internal/tmux        19.962s
ok      github.com/Zalaras/muster/internal/tmux/tmuxtest       7.303s
ok      github.com/Zalaras/muster/internal/triage      7.129s
ok      github.com/Zalaras/muster/internal/tty 8.160s
ok      github.com/Zalaras/muster/internal/usage       7.294s
ok      github.com/Zalaras/muster/internal/webui       5.932s
?       github.com/Zalaras/muster/test/rig/capture     [no test files]
?       github.com/Zalaras/muster/test/rig/failapi     [no test files]
?       github.com/Zalaras/muster/test/rig/failproxy   [no test files]
ok      github.com/Zalaras/muster/tools/gatelock       6.258s
ok      github.com/Zalaras/muster/tools/kb     5.315s
ok      github.com/Zalaras/muster/tools/triage 6.115s
ok      github.com/Zalaras/muster/tools/versions       12.062s

$ make lint
golangci-lint run
0 issues.

$ python3 .claude/skills/orchestrate/scripts/comment-checks.py daemon-tests
comment-checks: clean

$ python3 .claude/skills/orchestrate/scripts/dead-refs.py
web/e2e/helpers/daemon.ts:49  web/dist  ignored (gitignored by design)
dead-refs: 831 references checked, 0 missing
```

**Throwaway-copy proof that `TestLockClaudeSession_SerializesTheCheckThenClaimRaceForOneClaudeID`
is not vacuous** (`/tmp/muster-lock-check`, a full `cp -r` of the tree with
`LockClaudeSession` patched to return a no-op unlock func; run, output pasted, then
`rm -rf`'d — never committed, this tree's own `manager.go` untouched throughout):

```
$ go test -count=1 ./internal/session/... -run TestLockClaudeSession_SerializesTheCheckThenClaimRaceForOneClaudeID -v
=== RUN   TestLockClaudeSession_SerializesTheCheckThenClaimRaceForOneClaudeID
    manager_test.go:3559:
        Error Trace:    manager_test.go:3559
        Error:          Not equal:
                        expected: int(1)
                        actual  : int64(20)
        Test:           TestLockClaudeSession_SerializesTheCheckThenClaimRaceForOneClaudeID
        Messages:       exactly one concurrent resume claim for the same claude id may win
--- FAIL: TestLockClaudeSession_SerializesTheCheckThenClaimRaceForOneClaudeID (0.03s)
FAIL
```

With the real `LockClaudeSession` (this tree), the same test passes with `winners: 1` (see
the `make test` run above) — confirming the guarded version's assertion is actually
exercising the lock's exclusion, not passing by construction.
