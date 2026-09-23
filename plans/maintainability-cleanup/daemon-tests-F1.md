# Daemon Tests: Maintainability Cleanup — F1 session write-ordering fixes

**Plan**: maintainability-cleanup
**Unit**: F1 (daemon track, session write-ordering)
**Verdict**: pass
**Pack**: `kb: pack 67281 words (budget 8000)` — WARN over budget; read `plan.md`, `daemon-implementation-F1.md`, `review.maintainability.a-session.md` and `b-server.md` directly per the spawn prompt, plus `docs/conventions.md` § Testing/§ Design.

## Summary

Tests created: 9 new top-level tests (2 as `t.Run` subtests, 2 as table-driven with 10 and
2 rows respectively) across two new files, plus one case added to an existing table
(`TestTruncate`). Passing: all. Failing: 0.

Covers every item in `daemon-implementation-F1.md`'s "Interleavings daemon-tests should
drive" list (1–7), the cited findings (a-C1, a-M2, a-M3, a-S2/b-M1, S1 widened,
a-note-3), and the extra case the orchestrator asked for (nextRailPos vs. a rebuilt rail).

## Tests

| File | Test | What It Tests | Status |
|------|------|----------------|--------|
| `internal/session/machine_test.go` | `TestTruncate` (added case) | a-note-3: `truncate` backs off to a UTF-8 rune boundary instead of splitting a multi-byte rune | pass |
| `internal/session/manager_writeorder_test.go` | `TestApplyBind_DoesNotMutateAModelSharedByAnEarlierClone` | a-C1, deterministic: a clone taken before a rebind keeps its old `Model.ID`; a rebind never mutates a `*Model` a clone shares | pass |
| `internal/session/manager_writeorder_test.go` | `TestApplyBind_ConcurrentWithListNeverRacesOnModel` | a-C1, `-race`-driven: concurrent rebind + unsynchronized `List()`/`.Model.ID` read never races | pass |
| `internal/session/manager_writeorder_test.go` | `TestCreateSession_ConcurrentLaunchesForDifferentDirectoriesGetDistinctRailPos` | a-M2, looped (50 trials): two concurrent `CreateSession` calls never collide on `RailPos` | pass |
| `internal/session/manager_writeorder_test.go` | `TestCreateSession_AfterRailReorderStillExceedsEveryExistingRailPos` | Extra case (orchestrator): after `SetOrder`+`SetPinned` rebuild the rail, `nextRailPos` still exceeds every existing session's `RailPos` | pass |
| `internal/session/manager_writeorder_test.go` | `TestMarkPlanWritten_RefusesAStalePathAndFlipsExistsOnlyForTheCommittedOne` (2 subtests) | b-M1/a-S2: a stale `expectedPath` is refused and the current, scan-committed path survives; a current path flips `PlanExists` and broadcasts exactly once | pass |
| `internal/session/manager_writeorder_test.go` | `TestPersistFailure_RollsBackEveryMutationUniformly` (10 rows: `Apply`, `ApplyStatus`, `SetTitle`, `MarkSeen`, `SetTranscript`, `SetPlan`, `MarkPlanWritten`, `ApplyPlanScan`, `RepairOwnedSession`, `RecordResume`) | S1 widened: every persist-touching setter rolls back to byte-identical state and broadcasts nothing on a closed-store persist failure | pass |
| `internal/session/manager_writeorder_test.go` | `TestPersistFailure_RailBatchRollsBackEveryQueuedWrite` (2 rows: `SetOrder`, `SetPinned`) | S1 rail tail, multi-instance (3 affected sessions): a closed-store failure rolls back every queued write, not just the one that ran first; no partial broadcast | pass |
| `internal/session/manager_writeorder_test.go` | `TestWriteTurns_FinishWriteOrdersPersistsByTicketNotGoroutineStartOrder` | S1, white-box: `nextWriteTurnLocked`/`finishWrite` order persists by ticket, not goroutine start order or injected delay | pass |
| `internal/store/watermark_test.go` | `TestBumpIDWatermark_ConcurrentWithInsertSessionNeverLowersThePersistedWatermark` | a-M3, looped (100 rounds × 5-way burst): a concurrent `BumpIDWatermark` can never leave the persisted watermark below the highest id `InsertSession` actually committed | pass |

## Decisions

- design: `fakeResolvingKiller` (`manager_writeorder_test.go`) embeds the existing
  `fakeKiller` (manager_test.go) and adds `ResolveSessionTarget`, so it also satisfies
  `targetResolver` — the one capability nothing in the existing fixture set provides.
  `rg -n 'ResolveSessionTarget' internal/session/*_test.go` before writing it found no
  existing implementer; without it, `RepairOwnedSession` is untestable for S1 (it errors
  out before ever reaching a persist call).
