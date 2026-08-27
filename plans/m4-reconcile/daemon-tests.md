# Daemon Tests: M4 — Reconcile, shutdown policy, end / remove / resume

**Plan**: m4-reconcile
**Verdict**: pass

## Summary

Tests created: 36 new top-level Go test functions (many table/subtest-driven — ~90
assertions worth of subtests total) across 8 files, plus 2 sanctioned-breakage fixes and 2
new table cases in an existing test. Passing: all (`go build ./...` and `make test` both
green; `make lint` reports `0 issues`). Failing: 0.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/claudecode/interpret_test.go` | `TestInterpret_SessionStart/resume_source_is_a_distinct_resume-bind_kind…` | sanctioned-breakage fix: `source:"resume"` now interprets as `KindResumeBind`, not `KindBind` | pass |
| `internal/store/migrate_test.go`, `internal/store/store_test.go` | (existing tests, counts bumped) | sanctioned-breakage fix: migration count 3→4 for `0004_reconcile.sql` | pass |
| `internal/claudecode/launch_test.go` | `TestBuildArgv/ResumeSessionID_emits_--resume_and_omits_--name…` | D13: `BuildArgv` with `ResumeSessionID` emits `--resume <id>`, omits `--name` even with a Title set | pass |
| `internal/claudecode/launch_test.go` | `TestBuildArgv/ResumeSessionID_combines_with_a_non-default_permission_mode` | D13: resume + `--permission-mode` compose correctly | pass |
| `internal/claudecode/settings_test.go` | `TestMergeSettings_ForeignCommandHookOnSessionStartSurvives` | D8/REQ-16: foreign `type:"command"` SessionStart hook survives alongside Muster's quoted entry; re-merge doesn't duplicate it | pass |
| `internal/session/machine_test.go` | `TestApplyInput_ResumeBind_SameClaudeIDFromEveryStateLandsIdleWithAttentionAndFailureCleared/{started,planning,working,needs_input,failed,idle}` | D11/INV-6: same-id resume bind → idle, attention/failure cleared, from **every** reachable source state (not just the convenient one) | pass |
| `internal/session/machine_test.go` | `TestApplyInput_ResumeBind_DifferentClaudeIDEscalatesToClearRebind` | D12: a resume bind for an unrecognized claude id escalates to clear-rebind, lands `started` | pass |
| `internal/session/manager_test.go` | `TestReconcile_DeletesEndedRowsMarksDeadPanesEndedLeavesLivePanesByteIdentical` | D9: `Reconcile` deletes `alive=0` rows, marks `alive=1`+no-pane ended with `endedAt`, leaves `alive=1`+pane-present byte-identical (asserted via full-row equality) | pass |
| `internal/session/manager_test.go` | `TestReconcile_ReportsUnknownMusterSessionsWithoutCreatingRows` | D10: unknown `muster-*` tmux session reported, known/non-`muster-` sessions excluded, no row created | pass |
| `internal/session/manager_test.go` | `TestRecordResume_UpdatesTargetClearsSnapshotLeavesStateUntouched` | REQ-7: resume updates target/pane, sets alive/clears endedAt, clears stale snapshot, leaves state alone | pass |
| `internal/session/manager_test.go` | `TestRecordResume_AliveTracksPaneExistenceOnTheNextPoll/{resumed_then_still_alive,resumed_then_immediately_dead}` | INV-1: alive tracks real pane existence after a resume, in both directions | pass |
| `internal/session/manager_test.go` | `TestCaptureSnapshot_NeverMutatesStateFields/{started,working,planning,needs_input,failed,idle}` | D14/INV-4: a pane capture changes only snapshot fields, from every displayed state | pass |
| `internal/session/manager_test.go` | `TestCaptureSnapshot_ErrorLeavesThePreviousSnapshotAndNeverTouchesAlive` | Edge Case 9: a capture error keeps the previous snapshot and never flips alive | pass |
| `internal/session/manager_test.go` | `TestEnd_OnATwoSessionManagerFlipsOnlyTheTargetsAlive` | D15/INV-2: `End` flips only the target's alive/state/tmux; a live bystander (2nd session on the same manager) is fully untouched | pass |
| `internal/session/manager_test.go` | `TestEnd_UnknownAndAlreadyEndedSessions` | `End` returns `ErrUnknownSession` / `ErrSessionNotAlive` on the two error paths | pass |
| `internal/session/manager_test.go` | `TestRemove_EndsAnAliveSessionFirstAndLeavesTheRowOnAFailingKill/{successful_kill…,a_failing_kill…}` | D16/INV-2: `Remove` runs `End` first for a live session (bystander present, unaffected); a failing kill leaves the row and never fires `OnRemoved` | pass |
| `internal/session/manager_test.go` | `TestRemove_UnknownSessionIsErrUnknownSession` | `Remove` on an unknown id | pass |
| `internal/server/sessions_test.go` | `TestHandleEndSession_AlreadyDeadSessionIs409NotAlive`, `TestHandleEndSession_UnknownSessionIs404` | D17 (End clauses): 409 `not_alive`, 404 `unknown_session` | pass |
| `internal/server/sessions_test.go` | `TestHandleResumeSession_LiveSessionIs409NotResumable`, `TestHandleResumeSession_DeadSessionWithoutClaudeIDIs409NotResumable`, `TestHandleResumeSession_UnknownSessionIs404` | D17 (Resume clauses): both `not_resumable` cases + 404 | pass |
| `internal/server/sessions_test.go` | `TestHandleRemoveSession_UnknownSessionIs404`, `TestHandleRemoveSession_DeadSessionSucceeds` | D17 (Remove clauses): 404 unknown; dead-session 204 happy path | pass |
| `internal/server/sessions_test.go` | `TestHandlePaneSnapshot_404BeforeCaptureThen200WithTextAfter`, `TestHandlePaneSnapshot_UnknownSessionIs404UnknownSession` | D18: `GET …/pane` 404 `no_snapshot` before capture → 200 `text`/`capturedAt` after; 404 `unknown_session` | pass |
| `internal/server/sessions_test.go` | `TestSessionActionHandlers_RequireCookie/{end,resume,remove,pane}` | auth wiring for all four new endpoints | pass |
| `internal/tmux/tmux_test.go` | `TestKillSession_RemovesTheWholeSessionErrorsForAnUnknownName` | `KillSession` removes the whole session, errors for an unknown name | pass |
| `internal/tmux/tmux_test.go` | `TestListSessions_ReturnsEveryNameNoServerIsAnEmptyResultNotAnError/{no_server_yet,every_session_name,killing_every_session}` | `ListSessions`: no-server-yet is empty-not-error, lists every name, empty again once all killed | pass |
| `internal/tmux/tmux_test.go` | `TestCapturePane_ReturnsPaneTextAndTrimsTrailingBlankLines`, `TestCapturePane_UnknownTargetErrors` | `CapturePane` returns real pane text with trailing blanks trimmed; errors for an unknown target | pass |
| `cmd/musterd/main_test.go` | `TestResolveOnExit_ExplicitLeaveAndKillNeverConsultStdin`, `TestResolveOnExit_AskWithNonTTYStdinIsLeave`, `TestResolveOnExit_InvalidFlagValueFallsThroughToTheAskPath` | `resolveOnExit`'s pure-function branches (feeds D19-D21's real behavior) | pass |
| `cmd/musterd/main_test.go` | `TestIsCharDevice/{nil,pipe,regular_file}` | `isCharDevice` correctly rejects a pipe/regular file (only a real TTY should ever pass) | pass |
| `cmd/musterd/main_test.go` | `TestAskKillPrompt/{y,Y,yes,YES,n,empty,garbage}`, `TestAskKillPrompt_EOFWithNoInputAnswersLeave` | REQ-3 answer parsing: only y/Y/yes(-insensitive) kills; everything else (incl. EOF) leaves | pass |
| `cmd/musterd/main_test.go` | `TestRun_InvalidOnExitValueIsRejected` | an unrecognized `-on-exit` value fails fast before touching data-dir/store | pass |
| `cmd/musterd/onexit_test.go` | `TestOnExit_Leave_LiveSessionSurvivesShutdown` | **D19**: `-on-exit=leave`, real subprocess + real scratch tmux socket + real live pane — exits 0, tmux session survives, "leaving" log line present | pass |
| `cmd/musterd/onexit_test.go` | `TestOnExit_Kill_LiveSessionIsKilledAndRowMarkedDead` | **D20**: `-on-exit=kill` — exits 0, tmux session gone, DB row reads `alive=false`/`endedAt` set | pass |
| `cmd/musterd/onexit_test.go` | `TestOnExit_AskWithNonTTYStdinBehavesAsLeave` | **D21**: `-on-exit=ask` with a non-TTY (pipe) stdin behaves as leave, no prompt, tmux session survives | pass |

## Implementation Bugs

None found. `daemon-implementation.md`'s Decisions section pre-emptively documented the
two divergences from the plan's literal Affected-Files wording (`Server.Shutdown`'s
signature unchanged; `run()` gaining a `stdin` parameter) with evidence, and both are
consistent with — and directly exploited by — the tests here (D19-D21 use the `stdin`
parameter exactly as documented; the unchanged `Shutdown` signature required no test-file
edits beyond the two sanctioned ones already called out).

## Notable design decisions in the test suite

- **D19-D21 use a real subprocess, not an in-process call to `run()`.** `run()`'s shutdown
  path is driven by `signal.Notify(SIGINT, SIGTERM)`; sending a real signal to the test's
  *own* process to exercise that path would risk terminating the whole `go test` run if
  the signal arrived before `Notify` had registered (default OS disposition for SIGINT is
  process termination). A subprocess makes that race harmless: `cmd/musterd/onexit_test.go`
  builds the real `musterd` binary once (`TestMain`/`runTestMain`), spawns it against a
  scratch tmux socket and data dir, drives a real launch over its HTTP API with a
  sleep-stub standing in for `claude` (CLAUDE.md forbids ever launching the real `claude`
  from a unit test), waits for the resulting tmux session, sends a real `SIGTERM`, and
  asserts on the real exit code plus tmux/DB state afterward. Every spawned process is
  killed in `t.Cleanup` even on a failing early exit, and every tmux server is
  `kill-server`'d — verified no orphan `musterd-under-test` or scratch tmux servers survive
  a full `go test ./cmd/musterd/...` run.
- **Reconcile's "byte-identical" clause (D9)** is asserted via whole-row equality
  (`assert.Equal` on the full `store.SessionRow`) captured before and after `Reconcile`,
  not a handful of spot-checked fields — the plan's own wording ("byte-identical") is
  exactly what a full-struct comparison proves and a partial one doesn't.
- **INV-4 (D14) and INV-6 (D11)** are asserted from all six displayed states via
  table-driven subtests, per the m1-sessions review lesson cited in this agent's own
  instructions (an invariant proven only from the "convenient" state proves nothing about
  the invariant).
- **INV-2 (bystander safety)** is exercised with ≥2 sessions coexisting on the same
  in-memory `Manager` for every destructive path this plan adds (`End`, `Remove`),
  asserting the survivor's `alive`/`state`/`tmuxTarget` and (for `Remove`) the kill-call log
  afterward — not just that the target itself transitioned correctly.
- New fakes (`fakeKiller`, `fakePaneSnapshotter`) follow the existing `fakePaneChecker`
  pattern in `manager_test.go` exactly (mutex-guarded, per-target configurable
  answers/errors, a call/kill log) rather than reaching for real tmux — real tmux is
  reserved for `internal/tmux`'s own package tests (new `KillSession`/`ListSessions`/
  `CapturePane` coverage added there) and the `cmd/musterd` D19-D21 subprocess tests, where
  the tmux behavior itself is exactly what's under test.
- `internal/claudecode/settings_test.go`'s new D8 test deliberately exercises the
  SessionStart-specific case of the foreign-hook-preservation contract
  (`TestMergeSettings_ForeignHookOnAMusterOwnedEventSurvives` already covers a `type:"http"`
  entry on a different event) since SessionStart is the one event Muster registers as
  `type:"command"`, and D8's criterion names that test by its exact required name.

## Test Run Output

```
$ go build ./...
(clean, exit 0)

