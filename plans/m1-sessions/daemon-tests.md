# Daemon Tests: m1-sessions

**Plan**: m1-sessions
**Verdict**: pass

## Summary

Tests created: 112 new top-level test functions (many with `t.Run` subtests — 107
subtests observed in a `-v` run across the whole repo) across 14 new files plus one
addition to an existing store test file. Two pre-existing store test files were also
repaired (hardcoded migration counts, see "Pre-existing test repair" below).

Passing: all 156 top-level tests in the repo (112 new + 44 pre-existing M0 tests), 0
failing. `go build ./...`, `make lint` (0 issues) and `make check` all exit 0. The full
suite was also run with `-race -count=1` (repo-wide) and `-count=3` for the
timing-sensitive packages (`internal/session`, `internal/server`, `internal/tmux`) with
no flakes.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|----------------|--------|
| `internal/session/machine_test.go` | TestApplyInput_Bind | Bind: fresh-session start, model capture (object/absent shapes via the interpreter boundary), DisplayName stays verbatim, same-id rebind is not a clear | pass |
| `internal/session/machine_test.go` | TestApplyInput_ClearRebind | Explicit clear-rebind and Bind-escalation-on-changed-id (Edge Case 5) both reset compactions/prompt guards and set `started` | pass |
| `internal/session/machine_test.go` | TestApplyInput_TurnActivity | ACTIVE split (working/planning), REQ-9 latch (present vs nil `permission_mode`), D12 unseen-prompt opens ACTIVE, D11/Edge Case 2 closed-prompt straggler no-op | pass |
| `internal/session/machine_test.go` | TestApplyInput_NeedsInput | Both notification variants set `needs_input` with the right `attention.reason`; closed-prompt guard applies here too | pass |
| `internal/session/machine_test.go` | TestApplyInput_TurnClosed | Stop closes the prompt, enters idle, clears attention/failure, truncates `lastActivity` to 200 chars, latches mode, idempotent replay | pass |
| `internal/session/machine_test.go` | TestApplyInput_TurnFailed | D13: the permission latch is **never** touched by a failure (StopFailure carries no `permission_mode`); Failure/state set, prompt closed | pass |
| `internal/session/machine_test.go` | TestApplyInput_Compaction | REQ-21: PreCompact increments the counter, causes no transition | pass |
| `internal/session/machine_test.go` | TestApplyInput_DeathHint | D15: any non-clear SessionEnd sets `alive:false`+`endedAt`, never touches `state` | pass |
| `internal/session/machine_test.go` | TestApplyInput_ClearDeathHintAndInert | SessionEnd(clear) and unknown/inert inputs are true no-ops | pass |
| `internal/session/machine_test.go` | TestSetState_NoopWhenUnchanged | Edge Case 3: reapplying to the same resolved state never moves `stateSince` | pass |
| `internal/session/machine_test.go` | TestClosePrompt_BoundedRing | The closed-prompt guard evicts beyond 8 entries (Schema Changes note) | pass |
| `internal/session/machine_test.go` | TestClosePrompt_ClearsCurrentPromptIDWhenItIsTheOneClosed | closePrompt clears currentPromptID when it's the one closed | pass |
| `internal/session/machine_test.go` | TestClosePrompt_IdempotentForAnAlreadyClosedID | Closing the same id twice doesn't duplicate the ring entry | pass |
| `internal/session/machine_test.go` | TestActiveState | plan→planning, default/acceptEdits→working | pass |
| `internal/session/machine_test.go` | TestTruncate | 200-char truncation helper boundary cases | pass |
| `internal/session/manager_test.go` | TestCreateSession_DoesNotBroadcast | REQ-2: no broadcast until RecordLaunch | pass |
| `internal/session/manager_test.go` | TestRecordLaunch_BroadcastsOnceWithTheRealTarget | REQ-2: exactly one broadcast, carrying the real tmux target | pass |
| `internal/session/manager_test.go` | TestRecordLaunch_UnknownSessionErrors | RecordLaunch on an unknown id errors | pass |
| `internal/session/manager_test.go` | TestDeleteSession_RemovesFromMemoryAndStoreAndByClaudeIndex | Rollback removes the in-memory row, the store row, and the claude-id binding | pass |
| `internal/session/manager_test.go` | TestApply_RoutesByClaudeSessionIDAndBroadcasts | REQ-7/D8: Bind then routed Apply persist+broadcast through the same session | pass |
| `internal/session/manager_test.go` | TestApply_UnknownSessionErrors | Apply on an unknown Muster session id errors | pass |
| `internal/session/manager_test.go` | TestLoadAll_ReconstructsInMemoryStateAndClaudeBinding | Edge Case 7: restart reload rebuilds both the session and the claude-id binding | pass |
| `internal/session/manager_test.go` | TestCheckLiveness_FlipsAliveFalseOnMissingPaneAndBroadcasts | D16/REQ-11: a missing pane flips alive, broadcasts, never touches state | pass |
| `internal/session/manager_test.go` | TestCheckLiveness_LeavesAliveSessionsUntouchedWhenPaneExists | A live pane causes no spurious broadcast | pass |
| `internal/session/manager_test.go` | TestCheckLiveness_SkipsSessionsWithNoTmuxTargetYet | The CreateSession→RecordLaunch placeholder window is never pane-checked | pass |
| `internal/session/manager_test.go` | TestCheckLiveness_NilPaneCheckerIsANoOp | A nil PaneChecker doesn't panic | pass |
| `internal/session/manager_test.go` | TestPollLoop_RunsUntilStopped | Start/Stop with the real ticker actually flips a dead session within the poll interval | pass |
| `internal/session/manager_test.go` | TestList_ReturnsClonesNotLiveReferences | List returns independent clones, not the manager's live pointers | pass |
| `internal/claudecode/interpret_test.go` | TestInterpret_SessionStart | startup/resume/clear sources; model as object, plain string, and absent (all three measured shapes) | pass |
| `internal/claudecode/interpret_test.go` | TestInterpret_TurnActivityEvents | UserPromptSubmit/PreToolUse/PostToolUse all carry `permission_mode` (measured "always present" set) | pass |
| `internal/claudecode/interpret_test.go` | TestInterpret_Notification | permission_prompt/idle_prompt/unrecognized-type mapping | pass |
| `internal/claudecode/interpret_test.go` | TestInterpret_PermissionRequest | Maps to needs_input_permission, carries `permission_mode` | pass |
| `internal/claudecode/interpret_test.go` | TestInterpret_Stop | Maps to turn_closed with mode+lastActivity | pass |
| `internal/claudecode/interpret_test.go` | TestInterpret_StopFailure | D13's premise at the wire level: StopFailure never carries `permission_mode` | pass |
| `internal/claudecode/interpret_test.go` | TestInterpret_StopFailure_EmptyErrorStillReturnsANonNilPointer | An absent `error` field still yields a non-nil `*string` | pass |
| `internal/claudecode/interpret_test.go` | TestInterpret_PreCompact | Maps to compaction kind | pass |
| `internal/claudecode/interpret_test.go` | TestInterpret_SessionEnd | reason:"clear" → clear-death-hint; reason:"other" → death-hint (REQ-10/D15) | pass |
| `internal/claudecode/interpret_test.go` | TestInterpret_InertAndForwardCompatibility | SubagentStop/status_line/unknown hook names are all inert | pass |
| `internal/claudecode/interpret_test.go` | TestInterpret_MalformedPayloadNeverPanics | Garbage JSON never panics, for every event type | pass |
| `internal/claudecode/settings_test.go` | TestMergeSettings_FreshFileRegistersEveryHTTPHookEventAndSessionStartAsCommand | REQ-4/D19: every HTTP hook event registered, SessionStart as command, 1-2s timeout | pass |
| `internal/claudecode/settings_test.go` | TestMergeSettings_CalledTwiceProducesByteIdenticalOutput | D7: idempotent merge produces byte-identical output | pass |
| `internal/claudecode/settings_test.go` | TestMergeSettings_PreservesKeysMusterDoesNotOwn | Edge Case 9: unrelated keys/hook events/allowed URLs survive verbatim | pass |
| `internal/claudecode/settings_test.go` | TestMergeSettings_ReplacesMustersOwnEntriesWholesale | A changed daemon URL replaces the stale entry rather than appending | pass |
| `internal/claudecode/settings_test.go` | TestMergeSettings_AllowedURLsAreDeduplicatedAndSorted | No duplicate URL entries across repeated merges | pass |
| `internal/claudecode/settings_test.go` | TestMergeSettings_RejectsInvalidJSON | Corrupt existing file refuses rather than guessing | pass |
| `internal/claudecode/settings_test.go` | TestMergeSettings_RejectsInvalidHooksShape | Malformed `hooks` shape errors | pass |
| `internal/claudecode/settings_test.go` | TestMergeSettings_RejectsInvalidAllowedHttpHookUrlsShape | Malformed `allowedHttpHookUrls` shape errors | pass |
| `internal/claudecode/settings_test.go` | TestMergeSettings_EmptyExistingBehavesLikeNilExisting | `[]byte{}` and `nil` existing produce identical output | pass |
| `internal/claudecode/settings_test.go` | TestWriteWrapperScripts | Script paths, 0755 mode, 2s curl timeout, exit 0, envelope fields, no 5s timeout | pass |
| `internal/claudecode/launch_test.go` | TestBuildArgv | Table of model/title/permission-mode → argv combinations (spike S2) | pass |
| `internal/claudecode/launch_test.go` | TestBuildArgv_UsesTheGivenBinaryName | REQ-19: the binary name is a seam, not hardcoded | pass |
| `internal/store/repo_test.go` | TestUpsertRepo_CreatesOnFirstLaunch | First launch creates the row, `created=true` | pass |
| `internal/store/repo_test.go` | TestUpsertRepo_SecondLaunchIncrementsCountAndUpdatesDefaults | D6: one row, `launch_count==2`, defaults updated, `created=false` | pass |
| `internal/store/repo_test.go` | TestListRepos_OrdersPinnedThenMostRecentlyLaunched | D20/REQ-5 ordering: most-recent-first among unpinned | pass |
| `internal/store/repo_test.go` | TestListRepos_PinnedSortsBeforeUnpinnedRegardlessOfRecency | Pinned sorts first regardless of recency | pass |
| `internal/store/repo_test.go` | TestGetRepo_ReturnsErrorForUnknownID | Unknown id errors | pass |
| `internal/store/repo_test.go` | TestGetRepo_RoundTrips | Round-trip read matches what was upserted | pass |
| `internal/store/session_test.go` | TestInsertSession_SeedsStartedStateAndSeedSourceLatch | REQ-1/REQ-2 row shape: started, seed-latch, alive, placeholder tmux_target | pass |
| `internal/store/session_test.go` | TestInsertSession_NilOptionalFieldsRoundTripAsNil | branch/title/model nil round-trip as nil | pass |
| `internal/store/session_test.go` | TestGetSession_ReturnsErrorForUnknownID | Unknown id errors | pass |
| `internal/store/session_test.go` | TestUpdateSession_RoundTripsEveryField | Whole-object update round-trips every column | pass |
| `internal/store/session_test.go` | TestUpdateSession_CanClearPointerFieldsBackToNil | Attention fields can be cleared back to NULL (clear-rebind's reset) | pass |
| `internal/store/session_test.go` | TestDeleteSession_RemovesTheRow | Delete removes the row | pass |
| `internal/store/session_test.go` | TestListSessions_ReturnsEveryRow | Lists every row, unordered | pass |
| `internal/store/session_test.go` | TestListSessions_EmptyStoreReturnsNoRowsNoError | Empty store returns no rows, no error | pass |
| `internal/store/store_test.go` | TestInsertEvent_SessionIDRoutingColumn | D8/D9: `event.session_id` populated when routed, NULL when not, never guessed | pass |
| `internal/gitutil/gitutil_test.go` | TestIsRepo_TrueInsideAGitWorkingTree / FalseForAPlainDirectory / FalseForANonExistentDirectory | IsRepo against a real git checkout, a plain dir, a missing path | pass |
| `internal/gitutil/gitutil_test.go` | TestBranch_ReturnsTheCurrentBranchName / NilForAPlainNonGitDirectory / NilInDetachedHEADState | Branch detection incl. the detached-HEAD nil case (Schema Changes: "null when not git") | pass |
| `internal/gitutil/gitutil_test.go` | TestIsWorktree_FalseForAnOrdinaryRepo / FalseForAPlainNonGitDirectory / TrueForALinkedWorktreeFalseForItsMainCheckout | ux-flows §2's git-dir≠common-dir worktree recognition, against a real `git worktree add` | pass |
| `internal/tmux/tmux_test.go` | TestNewWindow_ReturnsATargetAndPane | Target/pane shape (`muster:@N` / `%N`) | pass |
| `internal/tmux/tmux_test.go` | TestNewWindow_SetsExtraEnvironmentInThePane | `-e` env vars actually reach the spawned process (verified via the process's own output, not `show-environment` — see Notes) | pass |
| `internal/tmux/tmux_test.go` | TestNewWindow_SpawnsInTheGivenDirectory | `-c dir` is honored | pass |
| `internal/tmux/tmux_test.go` | TestNewWindow_ReusesTheSameTmuxSessionAcrossCalls | One tmux session, multiple windows | pass |
| `internal/tmux/tmux_test.go` | TestPaneExists_TrueForALiveWindowFalseAfterKill | D16's core signal: true before kill, false after | pass |
| `internal/tmux/tmux_test.go` | TestPaneExists_EmptyTargetIsFalseWithNoError | Placeholder target → false, no error | pass |
| `internal/tmux/tmux_test.go` | TestPaneExists_UnknownTargetOnARunningServerIsFalseWithNoError | A never-created window target → false, no error | pass |
| `internal/tmux/tmux_test.go` | TestKillWindow_ErrorsForAnUnknownTarget | KillWindow surfaces tmux's own error for a bad target | pass |
| `internal/server/sessionwire_test.go` | TestToWireSession_MinimalShapeRendersEveryNullableFieldNull | "No data yet" wire shape: every optional field null, not zero-valued | pass |
| `internal/server/sessionwire_test.go` | TestToWireSession_RepoIsPopulatedOnlyWhenBranchIsSet | `repo` object only appears for a git checkout | pass |
| `internal/server/sessionwire_test.go` | TestToWireSession_ModelCarriesBothFieldsVerbatim | id/displayName both carried through | pass |
| `internal/server/sessionwire_test.go` | TestToWireSession_ClaudeSessionIDOnlyPresentWhenBound | Null until bound | pass |
| `internal/server/sessionwire_test.go` | TestToWireSession_AttentionAndFailureShapes | attention/failure object shapes | pass |
| `internal/server/sessionwire_test.go` | TestToWireSession_EndedAtFormatsAsRFC3339WhenSet | RFC3339 formatting | pass |
| `internal/server/sessionwire_test.go` | TestToWireSession_ContextGaugesAreAlwaysNullExceptCompactions | M1 Protocol Contract: gauges null, compactions live | pass |
| `internal/server/sessionwire_test.go` | TestSessionWire_JSONShapeHasNoUnexpectedNulls | Pins every field name against the protocol's §5.3 shape | pass |
| `internal/server/repos_test.go` | TestHandleListRepos_RequiresCookie | Auth wiring | pass |
| `internal/server/repos_test.go` | TestHandleListRepos_EmptyStoreReturnsEmptyArray | Empty store → `[]` | pass |
| `internal/server/repos_test.go` | TestHandleListRepos_IncludesLaunchDefaultsAndOrdering | REQ-5 additive fields via the real handler | pass |
| `internal/server/repos_test.go` | TestHandleListRepos_BranchIsReadAtRequestTimeNotCached | D20: two requests around a real branch change both reflect reality | pass |
| `internal/server/browse_test.go` | TestHandleBrowse_RequiresCookie | Auth wiring | pass |
| `internal/server/browse_test.go` | TestHandleBrowse_ListsSubdirectoriesSortedByNameExcludingDotfilesAndFiles | REQ-6/D19 response contract | pass |
| `internal/server/browse_test.go` | TestHandleBrowse_MarksGitCheckoutsAmongSubdirectories | `isGit` per subdirectory, real git checkouts | pass |
| `internal/server/browse_test.go` | TestHandleBrowse_NoPathDefaultsToHomeDirectory | Default-to-home-dir behaviour | pass |
| `internal/server/browse_test.go` | TestHandleBrowse_RelativePathIs400 | 400 invalid_request | pass |
| `internal/server/browse_test.go` | TestHandleBrowse_NonExistentPathIs404 | 404 not_found | pass |
| `internal/server/browse_test.go` | TestHandleBrowse_APathThatIsAFileIs404 | A file path is also 404 | pass |
| `internal/server/browse_test.go` | TestHandleBrowse_RootHasNilParent | `/` has a nil parent | pass |
| `internal/server/sessions_test.go` | TestHandleCreateSession_RequiresCookie | Auth wiring | pass |
| `internal/server/sessions_test.go` | TestHandleCreateSession_InvalidJSONBodyIs400 | Decode failure → 400 | pass |
| `internal/server/sessions_test.go` | TestHandleCreateSession_ValidationErrors | Protocol Contract's full 400 list (dir/model/permissionMode variants) | pass |
| `internal/server/sessions_test.go` | TestHandleCreateSession_ADirectoryThatIsAFileIs400 | "Not a directory" clause | pass |
| `internal/server/sessions_test.go` | TestLauncher_CorruptSettingsFileRefusesAndRollsBackTheSessionRow | D7/Edge Case 9: corrupt file names itself in the error, session row rolled back | pass |
| `internal/server/sessions_test.go` | TestLauncher_SuccessfulLaunchEndToEnd | D4-D7/REQ-1/REQ-2 via a real (private-socket) tmux window + stub binary: env var reaches the process, single broadcast, settings written, D6 relaunch increments launch_count | pass |
| `internal/server/ingest_routing_test.go` | TestIngestRouting_EnvelopedSessionStartBindsThenRawHookRoutesByClaudeSessionID | D8 end-to-end through the real HTTP ingest pipeline: envelope bind, then raw-hook routing by claude session id, state machine actually applied | pass |
| `internal/server/ingest_routing_test.go` | TestIngestRouting_UnknownClaudeSessionIDPersistsUnroutedAndLogs | D9: unrouted raw event → NULL `session_id` + log line | pass |
| `internal/server/ingest_routing_test.go` | TestIngestRouting_EnvelopeNamingAnUnknownMusterSessionPersistsUnrouted | Edge Case 12: a stale envelope's musterSession is never trusted | pass |

## Pre-existing test repair

`internal/store/migrate_test.go` (`TestMigrate_AppliesInitSchema`, `TestMigrate_SecondCallIsANoOp`) and `internal/store/store_test.go` (`TestOpen_SecondOpenOnSamePathDoesNotReapplyMigrations`) hardcoded "exactly 1 migration" / `version == 1`, flagged as expected fallout in `daemon-implementation.md`'s Handoff section once `0002_sessions.sql` existed. Updated the three assertions to `2` (and `TestMigrate_AppliesInitSchema`'s version check to `MAX(version) == 2`) — this is a test-content fix (assertion values), not an implementation change, and matches exactly what the implementation log predicted. All three pass now.

## Implementation Bugs

None found. Every acceptance criterion I could reach at the unit level (D3, D4–D9, D10–D16, D19, D20, plus REQ-1/2/3/4/5/6/7/8/9/10/11/13/19/20/21) behaves per the plan and protocol contract.

## Notes / decisions

- **`internal/session/manager_test.go` and `internal/server/*_test.go` use real SQLite (temp-dir file) and, where genuinely needed, real `tmux`/`git` binaries against private, per-test sockets/directories** — never `-L muster`, never the user's default tmux server, never a real `claude` binary. This matches "the state machine, reconcile, and any JSON merge get exhaustive unit tests" plus the constraint that per-test tmux gets its own private socket.
- **Dropped test: a dedicated "tmux spawn failure rolls back the row" case.** Manually probed `tmux new-window -c <nonexistent dir> -- <nonexistent binary>`: both return exit 0 with a valid window/pane — the fork succeeds synchronously and only the child's later exec fails asynchronously inside the pane, which `tmux.Client.NewWindow` has no way to observe, and the binary name "tmux" isn't an injectable seam. Evidence (via Bash):
  ```
  ---nonexistent binary---
  @1 %1
  exit: 0
  ---nonexistent cwd---
  @2 %2
  exit: 0
  ```
  The `rollback` code path itself (delete-session-row-on-later-step-failure) is still exercised structurally by `TestLauncher_CorruptSettingsFileRefusesAndRollsBackTheSessionRow`, which fails a real, reachable step (a corrupt `settings.local.json`) before tmux is ever touched.
- **`tmux show-environment` does not reflect what `new-window -e` actually hands the spawned process** — confirmed by manual probe (a var set via `-e` reached the child process's env, in a file it wrote itself, but was reported as "unknown variable" by `show-environment` on both the window and the global scope). `TestNewWindow_SetsExtraEnvironmentInThePane` and `TestLauncher_SuccessfulLaunchEndToEnd`'s D4 assertion both verify the pane environment by having the spawned process itself write the variable to a file, not via `show-environment`.
- **`internal/session` test files import `github.com/Zalaras/muster/internal/claudecode` only for the neutral `StateInput`/`InputKind` vocabulary** (no hook/event-name strings), matching D3a's "the state machine consumes only the neutral StateInput type" — same as the production code they test.
- Ran the D3 negative grep myself before finishing: `rg -n "hook_event_name|notification_type|last_assistant_message|stop_hook_active" cmd/ internal/ --glob '!internal/claudecode/**'` finds nothing (exit 1 → the `!`-gated check passes).
- `REQ-20` (LANG/LC_ALL) and `REQ-3` (repo upsert on launch) are exercised as a side effect of `TestLauncher_SuccessfulLaunchEndToEnd` and `TestUpsertRepo_*`; no dedicated LANG/LC_ALL-content assertion was added since `sessions.go` sets it as two literal map entries with no branching logic to exercise beyond that.

## Fix Cycle 1, Wave 2 (review-driven test updates)

**Mode**: fix mode, review cycle 1 of 3, wave 2 — daemon-tests only, following wave 1's
daemon-impl fixes (`daemon-implementation.md` "Fix Attempt 1"). Scope: update the two
tests the impl agent left intentionally red because they pinned superseded behavior, and
add the coverage review Critical 1 and Critical 2 explicitly asked for.

**Verdict: pass.** `go build ./...` exits 0, `gofmt -l .` and `go vet ./...` are clean,
`make lint` reports 0 issues, `make test` (`go test ./...`) is fully green, and
`go test -race ./internal/session/... ./internal/claudecode/...` is clean.

### Changes

| File | What | Why |
|------|------|-----|
| `internal/claudecode/settings_test.go` | `TestWriteWrapperScripts`: mode assertion changed from `0o755` to `0o700` | Review Major 9 — wrapper scripts embed the ingest token in cleartext; `daemon-implementation.md` Fix Attempt 1 changed the mode and left this assertion intentionally red for this pass |
| `internal/claudecode/interpret_test.go` | Renamed `TestInterpret_StopFailure_EmptyErrorStillReturnsANonNilPointer` → `TestInterpret_StopFailure_EmptyErrorYieldsNilFailureError`; assertion now `assert.Nil(t, in.FailureError)` | Review Minor 11 — an absent StopFailure `error` field must yield `FailureError: nil`, not a pointer to `""` (Fix Attempt 1 changed `interpret.go`; test was left red on purpose) |
| `internal/claudecode/interpret_test.go` | `TestInterpret_SessionStart`: renamed the two model subtests to describe the plain-string shape accurately, and added a new subtest `"model present as an {id, display_name} object (the status-line shape) is not extracted here"` asserting `in.Model` is nil for that shape | Review Major 11 / Fix Attempt 1's `modelID` change — the object-shape branch was dropped (measured: SessionStart's `model` is a plain string only, per `spikes/canary-fields.md`); the old subtest name described a shape the helper (`claudecodetest.EnvelopedSessionStart`) no longer even sends, and no test previously pinned "the object shape is rejected/ignored here" |
| `internal/session/machine_test.go` | `TestApplyInput_ClearRebind`: added 3 subtests — clear-rebind from `needs_input` (attention/failure/lastActivity all clear), clear-rebind from `failed` (failure clears), and the id-change-escalation path from `needs_input` (attention/failure clear) | Review Critical 1 — `applyBind` previously left `Attention`/`Failure` set on a `started` session after a `/clear` rebind, breaking protocol §5.3's iff invariants; the fix (Fix Attempt 1) needed the exact coverage the review named ("clearing from `needs_input` and from `failed`"), on both the explicit-clear and the id-change-escalation paths |
| `internal/claudecode/settings_test.go` | New test `TestMergeSettings_ForeignHookOnAMusterOwnedEventSurvives`: a user's own `PostToolUse` command hook (a formatter script) survives the merge alongside Muster's own entry, and survives a second (idempotent) merge without duplicating | Review Critical 2 — `MergeSettings` previously replaced the whole hook array per Muster-owned event, destroying foreign hooks on any of the ten events Muster also registers; this is the exact companion test the review asked for to `TestMergeSettings_PreservesKeysMusterDoesNotOwn` |

### Verified: no other fallout from wave 1

- `internal/claudecode/ingest_test.go`'s `TestParseIngestBody_EnvelopedVsRaw` embeds a
  literal `SessionStart` payload with the old `{id, display_name}` model object, but
  (confirmed via `grep -n "Interpret(" ingest_test.go`, no matches) it never calls
  `Interpret` and never asserts on `Model` — only envelope-routing fields. Left
  unchanged; the literal is inert.
- `internal/session/manager_test.go`'s liveness tests (`TestCheckLiveness_*`) were
  re-run under `-race` after the `checkLiveness` value-copy fix (review Major 8) — all
  pass, no assertion changes needed; the fix is an internal locking-discipline change
  with no externally observable behavior difference the existing tests pinned.
- `internal/server/repos_test.go` and `internal/server/sessions_test.go` — neither pins
  the literal string of an `err.Error()` leak (review Minor 12) or a rollback/kill-window
  call count (review Major 10), so the corresponding `daemon-implementation.md` Fix
  Attempt 1 changes (`repos.go`'s curated message, `sessions.go`'s
  `KillWindow`-on-`RecordLaunch`-failure) needed no test updates to keep green. Not adding
  new coverage for those here — out of this wave's explicitly scoped list (items 1-5 in
  the fix-mode brief); flagging in case a later wave wants it.
