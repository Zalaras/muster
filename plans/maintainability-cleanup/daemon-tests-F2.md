# Daemon Tests: Maintainability Cleanup — F2 server concurrency

**Plan**: maintainability-cleanup
**Unit**: F2 (daemon track, server concurrency)
**Verdict**: pass
**Pack**: `kb: pack 67323 words (budget 8000)` — WARN over budget; read `plan.md` § Units →
F2, `daemon-implementation-F2.md`, `review.maintainability.b-server.md` (Critical 1, Major
2, Major 3, Minor 10, Minor 11 in full) and `docs/conventions.md` § Testing/§ Design
directly per the spawn prompt.

## Summary

Tests created: 6 new top-level tests (plus 6 keyedlock package tests) across 6 new files.
Passing: all 12. Failing: 0.

Every one of `daemon-implementation-F2.md`'s five interleavings is covered by a test that
fails on the pre-fix code and passes on the fix — verified for each by temporarily
restoring the pre-F2 version of the touched implementation file (`git show HEAD:<path>` in
place, since F2's changes are uncommitted, so `HEAD` == pre-F2), running the new test 2-3
times to confirm a *reliable* (not flaky) failure, capturing the output, then restoring the
saved F2 copy and byte-diffing it back against that copy to confirm the restore was exact.
`internal/keyedlock` is a new package with its own small table/concurrency test suite
(`internal/session`'s existing suite exercises `LockSession` only incidentally through
End/Remove/Resume tests, never `keyedlock.Locks` directly, so it needed its own).

One interleaving (Major 3) needed a materially different assertion than the plan's own
"B has not returned yet" framing once I actually measured it — see Interleaving 3 below for
why, and for the reliably-failing replacement.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/keyedlock/keyedlock_test.go` | `TestLocks_ZeroValueIsReadyToUse` | zero value needs no constructor | pass |
| `internal/keyedlock/keyedlock_test.go` | `TestLocks_SameKeySerializes` | same key never lets two callers run concurrently (race-detector-backed) | pass |
| `internal/keyedlock/keyedlock_test.go` | `TestLocks_DifferentKeysDoNotBlock` | one key's held lock never delays another key | pass |
| `internal/keyedlock/keyedlock_test.go` | `TestLocks_SecondLockOnHeldKeyBlocksUntilReleased` | same key does actually serialise (mirror of the above) | pass |
| `internal/keyedlock/keyedlock_test.go` | `TestLocks_ForgetThenLockAgainSucceeds` | Forget's documented intended use (reused key id starts clean) | pass |
| `internal/keyedlock/keyedlock_test.go` | `TestLocks_ConcurrentLockAndForgetOnDifferentKeysNeverPanics` | map-mutating half under concurrent unrelated traffic, many keys | pass |
| `internal/server/prefs_concurrency_test.go` | `TestHandlePutPrefs_ConcurrentSingleFieldPUTsAllLand` | Critical 1: 7 concurrent single-field PUTs (one per field) from a shared start gate all land | pass |
| `internal/server/prefs_concurrency_test.go` | `TestHandlePutPrefs_ConcurrentPUTsAllReachTheBroadcastToo` | Critical 1 on the broadcast side: 2 concurrent PUTs' fields both survive in the final persisted+broadcast object | pass |
| `internal/server/terminal_registry_lock_test.go` | `TestTerminalRegistry_WatchedNeverBlocksOnAnInFlightTakeoverClose` | Major 2: `Watched` returns within 200ms while a takeover is stuck in a gated `bridge.Close()` | pass |
| `internal/server/shell_remove_lock_test.go` | `TestHandleCreateShell_BlocksConcurrentRemoveUntilEnsureCompletes` | Major 3: the session row cannot be removed while `handleCreateShell` holds `session.Manager`'s per-id lock inside `Ensure`; Remove completes and `shells.Kill` cleans up once released | pass |
| `internal/server/wshub_closeall_test.go` | `TestWSHub_CloseAllDoesNotBlockBroadcastOnASlowPeer` | Minor 10: `broadcast`/`add`/`remove` return promptly while `closeAll` is stuck in a slow peer's ~5s close handshake | pass |
| `internal/server/updatemanager_stop_test.go` | `TestUpdateManager_StopCancelsAndBoundedWaitsForInFlightApply` | Minor 11: `Stop` cancels an in-flight `RequestApply` and the apply records itself `failed`, not left mid-flight | pass |

## Interleavings — what was proven, and how

### 1. Critical 1 (prefs lost update)
`TestHandlePutPrefs_ConcurrentSingleFieldPUTsAllLand` fires 7 goroutines from a shared
start-gate channel, each PUTing a distinct field (`view`, `density`, `usageModel`,
`railSort`, `theme`, `railDensity`, `railActivity`), then asserts the final `loadPrefs`
object carries every field's new value.
`TestHandlePutPrefs_ConcurrentPUTsAllReachTheBroadcastToo` repeats the shape against a
connected WS socket and asserts the persisted object (not any single broadcast frame, since
the two PUTs' broadcast order isn't fixed) carries both fields.

No injectable seam exists in `prefs.go` to force the interleaving deterministically (unlike
the other four, which gate a fake/real I/O call) — the race is proven by real concurrent
goroutines hitting real SQLite through `f.mu`'s absence pre-fix. Re-run 5× against the
restored pre-fix `prefs.go`: failed 5/5 (not flaky). Dropped an earlier, weaker 5-round/10-way
variant from this file before finalizing — it passed by luck on the very run I checked it
against pre-fix code (scheduling-dependent, not forced), so it wasn't pulling its weight per
the "forced, not timing-dependent" bar; the two tests kept here reliably reproduce the bug.

Pre-fix failure (restored `git show HEAD:internal/server/prefs.go`), captured verbatim:
```
=== RUN   TestHandlePutPrefs_ConcurrentSingleFieldPUTsAllLand
    prefs_concurrency_test.go:33: Not equal: expected: "tiles" actual: "focus"
    prefs_concurrency_test.go:34: Not equal: expected: "3x2" actual: "2x2"
    prefs_concurrency_test.go:36: Not equal: expected: "attention" actual: "manual"
    prefs_concurrency_test.go:37: Not equal: expected: "dark" actual: "follow"
    prefs_concurrency_test.go:38: Not equal: expected: "compact" actual: "comfortable"
    prefs_concurrency_test.go:39: Not equal: expected: "both" actual: "turn"
--- FAIL: TestHandlePutPrefs_ConcurrentSingleFieldPUTsAllLand (0.14s)
=== RUN   TestHandlePutPrefs_ConcurrentPUTsAllReachTheBroadcastToo
    prefs_concurrency_test.go:107: Not equal: expected: "tiles" actual: "focus"
        Messages: Critical 1: a concurrent sibling PUT must never erase this PUT's field
--- FAIL: TestHandlePutPrefs_ConcurrentPUTsAllReachTheBroadcastToo (0.13s)
```
Post-fix (restored F2 `prefs.go`): both pass, `go test -race` clean, 5/5 runs.

### 2. Major 2 (lock order / `Watched` blocking on a takeover)
`TestTerminalRegistry_WatchedNeverBlocksOnAnInFlightTakeoverClose` drives
`terminalRegistry.takeover` and `.Watched` directly (no HTTP handler needed — both are
package-internal and already exercised this way by `terminal_rail_test.go`'s existing
`TestTerminalRegistry_Watched`). A `gatedCloseConn` (fake `paneConn`) blocks inside `Close`
until released, signalling `entered` first; the registered "old" and replacement "new"
connections both need a real, non-nil `*websocket.Conn` for their `ws` field (`takeover`
calls `old.ws.Close(...)` directly, which panics on a fabricated/nil value) — `dialRealWSConn`
gets one from a throwaway `httptest.Server` running `websocket.Accept` + `CloseRead` (the
`CloseRead` matters: without it the *test's own* `old.ws.Close()` call would itself block on
coder/websocket's internal 5s close-handshake timeout before `terminalRegistry` code is even
reached, confounding the bound below regardless of the fix).

Once the takeover goroutine is confirmed stuck in `oldBridge.Close()`, `Watched` is called
from a second goroutine and must return within 200ms.

Pre-fix (restored `git show HEAD:internal/server/terminal.go` — single shared `mu` across
the whole evict-then-attach), captured verbatim, reliably 3/3 runs:
```
=== RUN   TestTerminalRegistry_WatchedNeverBlocksOnAnInFlightTakeoverClose
    terminal_registry_lock_test.go:130: Major 2 regression: Watched blocked on an in-flight takeover's stuck Close
--- FAIL: TestTerminalRegistry_WatchedNeverBlocksOnAnInFlightTakeoverClose (0.21s)
```
Post-fix (`keyLocks` + separate `mu`): passes in ~0.01s (`Watched` returns immediately, as
expected — the map entry is between evict and attach at that point, so `false` is the
correct answer; the test asserts that specific value too, not just "returned in time").

### 3. Major 3 (shell spawned after Remove) — assertion changed from the plan's framing
The plan's Interleaving 3 says to assert "B [the DELETE] has not returned yet" while A
[the shell POST] is blocked inside `Ensure`'s gated `PaneExists`. I built exactly that first,
using `newFakeTmuxTestServer`'s fake tmux — and it passed on **both** pre-fix and post-fix
`shells.go`, which is a false pass, not evidence of the fix. Root cause, found by adding
elapsed-time logging: `handleRemoveSession`'s own HTTP response only returns once it has
*also* called `f.shells.Kill(id)` (sessions.go, after `manager.Remove` succeeds), and `Kill`
serialises on `shellRegistry`'s **own**, unrelated per-id lock — the exact one `Ensure` is
already holding while blocked in the gate. So the whole DELETE handler "hasn't returned yet"
for the same span both pre- and post-fix, for a reason Major 3's fix does nothing about —
not a discriminating check at all. Measured directly: with the gate held, a *bare* DELETE
(no concurrent shell POST) against the same setup completes in ~57ms; the confounded
combined scenario took ~465ms, all of it spent stuck in `shells.Kill`, not in `manager.Remove`.

Fixed by asserting the thing the fix actually changes: `srv.manager.Exists(sess.ID)`, polled
every 10ms across a 300ms window while `Ensure` is gated. Pre-fix, `handleCreateShell` holds
no `session.Manager` lock at all, so `manager.Remove` (independent of `shellRegistry`'s lock)
deletes the row almost immediately — the poll catches this well inside the window. Post-fix,
`manager.Remove` cannot even acquire the lock `handleCreateShell` is holding, so the row must
survive the whole window. This also needed a real per-test tmux socket
(`tmuxtest.Socket`), not `newFakeTmuxTestServer`'s fake: that helper's own doc comment warns
its fake is disconnected from `session.Manager`'s own `PaneChecker`/`TmuxSessions` ports,
which are *always* a real (if normally untouched) `tmux.Client` bound to `Config.TmuxSocket`
— and this test's DELETE goroutine reaches `Manager.Remove`'s End path, which calls those
ports for real. `gatedPaneExistsTmux` wraps the real per-socket `tmux.Client` (embedding the
`paneSpawner` interface, overriding only `PaneExists`) so gating only touches the shell
target `Ensure` checks, while `Manager`'s own tmux calls stay on the same working socket.

Pre-fix (restored `git show HEAD:internal/server/shells.go`), captured verbatim, reliably
3/3 runs:
```
=== RUN   TestHandleCreateShell_BlocksConcurrentRemoveUntilEnsureCompletes
    shell_remove_lock_test.go:135: Major 3 regression: the session row was removed while handleCreateShell still held session.Manager's per-id lock inside Ensure
--- FAIL: TestHandleCreateShell_BlocksConcurrentRemoveUntilEnsureCompletes (0.30s)
```
Post-fix: passes, ~0.65-1.0s (mostly the real tmux spawn/kill round trips), 3/3 runs,
`go test -race` clean. Confirms the full sequence: the row survives while gated, `Ensure`
spawns once released (`created:true`), `Remove` then completes and `shells.Kill` removes the
shell `handleCreateShell` just spawned (`PaneExists` on its target eventually reports gone).

### 4. Minor 10 (`wsHub.closeAll` under lock)
`TestWSHub_CloseAllDoesNotBlockBroadcastOnASlowPeer` dials one real client, drains its
hello/snapshot, then simply never reads (or writes) it again — coder/websocket's own 5s
internal close-handshake timeout (`close.go`'s `waitCloseHandshake`) then bounds how long a
server-side `Close` call on that peer takes, with no need for a bespoke blocking transport.
Calls `srv.hub.closeAll()` in one goroutine and, shortly after, `srv.hub.broadcast(...)` in
another; `broadcast` must return within 500ms regardless of `closeAll`'s progress. Also
confirms `closeAll` itself still finishes (bounded at 7s, above the 5s internal timeout) and
that the hub is immediately reusable (a fresh dial straight afterward).

Pre-fix (restored `git show HEAD:internal/server/ws.go` — `closeAll` holds `h.mu` across
every `Close` call), captured verbatim, reliably 3/3 runs:
```
=== RUN   TestWSHub_CloseAllDoesNotBlockBroadcastOnASlowPeer
    wshub_closeall_test.go:61: Minor 10 regression: broadcast blocked on closeAll's slow-peer close handshake
--- FAIL: TestWSHub_CloseAllDoesNotBlockBroadcastOnASlowPeer (0.68-0.70s)
```
Post-fix (map copied out and cleared under the lock, `Close` calls made outside it): passes,
~5.1s (the one slow peer's close handshake still runs to completion, just not under the
lock), 3/3 runs.

### 5. Minor 11 (untracked apply goroutine)
`TestUpdateManager_StopCancelsAndBoundedWaitsForInFlightApply` reuses `update_test.go`'s
existing `fakeOrigin`/`newTestUpdateManager`/`newUpdateTestKey`/`publishRelease` fixtures
rather than a bespoke blocking `RoundTripper`: `origin.hold()` makes every request block
server-side, so `RequestApply`'s non-`skipDownload` path (arranged via `m.available` set,
`m.installed` nil) genuinely blocks inside `selfupdate.Apply`'s HTTP call — and Go's
`net/http` itself aborts a pending request the instant its context is canceled, which is
exactly what the interleaving's "or the request's own context is done" clause asks for,
without writing a fake transport. Waits for the origin to actually receive the request, then
calls `m.Stop` with a 3s-bounded context and asserts (a) `Stop` returns in under 1.5s and (b)
`Current().Apply.Phase` becomes `"failed"` within 2s.

Pre-fix (restored `git show HEAD:internal/server/updatemanager.go` — `Stop` never touches
the apply's context), captured verbatim, reliably 3/3 runs:
```
=== RUN   TestUpdateManager_StopCancelsAndBoundedWaitsForInFlightApply
    updatemanager_stop_test.go:68: Condition never satisfied
        Messages: the canceled apply must record itself failed, never left stuck mid-flight
--- FAIL: TestUpdateManager_StopCancelsAndBoundedWaitsForInFlightApply (2.02s)
```
(Assertion (a), "Stop returns quickly", is trivially true pre-fix too — `Stop` returns
immediately without waiting for anything, which is itself the bug the plan describes; only
assertion (b) discriminates, and it fails as expected.)
Post-fix (`applyCancel`/`applyWG` added, `Stop` cancels then bounded-waits): passes in
~0.02s, 3/3 runs.

## Restore-integrity note

Steps 2-5 each required temporarily replacing an implementation file with its pre-F2
(`HEAD`) content, then restoring it. After every restore I byte-diffed the restored file
against a `cp` backup taken before the swap-dance started, confirming an exact match in all
6 cases (`prefs.go`, `terminal.go`, `shells.go`, `ws.go`, `updatemanager.go`,
`session/manager.go`). Because this is a shared worktree with a concurrent comment-only
sweep (impl-X1d) touching `internal/server`, I flagged to impl-X1d directly that my
temporary overwrite-and-restore could have silently clobbered a concurrent edit to one of
those same files landing inside my test window, and asked them to check — logged here since
it's a process risk this approach carries, not something the diff-back-to-my-own-backup
check can itself catch.

## Test Run Output

```
$ go build ./...
(exit 0)

$ go vet ./...
(exit 0)

$ gofmt -l internal/server internal/session internal/keyedlock
(no output — clean)

$ make lint
golangci-lint run
0 issues.

$ go test -race -count=1 ./internal/server/... ./internal/session/... ./internal/keyedlock/...
ok  	github.com/Zalaras/muster/internal/server	108.513s
ok  	github.com/Zalaras/muster/internal/session	32.074s
ok  	github.com/Zalaras/muster/internal/keyedlock	2.544s
```