$ make test
go test ./...
ok  	github.com/Zalaras/muster/cmd/musterd	3.1s
ok  	github.com/Zalaras/muster/internal/claudecode	(cached)
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
ok  	github.com/Zalaras/muster/internal/gitutil	(cached)
ok  	github.com/Zalaras/muster/internal/server	(cached)
ok  	github.com/Zalaras/muster/internal/session	1.3s
ok  	github.com/Zalaras/muster/internal/store	(cached)
ok  	github.com/Zalaras/muster/internal/termbridge	(cached)
ok  	github.com/Zalaras/muster/internal/tmux	(cached)
ok  	github.com/Zalaras/muster/internal/usage	(cached)
?   	github.com/Zalaras/muster/test/rig/capture	[no test files]
?   	github.com/Zalaras/muster/test/rig/failproxy	[no test files]

$ make lint
golangci-lint run
0 issues.

$ rg -q "func TestMergeSettings_ForeignCommandHookOnSessionStartSurvives" internal/claudecode/settings_test.go   # D8
$ ls internal/store/migrations/0004_reconcile.sql   # D22
internal/store/migrations/0004_reconcile.sql
```

No orphan processes/tmux servers left behind by `cmd/musterd`'s subprocess-based tests
(checked via `ps aux | grep musterd-under-test` and the scratch tmux sockets' own
`kill-server` cleanup after a full run).

## Fix Attempt 1

**Mode**: fix (attempt 1) — review cycle 1, wave 2

**Scope**: Major 2 (blocking — the D11 test enshrined the Major-1 `alive:=true`
behaviour daemon-impl removed) plus `[daemon-tests]` Minors 5 and 6. Also added coverage
for four behaviours daemon-impl's Fix Attempt 1 introduced while fixing its own Minors
1–4 (`checkOneLiveness`'s `endOnCheckError` parameter, `Snapshot`'s
`LastSnapshotAt.IsZero()` sentinel, `EndAllSessions`'s bounded context, and
`tmux.CapturePane`'s `runCapture`), per the orchestrator's explicit instruction. No
implementation code was touched.

### Major 2 — D11 test enshrined the Major-1 behaviour

`internal/session/machine_test.go` —
`TestApplyInput_ResumeBind_SameClaudeIDFromEveryStateLandsIdleWithAttentionAndFailureCleared`
asserted `assert.True(t, sess.Alive, …)` for all six source states, which fixing Major 1
(deleting `applyBind`'s `sess.Alive = true` line) necessarily breaks — confirmed still
failing before my edit:

```
--- FAIL: TestApplyInput_ResumeBind_SameClaudeIDFromEveryStateLandsIdleWithAttentionAndFailureCleared/started
    machine_test.go:310: REQ-8: applyBind's resume-bind branch marks the session alive
        Error: Not equal: expected true, got false