- `internal/store` file-mode (review Minor 3, `muster.db` now `0600`) — no existing test
  pinned the old `0644`, confirmed via `grep -rn "0o644\|0644\|FileMode\|Perm()"
  internal/store/*_test.go` (no matches), so no repair needed.

### Fix Cycle 1 Test Run Output

```
$ go build ./...
(exit 0, no output)

$ gofmt -l .
(no output)

$ go vet ./...
(no output)

$ make lint
golangci-lint run
0 issues.

$ make test
go test ./...
?   	github.com/Zalaras/muster/cmd/musterd	[no test files]
ok  	github.com/Zalaras/muster/internal/claudecode	(cached)
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
ok  	github.com/Zalaras/muster/internal/gitutil	(cached)
ok  	github.com/Zalaras/muster/internal/server	(cached)
ok  	github.com/Zalaras/muster/internal/session	(cached)
ok  	github.com/Zalaras/muster/internal/store	(cached)
ok  	github.com/Zalaras/muster/internal/tmux	(cached)
?   	github.com/Zalaras/muster/test/rig/capture	[no test files]
?   	github.com/Zalaras/muster/test/rig/failproxy	[no test files]

$ go test -race ./internal/session/... ./internal/claudecode/...
ok  	github.com/Zalaras/muster/internal/session	2.190s
ok  	github.com/Zalaras/muster/internal/claudecode	2.561s
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]

$ go test ./... -v -count=1 | grep -c '^--- PASS'
157
$ go test ./... -v -count=1 | grep -c '^--- FAIL'
0
```

