# Daemon Implementation: M2 — Terminal panes

**Plan**: m2-terminal
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/tmux/tmux.go` | rewritten | Topology change: `NewWindow` → `NewSession(ctx, id, dir, env, command)`, one tmux *session* `muster-<id>` per Muster session (drops `ensureSession`'s shared-session/placeholder-window model). Socket flag now path-aware (`-S` iff it contains `/`, else `-L`) via `socketFlag()`. Adds `applyServerOptions` (REQ-4's carry-over tmux config + `prefix`/`prefix2 None`), applied once right after the first session brings up a fresh server (`serverRunning` preflight). Adds `AttachArgv(target)`, `ResizeWindow(ctx, target, cols, rows)`, `DisplayVar(ctx, target, format)` (test oracle). `PaneExists`/`KillWindow` behavior unchanged. Package doc comment rewritten for the new topology. |
| `internal/termbridge/termbridge.go` | created | New package: `Attach(ctx, tmuxClient, target)` spawns `tmux attach-session -t target` under a `creack/pty` PTY with `TERM=xterm-256color`/`LANG=en_US.UTF-8` set explicitly (REQ-6). `Bridge.Read` maps macOS PTY `EIO` to `io.EOF` (FINDINGS §7). `Bridge.Resize` applies `pty.Setsize` then `tmux.Client.ResizeWindow`, in that order (FINDINGS §7(d)). `Bridge.Close` is idempotent (`sync.Once`). |
| `internal/server/terminal.go` | created | `GET /ws/terminal/{id}` handler: 404 unknown id / 409 `not_attachable` (dead session) pre-upgrade; `terminalRegistry` enforces one-live-client (INV-1) — `takeover` closes the old socket with 4000 `superseded` and tears down its PTY before the new attach starts; two goroutines pump PTY→socket (binary) and socket→PTY (binary input / text resize frames, clamped to [20,500]×[5,300], unparseable/unknown frames logged and ignored); PTY EOF closes with 4001 `pane_ended` and calls `manager.Nudge`. `closeAll()` for daemon shutdown (normal close). |
| `internal/server/prefs.go` | created | `PUT /api/prefs`: validates `view`∈{focus,tiles}/`density`∈{2x2,3x2} (at least one field, unknown fields ignored), merges onto the persisted object, writes it to kv under one JSON key (`prefsKVKey = "prefs"`), returns 204, broadcasts the full object as a `prefs` WS message (INV-4). `loadPrefs`/`defaultPrefs` shared with the snapshot path. |
| `internal/server/state.go` | modified | `PrefsInfo` gains `Density`. `buildSnapshot()` now uses `defaultPrefs()`. `currentSnapshot` takes `ctx` and loads real persisted prefs via `loadPrefs` instead of a hardcoded default (REQ-10 — prefs now survive restart in the snapshot, not just a fixed value). `handleState` passes `r.Context()`. |
| `internal/server/ws.go` | modified | `handleWS`'s `currentSnapshot` call updated to pass `r.Context()` (signature change only; the `prefs` message type lives in prefs.go). |
| `internal/server/server.go` | modified | `Server` gains `tmuxClient *tmux.Client` and `terminals *terminalRegistry` fields (the tmux client built in `New` is now stored, not just handed to the launcher/manager). Routes: `PUT /api/prefs`, `GET /ws/terminal/{id}` (both behind `requireCookie`, matching every other UI-authenticated route). `Shutdown` also calls `s.terminals.closeAll()`. |
| `internal/server/sessions.go` | modified | Launch calls `l.tmux.NewSession(ctx, sess.ID, dir, env, argv)` instead of `NewWindow` (topology change; the session's own DB id, already known at this point in `Launch`, becomes its tmux session's suffix). Error message updated from "spawning tmux window" to "spawning tmux session". |
| `internal/session/manager.go` | modified | Adds `Get(id) (*Session, bool)` (terminal handler's 404/409 pre-upgrade check) and `Nudge(ctx, sessionID)` (immediate liveness re-check after a PTY EOF, REQ-6/D6, rather than waiting the full ~5s poll interval). `checkLiveness`'s per-target body was extracted into a shared `checkOneLiveness` so `Nudge` and the poll loop share one code path. |
| `cmd/musterd/main.go` | modified | `-tmux-socket` flag help text documents the path form (REQ-5). |
| `go.mod` / `go.sum` | modified | Added `github.com/creack/pty v1.1.24` (direct dependency, per spike S4). |
| `test/rig/newprobe.sh` | modified | `SOCKET` is now `$INST/tmux.sock` (a path under the instance's own scratch dir, outside the repo) instead of a bare `-L` name in tmux's shared socket directory — REQ-5's "per-run socket paths inside scratch dirs that already get deleted" extended to the interface-probe rig. Comment updated accordingly. |

## Decisions

- **`prefix None` manually verified, not just asserted from the plan.** Wrote a throwaway Go program (creack/pty + a scratch tmux socket) that attached a PTY client to a session running `cat > outfile` and sent literal bytes `0x02 'Q' "SENTINEL\n"`. With tmux's default prefix, the captured output was exactly `SENTINEL\n` (both `C-b` and `Q` were swallowed by tmux). With `set-option -g prefix None` + `prefix2 None` applied first, the captured output was `\x02QSENTINEL\n` — `C-b` passed through verbatim to the attached pane. This confirms the plan's Implementation Notes claim and my `applyServerOptions` implementation; the comment in `tmux.go` cites this verification directly. Script and output are not checked in (throwaway).
- **Manual end-to-end smoke test of the real bridge** (not just the prefix option), run from a temporary `main.go` inside the module (deleted afterward, `git status` confirms no leftover): `tmux.NewSession` → `termbridge.Attach` → write `echo HELLO_FROM_BRIDGE\n` → read loop found the marker in the PTY output (D1/D2); `Bridge.Resize(120, 40)` then `DisplayVar(#{window_width})`/`(#{window_height})` read back exactly `120`/`40` (D4); `KillWindow` then a read loop returned `io.EOF` (mapped from `EIO`) within ~300ms (D5/REQ-6). All four measured live, not inferred from the diff.
- **`internal/tmux/tmux_test.go` and `internal/server/sessions_test.go`'s `newTestTmuxClient` were NOT updated** — see Handoff below. Per the daemon-impl constraints, an API rename that breaks test bodies (not just an import line) is a test-agent fix, not mine to make. Evidence: `go vet ./...` restricted to `internal/tmux` shows 8 call sites at `tmux_test.go:42,54,74,105,107,121,149,161` all failing with `c.NewWindow undefined`; `go test ./...` shows the same build failure plus one value-only assertion failure in `internal/server/state_test.go:20` (`TestBuildSnapshot_M0Shape`, exact `assert.JSONEq` missing the new `density` field). Every other package (`claudecode`, `gitutil`, `session`, `store`, `server` minus that one test) passes; `golangci-lint run` scoped to every package except `internal/tmux` reports `0 issues`.
- **No new interface was introduced between `internal/server` and `internal/termbridge`/`internal/tmux`.** The plan's Affected Files section describes concrete functions (`Attach`, `Resize`, `AttachArgv`, `NewSession`, …), not an interface seam, and D1–D6's acceptance tests are real-tmux integration tests (per the hard rule, capture/attach are test oracles, exercised for real) rather than something needing a mock. Kept concrete per YAGNI.
- **`window-size manual` was not directly re-verified via `show-options`** in my manual smoke test (I checked `#{window_size}` via `display-message`, which is the wrong format variable for a session option and prints empty — not a bug, just the wrong oracle in my throwaway script). D8 in the plan is explicitly a Go acceptance test daemon-tests will write with `show-options`; the *effect* of `window-size manual` (that `pty.Setsize` + `resize-window` together land at the exact requested geometry, not clipped/padded) **was** measured directly: the smoke test's `DisplayVar(#{window_width})`/`(#{window_height})` read back exactly 120×40 after `Resize(120, 40)`.

## Handoff

**Build status**: `go build ./...` exits 0 (verified). `go vet` and `golangci-lint run` are clean on every package except `internal/tmux`, whose failure is entirely inside its pre-existing `_test.go` file (see below) — not a leftover source issue.

**Test files needing changes (test-agent scope, not import-only)**:

1. `internal/tmux/tmux_test.go` — every call site of the old `c.NewWindow(ctx, dir, env, argv)` (lines 42, 54, 74, 105, 107, 121, 149, 161) must move to `c.NewSession(ctx, id, dir, env, argv)` with an explicit `int64` id per call. Consequences beyond a signature bump:
   - `newTestSocket(t)` (line ~22) returns a bare socket **name** (`"muster-test-" + hex`), which lands sockets in tmux's shared `$TMPDIR/tmux-$UID/` directory — the opposite of D12 ("every `tmux.New` in tests receives a `t.TempDir()` path; none uses a bare `-L` name"). It should build a **path** under `t.TempDir()` instead (e.g. `filepath.Join(t.TempDir(), "tmux.sock")`), which also exercises the new `-S` code path.
   - Target-format assertions (`assert.Regexp(t, `^muster:@\d+$`, target)`, line ~45) must change to `^muster-\d+:@\d+$` (the session name is now `muster-<id>`, not the fixed `muster`).
   - `TestNewWindow_ReusesTheSameTmuxSessionAcrossCalls` (line ~100) is now testing a **removed** behavior — two `NewSession` calls with different ids now create two distinct tmux *sessions*, not two windows in one shared session. This test needs to be replaced with something that asserts the new invariant (e.g. two different ids → two different tmux session names via `list-sessions`), not just patched.
   - New coverage the plan calls for that doesn't exist yet: `AttachArgv`, `ResizeWindow`/`DisplayVar` (D4's oracle), the socket-path form (D9: a `/`-containing socket creates the file at that path), and `applyServerOptions`/`prefix None` (D8, via `show-options`) — I verified `prefix None` manually (see Decisions) but did not write an automated test for it since I cannot add test files.
