# Daemon Tests: maintainability-cleanup (Unit F3)

**Plan**: maintainability-cleanup
**Verdict**: pass
**Pack**: not run separately — reused the F3 implementation log's pack context (`daemon-implementation-F3.md`'s `**Pack**` line: `kb: pack 68157 words (budget 8000)` — over budget, relevant slices pulled by grep: rules §Go conventions, `kb:adr/lifecycle-liveness-from-pane-existence`, `kb:adr/lifecycle-alive-flag-not-a-state`, `kb:adr/lifecycle-liveness-writes-stop-at-shutdown`, `kb:fact/sessionend-reason-ambiguous`, `kb:fact/hook-delivery-best-effort`, `internal/session/CLAUDE.md`).

## Summary

Tests created: 2 (1 replaces a pinned-old-behaviour test, 1 net new) | Passing: 2/2 | Failing: 0

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `machine_test.go` | `TestApplyInput_SessionEndNeverWritesAlive` | Replaces `TestApplyInput_DeathHint`. Cross-state table (6 source states × alive=true/false = 12 subtests): a non-clear `SessionEnd` (`KindDeathHint`) never writes `Alive`, `EndedAt`, `State` or `StateSince`, from every source state and both starting liveness values (including not overwriting a pre-existing `EndedAt`) | pass |
| `machine_test.go` | `TestApplyInput_ClearDeathHintAndInert` | Unchanged — `KindClearDeathHint`/`KindInert` no-op coverage kept as-is per instructions | pass (untouched) |
| `manager_test.go` | `TestApply_SessionEndAfterStopKeepsResumeChance` | Manager-level regression: a non-clear `SessionEnd` applied after `Manager.Stop` (simulating a hook landing in the `-on-exit=ask` window) leaves the stored row `alive=1`; a subsequent `Reconcile` on a fresh `Manager`/`LoadAll` over the same store takes the absent+alive=true branch (`MarkedEnded=1, Swept=0`) instead of sweeping the row | pass |

## Implementation Bugs

None — verdict is `pass`. `internal/session/machine.go`'s `KindDeathHint` arm already matches the decision (folded into the no-op case with `KindClearDeathHint, KindInert`); no implementation change was needed or made.

## Proof the regression tests fail on the old code

Per instructions, before finalizing, temporarily restored the old `machine.go` (`git show HEAD:internal/session/machine.go`, since the F3 fix is still uncommitted in the worktree — `HEAD` is the pre-fix version), reran both new tests, then restored the fixed file (copied aside first, restored after):

```
$ git show HEAD:internal/session/machine.go > internal/session/machine.go
$ go test -race -count=1 -run 'TestApplyInput_SessionEndNeverWritesAlive|TestApply_SessionEndAfterStopKeepsResumeChance' ./internal/session/... -v
--- FAIL: TestApplyInput_SessionEndNeverWritesAlive/working/alive=true
    Error: Not equal: expected: true, actual: false ("a death hint must never write alive")
    Error: Expected nil, but got: time.Date(...) ("a death hint must never set endedAt")
--- FAIL: TestApplyInput_SessionEndNeverWritesAlive/working/alive=false
    Error: Not equal: expected: 2026-08-22 11:00:00 +0000 UTC, actual: 2026-08-22 12:01:00 +0000 UTC
    ("a death hint must never overwrite an existing endedAt")
... (same shape for started/planning/needs_input/failed/idle, both alive=true and alive=false)
--- FAIL: TestApplyInput_SessionEndNeverWritesAlive (0.01s)
--- FAIL: TestApply_SessionEndAfterStopKeepsResumeChance (0.13s)
    manager_test.go:923: Should be true ("a non-clear SessionEnd delivered after Stop must not flip alive")
    manager_test.go:924: Expected nil, but got: time.Date(2026, September, 24, ...)
    manager_test.go:928: Should be true ("the stored row must stay alive through the whole shutdown window")
    manager_test.go:937: Not equal: expected: 1, actual: 0 ("the row gets one more life: marked ended, not swept")
    manager_test.go:938: Not equal: expected: 0, actual: 1
FAIL
FAIL	github.com/Zalaras/muster/internal/session	0.995s
```

All 12 `TestApplyInput_SessionEndNeverWritesAlive` subtests and `TestApply_SessionEndAfterStopKeepsResumeChance` failed against the pre-fix code, confirming both are load-bearing regression tests, not tautologies. Restored the fixed `machine.go` afterward (verified `git diff --stat internal/session/machine.go` showed 5 insertions/7 deletions matching the F3 fold, and `KindDeathHint` still grouped with `KindClearDeathHint, KindInert` on one case line).

## Doc update

`docs/facts/sessionend-reason-ambiguous.md`'s `tests:` frontmatter renamed `TestApplyInput_DeathHint` → `TestApplyInput_SessionEndNeverWritesAlive` (its `guard:` field, `TestSessionEndReasonAmbiguous`, is a different, canary-side test and was untouched).

`make gen-kb` regenerated `docs/features/lifecycle/contract.md` (6 lines changed) — this reflects the main session's already-made `docs/protocol.md`/`docs/features/lifecycle/spec.md` edits for this same decision, not anything from this test pass; the file was already showing modified in `git status` before I ran `gen-kb`.

`make check-kb` reports one pre-existing, unrelated problem: `internal/keyedlock/keyedlock.go: owned by no feature` — an untracked package from a concurrent agent's work (not `internal/session`, not touched by F3). Out of scope for this unit; not something I introduced or can fix under this agent's file-scope restriction (`internal/session/*_test.go` only).

## Test Run Output

```
$ go build ./...
(exit 0)

$ go vet ./internal/session/...
(exit 0, no output)

$ make lint
golangci-lint run
0 issues.

$ go test -race -count=1 ./internal/session/...
ok  	github.com/Zalaras/muster/internal/session	31.262s

$ python3 .claude/skills/orchestrate/scripts/dead-refs.py internal/session/machine_test.go internal/session/manager_test.go
dead-refs: 10 references checked, 0 missing

$ make gen-kb
go run ./tools/kb gen
kb: regenerated 1 file(s): docs/features/lifecycle/contract.md

$ make check-kb
go run ./tools/kb check
internal/keyedlock/keyedlock.go: owned by no feature (add it to a docs/features/<name>/spec.md glob)
kb: 426 records, 23 features, 1 problem(s)
kb: kb check: 1 problem(s)
exit status 1
```
