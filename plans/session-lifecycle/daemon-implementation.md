# Daemon Implementation: Session lifecycle robustness

**Plan**: session-lifecycle
**Mode**: initial
**Pack**: `kb: pack 23136 words` / `kb: WARN pack exceeds budget of 8000 words` (role `daemon-impl`, features `lifecycle,actions,launch,surfaces,ingest`)

## Scope

Phase 1 only — REQ-1 through REQ-10, plus REQ-8 (see Decisions). REQ-11 through REQ-17
(Phase 2) are untouched, as instructed.

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/tmux/tmux.go` | modified | REQ-3 `ParseSessionName`/`MaxSessionID`; REQ-4 `ErrSessionExists` wrapped from `NewNamedSession`'s stderr (additive, via a second `%w` on the existing `"tmux new-session: %w"` chain — the tmux session name still survives into the error text); REQ-5 `killLeakedSession` on both post-create failure branches; REQ-6 `KillSession` treats `*exec.ExitError` as success; new `ResolveSessionTarget` (REQ-9's repair primitive, resolves a live session name's current window/pane via `list-panes -F`) |
| `internal/store/session.go` | modified | REQ-1 `InsertSessionParams.MinID` + transactional, explicit-id `InsertSession` (one `sql.Tx`: reads `MAX(id)` and the `kv` watermark, allocates `max(...)+1`, writes both the row and the bumped watermark); new `BumpIDWatermark` for REQ-9's unknown/shell-name floor-raise |
| `internal/store/store.go` | modified | `dbTx` interface + unexported `kvGet`/`kvSet` so the watermark read/write can run inside `InsertSession`'s transaction; `KVGet`/`KVSet` now thin wrappers over these, signatures unchanged |
| `internal/session/manager.go` | modified | REQ-9 `Reconcile` rewritten to classify by tmux name ownership from one `ListSessions` snapshot (`classifySessionsByOwnership`, `classifyTmuxNames`, `reviveOwnedSession`, `reportAndSweepUnknown`) with a `classifySessions` (legacy alive+`PaneExists`) fallback when no `SessionKiller` is wired or `ListSessions` itself fails; REQ-10 the act phase (`actOnReconcile`) logs and continues past a `markEnded`/`DeleteSession` failure instead of aborting; `CreateParams.MinID` passthrough to `store.InsertSessionParams`; new `RepairOwnedSession` (REQ-8's single-row repair, used by Resume) |
| `internal/server/sessions.go` | modified | REQ-7 `paneSpawner` gains `MaxSessionID`; `Launch` probes it before the (now-looped, up to 3 attempts) `CreateSession`→`NewSession`, raising the floor and retrying on `errors.Is(err, tmux.ErrSessionExists)`, naming the tmux session and never quoting raw tmux stderr on exhaustion; `writeSettings` moved before any row is created (so a corrupt settings file never needs a rollback and never touches `l.tmux`, which one frozen test constructs as nil); REQ-8 `Resume`'s `ErrSessionExists` branch calls `manager.RepairOwnedSession` and returns 200 on success, 500 `launch_failed` naming the session (no raw stderr) otherwise |

## Decisions

- REQ-8 (Resume repair) has no `D*`/`W*`/`E*` acceptance criterion anywhere in the plan or
  daemon-tests.md, and the orchestrator's task message only names D1–D11 (+D18) for this
  phase, but REQ-8 is listed under "Must Have — Phase 1" in plan.md and was not called
  out as Phase 2. Implemented it (new `Manager.RepairOwnedSession` + `Resume`'s
  `ErrSessionExists` branch) since an unmentioned Phase-1 REQ is a review Minor
  (kb:lesson/unmentioned-req-costs-a-review-minor); no existing test exercises this path
  and none broke.
- REQ-5's "a kill failure there is logged" (plan wording) is not logged: `internal/tmux`
  has no logger threaded into `Client` anywhere (`grep -rn "zerolog\|logger" internal/tmux/*.go`
  → no hits outside this comment), and every call site across the tree
  (`rg -n 'tmux\.New\('`) constructs it with only a socket string — adding a logger
  parameter would change `New`'s signature and every one of those call sites, several in
  test files I may not edit. `killLeakedSession` is best-effort and silent; the doc
  comment states this and notes the caller (which does hold a logger) is where a leak
  would actually be surfaced if one ever mattered. Minimal deviation, not a wire/contract
  change.
- The store-level watermark-raise for unknown/shell tmux names (REQ-9's last clause,
  `BumpIDWatermark`) has no direct test assertion in daemon-tests.md's D8–D11, but is
  explicit REQ-9 text — implemented for completeness (cheap, and the `kv` write pattern
  already existed for REQ-1).
- `sweepUnknownTmuxSessions` (the old, now-superseded helper) was deleted rather than kept
  dead — its old `ListSessions` call would otherwise race REQ-9's own single snapshot,
  and both `TestReconcile_KillsEveryShellSessionUnconditionallyAndCountsThem` and its two
  siblings in `internal/session/reconcile_shell_test.go` (unedited) pass against the new
  single-call path.
- `writeSettings` was reordered to run before `CreateSession` (previously: create → write
  settings → spawn). `TestLauncher_CorruptSettingsFileRefusesAndRollsBackTheSessionRow`
  constructs `sessionLauncher` with `tmux` left nil; probing `MaxSessionID` before
  `CreateSession` (REQ-7's literal ordering) would nil-panic if it ran ahead of
  `writeSettings` failing. The test's only assertion is `st.ListSessions()` being empty,
  which holds either way (no row is ever created when settings fail first) — confirmed
  the test still passes: `go test ./internal/server/... -run
  TestLauncher_CorruptSettingsFileRefusesAndRollsBackTheSessionRow -v` → PASS. No REQ or
  Edge Case pins the create/writeSettings order the other way.

## Handoff

**Build status**: `go build ./...` exits 0.

**Test files needing changes**: None — every test file was left untouched; D1–D11 all
pass unamended against the new code, and the two pinned guardrails
(`manager_test.go:895`-area `TestReconcile_ReportsUnknownMusterSessionsWithoutCreatingRows`
and `manager_test.go:1422`-area `TestRemove_EndsAnAliveSessionFirstAndLeavesTheRowOnAFailingKill`)
pass unamended.

**Tests I believe are asserting something no longer reachable** (flagging per the
orchestrator's ask, not something I touched):
`TestHandleRemoveSession_FailingEndLeavesTheShellRunningAndTheRowPresent`
(`internal/server/sessions_test.go:469`, D15/REQ-13) fabricates a `tmux_target` that
names a tmux session that was never spawned, intending End's `KillSession` to fail
genuinely — its own comment already flags this as "stands in for D15's 'tmux
unreachable' scenario" and "today's non-idempotent KillSession". Now that REQ-6 (Phase 1,
shipped) makes "no such session" a *success*, a fabricated/never-spawned target can no
longer produce a genuine kill failure at all — the test gets `204` instead of the `500`
it expects, not just because REQ-13's reordering is still pending (Phase 2, as expected),
but because its own fault-injection method is gone. Phase 2's REQ-13 implementer will
need a different way to force a genuine kill failure (e.g. a `Killer`/tmux double that
returns a real error, or `context.Canceled`/deadline) rather than a fabricated name.

**Left red, as instructed (Phase 2, D12 is a side effect, D14 too)**:
- D15 (`TestHandleRemoveSession_FailingEndLeavesTheShellRunningAndTheRowPresent`) — REQ-13, see above.
- D16 (`TestMarkEnded_APersistFailureLeavesTheInMemorySessionAliveMatchingTheDB`) — REQ-14 (rollback on persist failure), not implemented.
- D17 (`TestCheckLiveness_ListSessionsFailureLeavesSessionsAsIsDespitePaneExistsFalse`) — REQ-16 (server-reachability guard in `checkOneLiveness`), not implemented.

**Passes as a side effect of Phase 1 (not implemented on purpose, but true)**:
- D12 (`TestEnd_AlreadyGoneTmuxSessionIsSuccessNotError`) — passes purely because REQ-6 (Phase 1) makes `KillSession` idempotent; `Manager.End` needed no change.
- D14 (`TestEnd_ConcurrentEndsProduceExactlyOneMarkEndedAndNeverAKillError`) — passes reliably (10/10 runs) without REQ-11's per-session lock, because REQ-6 makes both racing `KillSession` calls succeed (the loser's "no such session" is now success, not a raw error) and `markEnded` is already idempotent. REQ-11 (Phase 2) still belongs to a later run for its own reasons (concurrent Launch/Resume/Remove), but D14 specifically is already green.

## Verification evidence

`go build ./...` — exit 0, no output.

`gofmt -l .` — no output (clean).

`go vet ./...` — no output (clean).

`golangci-lint run` — 2 issues, both pre-existing `intrange` suggestions in frozen test
files (`internal/session/manager_test.go:2662`, `internal/store/session_test.go:133`),
introduced by the red-first test-authoring commit `33d482a` (confirmed via `git log
--oneline -1 -- <file>`), not by this step. `golangci-lint run --tests=false` (production
code only) — 2 unrelated pre-existing `unused` findings in `internal/server/issue.go` and
`internal/server/prefs.go` (functions referenced only from test files that `--tests=false`
excludes; `git diff --stat HEAD -- internal/server/issue.go internal/server/prefs.go` is
empty — I never touched these files). Nothing from my diff appears in either lint run.

`python3 .claude/skills/orchestrate/scripts/dead-refs.py` — `dead-refs: 4 references
checked, 0 missing`.

`make refs` (`--all`) — 25 missing, all pre-existing (`.claude/settings.local.json` /
`test/rig/captures/*` paths in docs/spikes/test-rig files I never touched).

`make check-kb` — 1 problem: `internal/tmux/tmux_test.go:500: citation
kb:adr/actions-kill-is-idempotent resolves to no record` — that citation is in the frozen
test file (authored by daemon-tests, not by me) and names one of the plan's four
`proposed` ADRs the orchestrator writes at Completion; it cannot resolve before then.

`go test ./internal/tmux/... ./internal/store/... ./internal/session/... ./internal/server/... -v`
— full output captured; every D1–D11 test green, D15/D16/D17 red as expected, nothing
else red. Representative excerpts:

```
--- PASS: TestMaxSessionID_NoServerReturnsZero
--- PASS: TestMaxSessionID_ReturnsTheHighestIDAcrossBothClaudeAndShellSessionNames
--- PASS: TestParseSessionName
--- PASS: TestNewNamedSession_DuplicateNameWrapsErrSessionExists
--- PASS: TestNewNamedSession_ApplyServerOptionsFailureLeavesNoSessionAndReturnsTheOriginalError
--- PASS: TestKillSession_RemovesTheWholeSessionIdempotentForAnUnknownName
```

```
--- PASS: TestInsertSession_AllocatesAboveHighestExistingIDAndWritesWatermark
--- PASS: TestInsertSession_MinIDFloorsAllocationEvenAboveTheExistingMax
```

```
--- PASS: TestCreateSession_AfterRemovingTheHighestIDTheNextIDIsStrictlyGreater
--- PASS: TestReconcile_LiveMusterSessionUnderAPlaceholderTargetIsRepairedAndKeptAlive
--- PASS: TestReconcile_AliveFalseRowWithALiveMusterSessionIsRevivedNotSwept
--- PASS: TestReconcile_AliveRowWithAStaleWindowTargetIsRepairedNotMarkedEnded
--- PASS: TestReconcile_ReportsUnknownMusterSessionsWithoutCreatingRows   (guardrail, unamended)
--- PASS: TestEnd_AlreadyGoneTmuxSessionIsSuccessNotError
--- PASS: TestRemove_EndsAnAliveSessionFirstAndLeavesTheRowOnAFailingKill  (guardrail, unamended)
--- PASS: TestEnd_ConcurrentEndsProduceExactlyOneMarkEndedAndNeverAKillError
--- FAIL: TestMarkEnded_APersistFailureLeavesTheInMemorySessionAliveMatchingTheDB  (D16, Phase 2, expected)
--- FAIL: TestCheckLiveness_ListSessionsFailureLeavesSessionsAsIsDespitePaneExistsFalse  (D17, Phase 2, expected)
--- PASS: TestReconcile_KillsEveryShellSessionUnconditionallyAndCountsThem
--- PASS: TestReconcile_NeverListsAnyShellSessionAsUnknown
--- PASS: TestReconcile_AFailedShellKillIsNotCountedButStillNeverReportedAsUnknown
```

```
--- PASS: TestHandleCreateSession_OrphanedTmuxSessionDoesNotBlockLaunch   (D3, the #26 reproducer)
--- PASS: TestLauncher_ProbesMaxSessionIDAndDegradesToFloorZeroOnError    (D2, launcher half)
--- PASS: TestLauncher_RetriesOnceOnASingleErrSessionExistsThenSucceedsWithAHigherID  (D4)
--- PASS: TestLauncher_ExhaustsThreeAttemptsOnRepeatedErrSessionExists    (D5)
--- PASS: TestLauncher_SuccessfulLaunchEndToEnd                          (pre-existing, unamended)
--- PASS: TestLauncher_AutoPermissionModeSeedsLatchAndRepoDefault        (pre-existing, unamended)
--- PASS: TestLauncher_CorruptSettingsFileRefusesAndRollsBackTheSessionRow (pre-existing, unamended)
--- FAIL: TestHandleRemoveSession_FailingEndLeavesTheShellRunningAndTheRowPresent  (D15, Phase 2, expected — see note above)
```

`go test ./internal/...` full run: only the same three FAILs (D15/D16/D17); every other
package (`claudecode`, `ghissue`, `gitutil`, `kb`, `locate`, `selfupdate`, `store`,
`termbridge`, `tmux`, `tmuxtest`, `triage`, `usage`, `webui`) is green.

## Phase 2 — REQ-11 through REQ-16

**Scope**: daemon only. REQ-17 (web) belongs to a different agent; `web/` untouched.
Picked up on the branch after Phase 1 (`b4f2255`) plus the D19/REQ-17-test-authoring
commits that landed since (`ce6a2c5`, `c5304cb`, `b4bc066`, `632d446`, `c725880`,
`8f77f5f`) — none of which touch `internal/session/manager.go`,
`internal/server/sessions.go` or `internal/server/shells.go`.

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/session/manager.go` | modified | REQ-11 `Manager.idLocks` + exported `LockSession(id) (unlock func())`, a `map[int64]*sync.Mutex` guarded by `m.mu` (map access only, never held across tmux I/O); `End`/`Remove` split into locked entry points (`End`→`endLocked`, `Remove`→`removeLocked`) so `Remove`'s own alive branch calls `endLocked` directly instead of re-entering `End` (which would deadlock re-acquiring the same id's lock); REQ-14 rollback-on-persist-failure via a new shared `rollbackOnPersistFailure` helper, applied to `RecordLaunch`, `RecordResume` and `markEnded`; REQ-14 `removeLocked` now deletes the store row *before* dropping the in-memory entry and fires `OnRemoved` only after both succeed; REQ-15 `removeLocked`'s not-alive branch issues an idempotent `KillSession` before deleting (REQ-6 already makes "already gone" a success); REQ-16 `checkLiveness` calls `ListSessions` once per sweep (not per session) to confirm tmux is reachable before trusting any `PaneExists` miss, and returns early (leaving every session as-is) on failure |
| `internal/server/sessions.go` | modified | REQ-11 `sessionLauncher.Resume` and a new `spawnAndRecordLaunch` helper (Launch's per-attempt spawn+record step, extracted so it can hold the lock without `continue`/return juggling) both call `manager.LockSession(id)`/`defer unlock()`; REQ-13 `handleEndSession` now calls `manager.End` first and closes the terminal socket only past the unknown/not-alive gates (still closed on a genuine kill failure, since End's own gates already passed by then); `handleRemoveSession` now calls `manager.Remove` first and only kills the shell/closes terminal sockets on success |
| `internal/server/shells.go` | modified | REQ-12 `shellRegistry`'s single `mu` becomes `idLocks map[int64]*sync.Mutex` (same map-guarded-by-mu shape as `Manager.LockSession`) via a new `lockID` helper; `Ensure` tolerates `tmux.ErrSessionExists` from `NewNamedSession` by re-checking `PaneExists` and returning `created:false` instead of propagating to `500 shell_spawn_failed`; every tmux call `Ensure`/`Kill` make is now wrapped in `context.WithTimeout(ctx, shellTmuxTimeout)` (5s) so a wedged tmux can't hang End/Remove (which call `Kill`); `Kill` reclaims its id's lock entry after use (never reused, REQ-2) |

## Decisions

- REQ-11 covers Launch too, not just Resume: `spawnAndRecordLaunch` locks around
  Launch's spawn+record step even though no red test drives it there (D19 only exercises
  Resume) — a fresh id from `CreateSession` can't actually be contended by anything else
  yet, so this is pure discipline-uniformity, not a behavior change; confirmed
  `TestLauncher_ProbesMaxSessionIDAndDegradesToFloorZeroOnError`,
  `TestLauncher_RetriesOnceOnASingleErrSessionExistsThenSucceedsWithAHigherID`,
  `TestLauncher_ExhaustsThreeAttemptsOnRepeatedErrSessionExists`,
  `TestLauncher_SuccessfulLaunchEndToEnd`, `TestLauncher_AutoPermissionModeSeedsLatchAndRepoDefault`
  and `TestLauncher_CorruptSettingsFileRefusesAndRollsBackTheSessionRow` are all still green
  unamended (`go test ./internal/server/... -run TestLauncher_ -v`, all PASS).
- REQ-16's reachability check lives in `checkLiveness` (the periodic sweep) only, not
  inside `checkOneLiveness` itself — the orchestrator's brief explicitly warned against
  adding a `ListSessions` call per session per tick; `checkOneLiveness` is also called
  directly by `Nudge` and by `End` (which just performed its own kill), neither of which
  gained a reachability check, since D17 only exercises the sweep and adding it to
  `End`/`Nudge` would mean two tmux round-trips per action for no tested benefit.
- REQ-15's not-alive-row kill only runs `if m.sessionKiller != nil` — several existing
  Remove tests construct a `Manager` with no `SessionKiller` at all
  (`TestRemove_LeavesBystandersPinnedAndRailPosUnchanged`,
  `TestSetPinned_NoOpWithABystanderGapFromAnEarlierRemoveStillBroadcastsNothing` and its
  pinned-block sibling); without the nil guard these would nil-pointer-panic on a
  not-alive Remove. Confirmed all three still pass:
  `go test ./internal/session/... -run 'TestRemove_LeavesBystandersPinnedAndRailPosUnchanged|TestSetPinned_.*Remove.*' -v` → all PASS.
- `TestIngestRouting_StragglerFromBeforeAClearNeverMovesTranscriptOrPlan`
  (`internal/server/reader_test.go:747`) intermittently fails its `require.Eventually`
  (fixed 2s bound) under `-race` and under full-package `go test ./internal/...` load —
  reproduced 5/5 under `-race -count=5` in isolation, and confirmed present identically on
  a clean worktree of the branch tip *before* any of this step's changes (`git worktree add
  /tmp/verify-flake-b4bc066 HEAD` at commit `8f77f5f`, same 5/5 failure). Not touched by
  this diff (no file under `internal/server/reader*.go` or `internal/claudecode/` was
  edited) and not something to fix here — flagged, not fixed, per this agent's file-touch
  boundary.
- `make check-kb` reports one problem, `web/src/render/actionerror.test.ts: owned by no
  feature` — that file was added by the web-tests agent's commit `8f77f5f`
  (`git log --oneline -1 -- web/src/render/actionerror.test.ts`), before this step touched
  anything; not mine to fix (`web/` is out of scope for this agent per the task).

## Handoff

**Build status**: `go build ./...` exits 0.

**Test files needing changes**: None — every test file was left untouched.

**Requirements resting on inspection, not a failing test** (per the orchestrator's ask):
REQ-12 (`shellRegistry`'s per-id lock, `ErrSessionExists` tolerance, bounded tmux
contexts) has no `D*`/`W*`/`E*` acceptance criterion anywhere in daemon-tests.md; verified
by `go test ./internal/server/... -run TestShellRegistry -v` (unchanged, all green) plus
manual reasoning above — no test exercises the timeout or the `ErrSessionExists`
re-check path. REQ-11's coverage of Launch (as opposed to Resume, which D19 covers) is
likewise inspection-only.

## Verification evidence

`go build ./...` — exit 0, no output.

`gofmt -l .` — no output (clean).

`go vet ./...` — no output (clean).

`golangci-lint run` — 3 issues, all `intrange` in frozen test files I may not edit
(`internal/server/sessions_test.go:578` — the D19 test; `internal/session/manager_test.go:2662`;
`internal/store/session_test.go:133` — the latter two already flagged pre-existing in
Phase 1's log). `golangci-lint run --tests=false` (production code only) — the same 2
pre-existing `unused` findings in `internal/server/issue.go`/`prefs.go` Phase 1 already
flagged, confirmed still untouched by this diff (`git diff --stat -- internal/server/issue.go
internal/server/prefs.go` empty). Nothing from this step's diff appears in either run.

`python3 .claude/skills/orchestrate/scripts/dead-refs.py` — `dead-refs: 823 references
checked, 0 missing`.

`go test ./internal/...` (no `-race`, matching the gate command) — every package green,
including `internal/server` and `internal/session`.

Target tests, isolated and verbose:

```
--- PASS: TestHandleRemoveSession_FailingEndLeavesTheShellRunningAndTheRowPresent (0.16s)
--- PASS: TestLauncher_ConcurrentResumesSpawnExactlyOnce (0.01s)
--- PASS: TestMarkEnded_APersistFailureLeavesTheInMemorySessionAliveMatchingTheDB (0.01s)
--- PASS: TestCheckLiveness_ListSessionsFailureLeavesSessionsAsIsDespitePaneExistsFalse (0.01s)
```

`go test ./internal/server/ -run TestLauncher_ConcurrentResumesSpawnExactlyOnce -count=20 -race`:

```
ok  	github.com/Zalaras/muster/internal/server	4.035s
```

(20/20 pass under `-race`; D14 (`TestEnd_ConcurrentEndsProduceExactlyOneMarkEndedAndNeverAKillError`)
and the two guardrails (`manager_test.go` unknown-sessions test, `TestRemove_EndsAnAliveSessionFirstAndLeavesTheRowOnAFailingKill`)
also still pass, confirmed via `go test ./internal/session/... -run
'TestEnd_ConcurrentEndsProduceExactlyOneMarkEndedAndNeverAKillError|TestReconcile_ReportsUnknownMusterSessionsWithoutCreatingRows|TestRemove_EndsAnAliveSessionFirstAndLeavesTheRowOnAFailingKill'
-v -race` → all PASS.)

## Fix Attempt 1 — KillSession's ExitError needs verification, not assumption

**Failure addressed**: not a red test — a correctness gap the e2e agent found while
tracing REQ-13: `KillSession` (`internal/tmux/tmux.go`) treated *any* `*exec.ExitError`
from `kill-session` as a successful idempotent kill, which is broader than REQ-6/
`kb:adr/actions-kill-is-idempotent` intend ("every other failure — tmux missing, socket
unreadable, context deadline — still returns an error"). A socket tmux can't read also
exits non-zero, which read as success, and `removeLocked`'s not-alive branch (this
plan's own REQ-15 addition) would then delete a row whose pane is still running — exactly
the orphan class the plan exists to close.

**Change made**: `KillSession` now verifies an `*exec.ExitError` against `PaneExists`
before treating it as success, rather than matching tmux's stderr text (unstable across
versions) or assuming from the exit code alone:
- `PaneExists` says gone (`false, nil`) → `nil`, the REQ-6 idempotent-kill case.
- `PaneExists` says still there (`true, nil`) → the original `kill-session` error, so a
  genuine failure still blocks Remove/End and still leaves the row.
- `PaneExists` itself errors → the original `kill-session` error (unprovable is not
  proven — the conservative default, matching every other "check error" branch in this
  package).

The extra round trip (one more tmux invocation) happens only on the already-erroring
path; the success path (`kill-session` exits 0) is unchanged.

**Test coverage**: `TestKillSession_RemovesTheWholeSessionIdempotentForAnUnknownName`
(D12's basis) exercises the "gone" branch end-to-end against a real socket — a name
nothing ever created, `kill-session` exits non-zero, `PaneExists` confirms gone, `nil`
returned. `TestEnd_AlreadyGoneTmuxSessionIsSuccessNotError` (D12) exercises the same
branch through `Manager.End`. Neither test, nor any other in the suite, exercises the
"still there" branch (a `kill-session` that fails for a reason other than the session
being gone, against a session that in fact still exists) or the "PaneExists itself
errors" branch — both rest on inspection/the reasoning above, not a red test.
`TestRemove_EndsAnAliveSessionFirstAndLeavesTheRowOnAFailingKill` (D13's guardrail) still
passes but does **not** exercise this new logic: it uses a fake `session.Killer`
(`fakeKiller`), so `internal/tmux.Client.KillSession` is never called on that path at
all — noted per the orchestrator's ask, not offered as proof of the new branches.
`TestReconcile_*` (all subtests) still pass, none of them call `KillSession` on a
still-alive shell/session name in a way that would exercise the "still there" branch
either (the shell-kill paths in those tests target names that genuinely don't exist).

**Verification**:

```
$ go build ./...
(no output — exit 0)

$ gofmt -l .
(no output — clean)

$ go vet ./...
(no output — clean)

$ make lint
golangci-lint run
0 issues.

$ go test ./internal/tmux/... -run TestKillSession_RemovesTheWholeSessionIdempotentForAnUnknownName -v
--- PASS: TestKillSession_RemovesTheWholeSessionIdempotentForAnUnknownName (0.16s)

$ go test ./internal/session/... -run 'TestEnd_AlreadyGoneTmuxSessionIsSuccessNotError|TestRemove_EndsAnAliveSessionFirstAndLeavesTheRowOnAFailingKill|TestReconcile_' -v
--- PASS: TestReconcile_DeletesEndedRowsMarksDeadPanesEndedLeavesLivePanesByteIdentical
--- PASS: TestReconcile_ReportsUnknownMusterSessionsWithoutCreatingRows
--- PASS: TestRemove_EndsAnAliveSessionFirstAndLeavesTheRowOnAFailingKill
    --- PASS: TestRemove_EndsAnAliveSessionFirstAndLeavesTheRowOnAFailingKill/successful_kill_removes_the_row_and_fires_OnRemoved
    --- PASS: TestRemove_EndsAnAliveSessionFirstAndLeavesTheRowOnAFailingKill/a_failing_kill_leaves_the_row_and_never_fires_OnRemoved
--- PASS: TestReconcile_LiveMusterSessionUnderAPlaceholderTargetIsRepairedAndKeptAlive
--- PASS: TestReconcile_AliveFalseRowWithALiveMusterSessionIsRevivedNotSwept
--- PASS: TestReconcile_AliveRowWithAStaleWindowTargetIsRepairedNotMarkedEnded
--- PASS: TestEnd_AlreadyGoneTmuxSessionIsSuccessNotError
--- PASS: TestReconcile_KillsEveryShellSessionUnconditionallyAndCountsThem
--- PASS: TestReconcile_NeverListsAnyShellSessionAsUnknown
--- PASS: TestReconcile_AFailedShellKillIsNotCountedButStillNeverReportedAsUnknown
PASS

$ go test ./internal/... -count=1
ok all 15 packages (including internal/server, internal/session, internal/tmux)
```

`make lint` reports 0 issues tree-wide now (the pre-existing `intrange`/`unused` findings
noted in the Phase 2 section above are gone — presumably cleaned up by another agent's
commit since; not touched by this fix).

## Fix Attempt 1 (Review cycle 1)

**Mode**: fix (review cycle 1)
**Failures addressed**: D20 (Critical 1), D21 (Critical 2), D22 (Major 1), D23 (Major 2) — the four review-authored red tests — plus Major 3, Major 4, and Minors 1/2 (no test; fixed on inspection per the lead's instruction). Minor 3 (web `forget` comment) is out of scope for this agent.

### Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/tmux/tmux.go` | modified | **Critical 1/D20.** `PaneExists` now distinguishes "tmux answered: target gone" from "tmux couldn't be reached" via a new `isConnectionFailure` helper, matched narrowly on stderr's `"error connecting to ... (Permission denied)"` — the exact shape D20 measures. On that match `PaneExists` returns an error instead of `(false, nil)`; `KillSession`'s existing verify-via-PaneExists step then inherits the fix with no code change (its doc comment updated to say so). |
| `internal/server/sessions.go` | modified | **Critical 2/D21.** `Resume`'s `not_resumable` now returns one message when the session is alive and a different one when it has no `claudeSessionId` — same code, split text, per REQ-17/`docs/protocol.md`. **Major 2/D23.** `handleEndSession`'s `default` (kill-failed) branch no longer calls `f.terminals.closeSession(id)` — the socket now closes only on End's actual success, matching Remove's already-correct ordering and REQ-13. **Major 4.** `writeSettings` now writes to a sibling temp file (`os.CreateTemp` in the same `.claude` dir) and `os.Rename`s it into place, instead of a direct `os.WriteFile` — atomic against a concurrent launch into the same directory. **Minor 1.** Resume's `RepairOwnedSession` failure now gets a `Warn` log line (session id, tmux name) before returning the generic `launch_failed`. **Minor 2.** Both hand-rolled `"muster-"+strconv.FormatInt(id,10)` literals now call the new `tmux.SessionName(id)`. |
| `internal/session/manager.go` | modified | **Major 1/D22.** `classifyTmuxNames`: a `muster-`-prefixed name matching neither the bare nor `-shell` shape now goes into `unknownNames` (reported + warn-logged), matching `main`'s pre-plan behaviour and Edge Case 22; a name with no `muster-` prefix at all is still ignored entirely. **Major 3.** New `endRemoveTmuxTimeout` (5s, mirrors `shellTmuxTimeout`); `endLocked`'s `CapturePane`/`KillSession`/`checkOneLiveness` calls and `removeLocked`'s not-alive `KillSession` call are each now wrapped in their own bounded `context.WithTimeout` — these run under the per-id lock (REQ-11), so an unbounded wedge there had become a permanent per-session wedge, not just a hung request. |
| `internal/termbridge/termbridge.go` | modified | **Major 3.** New `resizeTmuxTimeout` (5s); `Bridge.Resize`'s `ResizeWindow` call now runs under a bounded child context. `Attach`'s own tmux invocation is deliberately left tied to the caller's ctx (documented why): `attach-session` is meant to run for the connection's whole lifetime, not return quickly. |

### Decisions

- **D20/Critical 1 — Option A, mechanism relocated per the lead's routing.** Implemented at
  the source (`PaneExists`), not as a second special case in `KillSession` — the lead's
  instruction, and the only place that also fixes every other `PaneExists` caller
  (`shells.go`'s three call sites, `checkOneLiveness`) for free.
- **Narrowed the stderr match to `"Permission denied"` specifically, not the broader
  `"error connecting to"` prefix the review's Option A text suggested.** First attempt
  matched the full prefix and broke 6 previously-green tests (`TestHandleRemoveSession_*`,
  `TestShellRegistry_*`) — measured:
  ```
  checking pane "muster-1-shell": exit status 1: error connecting to
  /var/folders/.../muster-tmuxtest-2968039224/tmux.sock (No such file or directory)
  ```
  for the tmuxtest-socket cases (a fresh scratch socket with no server ever bound — the
  ordinary "no server yet" shape `ListSessions`' own doc comment already names as
  non-error, which nearly every check-before-first-spawn in this codebase depends on) and,
  after excluding that one reason, one further break:
  ```
  removing session 1: tmux kill-session "muster-1": exit status 1: error connecting to
  /private/tmp/tmux-501/ (Socket operation on non-socket)
  ```
  from `TestHandleRemoveSession_DeadSessionSucceeds` — `newTestServer` never sets
  `Config.TmuxSocket`, so `tmux.New("")` resolves to `-L ""`, which tmux treats as its own
  default socket *directory* rather than a file, an artifact never reachable in production
  (`cmd/musterd` always configures a real socket) but which I cannot fix by editing the
  test. Rather than widen the match further on a guess about what other "error connecting"
  reasons mean, I narrowed to the one reason review actually measured and D20 actually
  needs (`Permission denied`). Documented in `isConnectionFailure`'s doc comment as
  deliberately narrow, with widening (e.g. a crashed server's stale socket refusing
  connections) named as real future work needing its own measured repro — not something to
  guess into this fix. Re-ran the full suite after narrowing: `go test ./internal/... -count=1`
  all green (see below), and D20 itself still passes 3/3 repeat runs.
- **Major 3's `endRemoveTmuxTimeout`/`resizeTmuxTimeout` value (5s) chosen to mirror
  `shellTmuxTimeout`** (`internal/server/shells.go`) rather than invent a new number — same
  bounded-tmux-invocation shape, same package family.
- No `deviation:` from the plan — REQ-6, REQ-9, REQ-12, REQ-13, REQ-17's split, and the
  Affected Files' atomic-`writeSettings` line are all now implemented as originally
  specified. The narrowing described above is inside REQ-6's own scope (an implementation
  choice about *which* stderr fragment is stable enough to trust), not a departure from it.

### Handoff

**Build status**: `go build ./...` exits 0.

No test files were edited (none needed changing beyond what D20-D23 already established).

**Sanctioned pre-existing findings, not touched by this fix (per the lead's routing/the
review's own Notes):**
- `make lint` (full tree, tests included) reports 2 `testifylint` `require-error`
  findings in `internal/tmux/tmux_test.go:596,599` (D20's own two `assert.Error` calls) —
  test file, not mine to edit; `golangci-lint run --tests=false ./...` (production code
  only) is clean of these two, confirming they're test-only.
- `--tests=false` also reports 2 pre-existing `unused` findings
  (`internal/server/issue.go:541` `buildIssueSnapshot`, `internal/server/prefs.go:160`
  `loadPrefs`) — neither is in this diff (`git diff --stat` touches only
  `sessions.go`/`manager.go`/`termbridge.go`/`tmux.go`); the standard artifact of running
  lint without the test files that are these functions' only callers.
- `TestIngestRouting_StragglerFromBeforeAClearNeverMovesTranscriptOrPlan` still fails
  under `-race` only (review's own Note 9: pre-existing, `make test`/`go test` without
  `-race` doesn't hit it). Confirmed still true after this fix; unrelated to any file
  touched here.
- REQ-6/`kb:adr/actions-kill-is-idempotent`'s Decision paragraph: the lead said they will
  correct these once the fix lands — not touched here.

### Verification

```
$ go build ./...
(exit 0)

$ gofmt -l .
(no output — clean)

$ go vet ./...
(no output — clean)

$ make lint
golangci-lint run
internal/tmux/tmux_test.go:596:2: require-error: for error assertions use require (testifylint)
internal/tmux/tmux_test.go:599:2: require-error: for error assertions use require (testifylint)
2 issues (both in a test file this agent may not edit)

$ golangci-lint run --tests=false ./...
internal/server/issue.go:541:18: func (*Server).buildIssueSnapshot is unused (unused)
internal/server/prefs.go:160:18: func (*Server).loadPrefs is unused (unused)
2 issues (pre-existing, not in this diff — see Handoff)

$ go test ./internal/... -count=1
ok all 15 top-level packages (including internal/server, internal/session, internal/tmux,
internal/termbridge) — full listing:
ok  	github.com/Zalaras/muster/internal/claudecode
ok  	github.com/Zalaras/muster/internal/ghissue
ok  	github.com/Zalaras/muster/internal/gitutil
ok  	github.com/Zalaras/muster/internal/kb
ok  	github.com/Zalaras/muster/internal/locate
ok  	github.com/Zalaras/muster/internal/selfupdate
ok  	github.com/Zalaras/muster/internal/server
ok  	github.com/Zalaras/muster/internal/session
ok  	github.com/Zalaras/muster/internal/store
ok  	github.com/Zalaras/muster/internal/termbridge
ok  	github.com/Zalaras/muster/internal/tmux
ok  	github.com/Zalaras/muster/internal/tmux/tmuxtest
ok  	github.com/Zalaras/muster/internal/triage
ok  	github.com/Zalaras/muster/internal/usage
ok  	github.com/Zalaras/muster/internal/webui

$ go test ./internal/tmux/... ./internal/server/... ./internal/session/... \
  -run 'TestKillSession_UnreachableSocketReturnsAnErrorWhileTheSessionIsStillAlive|TestLauncher_Resume_NotResumableMessageNamesWhichCauseApplies|TestReconcile_ReportsAndLogsAMusterPrefixedNameMatchingNeitherShapeAsUnknown|TestHandleEndSession_FailingKillLeavesTheTerminalSocketOpen' \
  -v -count=3
--- PASS (x3 each): TestKillSession_UnreachableSocketReturnsAnErrorWhileTheSessionIsStillAlive
--- PASS (x3 each): TestLauncher_Resume_NotResumableMessageNamesWhichCauseApplies
--- PASS (x3 each): TestHandleEndSession_FailingKillLeavesTheTerminalSocketOpen
--- PASS (x3 each): TestReconcile_ReportsAndLogsAMusterPrefixedNameMatchingNeitherShapeAsUnknown
PASS

$ ps aux | grep "tmux -S" | grep -v grep
(empty — no leaked tmux server from D20)
```

All four review-authored tests pass, backed by their own assertions (not inspection). Major
3 and Major 4 rest on inspection plus the manual atomic-rename probe below — no test was
written for either, per the lead's explicit instruction not to manufacture a
timing-dependent one:

```
$ go run <scratch atomic-rename probe>
final content: {"new":true}
mode: -rw-------
dir entries: 1
```
(temp file created via `os.CreateTemp` in the same `.claude` dir, written, chmod 0600,
renamed over the existing file — final state has the new content, correct permissions, and
no leftover temp file in the directory.)

## Fix Attempt 2 (Review cycle 2)

**Failures addressed**: `TestIsConnectionFailure` (D24, Critical), `TestListSessions_UnreachableSocketReturnsAnErrorWhileASessionIsStillAlive` (D25, Major), `TestReconcile_ListSessionsFailureActsOnNothing` (D26, Major).

**Changes made**:

| File | What and Why |
|------|--------------|
| `internal/tmux/tmux.go` | `isConnectionFailure` now matches EPERM's wording ("Operation not permitted") alongside EACCES's ("Permission denied") — still requires "error connecting to" and still excludes the three measured negatives (D24). |
| `internal/tmux/tmux.go` | `ListSessions` now checks `isConnectionFailure` on an `*exec.ExitError` before treating it as "no server yet"; a connection failure returns an error instead of `(nil, nil)` (D25), mirroring `PaneExists`. |
| `internal/session/manager.go` | `Reconcile`'s `ListSessions`-error branch no longer falls through to `classifySessions` (whose `!r.alive` arm sweeps with no pane check). It now logs and returns an empty report, acting on nothing (D26). The `m.sessionKiller == nil` branch is untouched — that's a different, legitimate "never configured" case. |
| `internal/server/sessions.go` | New `launchTmuxTimeout` (5s, matches `shellTmuxTimeout`/`endRemoveTmuxTimeout`). `spawnAndRecordLaunch`'s `NewSession`/`KillWindow` and `Resume`'s `NewSession`/`KillWindow` now run under a bounded child context instead of the unbounded `context.WithoutCancel` ctx, so a wedged tmux releases the per-id lock in bounded time (cycle 2 Minor). |
| `internal/session/manager.go` | `RepairOwnedSession`'s `ResolveSessionTarget` call (Resume's other unbounded tmux call, reached via `l.manager.RepairOwnedSession`) now runs under `endRemoveTmuxTimeout` too; doc comment on the constant updated to name all three callers. |
| `internal/server/sessions.go` | `writeSettings` now `Sync()`s the temp file before `Close`/`Rename` (cycle 2 Note, done — cheap and safe: standard write-durably-then-atomically-rename pattern, no behavior change on the success path, only closes a crash window between write and rename). |

**Test coverage**:
- D24, D25, D26 each have a test that failed before the fix and passes after (pasted below) — not resting on inspection.
- The Launch/Resume timeout-bounding (cycle 2 Minor) has no test, per the lead's explicit instruction not to manufacture a timing-dependent one. Verified by inspection: every `l.tmux.NewSession`/`KillWindow` call in `spawnAndRecordLaunch` and `Resume`, plus `RepairOwnedSession`'s `ResolveSessionTarget`, now runs under a `context.WithTimeout(ctx, launchTmuxTimeout)`/`endRemoveTmuxTimeout` child context with `cancel()` called immediately after — `rg -n "l.tmux.NewSession|l.tmux.KillWindow" internal/server/sessions.go` and `rg -n "ResolveSessionTarget" internal/session/manager.go` confirm no remaining unbounded call site in these two paths.
- The `fsync` addition rests on inspection only (no test added, matches how the cycle-1 atomic-rename fix itself was verified — a manual probe, not a test).

**Verification**:

```
$ go build ./...
(clean, exit 0)

$ go test ./internal/tmux/... -run 'TestIsConnectionFailure|TestListSessions_UnreachableSocketReturnsAnErrorWhileASessionIsStillAlive' -v -count=1
--- PASS: TestIsConnectionFailure (0.00s)
    --- PASS: TestIsConnectionFailure/EACCES_wording_matches_(already_guarded_by_D20) (0.00s)
    --- PASS: TestIsConnectionFailure/EPERM_wording_must_also_match_(D24:_sandboxed_denial,_review_cycle_2_Critical) (0.00s)
    --- PASS: TestIsConnectionFailure/no_socket_file_at_all_must_not_match_—_the_ordinary_no-server-yet_reading (0.00s)
    --- PASS: TestIsConnectionFailure/a_non-socket_file_at_the_path_must_not_match_—_a_fixture_defect,_not_a_live_server (0.00s)
    --- PASS: TestIsConnectionFailure/a_real_socket_whose_server_already_exited_must_not_match (0.00s)
--- PASS: TestListSessions_UnreachableSocketReturnsAnErrorWhileASessionIsStillAlive (0.15s)
PASS

$ go test ./internal/session/... -run 'TestReconcile_ListSessionsFailureActsOnNothing' -v -count=1
--- PASS: TestReconcile_ListSessionsFailureActsOnNothing (0.02s)
PASS

$ gofmt -l .
(empty)

$ go vet ./...
(empty)

$ make lint
internal/tmux/tmux_test.go:700:2: require-error: for error assertions use require (testifylint)
	assert.Error(t, listErr, "D25/Major: an unreachable socket must not read as an empty session list")
1 issues: testifylint: 1
```

`make lint`'s one issue is inside `internal/tmux/tmux_test.go` — a test file I may not edit
(it uses `assert.Error` where testifylint wants `require.Error`; this is D25's own test,
added by the test agent this cycle). `golangci-lint run --tests=false ./...` (production
code only, test files excluded) is clean except two pre-existing `unused` findings
(`internal/server/issue.go:541 buildIssueSnapshot`, `internal/server/prefs.go:160
loadPrefs`) that are false positives of excluding tests — both are exercised only from
`_test.go` files (confirmed: `grep -n "loadPrefs" internal/server/prefs_test.go` finds 8+
call sites), so `--tests=false` alone flags them as dead. Neither is new; neither is touched
by this fix wave.

```
$ go test ./internal/... -count=1
ok  	github.com/Zalaras/muster/internal/claudecode	14.091s
ok  	github.com/Zalaras/muster/internal/ghissue	1.431s
ok  	github.com/Zalaras/muster/internal/gitutil	3.005s
ok  	github.com/Zalaras/muster/internal/kb	3.872s
ok  	github.com/Zalaras/muster/internal/locate	2.662s
ok  	github.com/Zalaras/muster/internal/selfupdate	4.066s
ok  	github.com/Zalaras/muster/internal/server	27.982s
ok  	github.com/Zalaras/muster/internal/session	7.785s
ok  	github.com/Zalaras/muster/internal/store	6.498s
ok  	github.com/Zalaras/muster/internal/termbridge	8.451s
ok  	github.com/Zalaras/muster/internal/tmux	16.915s
ok  	github.com/Zalaras/muster/internal/tmux/tmuxtest	6.493s
ok  	github.com/Zalaras/muster/internal/triage	7.630s
ok  	github.com/Zalaras/muster/internal/usage	7.327s
ok  	github.com/Zalaras/muster/internal/webui	7.384s
```

All green, including cycle 1's D20-D23 (unmodified). No leaked tmux sockets or server
processes after the run (`ps aux | grep "tmux -S"` empty).

**Handoff**: `go build ./...` exits 0. One test-file lint issue (`internal/tmux/tmux_test.go:700`,
testifylint `require-error`) needs the test agent's fix — I did not touch it, as required.