Before this wave's fixes (baseline, confirming exactly the two tests were red as
documented and nothing else):

```
$ go test ./internal/... 2>&1 | tail -20
--- FAIL: TestInterpret_StopFailure_EmptyErrorStillReturnsANonNilPointer (0.00s)
    interpret_test.go:175: Expected value not to be nil.
--- FAIL: TestWriteWrapperScripts (0.00s)
    settings_test.go:215: Not equal: expected: 0x1ed actual: 0x1c0
FAIL
FAIL	github.com/Zalaras/muster/internal/claudecode	0.398s
ok  	github.com/Zalaras/muster/internal/gitutil	(cached)
ok  	github.com/Zalaras/muster/internal/server	(cached)
ok  	github.com/Zalaras/muster/internal/session	(cached)
ok  	github.com/Zalaras/muster/internal/store	(cached)
ok  	github.com/Zalaras/muster/internal/tmux	(cached)
```

## Test Run Output

```
$ go build ./...
(exit 0, no output)

$ make lint
golangci-lint run
0 issues.

$ go test ./... -race -count=1
ok  	github.com/Zalaras/muster/internal/claudecode	1.503s
ok  	github.com/Zalaras/muster/internal/gitutil	2.861s
ok  	github.com/Zalaras/muster/internal/server	5.786s
ok  	github.com/Zalaras/muster/internal/session	2.928s
ok  	github.com/Zalaras/muster/internal/store	4.126s
ok  	github.com/Zalaras/muster/internal/tmux	3.463s

$ go test ./... -v -count=1 | grep -c '^--- PASS'
156
$ go test ./... -v -count=1 | grep -c '^--- FAIL'
0
```