```

Rather than just deleting the assertion (which would leave `Alive` completely
unobserved by this test), replaced it with the actual invariant the review demands: `sess
sess.Alive` was seeded `false` at the top of the loop (already documented there as "dead
before the resume — RecordResume sets Alive separately in the manager") and must come out
the other side of the hook-driven branch *still* `false` — INV-1 requires tmux pane
existence be the sole authority for liveness, and this branch runs off a hook payload.
Asserting `assert.False` (not just deleting the line) covers the invariant from every one
of the six source states, matching the cross-state-coverage lesson the test's own doc
comment already cites (m1-sessions review). All six subtests now pass.

### `[daemon-tests]` Minor 5 — D18's `capturedAt` only checked `NotEmpty`

`internal/server/sessions_test.go` —
`TestHandlePaneSnapshot_404BeforeCaptureThen200WithTextAfter` now asserts
`body.CapturedAt` equals `capturedAt.Format(time.RFC3339)` (the seeded value), not merely
`assert.NotEmpty`. Confirmed this is deterministic, not a flaky sub-second race: the store
truncates to RFC3339-seconds precision on write (`session.go`'s `UpdateSnapshot` does
`at.UTC().Format(time.RFC3339)` before the `UPDATE`) and the handler formats the read-back
value with the same layout (`sessions.go:399`), so a wrong-but-non-empty timestamp now
fails this test.

### `[daemon-tests]` Minor 6 — D14's whole-struct compare shared pointers between clones

`internal/session/manager_test.go` — `TestCaptureSnapshot_NeverMutatesStateFields`
compared `*before` and `*after` (both `Clone()`s of the same live session at two points
in time). `Clone()` is documented as a shallow copy, so `before.Attention` /
`.Failure` / `.Model` / `.Context` are the *same pointers* `after` also holds — a
future `captureSnapshot` mutating one of those pointees in place (rather than replacing
the pointer, as the code does today) would be invisible to that compare, since both sides
would end up dereferencing the same, already-mutated, memory by the time `assert.Equal`
runs.

Added a `derefSessionPointers` helper that copies each pointer field's *value* into a
plain (non-pointer) struct immediately after each `Get()` call — `beforeDeref` captured
right after the pre-capture `Get`, before `captureSnapshot` runs at all, so an in-place
mutation would now show up as a genuine diff between `beforeDeref` and `afterDeref`. This
runs alongside (not instead of) the existing pointer-sharing compare, across all six
source states.

Verified the helper actually has teeth with a synthetic probe: temporarily added
`if sess.Attention != nil { sess.Attention.Reason = "SYNTHETIC-MUTATION-PROBE" }` inside
`storeSnapshot` (right where the real code sets `LastSnapshot`/`LastSnapshotAt`, still
under the lock) and reran `TestCaptureSnapshot_NeverMutatesStateFields -v`. Result: only
the `needs_input` subtest failed (the one state where `Attention` is non-nil), and it
failed at exactly the new `derefSessionPointers` assertion —

```
manager_test.go:1076: Not equal: expected attention.Reason: "permission", actual: "SYNTHETIC-MUTATION-PROBE"
Messages: a pane capture must never mutate any state-machine field's pointee in place (INV-4)
--- FAIL: TestCaptureSnapshot_NeverMutatesStateFields/needs_input (0.01s)
```

— while the pre-existing pointer-sharing `assert.Equal(t, beforeCopy, afterCopy, …)`
immediately below it did **not** fail (no second `Error Trace` in the output), confirming
Minor 6's diagnosis exactly: the old compare cannot see an in-place pointee mutation, the
new one can. The probe line was then removed; `go build ./...` and
`go test ./internal/session/... -run TestCaptureSnapshot_NeverMutatesStateFields` were
rerun clean, and `git diff internal/session/manager.go` was checked to show no leftover
edit (the diff shown reflects only the plan's already-merged daemon-impl changes, not this
probe).

### Added coverage for daemon-impl Fix Attempt 1's other changes

Per the orchestrator's explicit instruction (not a tagged review issue, but new
production behaviour introduced while fixing Major 1/Minors 1–4):

- **`checkOneLiveness`'s `endOnCheckError` parameter** — two new tests:
  `TestEnd_MarksEndedWhenPostKillPaneCheckErrors` (`End`'s `endOnCheckError:=true` path:
  a `PaneExists` error right after `End`'s own kill must still mark the session ended,
  not leave it `alive:true`; a bystander session with a clean check is present and
  unaffected, in memory and in the store) and
  `TestCheckLiveness_LeavesAliveUntouchedWhenPaneCheckErrors` (the periodic poll's
  `endOnCheckError:=false` path: the same kind of error must leave the session alive for
  the next tick, no broadcast). Together these pin the documented split between the two
  callers, not just one side of it. Required adding a `setErr` method to the existing
  `fakePaneChecker` test double (it had an `err` map field but no setter).
- **`Snapshot`'s `LastSnapshotAt.IsZero()` sentinel** — three new tests directly against
  `Manager.Snapshot` (previously only exercised indirectly through the HTTP handler):
  `TestSnapshot_NeverCapturedReturnsNotOK`, `TestSnapshot_UnknownSessionReturnsNotOK`, and
  `TestSnapshot_GenuinelyBlankCaptureServesTextNotNoSnapshot` — the last one builds the
  actual scenario the fix targets (a pane captured successfully that happens to be blank)
  by capturing non-blank text first, then a blank capture that changes it (`storeSnapshot`
  only persists on a text change, so a lone blank first capture wouldn't set
  `LastSnapshotAt` at all — confirmed by reading the code, not asserted, since that
  narrower edge is explicitly out of scope per daemon-impl's Fix Attempt 1 notes), then
  asserts `ok:true` with empty text and a non-zero `capturedAt`.
- **`EndAllSessions`'s bounded context** — no new test added. This is a
  `context.WithTimeout(context.Background(), shutdownTimeout)` wrapping an
  already-end-to-end-tested call (`cmd/musterd/onexit_test.go`'s D20 exercises the real
  `-on-exit=kill` shutdown path with a real subprocess and would itself hang/fail if the
  call never returned); testing that `context.WithTimeout` actually bounds a call is a
  stdlib guarantee (CLAUDE.md/agent-brief "don't test what the stdlib guarantees"), and
  cmd/musterd has no scaffolding for injecting a wedged tmux to observe the timeout
  firing without adding real risk of flaky/slow tests for a one-line plumbing change.
- **`tmux.CapturePane`'s `runCapture`** — one new test,
  `TestCapturePane_FailureNeverLeaksPaneTextIntoTheError`: captures a marker
  successfully from a real tmux pane, kills the window, then re-captures the same
  now-gone target and asserts both that the returned text is empty and that the error
  string does not contain the earlier marker. The reviewer's own Minor 4 write-up notes
  they probed for a real repro of tmux emitting pane text on a non-zero exit and could
  not produce one ("failures write only to stderr") — this test can't force that failure
  mode either, so it exercises the mechanism (`runCapture`'s separate stdout/stderr
  buffers, discarding stdout entirely on error) rather than proving a specific historical
  leak is now closed; it is a regression guard, not a reproduction.

**Verdict**: pass. `go build ./...` exits 0; `make test` green across every package
(`internal/session`, `internal/server`, `internal/tmux` all re-verified individually with
`-run` + `-v` on the new/changed tests, plus a full `make test` run); `make lint` reports
`0 issues.`. No implementation file was modified.

### Fix Attempt 1 Test Run Output

```
$ go build ./...
(clean, exit 0)

