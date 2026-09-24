# Daemon Implementation: Maintainability Cleanup — F2 server concurrency

**Plan**: maintainability-cleanup
**Mode**: initial
**Pack**: `kb: pack` — read `plan.md` § Units → F2, `review.maintainability.b-server.md` Critical 1 / Major 2 / Major 3 / Minor 10 / Minor 11 in full, `docs/conventions.md` § Design, and `daemon-implementation-D5.md`/`-D6.md`/`-D7a.md`/`-D7b.md` for the shapes already landed (`attachAndPump`, `bgLoop`/`boundedwait`, the transport helpers in `respond.go`).

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/keyedlock/keyedlock.go` | created | Shared `Locks[K comparable]` type (Lock/Forget) — the one keyed-lock implementation Major 3 asks for. |
| `internal/session/manager.go` | modified | `Manager.idLocks map[int64]*sync.Mutex` replaced with `locks keyedlock.Locks[int64]`; `LockSession` now a one-line delegate; `removeSessionRecord` calls `m.locks.Forget(id)` instead of `delete(m.idLocks, id)`. Doc comments on `mu`/`writeChain` updated to stop naming the removed field. |
| `internal/server/shells.go` | modified | `shellRegistry.idLocks`+`lockID`'s hand-rolled map replaced with `locks keyedlock.Locks[int64]` (same shared type). `Kill` calls `r.locks.Forget(id)`. `handleCreateShell` now holds `f.manager.LockSession(id)` across its existence check and the `Ensure` call (Major 3's actual race fix — see Decisions). |
| `internal/server/terminal.go` | modified | `terminalRegistry` split into `keyLocks keyedlock.Locks[terminalKey]` (held across the whole evict+attach, same guarantee as before) and `mu sync.Mutex` (now guards only `conns` map reads/writes, never held across `old.ws.Close`/`old.bridge.Close`/`attach`). Fixes Major 2's lock order. |
| `internal/server/prefs.go` | modified | `prefsFeature` gained `mu sync.Mutex`; `handlePutPrefs` holds it from `loadPrefs` through the `KVSet`/broadcast/`SetCheckEnabled` sequence. Fixes Critical 1. |
| `internal/server/ws.go` | modified | `wsHub.closeAll` copies the client map out and clears it under `h.mu`, then closes each socket outside the lock — same pattern as `terminalRegistry.closeAll`. Fixes Minor 10. |
| `internal/server/updatemanager.go` | modified | Added `applyCancel context.CancelFunc` (mu-guarded) and `applyWG sync.WaitGroup`. `RequestApply` derives a cancellable `applyCtx` from the caller's (already-`WithoutCancel`) ctx and tracks the goroutine in `applyWG`. `runApply`'s deferred cleanup calls `cancel()` and `applyWG.Done()`. `Stop` cancels an in-flight apply and bounded-waits on `applyWG` via `boundedwait.Wait`, before the existing `bg.stop`. Fixes Minor 11. |

## Decisions

- **design: `internal/keyedlock`** — new leaf package, no internal imports, matching `internal/boundedwait`'s precedent for a primitive shared across `internal/session` and `internal/server` (session must never import server). `rg -n "idLocks|lockID" internal/server internal/session --glob '!*_test.go'` before this change showed exactly the two hand-rolled copies the review's Major 3 names (`session/manager.go`'s `idLocks`+`LockSession` and `server/shells.go`'s `idLocks`+`lockID`); both now instantiate `keyedlock.Locks[int64]`. `terminalRegistry` (Major 2) reuses the same type for a third, independent purpose (serialising one takeover per attach key) rather than inventing a second per-key-mutex shape — `rg -n "type.*Locks\[" internal` before adding it found nothing.
- **Major 3's actual race fix is at the `shellFeature.handleCreateShell` layer, not inside `shellRegistry`.** Extracting a shared keyed-lock type only fixes the literal code duplication; it does not by itself stop a shell from being spawned after `Remove` (that needs the *same* lock instance as `Manager.Remove`, not merely the same lock *type*). `handleCreateShell` now calls `f.manager.LockSession(id)` — the exact pattern `internal/server/launcher.go:304,358` (`sessionLauncher`, from D7) already uses for Launch/Resume — and holds it across `sessionOr404` + `registry.Ensure`. `session.Manager.Remove` holds that same per-id lock for its entire removal (`internal/session/actions.go:183-187`, unchanged), so: (a) an `Ensure` in flight blocks any concurrent `Remove` from even starting until `Ensure` (including its tmux spawn) has fully finished, and (b) a `Remove` that finishes first is guaranteed visible to the next `handleCreateShell`'s `sessionOr404` (now inside the same lock), which then 404s before ever calling `Ensure`. `shellRegistry.Kill`'s own lock-entry reclaim comment was rewritten to cite this guarantee instead of the old (contradicted) "nothing can contend on it again" reasoning the review quoted.
  - Considered instead: making `shellRegistry.Ensure` take `*session.Manager` directly and re-check `Exists` under its own lock. Rejected — it would change `newShellRegistry`'s constructor signature, breaking all 10 `shellRegistry`-level unit tests in `shells_test.go`/`sessions_test.go` (which construct the registry standalone, deliberately decoupled from any `session.Manager`, per the registry's own doc comment: "a shell has no persistent representation anywhere ... PaneExists is the sole source of truth"). The handler-level fix reuses an existing collaborator (`shellFeature` already holds `f.manager`) and touches no test.
- **`handleCreateShell`'s existing `shell_spawn_failed` 500 mapping is unchanged** — the race this closes was already returning a spawn *success* on old code (the bug), never an error path, so there is no new error branch to map; a session removed before the lock is acquired still 404s via the unchanged `sessionOr404`.
- **`terminalRegistry`'s two-lock split keeps every existing guarantee**: `keyLocks.Lock(key)` is held for the whole evict-then-attach sequence (same as the old single `mu` was), so the old-PTY-torn-down-before-new-attach-starts invariant and the second-evict-can't-race-a-first-attach invariant both still hold, unchanged. `mu` now brackets only the map read/delete before the close and the map write after attach — `Watched`/`release`/`closeSurface`/`closeSession(AndShell)`/`closeAll` are untouched (they only ever needed the map lock).
- **`updateManager.applyCtx`/`applyCancel`/`applyWG` are new state, not reuse of `bgLoop`**: `bgLoop.wg` tracks the *tick loop* goroutine (`Start`/`Stop`), which runs for the manager's whole life; the apply goroutine is a separate, occasionally-running task with its own cancellation point. `rg -n "applyInFlight" internal/server/updatemanager.go` showed the existing boolean already tracks "is one running" for `RequestApply`'s dedup, so the new fields extend that state rather than duplicating it.
- No REQ/wire/behaviour change outside the five races named in the plan's F2 line. No new size warnings (`make size-warn` diffed against the pre-existing 59 hits — none of the touched files/functions appear).

## Interleavings (for daemon-tests — each must FAIL on the pre-fix code)

1. **Critical 1 (prefs lost update).** Two concurrent `PUT /api/prefs`, request A `{"view":"tiles"}` and request B `{"density":"3x2"}`, both issued while stored prefs are still the defaults. Pre-fix: both handlers call `loadPrefs` before either calls `KVSet`, so whichever `KVSet`/broadcast lands last wins with a base object missing the other's field — the final persisted+broadcast object has only one of `view`/`density` changed from default, never both. Post-fix (the `f.mu` critical section spans load→persist→broadcast): drive both requests concurrently (e.g. release two goroutines from a shared start gate) and assert the final `GET`/broadcast `prefs` object has *both* `view:"tiles"` and `density:"3x2"` — a table of N concurrent single-field PUTs (each targeting a distinct field) whose final state must include every field's new value is the general form.

2. **Major 2 (lock order / `Watched` blocking on a takeover).** Give the test's fake `paneConn` (the `attachFunc` seam) a `Close` that blocks on a channel until released. Open a terminal socket for session X (registers normally). Start a second connect for the same key in a goroutine — `takeover` evicts the first, calling the fake's blocking `Close`. While that goroutine is blocked, call `terminalRegistry.Watched(X)` (or drive `session.Manager.Apply` with a `turn_closed` input for a session watched via this registry, which calls `Watched` while holding `Manager.mu`) from the test goroutine and assert it returns within a short bound (e.g. 50ms). Pre-fix: `Watched` needs the same `mu` the takeover holds across the blocked `Close`, so the call blocks until the test releases the gate — the bound assertion fails. Post-fix: `Watched` only needs the brief map-access `mu`, so it returns immediately regardless of the in-flight takeover. Release the gate afterward and confirm the takeover still completes and the new connection is registered.

3. **Major 3 (shell spawned after Remove).** Give the fake `paneSpawner`'s `PaneExists` (called first inside `shellRegistry.Ensure`, for the shell target) a controllable gate: it blocks until released, and only after being asked once. Start `POST /api/sessions/{id}/shell` (goroutine A) — it passes `sessionOr404`, enters `Ensure`, and blocks in `PaneExists`. While A is blocked, start `DELETE /api/sessions/{id}` (goroutine B) concurrently and assert — with a short bound — that B has **not** returned yet (it must be blocked acquiring the same `manager.LockSession(id)` A already holds). Then release A's gate: A's `Ensure` completes (spawns, since the session was still alive when A checked), A responds 200, and only then does B unblock, run `Remove`+`shells.Kill`, and clean up the shell A just spawned. Pre-fix: B is not blocked by anything A holds (A's own lock is `shellRegistry`'s internal per-id lock, unrelated to `Manager`'s), so B's "not returned yet" assertion fails — B completes immediately, and if the test instead releases A's gate only *after* confirming B has fully finished, A's `Ensure` (pre-fix has no existence re-check) spawns a shell for an id `Remove` already deleted, reproducing the review's bug directly (assert no `muster-<id>-shell` tmux session exists / A gets `unknown_session` post-fix vs. a spawned shell pre-fix).

4. **Minor 10 (`wsHub.closeAll` under lock).** Needs a websocket peer whose `Close` handshake can be made to hang (`wsHub.clients` is keyed on the concrete `*coder/websocket.Conn`, not an interface, so this is necessarily a real-connection test, e.g. via `httptest.Server` + a client that stops responding to the close control frame, or a raw `net.Pipe` half that never reads). Register two clients; make client 1's `Close` hang; call `closeAll()` in a goroutine; concurrently call `broadcast()`/`add()`/`remove()` (client 2, or a fresh connect) and assert those return promptly rather than waiting on client 1's stuck handshake. Pre-fix: `closeAll` holds `h.mu` for every `Close` call, so `broadcast`/`add`/`remove` block until client 1's handshake resolves or times out.

5. **Minor 11 (untracked apply goroutine).** Wire `updateManagerConfig.Client` to an `*http.Client` whose `Transport.RoundTrip` blocks until either (a) a test-controlled channel fires, or (b) `req.Context().Done()` fires (return `req.Context().Err()`), and use a config where `RequestApply`'s download path is taken (`skipDownload=false`). Call `RequestApply(ctx, false)` — it blocks inside the fake transport (via `selfupdate.Apply`'s HTTP call). Concurrently call `Stop(shutdownCtx)` with a bounded deadline and assert (a) `Stop` returns within its own budget, and (b) the fake transport observes `req.Context().Done()` shortly after `Stop` is called (proving cancellation reached the in-flight request), then that `Current().Update.Apply.Phase` is `failed`, not left mid-flight. Pre-fix: `Stop` returns immediately without touching the apply's `WithoutCancel` context, so the fake transport's blocked `RoundTrip` never observes cancellation (assertion (b) times out), and nothing in `Stop` waited for the goroutine either.

## Gates

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

$ golangci-lint run --tests=false ./...
0 issues.

$ go test -race -count=1 ./internal/server/... ./internal/session/...
ok  	github.com/Zalaras/muster/internal/server	103.681s
ok  	github.com/Zalaras/muster/internal/session	32.454s

$ make size-warn
size-warn: 59 hits   (same set as before this unit's changes — none of the touched
                       files/functions appear; see `## Decisions`)
```

An earlier run of the session-package suite hit a single failure, `TestApplyInput_DeathHint` in `machine_test.go`, against an *uncommitted* change to `internal/session/machine.go` already present in the shared worktree before this unit started (confirmed via `git diff internal/session/machine.go`, which touches `KindDeathHint` handling — nothing this unit's changes reach). `go test -race -count=1 -skip 'TestApplyInput_DeathHint' ./internal/session/...` passed clean at that point, isolating the failure from this unit's `manager.go` edit. By the time of the final gate run above, another concurrent agent had updated `machine_test.go` to match, and the full suite (including that test) passes — no action was needed from this unit.

## Handoff

**Build status**: `go build ./...` exits 0.
**Test files needing changes**: None. No existing test broke — `shellRegistry`'s constructor signature and every other touched type's public surface used by tests (`newShellRegistry`, `newTerminalRegistry`, `newPrefsFeature`, `newWSHub`, `newUpdateManager`/`updateManagerConfig`) are unchanged.