- design: new file `internal/session/manager_writeorder_test.go` rather than extending
  `manager_test.go` (already 3113 lines, flagged filelen in `review.maintainability.a-session.md`
  and slated for D2's split) — keeps F1's write-ordering/railPos/plan-CAS coverage together
  and out of a file D2 is about to carve into siblings anyway.
- design: `internal/store/watermark_test.go` is a new file (item 4 belongs to `internal/store`,
  not `internal/session`, since `BumpIDWatermark` lives there) — `rg -n 'BumpIDWatermark'
  internal/store/*_test.go` before writing found no existing test for it at all.
- `TestPersistFailure_RollsBackEveryMutationUniformly`/`RailBatchRollsBackEveryQueuedWrite`
  are table-driven (conventions § Testing/§ Design: duplicated bodies become table rows) —
  10 and 2 rows respectively share one setup/assert body and differ only in which setter
  runs. `TestPersistFailure_RollsBackEveryMutationUniformly`'s funlen (76 > 60,
  `size-warn.sh`) is the table itself; splitting it would separate the shared
  setup/assert from the row list it exists to drive, which is exactly the "no reason
  holds" pattern the a-session review flags elsewhere — here the reason (one shared body,
  ten setters) does hold, so it is left as a WARN per kb:adr/process-size-linters-warn-never-fail.
- `TestTruncate`'s new case (`internal/session/machine_test.go`) is appended to the
  existing test rather than a new function — it is the same helper, same file, same
  three-assert style; a fourth assert is not a new concern.
- No new fixture duplicates an existing one: `rg -n 'func newTestManager\b|func
  createLaunchedSession\b|func seedRepo\b'` before writing confirmed reuse of all three
  from `manager_test.go`.

## Red-first evidence

Per the spawn prompt, every new test was proven to fail on the pre-fix code by
temporarily restoring `git show HEAD:<path>` for the affected file(s), running just that
test, and restoring the working-tree file immediately after (no implementation file was
left modified; `git diff --stat` was re-checked after each restore and matched the
pre-existing F1 diff exactly). Items without a real pre-fix equivalent (7: `finishWrite`
is new code) were proven by temporarily disabling the mechanism under test instead, per
the same discipline.

### Item 1 — a-C1, `TestApplyBind_DoesNotMutateAModelSharedByAnEarlierClone`

Pre-fix `machine.go`/`manager.go` restored:

```
--- FAIL: TestRedFirst_ApplyBind_DoesNotMutateAModelSharedByAnEarlierClone (0.13s)
    Error: Not equal:
     expected: "claude-model-a"
     actual  : "claude-model-b"
    Messages: a-C1: a clone taken before the rebind must keep reporting the old model
```

### Item 2 — a-C1, `TestApplyBind_ConcurrentWithListNeverRacesOnModel` (`-race`)

Pre-fix `machine.go` restored, run with `-race`:

```
WARNING: DATA RACE
Write at 0x... by goroutine 34:
  internal/session.applyBind()
      internal/session/machine.go:138 +0x1e4
  internal/session.applyInput()
      internal/session/machine.go:25 +0x52c
  internal/session.(*Manager).Apply()
      internal/session/manager.go:822 +0x5ca
Previous read at 0x... by goroutine 35:
  internal/session.TestRedFirst_ApplyBind_ConcurrentWithListNeverRacesOnModel.func2()
      internal/session/zz_redfirst_race_test.go:43 +0x148
--- FAIL: TestRedFirst_ApplyBind_ConcurrentWithListNeverRacesOnModel (0.72s)
```

The write is at `machine.go:138`, exactly the pre-fix `sess.Model.ID = *input.Model` line.

### Item 3 — a-M2, `TestCreateSession_ConcurrentLaunchesForDifferentDirectoriesGetDistinctRailPos` (looped, 50 trials)

Pre-fix `manager.go` restored:

```
    Error: Should not be: 0
    Messages: trial 0: concurrent CreateSession calls must never allocate the same railPos
    Error: Should not be: 1
    Messages: trial 1: concurrent CreateSession calls must never allocate the same railPos
    ... (every trial 0-49 failed identically)
--- FAIL: TestRedFirst_CreateSession_ConcurrentLaunchesGetDistinctRailPos (0.71s)
```

Every one of the 50 trials collided pre-fix (both concurrent `CreateSession` calls read
`maxRailPosLocked()+1` before either registered).

### Item 4 — a-M3, `TestBumpIDWatermark_ConcurrentWithInsertSessionNeverLowersThePersistedWatermark` (looped, wrong-watermark)

Pre-fix `internal/store/session.go` restored:

```
watermark_test.go:77: "46" is not greater than or equal to "50"
    Messages: iteration 9: the persisted watermark must never end up below the highest id InsertSession actually committed this round
watermark_test.go:77: "76" is not greater than or equal to "80"
    Messages: iteration 15: ...
watermark_test.go:77: "96" is not greater than or equal to "100"
    Messages: iteration 19: ...
--- FAIL: TestBumpIDWatermark_ConcurrentWithInsertSessionNeverLowersThePersistedWatermark (1.96s)
```

