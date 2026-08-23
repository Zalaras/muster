# Daemon Tests: M2 — Terminal panes

**Plan**: m2-terminal
**Verdict**: pass

## Summary

Tests created/updated: 86 Go tests across 6 files (64 new, 22 fixed-to-compile/extended
on pre-existing files) | Passing: 86 | Failing: 0

Updated again for review cycle 1, wave 2 (review.md issue 7, `[daemon-tests]`): added 4
tests closing the "session death only tested with one tmux session on the socket"
structural gap (2 at the server layer plus a takeover-ordering test and a Critical 4
regression test, 1 at the termbridge layer), and fixed the one stale pre-existing
assertion the daemon-impl handoff flagged (`internal/tmux/tmux_test.go`'s
`detach-on-destroy off` → `on`, matching the REQ-4 amendment already live in
`tmux.go`/`plan.md`). See "Fix Attempt (review cycle 1, wave 2)" below for full detail
and evidence.

Re-run after daemon-impl's Fix Attempt 1 (`internal/server/terminal.go`: the `Nudge`
call in `pumpPTYToSocket`'s EOF branch now runs on `context.WithoutCancel(ctx)` instead
of the shared, racing `ctx`). No test files were changed for this re-run — the fix was
confined to implementation code, per daemon-impl's handoff. `go build ./...` exits 0,
`go vet ./...` is clean, `golangci-lint run` reports 0 issues, and `go test ./...`
(and `make test`) are fully green — the one previously failing test,
`TestHandleTerminal_KillingTheTmuxSessionCloses4001AndNudgesLiveness`, now passes
reliably: 20/20 under plain `go test -count=20`, and 10/10 under `go test -race
-count=10` (no data race reported, confirming the fix removed the cancellation race
rather than just narrowing its window).

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/tmux/tmux_test.go` | `TestNewSession_ReturnsATargetAndPane` | `NewSession` returns `muster-<id>:@n` target + pane | pass |
| `internal/tmux/tmux_test.go` | `TestNewSession_NamesTheTmuxSessionMusterDashID` | tmux session literally named `muster-<id>` (topology change) | pass |
| `internal/tmux/tmux_test.go` | `TestNewSession_SetsExtraEnvironmentInThePane` | `-e` env vars reach the pane | pass |
| `internal/tmux/tmux_test.go` | `TestNewSession_SpawnsInTheGivenDirectory` | `-c dir` honoured | pass |
| `internal/tmux/tmux_test.go` | `TestNewSession_DifferentIDsCreateDistinctTmuxSessions` | replaces the old "reuses one session" test: two ids → two tmux *sessions* (topology invariant) | pass |
| `internal/tmux/tmux_test.go` | `TestNewSession_ASlashContainingSocketCreatesTheSocketFileAtThatPath` | D9: `/`-containing socket → `-S`, file created at that path | pass |
| `internal/tmux/tmux_test.go` | `TestSocketFlag_PathUsesDashSBareNameUsesDashL` | D9 other half: flag selection, no real tmux spawned for the bare-name case (keeps D12 clean) | pass |
| `internal/tmux/tmux_test.go` | `TestPaneExists_*` (3 subtests) | liveness signal: true→false after kill, empty target, unknown target | pass |
| `internal/tmux/tmux_test.go` | `TestKillWindow_ErrorsForAnUnknownTarget` | error surfaced for bad target | pass |
| `internal/tmux/tmux_test.go` | `TestAttachArgv_IncludesTheSocketFlagAndTarget` | argv shape termbridge spawns | pass |
| `internal/tmux/tmux_test.go` | `TestResizeWindowAndDisplayVar_RoundTripTheRequestedGeometry` | D4: exact geometry round-trip via oracle | pass |
| `internal/tmux/tmux_test.go` | `TestDisplayVar_UnknownTargetReturnsEmptyWithNoError` | documents measured tmux behaviour (oracle-only helper, not a Muster bug) | pass |
| `internal/tmux/tmux_test.go` | `TestNewSession_AppliesServerOptionsOnFreshServer` (8 subtests) | D8 + REQ-4: `window-size manual`, `escape-time 0`, `status off`, `mouse off`, `destroy-unattached off`, `detach-on-destroy on` (REQ-4 amendment, review cycle 1), `prefix`/`prefix2 None` via `show-options` | pass |
| `internal/tmux/tmux_test.go` | `TestNewSession_AppliesServerOptionsOnlyOnceOnAnAlreadyRunningServer` | options applied once per socket server | pass |
| `internal/tmux/tmux_test.go` | `TestNewClient_UsesAPerTestSocketNeverTheSharedDefault` | regression guard: never the literal `"muster"` socket in tests | pass |
| `internal/termbridge/termbridge_test.go` | `TestAttach_StreamsPTYOutputAndAcceptsInput` | D1/D2: real round trip through a spawned shell | pass |
| `internal/termbridge/termbridge_test.go` | `TestAttach_SetsTERMAndLANGOnTheAttachProcess` | REQ-6: attach client env carries `TERM`/`LANG` | pass |
| `internal/termbridge/termbridge_test.go` | `TestBridge_Resize_AppliesPtySetsizeThenTmuxResizeWindow` | D4/D13: `Resize` composes `pty.Setsize` + tmux resize correctly | pass |
| `internal/termbridge/termbridge_test.go` | `TestBridge_Read_MapsEIOToCleanEOFWhenTheTmuxSessionDies` | D5/REQ-6: EIO→`io.EOF` mapping, real kill | pass |
| `internal/termbridge/termbridge_test.go` | `TestBridge_Close_IsIdempotent` | `Close` safe to call twice | pass |
| `internal/termbridge/termbridge_test.go` | `TestAttach_ErrorsForAnUnattachableTarget` | attach to a dead target ends in EOF/error, never hangs | pass |
| `internal/termbridge/termbridge_test.go` | `TestAttach_KillingOneOfTwoSessionsNeverMisroutesTheClientToTheOther` (review fix, wave 2) | review.md Critical 3 at the termbridge layer: with >=2 sessions on the socket, killing the attached one still clean-EOFs its own bridge and never leaves a client attached to the untouched survivor | pass |
| `internal/session/manager_test.go` | `TestGet_ReturnsCloneForAKnownSessionFalseForUnknown` | terminal handler's 404/409 pre-check primitive; clone independence | pass |
| `internal/session/manager_test.go` | `TestNudge_FlipsAliveFalseImmediatelyWithoutWaitingForThePollTicker` | D6: `Nudge` acts independently of the poll ticker (1h interval, still flips) | pass |
| `internal/session/manager_test.go` | `TestNudge_PaneStillAliveDoesNotBroadcast` | no spurious broadcast when pane is alive | pass |
| `internal/session/manager_test.go` | `TestNudge_UnknownSessionIsANoOp` | unknown id → no pane check | pass |
| `internal/session/manager_test.go` | `TestNudge_PlaceholderTargetIsANoOp` | CreateSession..RecordLaunch window never pane-checked | pass |
| `internal/session/manager_test.go` | `TestNudge_NilPaneCheckerIsANoOp` | nil checker doesn't panic | pass |
| `internal/session/manager_test.go` | `TestNudge_AnAlreadyDeadSessionIsANoOp` | already-dead session doesn't re-broadcast | pass |
| `internal/server/prefs_test.go` | `TestHandlePutPrefs_RequiresCookie` | 401 without cookie | pass |
| `internal/server/prefs_test.go` | `TestHandlePutPrefs_InvalidJSONBodyIs400` | malformed body → 400 | pass |
| `internal/server/prefs_test.go` | `TestHandlePutPrefs_ValidationErrors` (6 subtests) | no known field, invalid enums, empty strings | pass |
| `internal/server/prefs_test.go` | `TestHandlePutPrefs_UnknownFieldsAlongsideAKnownOneAreIgnored` | unknown fields ignored, not rejecting | pass |
| `internal/server/prefs_test.go` | `TestHandlePutPrefs_SetsViewOnlyLeavesDensityUntouched` / `SetsDensityOnlyLeavesViewUntouched` / `SetsBothFieldsInOneRequest` | partial-update merge semantics, both directions | pass |
| `internal/server/prefs_test.go` | `TestHandlePutPrefs_PersistsToKVUnderOneJSONKey` | kv persistence shape (Schema Changes note) | pass |
| `internal/server/prefs_test.go` | `TestLoadPrefs_DefaultsBeforeAnyPUT` / `CorruptKVValueFallsBackToDefaults` / `InvalidEnumValuesInKVFallBackPerField` | fallback behaviour, corrupt/invalid kv | pass |
| `internal/server/prefs_test.go` | `TestHandlePutPrefs_RejectedRequestsNeverPersistOrBroadcast` | INV-4 "iff accepted" half, from a non-default starting state | pass |
| `internal/server/prefs_test.go` | `TestHandlePutPrefs_BroadcastsExactlyOnePrefsMessageToEveryConnectedUISocket` | D11/INV-4: exactly one broadcast, fanned to every socket | pass |
| `internal/server/prefs_test.go` | `TestHandlePutPrefs_TwoAcceptedPutsProduceTwoBroadcasts` | invariant from a second reachable state (not coalesced) | pass |
| `internal/server/prefs_test.go` | `TestPrefs_PersistAcrossADaemonRestart` | D10: fresh `Server` over same db path retains prefs | pass |
| `internal/server/state_test.go` | `TestBuildSnapshot_M0Shape` (updated) | fixed snapshot shape now includes `density` | pass |
| `internal/server/state_test.go` | `TestHandleState_ReturnsSnapshotJSON` (updated) | asserts `density` too | pass |
| `internal/server/state_test.go` | `TestCurrentSnapshot_LoadsPersistedPrefsFromKV` | REQ-10: snapshot reflects persisted prefs, not the fixed default | pass |
| `internal/server/terminal_test.go` | `TestHandleTerminal_UnknownSessionIs404` / `NonNumericIDIs404` | pre-upgrade 404 | pass |
| `internal/server/terminal_test.go` | `TestHandleTerminal_DeadSessionIs409` | D7: real liveness-flip to `alive:false` → 409, no attach attempt | pass |
| `internal/server/terminal_test.go` | `TestHandleTerminal_RequiresCookie` | auth wiring | pass |
| `internal/server/terminal_test.go` | `TestHandleTerminal_StreamsPTYOutputAndAcceptsInput` | D1/D2 at the HTTP-handler level | pass |
| `internal/server/terminal_test.go` | `TestHandleTerminal_ResizeFrameAppliesRealGeometry` | D4/REQ-3 via the real wire JSON frame | pass |
| `internal/server/terminal_test.go` | `TestHandleTerminal_ResizeFrameIsClampedToTheProtocolBounds` | REQ-3 clamp via wire frame | pass |
| `internal/server/terminal_test.go` | `TestHandleTerminal_UnparseableResizeFrameIsIgnoredNotFatal` | Edge Case 9: garbage frame never kills the socket | pass |
| `internal/server/terminal_test.go` | `TestHandleTerminal_SecondSocketSupersedesTheFirst` | INV-1 from "no prior socket" | pass |
| `internal/server/terminal_test.go` | `TestHandleTerminal_SupersedesMidTyping` | INV-1 from "mid-typing" (named-invariant cross-state coverage) | pass |
| `internal/server/terminal_test.go` | `TestHandleTerminal_SupersedesOnRefocus` | INV-1 from "same-page refocus" | pass |
| `internal/server/terminal_test.go` | `TestHandleTerminal_KillingTheTmuxSessionCloses4001AndNudgesLiveness` | D5/D6: 4001 close + prompt `alive:false` | pass (20/20, and 10/10 under `-race`, after Fix Attempt 1) |
| `internal/server/terminal_test.go` | `TestHandleTerminal_KillingOneSessionAmongMultipleNeverMisroutesToAnother` (review fix, wave 2) | review.md Critical 3: with 3 sessions on the socket (killed/attached, survivor/attached, bystander/never-attached), killing the attached one still 4001s, the survivor keeps exactly 1 attached client throughout, the bystander never gains one, and `list-clients` shows nothing on any other session | pass (8/8 repeated) |
| `internal/server/terminal_test.go` | `TestHandleTerminal_TakeoverNeverLeavesTwoClientsAttachedAtOnce` (review fix, wave 2) | review.md Major 1: a background `#{session_attached}` poller across a full takeover never observes 2 clients on the session (eviction precedes attach) | pass (8/8 repeated, plus `-race -count=3`) |
| `internal/server/terminal_test.go` | `TestHandleTerminal_ClientInitiatedCloseTearsDownThePTYPromptly` (review fix, wave 2) | review.md Critical 4 regression: a graceful client-initiated close on a silent (Needs-Input-like) pane tears the attach client down within 300ms, not ~450ms+/indefinitely | pass (8/8 repeated) |
| `internal/server/terminal_test.go` | `TestHandleTerminal_ShutdownClosesOpenTerminalSocketsNormally` | `Shutdown` tears down open terminal sockets | pass |
| `internal/server/terminal_test.go` | `TestClampInt_Table` (6 subtests) | REQ-3 clamp function, exhaustive boundaries | pass |
| `internal/server/sessions_test.go` | `newTestTmuxClient` (fixed, not a test itself) | moved to a `t.TempDir()`-rooted socket **path** (`-S`), closing D12's pre-existing gap | n/a (fixture fix) |