## Fix Cycle 2, Wave 2 (review-driven test additions)

**Mode**: fix mode, review cycle 2 of 3, wave 2 — daemon-tests only, following wave 1's
daemon-impl fixes (`daemon-implementation.md` "Fix Attempt 2"). Scope: the two pieces of
coverage review cycle 2's Critical 1 / Major 1 and Fix Attempt 2's own handoff explicitly
asked for, plus a check that the loopback-host fix for Major 2 already had a pinning
test (it did not).

**Verdict: pass.** `go build ./...` exits 0, `gofmt -l .` and `go vet ./...` are clean,
`make lint` reports 0 issues, `make test` (`go test ./...`) is fully green, and
`go test -race ./internal/session/...` is clean.

### Changes

| File | What | Why |
|------|------|-----|
| `internal/session/machine_test.go` | `TestApplyInput_ClearRebind`: added 2 subtests — a plain `KindBind` with an **unchanged** `claudeSessionID`, from `StateNeedsInput` and from `StateFailed`. Both assert `Attention`/`Failure` clear and `State == StateStarted`, and additionally assert `Compactions`, `currentPromptID`, `closedPromptIDs`, and `LastActivity` are all **left untouched** (not reset), pinning the distinction Fix Attempt 2 drew between the unconditional attention/failure clear and the clear-rebind-only reset of the other fields. | Review Critical 1 (second half) / `daemon-implementation.md` Fix Attempt 2's explicit handoff: `SessionStart(source:"resume")` reuses the original `claude_session_id` per `spikes/canary-fields.md`, so it never escalates to `KindClearRebind` — this is exactly the path the fix (`applyBind` now clears `Attention`/`Failure` unconditionally, before the `KindClearRebind` check) needed a companion test for, and no prior test exercised a plain bind with an *unchanged* id starting from a non-`started` state. |
| `internal/store/store_test.go` | New test `TestOpen_RestrictsPermissionsOnDatabaseAndSidecars`: opens a store, forces a write (`KVSet`) to guarantee the WAL sidecars exist on disk, then asserts `muster.db`, `muster.db-wal`, and `muster.db-shm` are all mode `0600`. | Review cycle 2 Major 1 / Fix Attempt 2's explicit handoff: the WAL sidecars (which hold the most recently written pages, i.e. the newest hook payloads) were left world-readable by a fix that only chmod'd the main file; this is the regression guard the review asked for so a future change touching only one of the three files gets caught. |
| `internal/claudecode/settings_test.go` | New test `TestMergeSettings_ForeignHookOnNonLoopbackHostWithMusterPathShapeSurvives`: a foreign `PostToolUse` HTTP hook entry on `https://example.com` whose URL path exactly matches Muster's `/ingest/<token>/hook` shape survives the merge alongside Muster's own (loopback) entry. | Review cycle 2 Major 2: `isMusterEntry` previously recognized any HTTP hook by path shape alone, regardless of host, so a foreign tool that happened to register a hook on that exact path shape on a remote host would be silently deleted on every launch. The daemon-impl fix added `isLoopbackHost`, but no existing test exercised a *non-loopback* host with the matching path shape — confirmed via `grep -n "isLoopbackHost\|non-loopback\|NonLoopback" internal/claudecode/settings_test.go` before this change (no matches). |

