# Daemon Tests: Session lifecycle robustness

**Plan**: session-lifecycle
**Verdict**: implementation-bug
**Pack**: `kb: pack 23136 words` / `kb: WARN pack exceeds budget of 8000 words` (role `daemon-tests`, features `lifecycle,actions,launch,surfaces,ingest`)

## Summary

This is the red-first pass (plan Implementation Notes § Red-first): every test below is
written and run against the **unmodified** tree, before daemon-impl exists. "implementation-bug"
here means what the plan intends it to mean at this stage — the gap is proven, not that any
test is broken.

Tests created: 21 (covering D1–D17) | Compiling and red at runtime: 13 | Blocking whole-package
compile failures (expected per Red-first): 8, spread across 3 packages (`store`, `tmux`, `server`)

`go build ./...` passes (only `*_test.go` files were touched). `make test` is red, exactly as
required — see Test Run Output.

## Update — Phase 1 landed (commit `b4f2255`)

Everything below the Summary is the original red-first snapshot and is left as written — it
documents what was true before any implementation existed. Since then daemon-impl landed Phase 1
(REQ-1 through REQ-10), which now compiles alongside every test in this pass and turns most of
them green. Current state (`go test ./internal/store/... ./internal/tmux/... ./internal/session/...
./internal/server/...`):

- **Green now**: every D1–D10, D12, D14 test above, plus both previously-blocked D2/D3/D4/D5
  server-side tests, `TestKillSession_RemovesTheWholeSessionIdempotentForAnUnknownName`, and the
  three `MaxSessionID`/`ParseSessionName`/`ErrSessionExists` tests. (D14's assertions — zero raw
  kill errors, at most one not-alive, exactly one ended-broadcast — turn out to already hold
  without REQ-11's lock, purely as a side effect of REQ-6's idempotent kill; confirmed stable
  across 5 repeat runs, not a flake.)
- **Still red (Phase 2 — REQ-11/13/14/16 not yet implemented)**: `TestMarkEnded_APersistFailureLeavesTheInMemorySessionAliveMatchingTheDB`
  (D16), `TestCheckLiveness_ListSessionsFailureLeavesSessionsAsIsDespitePaneExistsFalse` (D17),
  `TestHandleRemoveSession_FailingEndLeavesTheShellRunningAndTheRowPresent` (D15 — re-injected
  below, since REQ-6 made its original fault injection invalid), and
  `TestLauncher_ConcurrentResumesSpawnExactlyOnce` (**D19**, new — see below; D14 turning green
  without REQ-11 left the lock with no red test driving it, so this closes that gap).
- The two guardrails (`manager_test.go:895`, `:1422`) and the other two named-elsewhere guardrails
  (`sessions_test.go:169`, `tmux_test.go:57`) all still pass.

### D15 re-injection

REQ-6 shipped in Phase 1, so `KillSession` against a target that was never spawned is now a
*successful* kill (the "already gone" case), not the genuine failure D15 needs — the test's
original fault injection (a fabricated, never-spawned tmux target) stopped reproducing anything.
Fixed by replacing it with `errKiller`, a `session.Killer` double whose `KillSession` always
returns a fixed, non-nil error, wired only into the `session.Manager`'s `SessionKiller` — the shell
registry still uses a real per-test tmux client so the shell-survives assertion stays a genuine
tmux-observable check. Confirmed still red:

```
=== RUN   TestHandleRemoveSession_FailingEndLeavesTheShellRunningAndTheRowPresent
    sessions_test.go:529:
        Error:      Should be true
        Test:       TestHandleRemoveSession_FailingEndLeavesTheShellRunningAndTheRowPresent
        Messages:   D15/REQ-13: a failed Remove must leave the shell tmux session running
--- FAIL: TestHandleRemoveSession_FailingEndLeavesTheShellRunningAndTheRowPresent (0.16s)
```

Only that one assertion fails — the 500 status and "row still present" assertions both already
pass, isolating the failure to exactly REQ-13's not-yet-implemented ordering fix.

### `killLeakedSession` — closing the field-count branch's coverage gap

daemon-impl introduced the shared helper the original D6 write-up predicted:
`func (c *Client) killLeakedSession(ctx context.Context, name string)` (`tmux.go:169-177`), called
by both `NewNamedSession` post-create failure branches. It's unexported and `tmux_test.go` is
in-package, so `TestKillLeakedSession_RemovesAnExistingSessionAndIsANoOpForAnUnknownName`
(`internal/tmux/tmux_test.go`) calls it directly: it actually removes a session that exists, and is
a silent no-op — no panic, no hang — for a name nothing ever created. No seam invented, no faked
assertion; passes green (it's already-shipped Phase 1 behaviour, not something red-first):

```
=== RUN   TestKillLeakedSession_RemovesAnExistingSessionAndIsANoOpForAnUnknownName
--- PASS: TestKillLeakedSession_RemovesAnExistingSessionAndIsANoOpForAnUnknownName (0.14s)
```

This closes the gap the original D6 section documented as "covered by inspection only" — the
`len(fields) != 2` branch's own trigger is still not independently forceable (unchanged reasoning,
see the D6 section below), but the cleanup behaviour both branches share is now directly tested
rather than merely inspected.

### D19 (new): concurrent Resume must spawn exactly once — the red driver for REQ-11