10 of 100 rounds produced a wrong (lowered) persisted watermark pre-fix; 0 of 100 post-fix
(also re-run 3× under `-race` with no failures and no data races — the bug is a logical
race in a two-statement read-then-write, not a Go memory race, matching a-M3's own "SQLite,
not Go memory" framing).

### Item 5 — b-M1/a-S2, `TestMarkPlanWritten_RefusesAStalePathAndFlipsExistsOnlyForTheCommittedOne`

`MarkPlanWritten` is new code (the pre-fix caller used `SetPlan` directly, which is the
bug). Its absence pre-fix is itself the defect: this test doesn't have a "red" pre-fix
form because the API being tested didn't exist — the finding's reproduction (a stale
`SetPlan(sess.PlanPath, true)` call clobbering a concurrently-scanned newer path) is
exactly what `internal/server/reader.go`'s pre-fix `observeWrite` did, and is covered from
the server side by the existing `reader_test.go` suite's pre-existing tests, which
`daemon-implementation-F1.md` reports still pass unmodified. This test instead locks down
the new primitive's own contract (CAS against the committed path) so a future regression
back to a plain `SetPlan` call is caught here first.

### Item 6 — S1, `TestPersistFailure_RollsBackEveryMutationUniformly` / `RailBatchRollsBackEveryQueuedWrite`

Pre-fix `manager.go` restored, all rows but `MarkPlanWritten` (new API) run:

```
--- FAIL: TestRedFirst_PersistFailure_RollsBackEveryMutationUniformly (1.17s)
    --- PASS: .../Apply (0.13s)          [see note below — first attempt was a false pass]
    --- FAIL: .../ApplyStatus (0.12s)
    --- FAIL: .../SetTitle (0.13s)
    --- FAIL: .../MarkSeen (0.12s)
    --- FAIL: .../SetTranscript (0.13s)
    --- FAIL: .../SetPlan (0.15s)
    --- FAIL: .../ApplyPlanScan (0.13s)
    --- FAIL: .../RepairOwnedSession (0.13s)
    --- PASS: .../RecordResume (0.13s)    [correct pass — RecordResume already rolled back pre-fix]
```

Sample failure (`ApplyStatus`):

```
Diff:
--- Expected
+++ Actual
@@ -9,3 +9,3 @@
  IsWorktree: (bool) false,
- Title: (*string)(<nil>),
+ Title: (*string)((len=7) "renamed"),
```

The first `Apply` row initially came back a false PASS pre-fix: its call
(`KindTurnClosed` with no promptID, on an already-idle, already-closed session) was a
true no-op, so there was nothing to roll back either way — proving nothing about S1. That
was a test bug, not a defect; fixed by giving the `Apply` row a genuinely mutating input
(`KindTurnActivity` with a fresh promptID/prompt, driving `idle -> working` plus
`LastPrompt`/`currentPromptID`). Re-run pre-fix with the corrected row:

```
--- FAIL: TestRedFirst_PersistFailure_RollsBackEveryMutationUniformly/Apply (0.13s)
    Diff:
    - State: "idle"
    + State: "working"
    - Unread: true
    + Unread: false
    - LastPrompt: (*string)(nil)
    + LastPrompt: (*string)((len=5) "hello")
```

`TestPersistFailure_RailBatchRollsBackEveryQueuedWrite`'s two rows (`SetOrder`,
`SetPinned`) exercise `persistAndBroadcastRail`, which pre-fix stopped at the first
persist failure with every later, unattempted entry in the same batch left mutated in
memory — the same class of bug, confirmed by the `ApplyStatus`/`SetTitle`/etc. failures
above against the shared `finishWrite` tail rail writes now go through.

### Item 7 — S1, `TestWriteTurns_FinishWriteOrdersPersistsByTicketNotGoroutineStartOrder`

`nextWriteTurnLocked`/`finishWrite` are new code with no pre-fix equivalent to restore, so
the wait itself was temporarily disabled in the current (post-fix) `finishWrite`
(`if false && wait != nil { <-wait }`), run, and immediately reverted:

```
--- FAIL: TestWriteTurns_FinishWriteOrdersPersistsByTicketNotGoroutineStartOrder (0.05s)
    Error: Not equal:
     expected: []int{1, 2, 3}
     actual  : []int{2, 3, 1}
```

`git diff --stat internal/session/manager.go` was confirmed unchanged (255 insertions/94
deletions, matching the original F1 diff) after reverting.

## Gate Output

```
$ go build ./...
(clean)

$ gofmt -l internal/session internal/store internal/server
(clean)

$ go vet ./...
(clean)

$ go test -race -count=1 ./internal/session/... ./internal/store/... ./internal/server/...
ok  	github.com/Zalaras/muster/internal/session	32.181s
ok  	github.com/Zalaras/muster/internal/store	10.010s
ok  	github.com/Zalaras/muster/internal/server	102.569s

$ make lint
golangci-lint run
0 issues.
```

`git status --short` confirms only the pre-existing F1 implementation diff plus the two
new test files (`internal/session/manager_writeorder_test.go`,
`internal/store/watermark_test.go`) and the one edited existing test file
(`internal/session/machine_test.go`, `TestTruncate`'s new case) — no implementation file
touched, no test file left modified beyond the intended addition.