2. `internal/server/sessions_test.go`'s `newTestTmuxClient` (line ~163) has the same bare-`-L`-name issue as above (`socket := "muster-server-test-" + hex...`) — should move to a `t.TempDir()` path for the same D12 reason. This one doesn't call `NewWindow` directly (it goes through `sessionLauncher.Launch` → `NewSession`), so it's not a compile break, just a D12 gap.
3. `internal/server/state_test.go:20` (`TestBuildSnapshot_M0Shape`) — the hardcoded `assert.JSONEq` literal needs `"density": "2x2"` added next to `"view": "focus"` inside `"prefs"`. One-line value fix, not a scope/strength change (mirrors what e2e-specs already did to `web/e2e/shell.spec.ts` for the same M2 protocol delta).

No other test files need changes. `internal/server/ws_test.go`'s `snapshotWire.Prefs` struct only decodes `view`, so the new `density` field on the wire doesn't break its decode or its assertions — left untouched.

## Fix Attempt 1

**Failures addressed**: `TestHandleTerminal_KillingTheTmuxSessionCloses4001AndNudgesLiveness` (reproducible 5/5 per daemon-tests.md), verdict `implementation-bug`.

**Root cause (from daemon-tests.md, confirmed by reading the code)**: `handleTerminal` runs `pumpPTYToSocket` and `pumpSocketToPTY` over one shared `ctx := context.WithCancel(r.Context())`. On PTY EOF, `pumpPTYToSocket` closed the websocket (`c.Close(closePaneEnded, ...)`) and then called `s.manager.Nudge(ctx, sessionID)` on that same `ctx`. Closing the socket unblocks the sibling goroutine's `pumpSocketToPTY` (its blocked `c.Read(ctx)` returns), which returns and lets `handleTerminal` call `cancel()` — racing Nudge's still-in-flight `PaneExists` (`tmux list-panes` subprocess) on the identical `ctx`. The websocket close is near-instant; the subprocess round-trip is not, so cancellation always won.