$ make test
go test ./...
ok  	github.com/Zalaras/muster/cmd/musterd	(cached)
ok  	github.com/Zalaras/muster/internal/claudecode	(cached)
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
ok  	github.com/Zalaras/muster/internal/gitutil	(cached)
ok  	github.com/Zalaras/muster/internal/server	10.607s
ok  	github.com/Zalaras/muster/internal/session	1.183s
ok  	github.com/Zalaras/muster/internal/store	(cached)
ok  	github.com/Zalaras/muster/internal/termbridge	(cached)
ok  	github.com/Zalaras/muster/internal/tmux	4.095s
ok  	github.com/Zalaras/muster/internal/usage	(cached)
?   	github.com/Zalaras/muster/test/rig/capture	[no test files]
?   	github.com/Zalaras/muster/test/rig/failproxy	[no test files]

$ make lint
golangci-lint run
0 issues.
```

## Fix Attempt 2

**Mode**: fix (attempt 2) — review cycle 2, wave 2

**Scope**: `[daemon-tests]` Minors 6 and 8, plus adding the regression test named in
daemon-impl's Fix Attempt 2 Handoff (`plans/m4-reconcile/daemon-implementation.md`,
`## Fix Attempt 2`) for the blank-first-capture guard fixed in `storeSnapshot`. No
implementation code was touched.