D14 turning green without REQ-11's per-session lock left that lock with no red test at all, which
by this project's own testing bar means it would ship unverified. Added
`TestLauncher_ConcurrentResumesSpawnExactlyOnce` (`internal/server/sessions_test.go`):
`Resume`'s check-then-act reads `sess.Alive == false` and only flips it later in `RecordResume`, so
without a per-id lock two concurrent `Resume` calls for one dead-but-resumable session both pass
the alive gate and both call `NewSession`. Post-Phase-1 that's invisible in either caller's status
code (the loser hits `tmux.ErrSessionExists` and REQ-8's repair path hands it a plain `200`), so
the test asserts on `fakeTmux.newSessionCalls` — exactly 1 — rather than any status.

No internal fake barrier was needed to make this deterministic: a plain `sync.WaitGroup` gated on a
shared `ready` channel (i.e. exactly the pattern the D14 test already used) was enough. I iterated
on this with a throwaway scratch test file (not committed) before adding it to `sessions_test.go`,
running `-run ... -count=20` and then `-count=20 -race`:

```
$ go test ./internal/server/... -run TestLauncher_ConcurrentResumesSpawnExactlyOnce -v -count=20
20/20 FAIL, actual: 2 every time

$ go test ./internal/server/... -run TestLauncher_ConcurrentResumesSpawnExactlyOnce -v -count=20 -race
20/20 FAIL, actual: 2 every time, 0 data races reported
```

Real disk I/O inside `writeSettings` (`os.ReadFile`/`os.WriteFile`/`os.MkdirAll` against a real temp
dir, between the alive-check and the `tmux.NewSession` call) is apparently enough to reliably widen
the race window on this machine — 100% reproduction across 40 total runs (20 plain + 20 `-race`),
so I did not need to fall back to a fake-side rendezvous barrier. Had it been flaky I would have
added a bounded (not unconditional — an unconditional 2-arrivals barrier would hang forever once
REQ-11 ships and the second Resume never reaches `NewSession` at all) wait inside `fakeTmux`
instead of shipping something timing-dependent; wasn't necessary here.

Final, integrated run (after moving the test into `sessions_test.go` for real):

```
=== RUN   TestLauncher_ConcurrentResumesSpawnExactlyOnce
    sessions_test.go:589:
        Error:      Not equal:
                    expected: 1
                    actual  : 2
        Test:       TestLauncher_ConcurrentResumesSpawnExactlyOnce
        Messages:   D19/REQ-11: two concurrent Resumes for one session must spawn exactly once
--- FAIL: TestLauncher_ConcurrentResumesSpawnExactlyOnce (0.01s)
```

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/store/session_test.go:128` | `TestInsertSession_AllocatesAboveHighestExistingIDAndWritesWatermark` | D1: seeded ids 1..7 → next id 8, `kv['session.id_watermark']='8'` | compile-fail (package) |
| `internal/store/session_test.go:152` | `TestInsertSession_MinIDFloorsAllocationEvenAboveTheExistingMax` | D1/REQ-1: `MinID` floors allocation above the table's own max | compile-fail (package) |
| `internal/tmux/tmux_test.go:401` | `TestMaxSessionID_NoServerReturnsZero` | D2 (tmux half): no server → `(0, nil)` | compile-fail (package) |
| `internal/tmux/tmux_test.go:414` | `TestMaxSessionID_ReturnsTheHighestIDAcrossBothClaudeAndShellSessionNames` | REQ-3: floor is max over both `muster-<id>` and `muster-<id>-shell` | compile-fail (package) |
| `internal/tmux/tmux_test.go:434` | `TestMaxSessionID_IgnoresNonMusterSessions` | REQ-3: an unrelated tmux session never moves the floor | compile-fail (package) |
| `internal/tmux/tmux_test.go:450` | `TestParseSessionName` | REQ-3: bare `muster-<N>` parses; shell suffix and unrelated names don't | compile-fail (package) |
| `internal/tmux/tmux_test.go:468` | `TestNewNamedSession_DuplicateNameWrapsErrSessionExists` | REQ-4: a duplicate-session tmux failure wraps `ErrSessionExists` | compile-fail (package) |
| `internal/tmux/tmux_test.go:379` | `TestNewNamedSession_ApplyServerOptionsFailureLeavesNoSessionAndReturnsTheOriginalError` | D6/REQ-5: a post-create `applyServerOptions` failure leaves no leaked session, original error preserved | **red (runtime)** |
| `internal/tmux/tmux_test.go:501` | `TestKillSession_RemovesTheWholeSessionIdempotentForAnUnknownName` | REQ-6 (feeds D12/D13): killing an already-gone session is success, not an error — replaces the pre-plan assertion that it must error | **red (runtime)** |
| `internal/session/manager_test.go:2458` | `TestCreateSession_AfterRemovingTheHighestIDTheNextIDIsStrictlyGreater` | D7/REQ-2: an id is never reissued after the highest row is removed | **red (runtime)** |
| `internal/session/manager_test.go:2486` | `TestReconcile_LiveMusterSessionUnderAPlaceholderTargetIsRepairedAndKeptAlive` | D8: a live `muster-<id>` under a placeholder (`""`) target is repaired and kept alive | **red (runtime)** |
| `internal/session/manager_test.go:2523` | `TestReconcile_AliveFalseRowWithALiveMusterSessionIsRevivedNotSwept` | D9: an `alive=false` row whose pane is live is revived, not swept | **red (runtime)** |
| `internal/session/manager_test.go:2565` | `TestReconcile_AliveRowWithAStaleWindowTargetIsRepairedNotMarkedEnded` | D10: a stale-window target under a live owning session is repaired, not marked ended | **red (runtime)** |
| `internal/session/manager_test.go` (unchanged) | `TestReconcile_ReportsUnknownMusterSessionsWithoutCreatingRows` (line 895 pre-existing) | D11 guardrail: unknown sessions still reported/logged, never killed | pass (confirmed unchanged) |
| `internal/session/manager_test.go:2607` | `TestEnd_AlreadyGoneTmuxSessionIsSuccessNotError` | D12/REQ-6: End on an already-gone tmux session succeeds | **red (runtime)** |
| `internal/session/manager_test.go` (unchanged) | `TestRemove_EndsAnAliveSessionFirstAndLeavesTheRowOnAFailingKill` (line 1422 pre-existing) | D13 guardrail: a genuine kill failure still errors, row still left | pass (confirmed unchanged) |
| `internal/session/manager_test.go:2641` | `TestEnd_ConcurrentEndsProduceExactlyOneMarkEndedAndNeverAKillError` | D14/REQ-11: two concurrent Ends serialise; at most one not-alive, zero kill errors, exactly one ended-broadcast | **red (runtime)** |
| `internal/server/sessions_test.go:488` | `TestHandleRemoveSession_FailingEndLeavesTheShellRunningAndTheRowPresent` | D15/REQ-13: a failed Remove leaves the shell running and the row present | **red (runtime)** |
| `internal/session/manager_test.go:2704` | `TestMarkEnded_APersistFailureLeavesTheInMemorySessionAliveMatchingTheDB` | D16: a persist failure inside `markEnded` rolls the in-memory flip back | **red (runtime)** |
| `internal/session/manager_test.go:2737` | `TestCheckLiveness_ListSessionsFailureLeavesSessionsAsIsDespitePaneExistsFalse` | D17/REQ-16: a `ListSessions` failure is transient, never grounds for mass death | **red (runtime)** |
| `internal/server/sessions_test.go:343` | `TestHandleCreateSession_OrphanedTmuxSessionDoesNotBlockLaunch` | **D3 — the #26 reproducer**: orphaned `muster-1`, fresh store, `POST /api/sessions` | compile-fail (package) |
| `internal/server/sessions_test.go:385` | `TestLauncher_ProbesMaxSessionIDAndDegradesToFloorZeroOnError` | D2 (launcher half): a `MaxSessionID` probe error never fails the launch | compile-fail (package) |
| `internal/server/sessions_test.go:409` | `TestLauncher_RetriesOnceOnASingleErrSessionExistsThenSucceedsWithAHigherID` | D4: one collision → one retry, strictly higher id, succeeds | compile-fail (package) |
| `internal/server/sessions_test.go:437` | `TestLauncher_ExhaustsThreeAttemptsOnRepeatedErrSessionExists` | D5: repeated collisions → `500 launch_failed` after 3 attempts, naming the session | compile-fail (package) |
| `internal/tmux/tmux_test.go:408` (added post-Phase-1) | `TestKillLeakedSession_RemovesAnExistingSessionAndIsANoOpForAnUnknownName` | closes D6's field-count-branch coverage gap: `killLeakedSession` removes a real session, no-ops for an unknown one | pass (Phase 1 behaviour) |
| `internal/server/sessions_test.go:545` (added post-Phase-1) | `TestLauncher_ConcurrentResumesSpawnExactlyOnce` | **D19/REQ-11**: two concurrent Resumes for one session must spawn exactly once | **red (runtime)** |

Also changed (per the orchestrator's instruction, a test-agent change): `internal/server/fakes_test.go`'s
`fakeTmux` gained `MaxSessionID`, a `newSessionErrQueue`/`newSessionIDs` recorder, and
`queueNewSessionErrs`/`newSessionIDsSeen` helpers, so it keeps satisfying `paneSpawner` once
daemon-impl widens that interface, and so D4/D5 can express "fails N times then succeeds" and
assert on the ids actually attempted.

**D18** (`make check`) is not mine — it runs after daemon-impl lands.

### Why 3 packages don't compile at all (this is the correct red state)

- **`internal/store`**: `internal/store/session_test.go:160` references `InsertSessionParams.MinID`,
  which doesn't exist. Every test in the package — including
  `TestInsertSession_AllocatesAboveHighestExistingIDAndWritesWatermark`, which doesn't itself need
  `MinID` — fails to build as a consequence. I verified that test's own logic separately (see
  "Isolated verification" below): with a throwaway `MinID` field added and reverted, it fails
  exactly as expected (missing watermark key), not for an unrelated reason.
- **`internal/tmux`**: `internal/tmux/tmux_test.go` references `MaxSessionID` (3 call sites),
  `ParseSessionName` (4), and `ErrSessionExists` (1) — none exist yet. This subsumes
  `TestNewNamedSession_ApplyServerOptionsFailureLeavesNoSessionAndReturnsTheOriginalError` and
  `TestKillSession_RemovesTheWholeSessionIdempotentForAnUnknownName`, both of which reference only
  existing symbols and are independently confirmed red at runtime (isolated verification below).
- **`internal/server`**: `internal/server/sessions_test.go` references `tmux.ErrSessionExists`
  (2 call sites, D4/D5). This subsumes `TestHandleCreateSession_OrphanedTmuxSessionDoesNotBlockLaunch`
  (D3) and `TestLauncher_ProbesMaxSessionIDAndDegradesToFloorZeroOnError` (D2) and
  `TestHandleRemoveSession_FailingEndLeavesTheShellRunningAndTheRowPresent` (D15), all three of
  which reference only existing symbols and are independently confirmed red at runtime.

`internal/session` compiles standalone (it references no new symbols) and its 8 new tests run and
fail for the stated reasons — see Test Run Output.

### Isolated verification of compile-blocked tests

To rule out "test bug hiding behind a compile error" for the tests in blocked packages, I copied
the tree to a scratch directory, added a throwaway stub file providing the missing symbols
(`ErrSessionExists`, `ParseSessionName`, `Client.MaxSessionID`, `InsertSessionParams.MinID` —
never committed, never touching the real working tree), and ran each test in isolation. All ten
failed for the reason their comment states (never a nil-pointer panic, wrong-type mismatch, or
other sign of a test-side bug) except two whose semantics are inherently untestable against a
placeholder stub:

- `TestMaxSessionID_NoServerReturnsZero` / `TestMaxSessionID_IgnoresNonMusterSessions` — both pass
  against the stub because the stub's `MaxSessionID` always returns `(0, nil)`; both are true
  assertions about the *contract* (matching `ListSessions`'s own no-server-yet shape and
  ignoring non-`muster-` names) that any correct implementation must also satisfy, so this is not a
  test bug — it's a case where a dumb stub happens to already satisfy the assertion.
- `TestMaxSessionID_ReturnsTheHighestIDAcrossBothClaudeAndShellSessionNames`,
  `TestParseSessionName`, `TestNewNamedSession_DuplicateNameWrapsErrSessionExists`,
  `TestHandleCreateSession_OrphanedTmuxSessionDoesNotBlockLaunch`,
  `TestLauncher_ProbesMaxSessionIDAndDegradesToFloorZeroOnError`,
  `TestLauncher_RetriesOnceOnASingleErrSessionExistsThenSucceedsWithAHigherID`,
  `TestLauncher_ExhaustsThreeAttemptsOnRepeatedErrSessionExists`,
  `TestHandleRemoveSession_FailingEndLeavesTheShellRunningAndTheRowPresent` all failed against the
  stub for exactly the reason their comments state (evidence in "Test Run Output — isolated
  verification" below). `TestLauncher_ExhaustsThreeAttemptsOnRepeatedErrSessionExists`'s
  "names the colliding tmux session" assertion failed against the stub only because the stub's
  placeholder error text ("stub: duplicate session") doesn't contain "muster-" — the real
  `tmux.ErrSessionExists`-wrapped error will, since `NewNamedSession` already builds it from the
  real `tmux new-session` stderr, which itself names the session
  (`tmux.go:130`: `"tmux new-session: %w"` wrapping the raw stderr `duplicate session: muster-N`).

## Implementation Bugs (per-D detail; verdict = implementation-bug at this red-first stage)

| Bug | File | Expected (per plan) | Actual (today) |
|-----|------|---------------------|-----------------|
| No id watermark | `internal/store/session.go` | REQ-1: `InsertSession` writes `kv['session.id_watermark']` | key never written; `InsertSessionParams` has no `MinID` field at all |
| tmux never consulted for launch floor | `internal/server/sessions.go` | REQ-7: probe `MaxSessionID` before `CreateSession`, degrade to floor 0 on error | `Launch` never calls any such probe |
| #26 reproducer | `internal/server/sessions.go`, `internal/tmux/tmux.go` | REQ-7: an orphaned `muster-1` must not block a launch that lands on id 1 | `POST /api/sessions` returns `500 launch_failed` every time (see Test Run Output) |
| No retry on collision | `internal/server/sessions.go` | REQ-7: bounded 3-attempt retry on `ErrSessionExists`, raising the floor each time | one attempt only; rolls back and 500s |
| `NewNamedSession` leaks on `applyServerOptions` failure | `internal/tmux/tmux.go:139-143` | REQ-5: kill the session it just created before returning | the branch returns immediately, orphaning the session |
| `KillSession` not idempotent | `internal/tmux/tmux.go:251-256` | REQ-6: an already-gone session is a successful kill | any non-existent name errors, unlike `PaneExists`/`ListSessions` |
| Reconcile classifies by stored `alive`+target, not tmux ownership | `internal/session/manager.go:322-358` | REQ-9: classify by tmux `ListSessions` name ownership, repairing target/pane | `!r.alive` sweeps before any pane check; `PaneExists("")` on a placeholder target reads as dead; a stale window target reads as dead |
| id reissued after delete | `internal/store/session.go` (ROWID reuse) | REQ-2: never reissue an id | SQLite `ROWID` (no `AUTOINCREMENT`) reuses `max(rowid)+1` right after the max row is deleted |
| No per-session lock | `internal/session/manager.go` (`End`) | REQ-11: keyed lock serialises Launch/Resume/End/Remove per id | two concurrent `End` calls both pass the alive check; the loser's real tmux kill fails and that raw error propagates instead of `ErrSessionNotAlive` |
| Shell/terminal torn down before Remove succeeds | `internal/server/sessions.go:436-441` (`handleRemoveSession`) | REQ-13: destructive side effects only after the action is known to succeed | `terminals.closeSessionAndShell` + `shells.Kill` run *before* `manager.Remove`, so a failed Remove has already destroyed the shell |
| No rollback on persist failure | `internal/session/manager.go:1058-1082` (`markEnded`) | REQ-14: roll back the in-memory mutation when `UpdateSession` fails | `sess.Alive = false` is set before the persist and never rolled back on error |
| Liveness never confirms server reachability | `internal/session/manager.go:1036-1051` (`checkOneLiveness`) | REQ-16: a `ListSessions` failure is transient, leaves sessions as-is | only `PaneExists` is consulted; a `false` reading (even from an unreachable server) marks the session ended |

## Test Run Output

### `go build ./...`

```
$ go build ./...
(no output — exit 0)
```

### `go test ./...` (against the real, unmodified tree)

```
FAIL	github.com/Zalaras/muster/internal/server [build failed]
FAIL	github.com/Zalaras/muster/internal/session	6.519s
FAIL	github.com/Zalaras/muster/internal/store [build failed]
FAIL	github.com/Zalaras/muster/internal/tmux [build failed]
```

Compile errors (`go test -c -o /dev/null`):

```
# internal/store
internal/store/session_test.go:160:123: unknown field MinID in struct literal of type InsertSessionParams

# internal/tmux
internal/tmux/tmux_test.go:404:15: c.MaxSessionID undefined (type *Client has no field or method MaxSessionID)
internal/tmux/tmux_test.go:426:16: c.MaxSessionID undefined (type *Client has no field or method MaxSessionID)
internal/tmux/tmux_test.go:442:16: c.MaxSessionID undefined (type *Client has no field or method MaxSessionID)
internal/tmux/tmux_test.go:451:12: undefined: ParseSessionName
internal/tmux/tmux_test.go:455:10: undefined: ParseSessionName
internal/tmux/tmux_test.go:458:10: undefined: ParseSessionName
internal/tmux/tmux_test.go:461:10: undefined: ParseSessionName
internal/tmux/tmux_test.go:480:25: undefined: ErrSessionExists

# internal/server
internal/server/sessions_test.go:413:32: undefined: tmux.ErrSessionExists
internal/server/sessions_test.go:441:28: undefined: tmux.ErrSessionExists
```

`internal/session` runtime failures (`go test ./internal/session/... -v`, trimmed to the new
tests; every other test in the package, including the two named guardrails, passed):

```
--- FAIL: TestCreateSession_AfterRemovingTheHighestIDTheNextIDIsStrictlyGreater (0.01s)
    manager_test.go:2477:
        Error:      "2" is not greater than "2"
        Messages:   D7/REQ-2: a session id must never be reissued, even right after the highest row is deleted
--- FAIL: TestReconcile_LiveMusterSessionUnderAPlaceholderTargetIsRepairedAndKeptAlive (0.15s)
    manager_test.go:2508:
        Error:      Should be true
        Messages:   D8: a live muster-<id> under a placeholder target must be kept alive, not swept
    manager_test.go:2509:
        Error:      Not equal:
                    expected: "muster-1:@0"
                    actual  : ""
        Messages:   the placeholder target must be repaired from tmux
    manager_test.go:2513:
        Error:      Not equal:
                    expected: "muster-1:@0"
                    actual  : ""
        Messages:   the repair must be persisted, not just in memory
    manager_test.go:2514:
        Error:      Should be true
--- FAIL: TestReconcile_AliveFalseRowWithALiveMusterSessionIsRevivedNotSwept (0.14s)
    manager_test.go:2555:
        Error:      Should be true
        Messages:   D9: the row must not be deleted while its pane is live
--- FAIL: TestReconcile_AliveRowWithAStaleWindowTargetIsRepairedNotMarkedEnded (0.15s)
    manager_test.go:2598:
        Error:      Should be true
        Messages:   D10: a live owning tmux session must not be marked ended over a stale window id
    manager_test.go:2599:
        Error:      Expected nil, but got: time.Date(2026, time.September, 14, 18, 58, 34, ...)
    manager_test.go:2600:
        Error:      Not equal:
                    expected: "muster-1:@0"
                    actual  : "muster-1:@999999"
        Messages:   the stale window target must be repaired to the real one
--- FAIL: TestEnd_AlreadyGoneTmuxSessionIsSuccessNotError (0.15s)
    manager_test.go:2629:
        Error:      Received unexpected error:
                    ending session 1: tmux kill-session "muster-1": exit status 1: no server running on /var/folders/.../muster-tmuxtest-.../tmux.sock
        Messages:   D12/REQ-6: an already-gone tmux session must be treated as a successful kill, never an error
--- FAIL: TestEnd_ConcurrentEndsProduceExactlyOneMarkEndedAndNeverAKillError (0.15s)
    manager_test.go:2686:
        Error:      Not equal:
                    expected: 0
                    actual  : 1
        Messages:   D14/REQ-11+REQ-6: neither concurrent End call may surface a raw kill error
--- FAIL: TestMarkEnded_APersistFailureLeavesTheInMemorySessionAliveMatchingTheDB (0.01s)
    manager_test.go:2728:
        Error:      Should be true
        Messages:   D16: a failed persist must roll the in-memory flip back so memory and the DB never disagree
    manager_test.go:2729:
        Error:      Expected nil, but got: time.Date(2026, time.September, 14, 18, 58, 34, ...)
--- FAIL: TestCheckLiveness_ListSessionsFailureLeavesSessionsAsIsDespitePaneExistsFalse (0.02s)
    manager_test.go:2766:
        Error:      Should be true
        Messages:   D17/REQ-16: a server-level ListSessions failure must be treated as transient, never as grounds to mark the session dead
    manager_test.go:2767:
        Error:      Expected nil, but got: time.Date(2026, time.September, 14, 18, 58, 34, ...)
FAIL
FAIL	github.com/Zalaras/muster/internal/session	6.519s
```

Guardrails confirmed still passing, unamended (`go test ./internal/session/... -run
'TestReconcile_ReportsUnknownMusterSessionsWithoutCreatingRows|TestRemove_EndsAnAliveSessionFirstAndLeavesTheRowOnAFailingKill'
-v`):

```
--- PASS: TestReconcile_ReportsUnknownMusterSessionsWithoutCreatingRows (0.01s)
--- PASS: TestRemove_EndsAnAliveSessionFirstAndLeavesTheRowOnAFailingKill (0.01s)
    --- PASS: TestRemove_EndsAnAliveSessionFirstAndLeavesTheRowOnAFailingKill/successful_kill_removes_the_row_and_fires_OnRemoved (0.00s)
    --- PASS: TestRemove_EndsAnAliveSessionFirstAndLeavesTheRowOnAFailingKill/a_failing_kill_leaves_the_row_and_never_fires_OnRemoved (0.00s)
PASS
```

### Isolated verification (scratch copy + throwaway stub, not part of the deliverable)

Store watermark test, with a throwaway `MinID` field added to a private copy of
`internal/store/session.go` and reverted immediately after (`git diff` on the real tree confirmed
clean before and after):

```
--- FAIL: TestInsertSession_AllocatesAboveHighestExistingIDAndWritesWatermark (0.01s)
    session_test.go:144:
        Error:      Should be true
        Messages:   REQ-1: InsertSession must persist the id watermark
```

`internal/tmux` and `internal/server` tests, run in a scratch copy of the repo (never the real
working tree) with a throwaway stub file (`ErrSessionExists`, `ParseSessionName`,
`Client.MaxSessionID`) added and then deleted along with the whole scratch copy:

```
--- FAIL: TestNewNamedSession_ApplyServerOptionsFailureLeavesNoSessionAndReturnsTheOriginalError (0.06s)
    Error: []string{"muster-3659527566"} should not contain "muster-3659527566"
    Messages: D6/REQ-5: a session created just before a fatal applyServerOptions failure must not be leaked
--- FAIL: TestMaxSessionID_ReturnsTheHighestIDAcrossBothClaudeAndShellSessionNames (0.15s)
    Error: Not equal: expected: 9 / actual: 0
    Messages: the shell session's id must count toward the floor too
--- FAIL: TestParseSessionName (0.00s)
    Error: Should be true
--- FAIL: TestNewNamedSession_DuplicateNameWrapsErrSessionExists (0.14s)
    Error: Target error should be in err chain: expected "stub: duplicate session" in chain "tmux new-session: exit status 1: duplicate session: muster-3925916050"
    Messages: REQ-4: a duplicate-session tmux failure must be wrapped as ErrSessionExists
--- FAIL: TestKillSession_RemovesTheWholeSessionIdempotentForAnUnknownName (0.14s)
    Error: killing an unknown session name must error -> now expects NoError, got exit status 1
    Messages: REQ-6: killing an already-gone session name must be treated as a successful kill
--- FAIL: TestHandleCreateSession_OrphanedTmuxSessionDoesNotBlockLaunch (0.19s)
    Error: Not equal: expected: 201 / actual: 500
    Messages: D3/#26: an orphaned muster-1 must never wedge every future launch
--- FAIL: TestLauncher_ProbesMaxSessionIDAndDegradesToFloorZeroOnError (0.04s)
    Error: "0" is not greater than or equal to "1"
    Messages: REQ-7: Launch must probe MaxSessionID (and tolerate its failure) before CreateSession
--- FAIL: TestLauncher_RetriesOnceOnASingleErrSessionExistsThenSucceedsWithAHigherID (0.04s)
    Error: Expected nil, but got: &server.launchError{status:500, code:"launch_failed", message:"spawning tmux session: stub: duplicate session"}
    Messages: REQ-7: a single collision must be retried transparently, never surfaced to the caller
--- FAIL: TestLauncher_ExhaustsThreeAttemptsOnRepeatedErrSessionExists (0.05s)
    Error: "spawning tmux session: stub: duplicate session" does not contain "muster-" (see note above: real ErrSessionExists text will)
    Error: Not equal: expected: 3 / actual: 1
    Messages: D5: exactly three attempts before giving up
--- FAIL: TestHandleRemoveSession_FailingEndLeavesTheShellRunningAndTheRowPresent (0.17s)
    Error: Should be true
    Messages: D15/REQ-13: a failed Remove must leave the shell tmux session running
```

`TestMaxSessionID_NoServerReturnsZero` and `TestMaxSessionID_IgnoresNonMusterSessions` passed
against the stub (see "Isolated verification of compile-blocked tests" above for why that's not a
concern — the stub trivially satisfies a `(0, nil)`-shaped contract either way).

## D6's oracle (package-var swap, not an invented seam)

`TestNewNamedSession_ApplyServerOptionsFailureLeavesNoSessionAndReturnsTheOriginalError`
(`internal/tmux/tmux_test.go:379`) forces the `applyServerOptions` post-create failure branch
deterministically by swapping the package-level `serverOptions` var (`tmux.go:89`) for a bogus
option under `t.Cleanup`, then calling `NewNamedSession` on a fresh per-test socket (`freshServer`
true, so the branch actually runs) — no implementation seam invented, since `tmux_test.go` is
`package tmux` and already has access to the unexported var.

Verified the bogus option genuinely makes `tmux set-option` exit non-zero on the installed tmux
(3.7b) before relying on it, run directly against a scratch socket outside the test:

```
$ tmux -S /tmp/tmux-verify-d6/tmux.sock set-option -g not-a-real-tmux-option nonsense
invalid option: not-a-real-tmux-option
exit=1
$ tmux -S /tmp/tmux-verify-d6/tmux.sock list-sessions
verifyd6: 1 windows (created ...)   # the session itself is untouched by the failing set-option
```

No `t.Parallel()` appears anywhere in `internal/tmux/tmux_test.go` (checked the whole file), so
this test's `serverOptions` mutation cannot race the neighbouring fresh-server-option tests
(`TestNewSession_AppliesServerOptionsOnFreshServer`,
`TestNewSession_AppliesServerOptionsOnlyOnceOnAnAlreadyRunningServer`) — none of the three opt
into parallel execution, and I made no changes to any of them.

**The other post-create branch** (`tmux.go:132-135`, `len(fields) != 2` on `new-session`'s own
`-F "#{window_id} #{pane_id}"` output) is **not deterministically forceable** and is covered by
inspection only, not by a red test: the format string is hard-coded inside `NewNamedSession`
itself (no seam), and tmux's `window_id`/`pane_id` formats are always single whitespace-free
tokens (`@N`, `%N`) — there is no environment-level way to make a successful `new-session` print
anything other than exactly two fields without modifying the implementation's own format string
(not permitted) or tmux's own internals. D6's stated acceptance criterion
("`NewNamedSession` whose `applyServerOptions` fails leaves no session ... and returns the
original error") only names the `applyServerOptions` branch, which is fully covered above; the
field-count branch is mentioned only in the plan's Overview/R3 narrative and REQ-5's
implementation note, not as its own acceptance item.

**Update (post Phase 1):** daemon-impl introduced exactly the shared kill-and-return helper
predicted above — `func (c *Client) killLeakedSession(ctx context.Context, name string)`
(`tmux.go:169-177`), called from both post-create failure branches. It's unexported and
`tmux_test.go` is in-package, so it needed no seam:
`TestKillLeakedSession_RemovesAnExistingSessionAndIsANoOpForAnUnknownName` calls it directly,
asserting it actually removes an existing session and is a silent no-op (no panic, no hang) for a
name nothing ever created — see the "Update — Phase 1 landed" section above for the passing
output. The field-count branch's own trigger is still not independently forceable (the reasoning
above is unchanged), but the cleanup behaviour it relies on is now directly tested rather than
merely inspected.

## Notes on the plan

Nothing in the plan proved unimplementable as specified. One clarification worth flagging for
daemon-impl: D5's message assertion (`assert.Contains(t, lerr.message, "muster-", ...)`) depends on
`NewNamedSession`'s existing stderr-wrapping behaviour (`tmux.go:130`, `"tmux new-session: %w"`)
continuing to carry the session name through `ErrSessionExists` — REQ-4 says the sentinel wraps the
stderr as `%w`, so as long as that's `fmt.Errorf("...%w", err)` rather than replacing it outright,
the name survives into the launcher's `launchFailed(fmt.Sprintf("spawning tmux session: %v", err))`
message for free.

## Update — Review cycle 1 (commit `d622db7`, needs-changes): D20–D23

Review found 2 Criticals and 4 Majors. Majors 3 (unbounded contexts under the per-id lock) and 4
(`writeSettings` not atomic) go straight to daemon-impl — no timing-dependent test, per the lead's
instruction. The four testable findings below are red, each confirmed for the stated reason with
the rest of the suite unaffected (`go test ./...` afterward: exactly these four fail, everything
else — every D1–D19 test, both remaining guardrails, the whole rest of the tree — still green;
`go build ./...` and `go vet ./...` clean).

### D20 — Critical 1: `PaneExists` conflates "not there" with "couldn't ask"

`TestKillSession_UnreachableSocketReturnsAnErrorWhileTheSessionIsStillAlive`
(`internal/tmux/tmux_test.go:571`). Lifted the reviewer's own repro almost verbatim: spawn
`muster-N` on a per-test socket the test manages itself (not `tmuxtest.Socket(t)` — see the test's
own doc comment for why), `chmod 000` the socket file, call `KillSession`, then a direct
`PaneExists`. Skips under `os.Geteuid() == 0` (root can still read a chmod-000 file, which would
invert the assertions). `t.Cleanup` restores `chmod 700` before `kill-server`, registered after the
`chmod 000` so LIFO ordering runs it first — no leaked tmux server (verified: `ps aux | grep "tmux
-S"` and the scratch directory both empty after the full suite run).

```
=== RUN   TestKillSession_UnreachableSocketReturnsAnErrorWhileTheSessionIsStillAlive
    tmux_test.go:596:
        Error:      An error is expected but got nil.
        Messages:   D20/Critical 1: an unreachable socket must not read as a successful kill
    tmux_test.go:599:
        Error:      An error is expected but got nil.
        Messages:   D20/Critical 1: PaneExists must surface a couldn't-ask failure as an error, not (false, nil)
--- FAIL: TestKillSession_UnreachableSocketReturnsAnErrorWhileTheSessionIsStillAlive (0.15s)
```

Both assertions fail (as intended — the whole point is both are currently broken) and the sanity
check at the end (the session is still listed once access is restored) passes, confirming the
failure is exactly the collapse the review describes, not a test bug. 5/5 stable under repeat runs
before committing.

Note for whoever routes the fix: this is filed `[orchestrator:decision]` in the review (Option A —
close the gap with a stable `error connecting` stderr match vs Option B — accept the gap and correct
REQ-6/the ADR instead). I wrote the test to the letter of what was asked (assert `KillSession` and
`PaneExists` both error) without pre-judging which option wins; if Option B is chosen, this test's
assertions would need to flip along with the docs, which isn't my call.

### D21 — Critical 2: `not_resumable`'s message doesn't name which cause applies

`TestLauncher_Resume_NotResumableMessageNamesWhichCauseApplies`
(`internal/server/sessions_test.go:345`). One test, both causes (an alive session; a dead session
that never bound a `claudeSessionId`, produced via `mgr.End` on a manager with no
SessionKiller/PaneChecker configured, which routes straight to `markEnded` — no tmux needed).
Doesn't pin exact prose per the lead's instruction — asserts the two messages differ, and that only
the alive-cause one mentions "alive":

```
=== RUN   TestLauncher_Resume_NotResumableMessageNamesWhichCauseApplies
    sessions_test.go:387:
        Error:      Should not be: "session is alive or has no resumable claude session id"
        Messages:   D21/Critical 2: the two not_resumable causes must produce different messages
    sessions_test.go:390:
        Error:      "session is alive or has no resumable claude session id" should not contain "alive"
        Messages:   the no-claudeSessionId message must not also claim the session is alive
--- FAIL: TestLauncher_Resume_NotResumableMessageNamesWhichCauseApplies (0.01s)
```

Both fail because both causes return the identical shared string today — exactly REQ-17's missing
split.

### D22 — Major 1: an unparseable muster-prefixed name is silently dropped, not reported

`TestReconcile_ReportsAndLogsAMusterPrefixedNameMatchingNeitherShapeAsUnknown`
(`internal/session/manager_test.go:967`). Mirrors the existing (unamended)
`TestReconcile_ReportsUnknownMusterSessionsWithoutCreatingRows` guardrail's `bytes.Buffer` logger
pattern exactly, for `"muster-99999-foreign"` — the review's own repro name — with no known rows at
all.

```
=== RUN   TestReconcile_ReportsAndLogsAMusterPrefixedNameMatchingNeitherShapeAsUnknown
    manager_test.go:979:
        Error:      Not equal:
                    expected: []string{"muster-99999-foreign"}
                    actual  : []string(nil)
        Messages:   D22: a muster-prefixed name matching neither shape must still be reported unknown
    manager_test.go:983:
        Error:      "{\"level\":\"info\",\"kept_alive\":0,\"marked_ended\":0,\"swept\":0,\"shells_killed\":0,\"message\":\"reconciled sessions\"}\n" does not contain "unknown muster tmux session on socket; not adopted"
        Messages:   D22: it must be warn-logged, not just silently ignored
    manager_test.go:985:
        Error:      ... does not contain "\"tmux_session\":\"muster-99999-foreign\""
        Messages:   the warn line must name the specific unknown session
--- FAIL: TestReconcile_ReportsAndLogsAMusterPrefixedNameMatchingNeitherShapeAsUnknown (0.01s)
```

The log capture shows only the ordinary `"reconciled sessions"` info line — `classifyTmuxNames`'s
`continue` really does drop the name before it ever reaches the report or the logger.

### D23 — Major 2: `handleEndSession`'s 500 path still closes the terminal socket

`TestHandleEndSession_FailingKillLeavesTheTerminalSocketOpen`
(`internal/server/sessions_test.go:608`). Reuses D15's `errKiller` double for a genuine kill
failure. Needed a real `coder/websocket` connection (`terminalConn.ws` is a concrete
`*websocket.Conn`, not an interface, so no fake can stand in for it) registered via a real HTTP
server hosting `sessionsFeature` + `terminalFeature` on a bare mux — `server.New` can't be used here
since it always wires the manager's `SessionKiller` from a real `tmux.Client`, never from an
override, so the pieces are built by hand instead (same shape as D15's test). Asserts on the
registry's own map state directly (`terminalConnFor`, in-package) rather than a network-observed
close, for a fully deterministic check with no bounded-wait guessing.

One iteration note: the first version of this test took 5.02s per run — `conn.ws.Close()` (called
by `closeSession`) performs a graceful close handshake and was blocking on an ack from a client that
never read anything. Added a background goroutine draining `c.Read` throughout, matching what
`readUntilError` does elsewhere in this file for the same reason; the test now runs in ~0.01–0.15s.
10/10 stable under `-race` with zero data races before committing.

```
=== RUN   TestHandleEndSession_FailingKillLeavesTheTerminalSocketOpen
    sessions_test.go:667:
        Error:      Not same:
                    expected: &server.terminalConn{ws:(*websocket.Conn)(0x...), bridge:(*server.fakePaneConn)(0x...)} (*server.terminalConn)(0x...)
                    actual  : (*server.terminalConn)(nil) (*server.terminalConn)(0x0)
        Messages:   D23/REQ-13: a failed End must leave the terminal socket exactly as it was, never closed
--- FAIL: TestHandleEndSession_FailingKillLeavesTheTerminalSocketOpen (0.01s)
```

`before` is the registered connection captured right after the WS handshake; `after` is `nil` —
`handleEndSession`'s `default` branch really does call `closeSession(id)` on a genuine failure, same
as it does on success, contradicting REQ-13.

### Full-suite confirmation

```
--- FAIL: TestLauncher_Resume_NotResumableMessageNamesWhichCauseApplies (0.01s)
--- FAIL: TestHandleEndSession_FailingKillLeavesTheTerminalSocketOpen (0.01s)
FAIL	github.com/Zalaras/muster/internal/server	24.418s
--- FAIL: TestReconcile_ReportsAndLogsAMusterPrefixedNameMatchingNeitherShapeAsUnknown (0.01s)
FAIL	github.com/Zalaras/muster/internal/session	4.301s
--- FAIL: TestKillSession_UnreachableSocketReturnsAnErrorWhileTheSessionIsStillAlive (0.15s)
FAIL	github.com/Zalaras/muster/internal/tmux	10.521s
```

Every other package: `ok`. No leaked tmux sockets or server processes after the full run
(`ps aux | grep "tmux -S"` and the scratch temp dirs both empty).

## Update — Review cycle 2 (commit `060e0e3`, needs-changes): D24–D26

Cycle 1's four fixes landed (`6d0ccd8`) and D20–D23 all now pass unmodified (confirmed in the full
run below) — this cycle's three testable findings are new gaps the fix itself exposed or left open.
The Minor (per-id lock still held across unbounded tmux I/O on the Launch/Resume arms) goes straight
to daemon-impl per the lead's instruction — no timing-dependent test.

### D24 — Critical: `isConnectionFailure` matches EACCES's wording only, not EPERM's

`TestIsConnectionFailure` (`internal/tmux/tmux_test.go:627`) tests the unexported predicate
directly — in-package, no seam needed — against synthetic error strings rather than trying to
reproduce a sandboxed EPERM denial through a real tmux process (fragile, environment-dependent,
per the lead's instruction). The three negative cases are not guessed: measured directly against
the real installed tmux binary before writing the test (a nonexistent socket path, a plain file at
the socket path, and a real socket whose server had already exited), matching exactly the three
wordings the reviewer's own scratch-copy experiment found breaking when the predicate was widened
to bare `"error connecting to"`.

```
$ tmux -S <nonexistent> list-sessions
error connecting to <path> (No such file or directory)
$ touch <path>; tmux -S <path> list-sessions
error connecting to <path> (Socket operation on non-socket)
$ tmux -S <path> new-session -d ...; tmux -S <path> kill-server; tmux -S <path> list-sessions
no server running on <path>
```

```
=== RUN   TestIsConnectionFailure/EPERM_wording_must_also_match_(D24:_sandboxed_denial,_review_cycle_2_Critical)
    tmux_test.go:661:
        Error:      Not equal:
                    expected: true
                    actual  : false
--- FAIL: TestIsConnectionFailure (0.00s)
    --- PASS: TestIsConnectionFailure/EACCES_wording_matches_(already_guarded_by_D20) (0.00s)
    --- FAIL: TestIsConnectionFailure/EPERM_wording_must_also_match_(D24:_sandboxed_denial,_review_cycle_2_Critical) (0.00s)
    --- PASS: TestIsConnectionFailure/no_socket_file_at_all_must_not_match_—_the_ordinary_no-server-yet_reading (0.00s)
    --- PASS: TestIsConnectionFailure/a_non-socket_file_at_the_path_must_not_match_—_a_fixture_defect,_not_a_live_server (0.00s)
    --- PASS: TestIsConnectionFailure/a_real_socket_whose_server_already_exited_must_not_match (0.00s)
```

Exactly the shape asked for: only the EPERM case fails; the EACCES positive and all three
negatives already pass, pinning them so a future widening of the match breaks visibly here first.

### D25 — Major: `ListSessions` collapses the same failure, at the worst call site

`TestListSessions_UnreachableSocketReturnsAnErrorWhileASessionIsStillAlive`
(`internal/tmux/tmux_test.go:675`). Same shape as D20/D24: reuses D20's self-managed-socket-dir
pattern (not `tmuxtest.Socket`, whose cleanup would fail against a still-chmod'd-000 socket and
leak the server), chmod 000, LIFO-ordered restore-then-kill-server cleanup, skipped under root.

```
=== RUN   TestListSessions_UnreachableSocketReturnsAnErrorWhileASessionIsStillAlive
    tmux_test.go:700:
        Error:      An error is expected but got nil.
        Messages:   D25/Major: an unreachable socket must not read as an empty session list
--- FAIL: TestListSessions_UnreachableSocketReturnsAnErrorWhileASessionIsStillAlive (0.13s)
```

The `Empty(names)` and final sanity (session alive once access restored) assertions both pass —
isolating the failure to exactly `ListSessions` returning `(nil, nil)` instead of an error. 3/3
stable on repeat before committing.

### D26 — Major: Reconcile must act on nothing when it cannot enumerate the socket

`TestReconcile_ListSessionsFailureActsOnNothing` (`internal/session/manager_test.go:1004`). Built
one alive row and one not-alive row, a `fakeKiller` with `setListErr` (already supported the
concurrency-lock work needed it before) and a `fakePaneChecker` erroring for the alive row's target
too — modelling the socket as genuinely, entirely unreachable, not just `ListSessions` failing in
isolation.

```
=== RUN   TestReconcile_ListSessionsFailureActsOnNothing
    manager_test.go:1042:
        Error:      Should be true
        Messages:   D26: a not-alive row must not be deleted when the socket cannot be enumerated
--- FAIL: TestReconcile_ListSessionsFailureActsOnNothing (0.01s)
```

Only the not-alive-row assertion fails. The alive-row assertion (`aliveAfter.Alive == true`) already
passes today — `classifySessions`'s alive branch does consult `PaneChecker` and leaves a row as-is
on a check error, so that half was never broken — asserted anyway per
`kb:lesson/invariant-missed-by-per-transition-tests`: the reviewer's own trap warning ("do not let
it fall through to `classifySessions`... that is the original bug") is exactly the kind of
never/always claim that needs checking from every reachable state, not just the one that happens to
be broken. Reconcile's fallback on a `ListSessions` error warn-logs and calls `classifySessions`
(the pre-REQ-9 function) unconditionally, whose `if !r.alive { toSweep = append(...); continue }`
sweeps every not-alive row with no pane check and no tmux call at all — reachable again through
this exact fallback path. 3/3 stable on repeat before committing.

### Full-suite confirmation

```
ok  	github.com/Zalaras/muster/internal/server	26.005s
--- FAIL: TestReconcile_ListSessionsFailureActsOnNothing (0.01s)
FAIL	github.com/Zalaras/muster/internal/session	3.137s
--- FAIL: TestIsConnectionFailure (0.00s)
--- FAIL: TestListSessions_UnreachableSocketReturnsAnErrorWhileASessionIsStillAlive (0.13s)
FAIL	github.com/Zalaras/muster/internal/tmux	10.103s
```

`internal/server` — including all four of cycle 1's D20/D21/D22/D23 tests — is now fully green,
confirming cycle 1's fixes hold. Every other package: `ok`. `go build ./...` and `go vet ./...`
clean; no leaked tmux sockets or server processes after the run.