**Every code path that reaches this defect**: grepped all `.Nudge(` call sites in production code (`grep -rn "\.Nudge(" internal cmd`) — exactly one production call site exists, `internal/server/terminal.go`'s `pumpPTYToSocket` EOF branch (the other hits are `context.Background()` calls from test files, unaffected). There is only one door here, not a family of doors: `Nudge` is called from nowhere else in the daemon, so no other call site needed the same treatment.

**Changes made**: `internal/server/terminal.go`, `pumpPTYToSocket`'s `io.EOF` branch — changed `s.manager.Nudge(ctx, sessionID)` to `s.manager.Nudge(context.WithoutCancel(ctx), sessionID)`, mirroring the existing precedent in `internal/server/sessions.go`'s `rollback`/`Launch` call (`context.WithoutCancel(r.Context())`, review-established pattern for "a client that navigates away mid-operation must not also cancel the cleanup/follow-up work"). `context.WithoutCancel` keeps `ctx`'s values but detaches it from the parent's cancellation signal, so the sibling goroutine's `cancel()` (triggered by the very socket close this branch just performed) can no longer race the in-flight `PaneExists` call to a premature `context canceled` error.

**Evidence**:
```
$ go build ./...
(exit 0, no output)

$ go test ./internal/server/... -run TestHandleTerminal_KillingTheTmuxSessionCloses4001AndNudgesLiveness -count=5 -v
=== RUN   TestHandleTerminal_KillingTheTmuxSessionCloses4001AndNudgesLiveness
--- PASS: TestHandleTerminal_KillingTheTmuxSessionCloses4001AndNudgesLiveness (0.16s)
=== RUN   TestHandleTerminal_KillingTheTmuxSessionCloses4001AndNudgesLiveness
--- PASS: TestHandleTerminal_KillingTheTmuxSessionCloses4001AndNudgesLiveness (0.17s)
=== RUN   TestHandleTerminal_KillingTheTmuxSessionCloses4001AndNudgesLiveness
--- PASS: TestHandleTerminal_KillingTheTmuxSessionCloses4001AndNudgesLiveness (0.16s)
=== RUN   TestHandleTerminal_KillingTheTmuxSessionCloses4001AndNudgesLiveness
--- PASS: TestHandleTerminal_KillingTheTmuxSessionCloses4001AndNudgesLiveness (0.17s)
=== RUN   TestHandleTerminal_KillingTheTmuxSessionCloses4001AndNudgesLiveness
--- PASS: TestHandleTerminal_KillingTheTmuxSessionCloses4001AndNudgesLiveness (0.17s)
PASS
ok  	github.com/Zalaras/muster/internal/server	1.600s

$ gofmt -l .
(no output)

$ go vet ./...
(no output)

$ golangci-lint run ./...
0 issues.

$ go test ./... -count=1   # x2 consecutive runs, both fully green
ok  	github.com/Zalaras/muster/internal/claudecode
ok  	github.com/Zalaras/muster/internal/gitutil
ok  	github.com/Zalaras/muster/internal/server
ok  	github.com/Zalaras/muster/internal/session
ok  	github.com/Zalaras/muster/internal/store
ok  	github.com/Zalaras/muster/internal/termbridge
ok  	github.com/Zalaras/muster/internal/tmux
```