### Minor 6 — D10 asserts the report but not the log line

`internal/session/manager_test.go` —
`TestReconcile_ReportsUnknownMusterSessionsWithoutCreatingRows` built its `Manager` with
`zerolog.Nop()`, so the criterion's log half ("logs (and reports)") was unobserved by the
suite even though the code does log it (`manager.go:335`) and the reviewer confirmed the
line live. Switched to `zerolog.New(&logBuf)` — the same pattern already used in
`internal/server`'s tests (`helpers_test.go`, `ingest_test.go`) — and added two
`assert.Contains` checks against the captured buffer: the literal warn message
(`"unknown muster tmux session on socket; not adopted"`) and the structured field
(`"tmux_session":"muster-999999"`) naming the specific unknown session, not just any
warn line. Confirmed this has teeth by temporarily deleting the
`m.log.Warn()...` call in `manager.go` and rerunning — the new assertions fail exactly
where expected:

```
--- FAIL: TestReconcile_ReportsUnknownMusterSessionsWithoutCreatingRows (0.01s)
    manager_test.go:929:
        Error:      "{\"level\":\"info\",\"kept_alive\":1,\"marked_ended\":0,\"swept\":0,\"message\":\"reconciled sessions\"}\n" does not contain "unknown muster tmux session on socket; not adopted"
        Test:       TestReconcile_ReportsUnknownMusterSessionsWithoutCreatingRows
        Messages:   D10 requires an unknown muster-prefixed tmux session to be logged, not just reported
    manager_test.go:931:
        Error:      "{\"level\":\"info\",\"kept_alive\":1,\"marked_ended\":0,\"swept\":0,\"message\":\"reconciled sessions\"}\n" does not contain "\"tmux_session\":\"muster-999999\""
        Test:       TestReconcile_ReportsUnknownMusterSessionsWithoutCreatingRows
        Messages:   the warn line must name the specific unknown session
```