Full per-package run (post-fix re-run): `go test ./internal/tmux/... ./internal/termbridge/... ./internal/session/... ./internal/server/...` → all pass. `go vet ./...` and `golangci-lint run` are both clean.

## Fixes to pre-existing files (handoff from daemon-implementation.md)

- **`internal/tmux/tmux_test.go`**: fully rewritten per the handoff — every `NewWindow` call site moved to `NewSession(ctx, id, ...)`; `newTestSocket` moved from a bare `-L` name in tmux's shared socket dir to a scratch-dir `-S` path (D12); target-format regex updated to `^muster-\d+:@\d+$`; `TestNewWindow_ReusesTheSameTmuxSessionAcrossCalls` replaced with `TestNewSession_DifferentIDsCreateDistinctTmuxSessions` (the new topology invariant); added the acceptance coverage the handoff flagged as missing (`AttachArgv`, `ResizeWindow`/`DisplayVar`, socket-path form, `applyServerOptions`/`prefix None`).
- **`internal/server/sessions_test.go`**: `newTestTmuxClient`'s bare `-L` name replaced with a scratch-dir `-S` path (same D12 gap the handoff named); unused `crypto/rand`/`encoding/hex` imports dropped.
- **`internal/server/state_test.go`**: `TestBuildSnapshot_M0Shape`'s JSON literal gained `"density": "2x2"`; `TestHandleState_ReturnsSnapshotJSON` gained a density assertion.

