# Daemon Implementation: maintainability-cleanup (Unit F3)

**Plan**: maintainability-cleanup
**Mode**: initial
**Pack**: `kb: pack 68157 words (budget 8000)` — over budget (whole-repo pack across 22
features); relevant slices pulled by grep: rules §Go conventions, the accepted
`kb:adr/lifecycle-liveness-from-pane-existence`, `kb:adr/lifecycle-alive-flag-not-a-state`,
`kb:adr/lifecycle-liveness-writes-stop-at-shutdown`, `kb:fact/sessionend-reason-ambiguous`,
`kb:fact/hook-delivery-best-effort`, and `internal/session/CLAUDE.md`'s own invariant line
(already correct — see Decisions).

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/session/machine.go` | modified | Deleted the `claudecode.KindDeathHint` effect arm (`sess.Alive = false; sess.EndedAt = &endedAt`) from `applyInput`. Folded `KindDeathHint` into the existing no-op case alongside `KindClearDeathHint, KindInert`. The event still persists (done by the ingest worker before `applyInput` runs); no state change occurs for a non-clear `SessionEnd`. |

## Decisions

- design: kept `claudecode.KindDeathHint` as a distinct named `InputKind` rather than
  folding it into `KindInert` in `internal/claudecode/interpret.go`. Checked for other
  branches per the plan's instruction: `rg -n "KindDeathHint\b" internal --include=*.go`
  (run without `_test.go` exclusion working via grep -rn) shows only
  `internal/claudecode/interpret.go` (declaration + `interpretSessionEnd`'s "other" branch)
  and `internal/session/machine.go` (the arm just deleted) touch it in production code;
  `internal/session/rail_unread_test.go:50` and `internal/claudecode/interpret_test.go:216`
  are the only other references, both tests. No production code branches on it distinctly
  from `KindInert` today. I kept the name anyway rather than deleting the constant, for two
  reasons: (1) it costs nothing — `interpret.go` is unchanged, so
  `interpret_test.go`'s `KindDeathHint` assertion at line 216 and
  `rail_unread_test.go`'s `death_hint` row at line 50 both keep compiling and keep passing
  (verified — see Handoff test run) instead of being forced into a second sanctioned break
  beyond the one the plan already calls out; (2) `interpret.go`'s job is turning a wire
  reason into a neutral classification of *what kind of SessionEnd this was*, which is
  still true information independent of what `internal/session` does with it — the
  proposed-backlog P8 liveness nudge (decision doc's "Dissent to honour") would want to
  distinguish "this was a non-clear SessionEnd" from "this was some unrelated inert event"
  to decide whether to trigger a liveness re-check, and collapsing the two now would make
  P8 re-invent the distinction later. `KindClearDeathHint` semantics are unchanged (still a
  separate case, still a no-op, as instructed).
- Nothing else in `internal/claudecode/interpret.go` changed — `interpretSessionEnd` still
  returns `KindDeathHint` for any non-"clear" reason; only `internal/session/machine.go`'s
  reaction to it changed.
- No REQ deferred: F3's only code deliverable per `plan.md` line 53 is the deletion of the
  effect plus the fold-or-keep decision, both done.
- doc-delta: none from me — `plan.md` line 54-55 assigns the `docs/protocol.md` and
  `docs/features/lifecycle/spec.md` corrections to the main session, not to daemon-impl.

## Handoff

**Build status**: `go build ./...` exits 0.

```
$ gofmt -l internal/session/machine.go internal/claudecode/interpret.go
(no output)
$ go build ./...
(exit 0)
$ go vet ./...
(exit 0, no output)
$ make lint
golangci-lint run
0 issues.
```

`go test -race -count=1 ./internal/session/... ./internal/claudecode/...`:

```
--- FAIL: TestApplyInput_DeathHint (0.00s)
    machine_test.go:900:
        Error Trace: .../internal/session/machine_test.go:900
        Error:       Should be false
        Test:        TestApplyInput_DeathHint
    machine_test.go:901:
        Error Trace: .../internal/session/machine_test.go:901
        Error:       Expected value not to be nil.
        Test:        TestApplyInput_DeathHint