— while the pre-existing report assertion (`report.UnknownSessions`) still passed
against this same edit, which is precisely the gap the reviewer described: the report
was already correct, only the log half was unobserved. The temporary edit was reverted
byte-for-byte before the final run (`diff` against a pre-edit copy of `manager.go`
confirmed identical).

### Minor 8 — `tmux.CapturePane`'s regression guard cannot reproduce the failure it guards

`internal/tmux/tmux_test.go` — the reviewer explicitly endorsed shipping
`TestCapturePane_FailureNeverLeaksPaneTextIntoTheError` as a mechanism guard rather than
a reproduction, and agreed no better test is obtainable without a fake `exec.Cmd` seam
(the real tmux binary never actually writes pane text to stdout alongside a non-zero
exit — Fix Attempt 1 already probed this and found "failures write only to stderr").
There is no sound way to make this test *reproduce* the historical failure mode without
either modifying implementation code (out of scope for this agent) or introducing new
process-mocking scaffolding for a single test, which is disproportionate to a Minor whose
own resolution was "ship it, just don't misread it." Fix: expanded the test's doc comment
to say explicitly that a green result here is not evidence a leak ever fired in
production, so a future reader doesn't mistake mechanism coverage for a proven
regression repro. No test behavior changed; `go test` output for this test is identical
before and after (still exercises the real successful-capture-then-failing-capture
sequence and asserts the error/text never carry the earlier marker).