**Portability note surfaced while fixing these**: `t.TempDir()` paths are rooted under the test's full name (e.g. `.../TestNewSession_AppliesServerOptionsOnlyOnceOnAnAlreadyRunningServer/001/`); appending `/tmux.sock` can overflow AF_UNIX's ~104-byte `sun_path` limit on macOS (tmux itself errors `File name too long`). Every socket helper in this plan's new/fixed files (`internal/tmux`, `internal/termbridge`, `internal/server`) uses `os.MkdirTemp("", "short-prefix-")` instead — same scratch-dir-that-gets-deleted property D12 wants, without the length trap. Worth carrying into future daemon-tests work that builds tmux sockets from `t.TempDir()`.

## Implementation Bugs found in the original run (fixed — see Fix Verification below)

| Bug | File | Expected (per plan) | Actual (original run) |
|-----|------|---------------------|------------------------|
| `Nudge`'s liveness check races its own cancellation on PTY EOF | `internal/server/terminal.go` (`handleTerminal`, `pumpPTYToSocket`) | REQ-6/D6: "On EOF the daemon closes the socket with code 4001 (reason `pane_ended`) and nudges the liveness poll for that session" — D6: "within the liveness poll interval after 4001, the session broadcasts `alive:false`" | `Nudge`'s `PaneExists` call is reliably canceled before it completes, so `alive:false` never lands until the next full ~5s poll tick, not "promptly" as REQ-6 requires. |