### Verified: no other fallout from Fix Attempt 2

- The three existing `TestApplyInput_ClearRebind` subtests from Fix Cycle 1 Wave 2
  (explicit clear-rebind from `needs_input`/`failed`, and the id-change-escalation path)
  still pass unchanged — Fix Attempt 2's change (moving the `Attention`/`Failure` clear
  above the `kind == KindClearRebind` check) is a strict widening of when those two
  fields get cleared, not a behavior change on the paths those three already covered.
- `internal/claudecode/settings_test.go`'s existing
  `TestMergeSettings_ForeignHookOnAMusterOwnedEventSurvives` and
  `TestMergeSettings_ReplacesMustersOwnEntriesWholesale` both use `testSettingsConfig()`,
  whose `HookURL`/`StatusURL` are already `127.0.0.1` (loopback) — so the new
  `isLoopbackHost` gate in `isMusterEntry` doesn't change their outcome; re-ran both
  under this change and they still pass.
- Did not add a case for `isLoopbackHost`'s IPv6-loopback (`::1`) branch — the function
  handles it via `net.ParseIP(host).IsLoopback()`, which is Go stdlib behavior the plan's
  testing guidance says not to duplicate ("don't test what the stdlib guarantees"); the
  daemon's own `SettingsConfig.HookURL` is always constructed from `127.0.0.1` or
  `localhost` (never `::1`), so it isn't a path this feature can actually take.