### Handoff test — very-first-capture-blank regression guard for `storeSnapshot`

`internal/session/manager_test.go` — added
`TestSnapshot_VeryFirstCaptureBlankStillSetsCapturedAt`, built exactly to the shape
daemon-impl's Fix Attempt 2 Handoff specified: create a session, `RecordLaunch` (no
snapshot yet), set the fake snapshotter's text to `""` for the target, call
`mgr.captureSnapshot` once, then assert `mgr.Snapshot(id)` returns `ok=true` with empty
text and a non-zero `capturedAt`. This is deliberately distinct from the existing
`TestSnapshot_GenuinelyBlankCaptureServesTextNotNoSnapshot` (cycle 1's read-side
scenario), which captures non-blank text first and therefore never exercises the
write-side diff-skip Fix Attempt 2 changed — this new test never captures anything but
blank text, so it is the only test in the suite that would have caught the original bug
(`storeSnapshot`'s `sess.LastSnapshot == text` guard comparing `"" == ""` on the very
first call and silently skipping the persist).

Verified the test actually depends on the fix by reverting
`storeSnapshot`'s guard to the pre-Fix-Attempt-2 form
(`sess.LastSnapshot == text`, dropping the `&& !sess.LastSnapshotAt.IsZero()` clause) and
rerunning just this test:

```
=== RUN   TestSnapshot_VeryFirstCaptureBlankStillSetsCapturedAt
    manager_test.go:1274:
        Error:      Should be true
        Test:       TestSnapshot_VeryFirstCaptureBlankStillSetsCapturedAt
        Messages:   a genuinely-blank first capture must still be reported as captured, not 404 no_snapshot
    manager_test.go:1276:
        Error:      Should be false
        Test:       TestSnapshot_VeryFirstCaptureBlankStillSetsCapturedAt
        Messages:   capturedAt must be set on the very first capture even though the text is empty
--- FAIL: TestSnapshot_VeryFirstCaptureBlankStillSetsCapturedAt (0.01s)
```

— confirming the new test fails against the pre-fix guard and would have caught this
regression had it existed before Fix Attempt 2. The revert was undone immediately
afterward; `git diff internal/session/manager.go` was checked clean before the final
run below.

**Verification**:
- `go build ./...` — exits 0.
- `gofmt -l internal/session/manager_test.go internal/tmux/tmux_test.go` — no output
  (clean).
- `go test ./internal/session/... ./internal/tmux/...` — pass, including the new/changed
  tests individually with `-v`.
- `make test` — every package passes.
- `make lint` — `0 issues.`
- No implementation file was modified (`git status` shows only the two `_test.go` files
  touched by this agent).

**Verdict**: pass.

### Fix Attempt 2 Test Run Output

```
$ go build ./...
(clean, exit 0)

$ go test ./internal/session/... -run 'TestReconcile_ReportsUnknownMusterSessionsWithoutCreatingRows|TestSnapshot_VeryFirstCaptureBlankStillSetsCapturedAt|TestSnapshot_GenuinelyBlankCaptureServesTextNotNoSnapshot' -v
=== RUN   TestReconcile_ReportsUnknownMusterSessionsWithoutCreatingRows
--- PASS: TestReconcile_ReportsUnknownMusterSessionsWithoutCreatingRows (0.01s)
=== RUN   TestSnapshot_GenuinelyBlankCaptureServesTextNotNoSnapshot
--- PASS: TestSnapshot_GenuinelyBlankCaptureServesTextNotNoSnapshot (0.01s)
=== RUN   TestSnapshot_VeryFirstCaptureBlankStillSetsCapturedAt
--- PASS: TestSnapshot_VeryFirstCaptureBlankStillSetsCapturedAt (0.01s)
PASS
ok  	github.com/Zalaras/muster/internal/session	0.946s

$ go test ./internal/tmux/... -run TestCapturePane_FailureNeverLeaksPaneTextIntoTheError -v
=== RUN   TestCapturePane_FailureNeverLeaksPaneTextIntoTheError
--- PASS: TestCapturePane_FailureNeverLeaksPaneTextIntoTheError (0.16s)
PASS
ok  	github.com/Zalaras/muster/internal/tmux	0.764s

$ make test
go test ./...
ok  	github.com/Zalaras/muster/cmd/musterd	(cached)
ok  	github.com/Zalaras/muster/internal/claudecode	(cached)
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
ok  	github.com/Zalaras/muster/internal/gitutil	(cached)
ok  	github.com/Zalaras/muster/internal/server	(cached)
ok  	github.com/Zalaras/muster/internal/session	0.829s
ok  	github.com/Zalaras/muster/internal/store	(cached)
ok  	github.com/Zalaras/muster/internal/termbridge	(cached)
ok  	github.com/Zalaras/muster/internal/tmux	3.877s
ok  	github.com/Zalaras/muster/internal/usage	(cached)
?   	github.com/Zalaras/muster/test/rig/capture	[no test files]
?   	github.com/Zalaras/muster/test/rig/failproxy	[no test files]

$ make lint
golangci-lint run
0 issues.
```