## Fix Verification (Re-run)

daemon-impl's Fix Attempt 1 changed the `Nudge` call in `pumpPTYToSocket`'s `io.EOF`
branch from `s.manager.Nudge(ctx, sessionID)` to
`s.manager.Nudge(context.WithoutCancel(ctx), sessionID)` — detaching the liveness check
from the shared pump-teardown context so the sibling goroutine's `cancel()` (triggered
by the very socket close this branch performs) can no longer race the in-flight
`PaneExists` subprocess call. No test files were modified for this re-run; the test
body is exactly as authored in the original run.

Verification performed:

```
$ go build ./...
(exit 0, no output)

$ go vet ./...
(no output)

$ golangci-lint run ./...
0 issues.

$ go test ./internal/server/... -run TestHandleTerminal_KillingTheTmuxSessionCloses4001AndNudgesLiveness -count=20 -v
=== RUN   TestHandleTerminal_KillingTheTmuxSessionCloses4001AndNudgesLiveness
--- PASS: TestHandleTerminal_KillingTheTmuxSessionCloses4001AndNudgesLiveness (0.17s)
... (20/20 PASS, no failures)
PASS
ok  	github.com/Zalaras/muster/internal/server	3.900s

$ go test ./internal/server/... -race -run TestHandleTerminal_KillingTheTmuxSessionCloses4001AndNudgesLiveness -count=10 -v
=== RUN   TestHandleTerminal_KillingTheTmuxSessionCloses4001AndNudgesLiveness
--- PASS: TestHandleTerminal_KillingTheTmuxSessionCloses4001AndNudgesLiveness (0.21s)
... (10/10 PASS, no race detector reports)
PASS
ok  	github.com/Zalaras/muster/internal/server	4.038s
```

The `-race` run is the meaningful confirmation here: the original failure was a logical
cancellation race between two goroutines (not a memory race, so `-race` alone wouldn't
have caught the original bug), but running the fix 10x under `-race` adds instrumentation
overhead that shifts goroutine scheduling and timing — if the fix had merely narrowed the
race window rather than removed the dependency on the shared `ctx`, this would be the run
most likely to re-expose it. It stayed green.