FAIL
FAIL    github.com/Zalaras/muster/internal/session     30.554s
ok      github.com/Zalaras/muster/internal/claudecode  8.243s
```

Exactly one failure (`grep -c "^--- FAIL"` = 1). This is the sanctioned break the plan
names at line 56: `TestApplyInput_DeathHint` (`internal/session/machine_test.go:891-904`)
still pins the old behaviour (`assert.False(t, sess.Alive)`, `require.NotNil(t,
sess.EndedAt)`) after feeding it `claudecode.KindDeathHint`. Everything else that touches
`KindDeathHint` — `rail_unread_test.go`'s `death_hint` row and
`interpret_test.go:216` — passed unchanged, because I kept the name (see Decisions) and
that arm never touched `Unread` in the first place.

**What `TestApplyInput_DeathHint` should assert instead** (rename to
`TestApplyInput_DeathHint_NoEffectOnAlive` or similar): seed `sess.State = StateWorking`,
`sess.Alive = true`, apply `claudecode.StateInput{Kind: claudecode.KindDeathHint}`, then
assert `sess.Alive` is still `true`, `sess.EndedAt` is still `nil`, and `sess.State` is
still `StateWorking` — i.e. fold it into the same no-op shape
`TestApplyInput_ClearDeathHintAndInert` already asserts for `KindClearDeathHint`/`KindInert`
(`machine_test.go:906-923`); `KindDeathHint` can simply be added as a third case in that
table-style test's `[]claudecode.InputKind` list, since all three kinds now produce
byte-identical no-op behaviour in `applyInput`.

**New test for the Manager-level interleaving** (plan.md line 56, second half) — precise
shape, following `TestEnd_StillMarksEndedAfterStop`'s fixture pattern
(`internal/session/manager_test.go:822-865`):

1. `st := openTestStore(t)`; build a `pc := newFakePaneChecker()`-backed manager via
   `newTestManager`, same as `TestEnd_StillMarksEndedAfterStop`.
2. `CreateSession` + `RecordLaunch` one session (`target`), tmux target
   `"muster-<id>:@1"`; `pc.setExists(targetTmux, true)`.
3. Bind it: `mgr.Apply(ctx, target.ID, "claude-1", nil, claudecode.StateInput{Kind:
   claudecode.KindBind}, true)` so `ClaudeSessionID` is set and `Alive` is `true`
   (`CreateSession`'s default).
4. `stopCtx, cancel := context.WithTimeout(ctx, 2*time.Second); defer cancel();
   mgr.Stop(stopCtx)` — simulates `shutdownGracefully`'s first statement
   (`cmd/musterd/onexit.go:48`) having already run, so the liveness poll is stopped.
5. `pc.setExists(targetTmux, false)` — the pane is gone (Claude Code exited under
   `-on-exit=ask`, mid the up-to-10s prompt window `onexit.go:96` waits in, before HTTP
   shutdown / before the next boot's Reconcile ever runs).
6. Simulate the async hook worker delivering the `SessionEnd` it received in that window,
   landing *after* Stop, exactly as it can today (`Apply` has no `stopped` guard — this is
   the failure mode the decision doc measured): `final, err := mgr.Apply(ctx, target.ID,
   "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindDeathHint}, true)`.
7. Assert `err` is nil, `final.Alive` is `true` (not flipped by the hint), `final.EndedAt`
   is `nil`.
8. Assert the store row itself: `persisted, err := st.GetSession(ctx, target.ID);
   assert.True(t, persisted.Alive)` — this is the load-bearing assertion: before this
   fix, step 6 wrote `alive=0` straight to the row; a daemon restarting with that row
   paneless and `alive=false` would have `Reconcile` (`internal/session/reconcile.go:33-34`)
   sweep it immediately, losing Resume. After this fix the row stays `alive=1` through the
   whole shutdown window, so the *next* boot's `Reconcile` instead takes the
   absent+alive=true branch (`reconcile.go:31-32`: "marked ended and kept ... the resume
   chance is not lost") — one more life before it is finally swept. A test that wants to
   show that second half explicitly can construct a fresh `Manager` on the same `st` with
   `pc.setExists(targetTmux, false)` still false and call `Reconcile`, asserting
   `report.MarkedEnded == 1` and `report.Swept == 0` (contrasted with what `Swept == 1`
   would have been under the old code, since the row would already have landed
   paneless+alive=false before that boot).

No test files needed an import fix from this change (nothing moved, renamed, or deleted a
symbol other agents import).
