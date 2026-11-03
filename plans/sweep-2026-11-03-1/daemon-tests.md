# Daemon Tests: sweep-2026-11-03-1

**Plan**: sweep-2026-11-03-1
**Verdict**: pass
**Pack**: kb: pack 28666 words (budget 30000)

Red-first run, then re-run against the implementation (c8c24118): all five red tests are green. Two of them stayed red after the implementation because of a test defect, fixed here (see Notes).

## Summary

Tests created: 2 new + 1 flipped + 2 flipped subtests | Passing: all | Failing: 0

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/session/manager_test.go` | TestReconcile_ARowWhosePaneDiedWhileDownSurvivesEverySubsequentStartAsEnded | e1: pane died while down, marked ended at start 2, kept un-restamped at starts 3-5; bystander already-ended row alongside | pass |
| `internal/session/manager_test.go` | TestReconcile_ARowEndedBeforeShutdownComesBackEndedAtTheNextStart | e2: two sessions ended by EndAll come back ended with the shutdown `endedAt` at starts 2 and 3 | pass |
| `internal/session/manager_test.go` | TestReconcile_KeepsEndedRowsMarksDeadPanesEndedLeavesLivePanesByteIdentical | renamed/flipped: already-ended row kept byte-identical, report `{KeptAlive:1, MarkedEnded:1}` | pass |
| `internal/session/note_test.go` | TestNote_INV1_EveryInputFromEveryState/dead/reconcile_with_the_socket_empty | kept ended row keeps its note, bystander untouched | pass |
| `internal/session/note_test.go` | TestNote_INV1_ASessionWithNoNoteGainsNoneFromAnyInput/dead/reconcile_with_the_socket_empty | kept ended row's note stays null | pass |
| `internal/session/manager_test.go` | TestApply_SessionEndAfterStopKeepsResumeChance | comment fixed; asserts `ReconcileReport{MarkedEnded: 1}` instead of `Swept` | pass |

## Handoff Received

None (red-first). The plan's "Existing tests this breaks" handled: manager_test.go (:937 Swept reference + comment, :1253 test renamed and flipped, a ListSessions-failure comment that described the sweep), note_test.go (`sweepsDead` removed; the dead row and its note are kept), manager_rail_test.go:220 comment, manager_writeturnstile_interleave_test.go `TestReconcile_SweptRowStoreFailureStillDropsMemory` deleted. `web/e2e` untouched.

## Notes

- Test defect fixed after the implementation landed: `TestReconcile_KeepsEndedRowsMarksDeadPanesEndedLeavesLivePanesByteIdentical` (`endedAt`) and the bystander in `TestReconcile_ARowWhosePaneDiedWhileDownSurvivesEverySubsequentStartAsEnded` (`bystanderEnded`) seeded `time.Now().UTC().Add(-time.Hour)` at nanosecond precision and compared it exactly with the store read-back, but `store.encodeTime` is `t.UTC().Format(time.RFC3339)` (whole seconds). Both seeds now `.Truncate(time.Second)`; the exact-equality assertions are unchanged, and a re-stamp to "now" would still differ by an hour, so they still falsify one.
- `make test` queued behind an exclusive gate lock held by the `muster-sweep-2026-11-03-2` worktree (`gatelock hold --exclusive`), so the same command it wraps, `go test -count=1 ./...`, was run directly.

- `TestReconcile_SweptRowStoreFailureStillDropsMemory` deleted, not repurposed: the `announced=false` store-failure path is covered by `TestDeleteSession_StoreFailureStillDropsMemory` in the same file (`manager_writeturnstile_interleave_test.go`), which asserts `assert.False(t, mgr.Exists(sess.ID), "a never-announced session must never stay visible after its rollback, even when the store delete failed")` after `st.Close()` and `DeleteSession`.
- Edge case 2 (live `muster-<id>` with stored `alive=false` is revived) is already covered by `TestReconcile_AliveFalseRowWithALiveMusterSessionIsRevivedNotSwept` (asserts `got.Alive`); its name still says "NotSwept", left as is.
- The store keeps `endedAt` at whole-second precision, so `requireKeptEnded` compares memory at second granularity and the store exactly.
- `web/e2e/*` working-tree edits visible in `git status` belong to e2e-specs; not committed here.

## Test Run Output

```
go build ./...                 ok
go test -count=1 ./...         every package ok (internal/session ok 49.5s)
make lint                      0 issues.
```