### Root cause and evidence

`handleTerminal` (terminal.go) runs two pumps over one shared context:

```go
ctx, cancel := context.WithCancel(r.Context())
defer cancel()

ptyDone := make(chan struct{})
go func() {
    defer close(ptyDone)
    defer cancel()
    s.pumpPTYToSocket(ctx, c, bridge, id)
}()

s.pumpSocketToPTY(ctx, c, bridge)
cancel()
<-ptyDone
```

`pumpPTYToSocket`'s EOF branch:

```go
if errors.Is(err, io.EOF) {
    _ = c.Close(closePaneEnded, "pane_ended")
    s.manager.Nudge(ctx, sessionID)
}
```

`c.Close(...)` closes the websocket immediately. That unblocks `pumpSocketToPTY`'s
blocked `c.Read(ctx)` running concurrently in the **other** goroutine (the one that
called `handleTerminal` directly), which returns and falls through to `cancel()` right
after `s.pumpSocketToPTY(...)` returns — racing `Nudge`'s still-in-flight `PaneExists`
(a real `tmux list-panes` subprocess via `exec.CommandContext(ctx, ...)`) on the exact
same `ctx`. The websocket close is essentially instantaneous; the `tmux` subprocess
round-trip is not, so the race is won by the cancellation on every observed run.

Reproduced deterministically — not flaky:

```
$ go test ./internal/server/... -run TestHandleTerminal_KillingTheTmuxSessionCloses4001AndNudgesLiveness -count=5 -v
...
--- FAIL (x5)
    terminal_test.go:398: daemon log output: {"level":"warn","error":"checking pane \"muster-1:@0\": context canceled: ","tmux_target":"muster-1:@0","message":"liveness check failed"}
```

The close code itself is correct (4001, asserted and passing); only the liveness nudge
is affected. `checkOneLiveness` correctly treats a `PaneExists` error as "log and return"
rather than flipping `Alive` (session/manager.go), which is the right behavior for a
*real* tmux error — it just means this particular error (a self-inflicted context
cancellation, not a real tmux failure) should never have reached it with a cancelled
ctx in the first place.