### Fix Cycle 2 Test Run Output

```
$ go build ./...
(exit 0, no output)

$ gofmt -l .
(no output)

$ go vet ./...
(no output)

$ make lint
golangci-lint run
0 issues.

$ go test ./internal/session/... ./internal/store/... ./internal/claudecode/... -v -run 'TestApplyInput_ClearRebind|TestOpen_RestrictsPermissionsOnDatabaseAndSidecars|TestMergeSettings_ForeignHookOnNonLoopbackHostWithMusterPathShapeSurvives'
=== RUN   TestApplyInput_ClearRebind
    --- PASS: TestApplyInput_ClearRebind/explicit_clear-rebind_resets_compactions_and_prompt_guards (0.00s)
    --- PASS: TestApplyInput_ClearRebind/a_plain_Bind_escalates_to_clear-rebind_when_the_claude_session_id_changed_without_a_clear_source (0.00s)
    --- PASS: TestApplyInput_ClearRebind/keeps_updating_the_model_id_on_a_clear-rebind (0.00s)
    --- PASS: TestApplyInput_ClearRebind/explicit_clear-rebind_from_needs_input_clears_attention_and_failure_and_resets_lastActivity (0.00s)
    --- PASS: TestApplyInput_ClearRebind/explicit_clear-rebind_from_failed_clears_the_stale_failure_and_attention (0.00s)
    --- PASS: TestApplyInput_ClearRebind/id-change_escalation_from_needs_input_also_clears_attention_and_failure (0.00s)
    --- PASS: TestApplyInput_ClearRebind/plain_bind_with_an_unchanged_claude_session_id_from_needs_input_clears_attention_and_failure_but_leaves_clear-only_fields_untouched (0.00s)
    --- PASS: TestApplyInput_ClearRebind/plain_bind_with_an_unchanged_claude_session_id_from_failed_clears_failure_and_attention_but_leaves_clear-only_fields_untouched (0.00s)
PASS
ok  	github.com/Zalaras/muster/internal/session	2.050s
=== RUN   TestOpen_RestrictsPermissionsOnDatabaseAndSidecars
--- PASS: TestOpen_RestrictsPermissionsOnDatabaseAndSidecars (0.01s)
PASS
ok  	github.com/Zalaras/muster/internal/store	0.725s
=== RUN   TestMergeSettings_ForeignHookOnNonLoopbackHostWithMusterPathShapeSurvives
--- PASS: TestMergeSettings_ForeignHookOnNonLoopbackHostWithMusterPathShapeSurvives (0.00s)
PASS
ok  	github.com/Zalaras/muster/internal/claudecode	1.379s

$ go test -race ./internal/session/...
ok  	github.com/Zalaras/muster/internal/session	2.297s

$ go test ./... -count=1
ok  	github.com/Zalaras/muster/internal/claudecode	0.381s
ok  	github.com/Zalaras/muster/internal/gitutil	1.942s
ok  	github.com/Zalaras/muster/internal/server	3.925s
ok  	github.com/Zalaras/muster/internal/session	1.782s
ok  	github.com/Zalaras/muster/internal/store	3.065s
ok  	github.com/Zalaras/muster/internal/tmux	3.038s

$ go test ./... -v -count=1 | grep -c '^--- PASS'
159
$ go test ./... -v -count=1 | grep -c '^--- FAIL'
0
```