**Build status**: `go build ./...` exits 0. No test files touched — the fix was confined to `internal/server/terminal.go`.

## Fix Attempt 2 (review cycle 1, wave 1)

**Failures addressed**: review.md Critical 3, Critical 4, Major 1, Minor 2, Minor 3, Minor 6 (all `[daemon-impl]`).

### Critical 3 — `detach-on-destroy off` misroutes keystrokes into another Muster session

**Fix**: `internal/tmux/tmux.go`'s `serverOptions` — `detach-on-destroy` changed from `"off"` to `"on"` (the plan's REQ-4 amendment, already in `plan.md`). Comment above `serverOptions` rewritten to explain why the spike's value doesn't hold under structural decision 1, and to record the `destroy-unattached` re-verification below instead of just asserting it.

**Only one door**: `detach-on-destroy` is set in exactly one place, `serverOptions` (applied once per fresh tmux server via `applyServerOptions`, `tmux.go`). There is no other place in the codebase that sets tmux session/server options — `grep -rn "detach-on-destroy\|set-option.*prefix" internal/ cmd/` shows only this one array. No other code path to close.

**Re-verification of `destroy-unattached off` under the amendment** (not just carried over — measured with a throwaway `creack/pty` program against a scratch `-S` socket, not tmux's shared dir, deleted after use):
- Set up two sessions on one socket with `destroy-unattached off` + the new `detach-on-destroy on`, attached a real PTY client (mirroring `termbridge.Attach`) to one, then closed it via the exact sequence `Bridge.Close()` uses (`pty.Close()` then `Process.Kill()`+`Wait()` — a normal client-initiated detach, NOT `kill-session`). Result: `tmux list-sessions` still showed **both** sessions afterward and `list-clients` was empty — the session survives a client detaching normally, confirming `destroy-unattached off` is unaffected by the amendment (it governs a different event: "does a session survive its last client detaching" vs. `detach-on-destroy`'s "what happens to a client when its session is destroyed").
- Separately re-confirmed the amendment's own fix direction (the review's control experiment, reproduced independently): two sessions, `detach-on-destroy on`, `kill-session` on the attached one. The attach client's PTY hit EOF (process exited) within 300ms in 1/1 run, and `list-clients` on the *other* session was empty afterward — no client migration. Both throwaway programs and their scratch sockets (`/private/tmp/m2fix*`) were deleted after use; `ls /private/tmp/tmux-501/` before and after shows no new entries (empty both times) since every run used an explicit `-S` scratch path, never tmux's shared socket dir.

**Test-file gap this reopens (not mine to fix)**: `internal/tmux/tmux_test.go:349`, `TestNewSession_AppliesServerOptionsOnFreshServer`'s table still asserts `{"detach-on-destroy", "off"}` — the pre-amendment value. This is a one-line value fix (`"off"` → `"on"`), not an import; per the daemon-impl constraints it's daemon-tests' fix. Confirmed via `go test ./... -count=1`: this is the *only* failure in the entire suite, isolated to that one subtest — everything else (`internal/server`, `internal/termbridge`, all other `internal/tmux` subtests) passes. `plans/m2-terminal/daemon-tests.md:38`'s table row documenting the D8 test also still says `detach-on-destroy off` and needs the same one-word update (doc, not code).

### Critical 4 — client-initiated close leaks the PTY/attach client

**Root cause confirmed by measurement, not assumed**: I first assumed closing the PTY master (`bridge.pty.Close()`) alone would unblock a concurrent blocked `bridge.Read`, matching how Go's poller-integrated fds behave. A throwaway `creack/pty` program disproved this directly: a blocked `Read` in one goroutine, `Close()` called from another, `Read` still blocked after 2s. A second throwaway program confirmed what *does* unblock it: killing the child process (`cmd.Process.Kill()` + `Wait()`) — which `Bridge.Close()` already does, in that exact order (`pty.Close()` then `Kill`+`Wait`) — unblocks the pending `Read` with `io.EOF` reliably (5/5 runs). So `Bridge.Close()` was always capable of unblocking the read; the bug was purely that `handleTerminal` never called it until *after* `<-ptyDone`, which can't return until that same read unblocks — a self-dependency, not a missing capability.

**Fix**: `internal/server/terminal.go`'s `handleTerminal` — after `pumpSocketToPTY` returns (the client side is gone, for any reason), `cancel()` then `bridge.Close()` run immediately, *before* `<-ptyDone`, instead of only via the deferred `bridge.Close()` that fires after the function returns. This makes `Bridge.Close()`'s process-kill run right away, unblocking `pumpPTYToSocket`'s blocked `Read` instead of waiting for the pane to emit output on its own (or, per the `destroy-unattached`/exec.CommandContext interaction, an unbounded TCP-level timeout).

**Avoiding a spurious 4001/Nudge from this induced read error**: `pumpPTYToSocket` now checks `ctx.Err() != nil` before treating a read error as `io.EOF`. `cancel()` runs (from the fix above) strictly before `bridge.Close()`, so by the time the induced read error arrives, `ctx` is already canceled — `ctx.Err() != nil` is true only for this teardown-induced case, never for a genuine pane death (where nobody has canceled `ctx` yet at the moment the real EOF is observed, since `cancel()` there only runs via the goroutine's own `defer` *after* the EOF branch already executed). This is the same signal already used elsewhere in the file (the existing `context.WithoutCancel` comment references the analogous race), just checked one line earlier.

**Every code path that reaches this defect — reviewed exhaustively, not just the reproduction case**: the leak is triggered by *any* path that causes `pumpSocketToPTY` to return before `pumpPTYToSocket` does. `pumpSocketToPTY` returns only from `c.Read(ctx)` erroring, which happens when: (a) the client sends a close frame (view switch, refocus, density shrink, demotion, page unload — all of these are the web side calling `pane.ts`'s dispose, which closes the WS; from the daemon's perspective they are indistinguishable, all handled by this one code path in `handleTerminal`), (b) the underlying TCP connection drops (network failure, browser crash), or (c) `ctx` is canceled by `s.terminals.closeAll()`'s socket close during shutdown. All three converge on the same `pumpSocketToPTY` return → same fix. There is exactly one call site of this teardown sequence (`handleTerminal`'s own body, after `s.pumpSocketToPTY(...)`); no other function constructs or tears down a `Bridge`.

**End-to-end verification of the actual fix** (not just the isolated PTY experiment) — a throwaway `_test.go` inside `internal/server` (same package, so it could use unexported helpers `newTerminalTestServer`/`launchRealSession` and the unexported `tmuxClient` field; deleted immediately after use, confirmed via `git status --porcelain internal/server/` showing no `zzz_manual_verify_test.go` afterward):
- Launched a real session with `sleepForeverCommand()` (emits nothing after tmux's initial repaint — exactly the "idle Needs-Input" condition the review measured), attached a terminal socket, confirmed `#{session_attached}` = `1`, then closed the client side with a **graceful** `c.Close(websocket.StatusNormalClosure, ...)` (matching a real browser's `ws.close()` and `TestHandleTerminal_SupersedesOnRefocus`'s existing precedent) — deliberately not `CloseNow()`, which force-drops the TCP connection from the client side and would itself trigger `exec.CommandContext`'s cancellation independent of any daemon-side fix, masking the bug.
- **Pre-fix** (temporarily reverted `handleTerminal`'s tail to the old `cancel(); <-ptyDone` with no `bridge.Close()`, restored from a backup copy afterward — confirmed via `go build ./...` exiting 0 and `git diff internal/server/terminal.go` showing the restored fix intact): teardown latency (time from the client's `Close()` call to `#{session_attached}` reading `0`) was **~450ms across 3 runs (451ms, 453ms, 447ms)** — bounded entirely by `coder/websocket`'s own client-side close-handshake timeout, an external bound with no guarantee in a real, slower, or unresponsive browser client (matching the review's "can persist indefinitely" language for a real session).
- **Post-fix**: teardown latency was **~35ms across 3 runs (32ms, 45ms, 32ms)** — the daemon's own explicit `bridge.Close()`, not dependent on the client's handshake timeout at all.
- `pgrep -fl tmux` during the pre-fix run confirmed the actual `tmux attach-session` OS process for the target disappeared at the same moment `#{session_attached}` flipped to `0`, and confirmed it was still running in every poll before that — this is a real process teardown being measured, not a stale/cached tmux report.

### Major 1 — takeover attaches before evicting the old connection

**Fix**: `internal/server/terminal.go` — `terminalRegistry.takeover` changed from `takeover(sessionID, conn)` (evict-then-install in one lock, called *after* `termbridge.Attach` had already run) to `takeover(ctx, sessionID, attach func(context.Context) (*terminalConn, error))`: eviction of the old connection (WS close + `bridge.Close()`) and the call to `attach` (which runs the new `termbridge.Attach`) both happen inside the same critical section, in that order. This delivers REQ-2's literal ordering ("old PTY torn down before the new attach starts") instead of the previous "evict-and-install-atomically, but attach beforehand" which let two PTYs coexist for the attach's duration. Holding the registry lock across `attach()` also serializes two concurrent connects for the same `sessionID`, closing a second window Major 1 didn't name explicitly but the same restructure closes: a second `takeover` call can no longer evict, then have its own `attach` overwritten by a first caller's late registration (the previous two-step evict/register design I considered and rejected during this fix would have reopened exactly that race — see below).

**Only one call site**: `s.terminals.takeover(...)` is called from exactly one place, `handleTerminal`. No other caller needed updating.

**Design note (why not a simpler evict-then-attach-then-register split)**: I initially considered splitting `takeover` into `evict(sessionID)` + `register(sessionID, conn)` with attach running unlocked in between (simpler, no closure). Rejected because two concurrent connects for the same `sessionID` could then interleave: A evicts (sees nothing), B evicts (also sees nothing, A hasn't registered yet), A attaches and registers connA, B attaches and registers connB — overwriting connA in the map without ever closing it, leaking exactly the PTY/socket pair this whole plan requirement exists to prevent. Passing `attach` as a closure into `takeover` and running it inside the lock closes that door structurally rather than requiring a second, separate lock.

**Verification**: `TestHandleTerminal_SecondSocketSupersedesTheFirst`, `_SupersedesMidTyping`, `_SupersedesOnRefocus` (the three concurrent-connect test scenarios already in the suite) all pass, including under `-race -count=3`:
```
$ go test ./internal/server/... -run 'TestHandleTerminal' -race -count=3
ok  	github.com/Zalaras/muster/internal/server	9.032s
```

### Minor 2 — stale `termbridge.Attach` doc comment

**Fix**: `internal/termbridge/termbridge.go` — rewrote the comment to state the actual, correct behavior (ctx is `exec.CommandContext`'s context; canceling it kills the process; in practice ctx is the caller's request context, so the Bridge's lifetime tracks it, and `Close` tears it down explicitly/idempotently either way) instead of the previous incorrect "ctx bounds only the spawn itself" claim.

### Minor 3 — `closeAll` never clears the map

**Fix**: `internal/server/terminal.go`'s `closeAll` now snapshots `r.conns` under the lock, replaces it with a fresh empty map, releases the lock, then closes the snapshotted connections outside the lock (also slightly reduces lock hold time during shutdown). A post-shutdown `takeover` now sees an empty map and can't re-close an already-closed `terminalConn`.

### Minor 6 — resize-frame parse failure logs the raw frame unbounded

**Fix**: `internal/server/terminal.go` — added `maxLoggedFrameLen = 200` and truncate the logged frame to that length in `applyResizeFrame`'s parse-failure branch. Keystrokes remain binary/unlogged as before; this only caps the one text-frame debug line.

**Evidence — full suite, build, vet, lint**:
```
$ gofmt -l .
(no output)

$ go vet ./...
(no output)

$ go build ./...
(exit 0)

$ make lint
golangci-lint run
0 issues.

$ go test ./... -count=1
ok  	github.com/Zalaras/muster/internal/claudecode
ok  	github.com/Zalaras/muster/internal/gitutil
ok  	github.com/Zalaras/muster/internal/server
ok  	github.com/Zalaras/muster/internal/session
ok  	github.com/Zalaras/muster/internal/store
ok  	github.com/Zalaras/muster/internal/termbridge
--- FAIL: TestNewSession_AppliesServerOptionsOnFreshServer/detach-on-destroy   # expected — see Critical 3's test-file gap above; daemon-tests' one-line fix
FAIL	github.com/Zalaras/muster/internal/tmux
```
Every package except that one pre-existing test's one stale subtest is green. `go test ./internal/server/... -run 'TestHandleTerminal' -race -count=3` and `go test ./internal/termbridge/... -race -count=2` both pass clean.

**tmux litter check**: `ls -la /private/tmp/tmux-501/` before and after this session's verification work shows the directory empty both times — every ad-hoc tmux invocation in this fix wave used an explicit `-S` scratch path (`/private/tmp/m2fix*`, deleted after use), never a bare `-L` name.

**Build status**: `go build ./...` exits 0.

**Test files needing changes (not mine to make, per daemon-impl constraints)**:
1. `internal/tmux/tmux_test.go:349` — `TestNewSession_AppliesServerOptionsOnFreshServer`'s table entry `{"detach-on-destroy", "off"}` must become `{"detach-on-destroy", "on"}` (REQ-4 amendment). One-line value fix, not an import.
2. `plans/m2-terminal/daemon-tests.md:38` (doc, not a test file, but flagging for consistency) — the table row documenting that same test still lists `detach-on-destroy off` among the asserted values.

No other test files were touched or need changes for this wave's fixes; the registry API change (`takeover`'s new signature) and the `pumpPTYToSocket`/`applyResizeFrame` internals are exercised only through the existing black-box HTTP/WS tests in `terminal_test.go`, none of which call these unexported functions directly.