**Suggested fix shape** (for daemon-impl, not applied here — impl agents own
`internal/server`): give the `Nudge` call in `pumpPTYToSocket`'s EOF branch a context
that outlives the pump teardown race — e.g. `context.WithoutCancel(ctx)` (the same
pattern `sessions.go`'s `rollback` already uses for exactly this class of problem: "a
client that navigates away mid-launch must not also cancel the cleanup write"), or a
short fresh `context.WithTimeout(context.Background(), ...)`. Either removes the
dependency on the racing shared `ctx`.

## Test Run Output (original failing run — kept for history)

```
$ go build ./...
(exit 0, no output)

$ golangci-lint run ./...
0 issues.

$ go test ./... -count=1
?   	github.com/Zalaras/muster/cmd/musterd	[no test files]
ok  	github.com/Zalaras/muster/internal/claudecode	0.376s
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
ok  	github.com/Zalaras/muster/internal/gitutil	1.652s
--- FAIL: TestHandleTerminal_KillingTheTmuxSessionCloses4001AndNudgesLiveness (3.15s)
    terminal_test.go:411:
        	Error Trace:	/Users/damian/Documents/code/Projects/muster/internal/server/terminal_test.go:411
        	Error:      	Condition never satisfied
        	Test:       	TestHandleTerminal_KillingTheTmuxSessionCloses4001AndNudgesLiveness
        	Messages:   	D6: alive:false must follow promptly, not wait out the ~5s poll interval
    terminal_test.go:398: daemon log output: {"level":"warn","error":"checking pane \"muster-1:@0\": context canceled: ","tmux_target":"muster-1:@0","message":"liveness check failed"}

FAIL
FAIL	github.com/Zalaras/muster/internal/server	9.360s
ok  	github.com/Zalaras/muster/internal/session	2.740s
ok  	github.com/Zalaras/muster/internal/store	1.997s
ok  	github.com/Zalaras/muster/internal/termbridge	2.874s
ok  	github.com/Zalaras/muster/internal/tmux	3.205s
?   	github.com/Zalaras/muster/test/rig/capture	[no test files]
?   	github.com/Zalaras/muster/test/rig/failproxy	[no test files]
FAIL
```

Reproduced identically across 3 consecutive full-suite runs and 5 isolated `-count=5`
runs of the failing test — this is not test flakiness. `go test ./... -race` on the
affected packages shows no data-race reports (the bug is a logical cancellation race
across two goroutines cooperating correctly under `go test -race`'s memory model, not a
detectable data race — evidenced by request/response ordering, not shared-memory
access).

One unrelated transient was observed exactly once across many runs:
`TestLauncher_SuccessfulLaunchEndToEnd` (pre-existing, untouched test body — only its
`newTestTmuxClient` fixture's socket path changed) failed once under `go test ./...`'s
default cross-package parallelism (many real tmux servers/forks contending for CPU
across packages simultaneously), and passed 5/5 in isolation and in a `-p 1`
(serialized) full run. Not re-observed in three subsequent full `go test ./...` runs;
treated as environmental noise, not a defect in this plan's code.

## Test Run Output (post-fix re-run — current)

```
$ go build ./...
(exit 0, no output)

$ go vet ./...
(no output)

$ golangci-lint run ./...
0 issues.

$ go test ./... -count=1 -v   (tail)
--- PASS: TestNewClient_UsesAPerTestSocketNeverTheSharedDefault (0.01s)
PASS
ok  	github.com/Zalaras/muster/internal/tmux	4.600s
?   	github.com/Zalaras/muster/test/rig/capture	[no test files]
?   	github.com/Zalaras/muster/test/rig/failproxy	[no test files]

$ grep -c '^--- PASS' <full log>   → 213
$ grep -c '^--- FAIL' <full log>   → 0

$ go test ./... -count=1
ok  	github.com/Zalaras/muster/internal/claudecode	0.397s
ok  	github.com/Zalaras/muster/internal/gitutil	1.828s
ok  	github.com/Zalaras/muster/internal/server	6.655s
ok  	github.com/Zalaras/muster/internal/session	2.223s
ok  	github.com/Zalaras/muster/internal/store	2.731s
ok  	github.com/Zalaras/muster/internal/termbridge	2.368s
ok  	github.com/Zalaras/muster/internal/tmux	4.600s

$ make test
go test ./...
ok  	github.com/Zalaras/muster/internal/claudecode	(cached)
ok  	github.com/Zalaras/muster/internal/gitutil	(cached)
ok  	github.com/Zalaras/muster/internal/server	5.849s
ok  	github.com/Zalaras/muster/internal/session	(cached)
ok  	github.com/Zalaras/muster/internal/store	(cached)
ok  	github.com/Zalaras/muster/internal/termbridge	(cached)
ok  	github.com/Zalaras/muster/internal/tmux	(cached)
```

All 213 subtests pass, 0 failures, across two independent full-suite invocations
(`go test ./...` and `make test`). No `TestLauncher_SuccessfulLaunchEndToEnd`
transient was observed on this re-run.

## Fix Attempt (review cycle 1, wave 2)

**Issue addressed**: review.md issue 7, `[daemon-tests]` — "Session death is only ever
tested with a single tmux session on the socket, so Critical 3 is structurally
invisible" (`internal/server/terminal_test.go` D5/D6 and
`internal/termbridge/termbridge_test.go`). Plus the wave-1 handoff item: the stale
`internal/tmux/tmux_test.go:349` assertion (`detach-on-destroy off`) needed updating to
`on` to match daemon-impl's Fix Attempt 2 (REQ-4 amendment).

### The structural gap and how it was closed

Every existing "session dies" test (`TestBridge_Read_MapsEIOToCleanEOFWhenTheTmuxSessionDies`,
`TestHandleTerminal_KillingTheTmuxSessionCloses4001AndNudgesLiveness`) creates exactly
one tmux session on its private socket. With nothing else on the socket, a dying attach
client has nowhere to hop to — it just exits, and the test passes identically whether
`detach-on-destroy` is `on` or `off`. This is precisely how Critical 3 (a destroyed
session's client migrating onto a *different* Muster session and misrouting keystrokes)
shipped past 100% green tests. Fixed by adding, at both layers, a case with >=2 sessions
on the socket:

1. **`internal/termbridge/termbridge_test.go`**: `TestAttach_KillingOneOfTwoSessionsNeverMisroutesTheClientToTheOther`
   — two sessions (`dying`, attached; `survivor`, untouched) on one socket. Kills
   `dying`'s window, asserts (a) this bridge's own `Read` still clean-EOFs exactly as the
   single-session test proves, and (b) `#{session_attached}` on `survivor` stays `0`
   throughout and tmux's own `list-clients` shows nothing at all on the socket
   afterward — the client that was on `dying` did not hop onto `survivor`.
   Added `newTestTmuxClientWithSocket` (returns the socket path alongside the `*tmux.Client`,
   since `tmux.Client` itself never exposes its socket — termbridge has no production
   reason to run `list-clients`/`display-message` directly, CLAUDE.md's capture/attach-are-
   oracle-only rule), plus `sessionNameFromTarget`/`attachedClientCount`/`listClientSessions`
   oracle helpers.

2. **`internal/server/terminal_test.go`**: `TestHandleTerminal_KillingOneSessionAmongMultipleNeverMisroutesToAnother`
   — three real launched sessions on the shared test-server socket: `dying` (has an open
   terminal WS), `survivor` (also has an open terminal WS, attached throughout),
   `bystander` (never gets a terminal socket at all — the plain ">=2 sessions on the
   socket" case, present even before any WS is opened). Kills `dying`'s tmux window via
   the existing `KillWindow` helper and asserts: (a) `dying`'s own WS still gets 4001 (the
   pre-existing D5/D6 assertion, unchanged); (b) `survivor`'s `#{session_attached}` stays
   exactly `1` the whole time (this is also the review's suggested "`#{session_attached}
   == 1` per session" invariant, catching Critical 4-style leaked/doubled attaches, not
   just Critical 3's misroute); (c) `bystander`'s stays `0`; (d) `tmux list-clients`
   across the whole socket shows exactly one entry, and it names `survivor`'s session —
   nothing on `dying`'s (destroyed) or `bystander`'s; (e) `survivor`'s socket is still
   perfectly healthy end to end (a real `echo`/read round trip), proving the fix isn't
   just "the dead client vanishes" but specifically "it never touched anyone else's
   pane." Added `tmuxSessionName`/`sessionAttachedCount`/`tmuxListClientSessions` oracle
   helpers (same shape as termbridge's, this package's own copies since the two packages
   share no test-helper file) and a `tmuxSocket` field on the shared `testServer` struct
   (`helpers_test.go`) so terminal tests can run these oracle queries against the same
   socket the server's own `tmuxClient` is bound to.

### Additional wave-2 work (from the orchestrator's brief, beyond the single named issue)

3. **`internal/tmux/tmux_test.go:349`** (`TestNewSession_AppliesServerOptionsOnFreshServer`):
   one-line value fix, `{"detach-on-destroy", "off"}` → `{"detach-on-destroy", "on"}`,
   matching daemon-impl Fix Attempt 2's REQ-4 amendment already live in `tmux.go`'s
   `serverOptions` and `plan.md`. This was the only failing subtest in the whole suite
   per daemon-impl's own handoff evidence, and is now green (see below). The table row
   documenting this test above is also updated to say `on`.

4. **`TestHandleTerminal_TakeoverNeverLeavesTwoClientsAttachedAtOnce`** (Major 1,
   takeover-ordering): a background goroutine polls `#{session_attached}` on the target
   session every 2ms across a full second-socket-supersedes-the-first sequence and
   records the maximum value observed; asserts it never exceeds `1`. This is a genuine
   ordering assertion, not just an eventual-state one — a regression to "attach before
   evict" (the exact Major 1 defect) would create a real, if brief, window with two
   attach processes on the session, which a 2ms poll has a good chance of catching
   (probabilistic by nature of polling real subprocess state, but backed by 8/8 clean
   repeated runs plus `-race -count=3`).
   **Test bug found and fixed while writing this**: the first version launched the
   session with `sleepForeverCommand()` (`/bin/sh -c "sleep 300"`) and then tried to
   write `echo TAKEOVER_ORDER_MARKER\n` into the pane expecting shell echo — but `sleep`
   is not a shell, so nothing ever echoed and the test failed with an empty read
   (reproduced 3/3 times: `"" does not contain "TAKEOVER_ORDER_MARKER"`). Fixed by
   switching to `shellCommand()` (a real `/bin/sh`), matching the pattern every other
   "prove the surviving/superseding connection actually streams" test in this file
   already uses (`TestHandleTerminal_SupersedesMidTyping`, `_SupersedesOnRefocus`). This
   was my own test-authoring mistake, not an implementation defect — confirmed by the fix
   making the test pass deterministically (8/8) with no implementation code touched.

5. **`TestHandleTerminal_ClientInitiatedCloseTearsDownThePTYPromptly`** (Critical 4
   regression, no-leaked-attach-after-client-close): a permanent automated version of
   daemon-impl's own throwaway measurement from Fix Attempt 2 (a `_test.go` they wrote,
   verified, then deleted). Launches a session with `sleepForeverCommand()` (silent after
   tmux's initial repaint — the idle Needs-Input condition the review measured),
   confirms the attach client registered (`#{session_attached} == 1`), closes the
   websocket gracefully from the client side (`c.Close(websocket.StatusNormalClosure,
   ...)`, matching a real browser's `ws.close()` — deliberately not `CloseNow()`, which
   force-drops the TCP connection and would trigger `exec.CommandContext`'s cancellation
   independently of the daemon's own fix, masking the very regression this test exists to
   catch, per daemon-impl's own note in Fix Attempt 2), then asserts
   `#{session_attached}` reaches `0` within 300ms. 300ms sits comfortably above
   daemon-impl's measured post-fix latency (32–45ms across 3 runs) and comfortably below
   their measured pre-fix latency (447–453ms, itself only bounded by `coder/websocket`'s
   own close-handshake timeout — a real, silent pane would hang indefinitely pre-fix), so
   a regression back to "wait for `<-ptyDone` before closing the bridge" fails this
   deterministically rather than by chance.

### Evidence

```
$ go build ./...
(exit 0, no output)

$ gofmt -l .
(no output)

$ go vet ./...
(no output)

$ golangci-lint run
0 issues.

$ go test ./internal/tmux/... -run TestNewSession_AppliesServerOptionsOnFreshServer -v
=== RUN   TestNewSession_AppliesServerOptionsOnFreshServer
=== RUN   TestNewSession_AppliesServerOptionsOnFreshServer/detach-on-destroy
--- PASS: TestNewSession_AppliesServerOptionsOnFreshServer (0.17s)
    --- PASS: TestNewSession_AppliesServerOptionsOnFreshServer/detach-on-destroy (0.01s)
    (all 8 subtests pass)
PASS
ok  	github.com/Zalaras/muster/internal/tmux	0.505s

$ go test ./internal/termbridge/... -run TestAttach_KillingOneOfTwoSessionsNeverMisroutesTheClientToTheOther -v -count=8
(8/8 PASS, e.g.:)
--- PASS: TestAttach_KillingOneOfTwoSessionsNeverMisroutesTheClientToTheOther (0.17s)
PASS
ok  	github.com/Zalaras/muster/internal/termbridge	1.686s

$ go test ./internal/server/... -run 'TestHandleTerminal_KillingOneSessionAmongMultipleNeverMisroutesToAnother|TestHandleTerminal_TakeoverNeverLeavesTwoClientsAttachedAtOnce|TestHandleTerminal_ClientInitiatedCloseTearsDownThePTYPromptly' -v -count=8
(8/8 PASS each, e.g.:)
--- PASS: TestHandleTerminal_KillingOneSessionAmongMultipleNeverMisroutesToAnother (0.27s)
--- PASS: TestHandleTerminal_TakeoverNeverLeavesTwoClientsAttachedAtOnce (0.58s)
--- PASS: TestHandleTerminal_ClientInitiatedCloseTearsDownThePTYPromptly (0.18s)
PASS
ok  	github.com/Zalaras/muster/internal/server	8.648s

$ go test ./internal/server/... -run 'TestHandleTerminal' -race -count=3
ok  	github.com/Zalaras/muster/internal/server	12.441s

$ go test ./internal/termbridge/... -race -count=3
ok  	github.com/Zalaras/muster/internal/termbridge	4.357s

$ go test ./internal/tmux/... -race -count=3
ok  	github.com/Zalaras/muster/internal/tmux	7.616s

$ go test ./... -count=1   (x2 consecutive full-suite runs)
ok  	github.com/Zalaras/muster/internal/claudecode
ok  	github.com/Zalaras/muster/internal/gitutil
ok  	github.com/Zalaras/muster/internal/server
ok  	github.com/Zalaras/muster/internal/session
ok  	github.com/Zalaras/muster/internal/store
ok  	github.com/Zalaras/muster/internal/termbridge
ok  	github.com/Zalaras/muster/internal/tmux
(repeated identically on the second run)

$ ls -la /private/tmp/tmux-501/   (before and after the full suite)
total 0
drwx------   2 damian  wheel   64 ...  .
drwxrwxrwt  12 root    wheel  384 ...  ..
(empty both times — no shared-socket-dir litter, D12 holds)
```

**Files touched this wave** (all test files, no implementation code):
- `internal/tmux/tmux_test.go` — one-line value fix (`detach-on-destroy off` → `on`).
- `internal/termbridge/termbridge_test.go` — new oracle helpers + 1 new test.
- `internal/server/helpers_test.go` — added `tmuxSocket` field to `testServer`.
- `internal/server/terminal_test.go` — set `tmuxSocket` in `newTerminalTestServer`, new
  oracle helpers + 3 new tests, `sync` import added.

**Build status**: `go build ./...` exits 0. Full daemon suite (`go test ./...` /
`make test`), `go vet ./...`, and `golangci-lint run` are all clean. No implementation
code was modified.

**Verdict: pass.**
