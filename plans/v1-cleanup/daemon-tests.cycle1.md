# Daemon Tests: v1 Cleanup

**Plan**: v1-cleanup
**Verdict**: implementation-bug

## Summary

Tests created/changed: 20 new or rewritten tests + 2 socket-helper-only edits (real
tests unchanged, just the helper they call) | Passing: all except 5 pre-existing tests
broken by one implementation defect | Failing: 5 (all one root cause, see below)

`go build ./...` and `golangci-lint run ./...` are both clean. `go vet ./...` is clean.
`gofmt -l` over every touched file reports nothing.

## Tests

### REQ-1/REQ-2/REQ-3: fakes for the 20 named tests, real tmux kept for the other 50

New shared test double, `internal/server/fakes_test.go`: `fakeTmux` (paneSpawner +
attachFunc, in-memory pane table, spawn/kill call counters, error injection on
`NewSession`/`NewNamedSession`) and `fakePaneConn` (paneConn: `Read` blocks until
`Close`, `Write` records bytes and self-closes on seeing "exit" to simulate a shell's
PTY EOF without a real process). `newFakeTmuxTestServer` builds a `*Server` with both
wired in; `markSessionDead` flips a session's `Alive` via a direct store write + reload
(the manager's own liveness path is *not* one of this plan's seams — it always talks to
a real, unconditionally-constructed `tmux.Client` per `server.go`'s `New`, so a fakes
test must never reach `Nudge`/`End`/`Remove`/`Reconcile`).

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `terminal_test.go` | TestHandleTerminal_UnknownSessionIs404 | 404 on unknown id, fakes | pass |
| `terminal_test.go` | TestHandleTerminal_NonNumericIDIs404 | 404 on unparseable id, fakes | pass |
| `terminal_test.go` | TestHandleTerminal_DeadSessionIs409 | 409 via `markSessionDead`, fakes | pass |
| `terminal_test.go` | TestHandleTerminal_RequiresCookie | 401 with no cookie, fakes | pass |
| `plainshell_test.go` | TestHandleCreateShell_NoShellYetSpawnsOneAndReturnsCreatedTrue | D1, asserts `fake.newNamedSessionCalls` | pass |
| `plainshell_test.go` | TestHandleCreateShell_RepeatCallReturnsCreatedFalse | D2, spawn-count strengthening | pass |
| `plainshell_test.go` | TestHandleCreateShell_UnknownSessionIs404 | 404 unknown_session | pass |
| `plainshell_test.go` | TestHandleCreateShell_DirectoryMissingIs409 | D6, 0 spawn calls on 409 | pass |
| `plainshell_test.go` | TestHandleCreateShell_DeadSessionSucceeds | D5/REQ-7 via `markSessionDead` | pass |
| `plainshell_test.go` | TestHandleCreateShell_SpawnFailureIs500ShellSpawnFailed | **new**: Edge Case 3/D9, `fake.newNamedSessionErr` → 500 shell_spawn_failed | pass |
| `plainshell_test.go` | TestHandleCreateShell_RequiresCookie | 401 | pass |
| `plainshell_test.go` | TestHandleCreateShell_LeavesSettingsLocalJSONUnchanged | REQ-2, `sessionLauncher` built directly with a `fakeTmux` | pass |
| `plainshell_test.go` | TestHandleShellTerminal_NoShellIs409NoShell | D8 | pass |
| `plainshell_test.go` | TestHandleShellTerminal_UnknownSessionIs404 | 404 | pass |
| `plainshell_test.go` | TestHandleShellTerminal_AttachOnlyNeverSpawns | 0 spawn calls on a rejected dial | pass |
| `plainshell_test.go` | TestShellLifecycle_NeverWritesAnySQLiteRow | D13/INV-2, redesigned: resize asserted via `fake.lastPaneConn().resize()`, "exit" simulated by `fakePaneConn`'s own EOF-on-"exit" behaviour instead of a real shell | pass |
| `shells_test.go` | TestShellRegistry_EnsureIsIdempotentNoSecondSpawn | D2, spawn-count via `newFakeShellRegistry` | pass |
| `shells_test.go` | TestShellRegistry_ConcurrentEnsureOnlySpawnsOnce | mutex-serializes concurrent spawns, spawn-count | pass |
| `shells_test.go` | TestShellRegistry_KillIsANoOpWhenNoShellExists | Kill's documented no-op | pass |
| `sessions_test.go` | TestLauncher_AutoPermissionModeSeedsLatchAndRepoDefault | D3/D7, `sessionLauncher.tmux = newFakeTmux()`, no real socket | pass |
| `sessions_test.go` | TestLauncher_CorruptSettingsFileRefusesAndRollsBackTheSessionRow | unchanged — never used tmux at all (fails before ever reaching it) | pass |

**Keep-real, verified unchanged** (D3, both directions): `terminal_test.go`'s 12,
`plainshell_test.go`'s 8, `shells_test.go`'s 4 (`EnsureSpawnsATmuxSessionNamedMusterIDShell`,
`EnsurePaneEnvironmentNeverCarriesMusterSession`, `RespawnsAfterExternalKillWithNoMusterSession`,
`KillRemovesOnlyItsOwnSession`), `sessions_test.go`'s 1
(`TestLauncher_SuccessfulLaunchEndToEnd`) — confirmed by `awk`-ing each file for which
constructor (`newTerminalTestServer`/`newTestShellRegistry`/`newTestTmuxClient` vs.
`newFakeTmuxTestServer`/`newFakeShellRegistry`/`newFakeTmux`) each test function calls;
every name matches the plan's Implementation Notes list exactly, in both directions.
`ResizeFrameAppliesRealGeometry`/`ResizeFrameIsClampedToTheProtocolBounds` (the
`srv.tmuxClient.DisplayVar` compile break daemon-impl's Handoff named) now build a local
concrete `tmux.New(srv.tmuxSocket)` alongside the interface-typed field, per the Handoff's
own suggested fix.

### REQ-4: shared socket helper adopted at all eight sites

`internal/tmux/tmuxtest.Socket(t)` (daemon-impl's package) now backs
`internal/tmux/tmux_test.go`'s `newTestSocket`, `internal/termbridge/termbridge_test.go`'s
`newTestTmuxClient`/`newTestTmuxClientWithSocket`, `cmd/musterd/open_test.go`'s
`openTestDaemonArgs`, `cmd/musterd/onexit_test.go`'s `spawnDaemon`, and
`internal/server`'s `newTerminalTestServer` (terminal_test.go), `newTestShellRegistry`
(shells_test.go) and `newTestTmuxClient` (sessions_test.go) — all eight sites the plan
names. The `sun_path` rationale now lives once, on `tmuxtest.Socket`'s own doc comment,
and each call site's local comment was trimmed rather than left duplicated.

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/tmux/tmuxtest/tmuxtest_test.go` | TestSocket_StaysUnderSunPathLimitEvenForAVeryLongTestName | **new**: D5, a deliberately ~140-char subtest name still produces a socket path under 104 bytes, and a real `tmux new-session` actually binds it | pass |

No dedicated test previously exercised D5 with a genuinely long name — every existing
call site happens to have a short test name, so the limit was asserted only by
inspection. Added this because D5 is a named acceptance criterion.

### REQ-6: nil-Locator guard

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `locate_test.go` | TestHandleLocateFile_NilLocatorIs500NotAPanic | D6: 500 internal_error, no panic, and the server answers a second request afterward (the "stays serving" half) | pass |

### REQ-7/REQ-9/REQ-10/REQ-11

- REQ-7 (`internal/locate`'s two unread fields deleted): no test fallout — `go vet`/`go test ./internal/locate/...` clean, unchanged.
- REQ-10 (doc-comment fix): prose only, nothing to test.
- REQ-11 (Makefile comment): nothing to test.
- REQ-9 (`checkWebDist(webDist string, dashboard fs.FS, log zerolog.Logger)`): `cmd/musterd/webdist_test.go` rewritten for the new signature — the three existing disk-override tests pass `fstest.MapFS{}` instead of calling `checkWebDist(dir, log)`, plus three new tests:

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `webdist_test.go` | TestCheckWebDist_DiskOverridePresent | unchanged behaviour, updated signature | pass |
| `webdist_test.go` | TestCheckWebDist_DiskOverrideEmptyDirWarnsButDoesNotFail | unchanged behaviour, updated signature | pass |
| `webdist_test.go` | TestCheckWebDist_DiskOverridePointsAtMissingDirectoryWarnsButDoesNotFail | unchanged behaviour, updated signature | pass |
| `webdist_test.go` | TestCheckWebDist_DiskOverridePrecedenceOverNonEmptyDashboard | **new**: D7, `-web-dist` wins even when the injected embedded `fs.FS` *does* have a dashboard | pass |
| `webdist_test.go` | TestCheckWebDist_NothingOnDiskNothingEmbeddedIsFatal | **new**: D5/D8, the fatal branch this REQ exists to make testable — asserts both remedies named | pass |
| `webdist_test.go` | TestCheckWebDist_EmbeddedDashboardPresentIsFine | **new**: non-fatal half of the webDist-unset branch | pass |

### Declined coverage

- REQ-12/REQ-13/REQ-14/REQ-15/REQ-16/REQ-17/REQ-18 and the web-side W1-W7/E1-E3
  criteria are web-tests'/e2e's territory (`web/src/terminal/notice.test.ts`,
  `web/src/render/dead.test.ts`, the E2E specs) — already landed per
  `daemon-implementation.md`'s log (commits `94fc794`, `3753530`) and outside this
  agent's remit (Go unit tests only).
- D4 (`shellRegistry.Kill` scoping, multi-instance) is covered by the unchanged
  keep-real `TestShellRegistry_KillRemovesOnlyItsOwnSession` (shells_test.go) and
  `TestHandleRemoveSession_KillsBothTmuxSessionsForThatSessionOnlyAnotherSurvives`
  (plainshell_test.go, keep-real) — both already assert the survivor is untouched;
  no new test needed, REQ-3 didn't move either off real tmux.
- D10/D11/D12 (no write-only shell state, no unread Locator fields, no `err.Error()`
  in the two 500 bodies) are structural — `shellRegistry` has no `spawned` field, the
  two `Locator` fields are gone, and `sessions.go:459-533`'s `handlePinSession`/
  `handleSetOrder` (unmodified by this pass) already send fixed strings; confirmed by
  reading `internal/server/shells.go`, `internal/locate/locate.go`, and
  `internal/server/sessions.go` directly rather than adding a redundant assertion.

## Implementation Bug

`internal/server/locate.go`'s `handleLocateFile` places the new REQ-6 nil-`Locator`
guard *before* the handler's existing body-validation branches (missing file part,
non-multipart body, bad filename, oversized upload) instead of guarding only the
`s.locator.Locate(...)` call it exists to protect. Every `newTestServer` in this
package leaves `Config.Locator` nil by default (it always has — `helpers_test.go`
never sets it), so this reorders five **pre-existing, already-approved** tests'
outcomes from their documented 400/413 codes to 500, with no change to those tests and
no relation to REQ-6's own criterion (D6: nil Locator + a request that would otherwise
reach the Locator → 500). Confirmed as a regression, not a pre-existing gap: `git diff
HEAD~1 HEAD -- internal/server/locate_test.go` is empty (the test file is byte-identical
across daemon-impl's commit), and `git show HEAD~1:internal/server/locate.go` has no nil
check at all — these five tests passed before this plan touched the file, purely because
they return in their own 400/413 branch before ever reaching `s.locator.Locate`.

| Bug | File | Expected (per plan) | Actual |
|-----|------|---------------------|--------|
| nil-Locator guard placed ahead of existing body-validation branches | `internal/server/locate.go:44-47` (the `if s.locator == nil` block, before `r.MultipartReader()`) | D6 only changes the nil-Locator-with-Locate-reachable path from a panic to 500; every other branch's status code (400 missing-file-part, 400 non-multipart, 400 bad-filename, 413 too-large) must be unchanged, since this plan's Protocol Contract states no wire shape changes anywhere else | The guard fires for **every** request when `Config.Locator` is nil, including ones that would otherwise 400/413 before ever reaching the Locator — five pre-existing tests now get 500 instead of their documented code |

**Suggested fix** (for daemon-impl, not applied here — implementation code is off
limits to this agent): move the `if s.locator == nil { ... }` check down to immediately
before `s.locator.Locate(r.Context(), ...)`, after `readFilePart` has already succeeded,
so it guards exactly the call it exists to protect and the existing 400/413 branches are
unreachable-therefore-unaffected exactly as before this plan.

## Doc note (not committed by this agent)

`docs/design/test-strategy.md`'s REQ-19 measurement, per the team-lead's brief ("report
the measurement... so the orchestrator can write it into docs/design/test-strategy.md"):
measured on this machine (12 cores), fresh runs, default invocation —

| Invocation | 2026-09-06 baseline | After REQ-1/REQ-2/REQ-3/REQ-4 |
|---|---|---|
| `go test -count=1 ./internal/server/...` (package alone) | 26.9 s (421 tests) | 18.6 s (3 runs: 18.58 s / 18.61 s / 18.67 s) |
| `internal/server` inside `go test -count=1 ./...` (full suite, packages parallel) | — | 20.3–22.8 s (3 runs) |
| `cmd/musterd` inside the same full run | 15.0 s | 11.1–11.7 s |
| `internal/tmux` inside the same full run | 10.2 s | 7.5–8.6 s |

This beats the plan's own honest ~22 s estimate for the standalone number; the
full-suite number varies run to run with contention from the other packages, exactly as
the plan's Overview predicted ("the wall is set by the slowest package"). The primary
win, as the plan states, is the ~20 fewer process forks per run, not the wall-clock
number itself.

I did **not** edit `docs/design/test-strategy.md` myself — the team-lead's brief assigns
that transcription to the orchestrator, and the plan's own Implementation Notes →
"Doc upkeep" section lists it under "(orchestrator)", not daemon-tests.

**Also observed, not mine to touch**: `TODO.md` currently has an uncommitted working-tree
diff (ticking the two Pre-v1 Cleanup items this plan closes, REQ-1-4 and the socket-helper
dedupe) that I did not make — it was already present before my first edit this session.
It reads as accurate to what I actually did, but I'm flagging it since I didn't write it
and the plan assigns `TODO.md` doc upkeep to the orchestrator too.

## Test Run Output

```
$ go build ./...
$ go vet ./...
$ golangci-lint run ./...
0 issues.

$ go test -count=1 ./...
...
--- FAIL: TestHandleLocateFile_MissingFilePart (0.01s)
    locate_test.go:213: Not equal: expected: 400, actual: 500
--- FAIL: TestHandleLocateFile_NotMultipartBody (0.01s)
    locate_test.go:230: Not equal: expected: 400, actual: 500
--- FAIL: TestHandleLocateFile_BadFilename (0.01s)
    locate_test.go:263: Not equal: expected: 400, actual: 500
--- FAIL: TestHandleLocateFile_TooLarge (0.01s)
    locate_test.go:277: Not equal: expected: 413, actual: 500
--- FAIL: TestHandleLocateFile_NeverWritesUploadToDisk (0.01s)
    locate_test.go:419: Not equal: expected: 400, actual: 500
FAIL	github.com/Zalaras/muster/internal/server	21.851s
ok  	github.com/Zalaras/muster/cmd/musterd	11.085s
ok  	github.com/Zalaras/muster/internal/claudecode	0.445s
ok  	github.com/Zalaras/muster/internal/ghissue	2.057s
ok  	github.com/Zalaras/muster/internal/gitutil	1.699s
ok  	github.com/Zalaras/muster/internal/locate	1.154s
ok  	github.com/Zalaras/muster/internal/session	4.492s
ok  	github.com/Zalaras/muster/internal/store	3.739s
ok  	github.com/Zalaras/muster/internal/termbridge	5.379s
ok  	github.com/Zalaras/muster/internal/tmux	8.482s
ok  	github.com/Zalaras/muster/internal/tmux/tmuxtest	2.588s
ok  	github.com/Zalaras/muster/internal/usage	5.451s
ok  	github.com/Zalaras/muster/internal/webui	4.232s
FAIL
```

`go test -race -count=1 ./internal/server/... ./internal/tmux/... ./internal/termbridge/... ./cmd/musterd/...`
reproduces the same 5 failures and nothing else — no data races in the new `fakeTmux`/
`fakePaneConn` infrastructure.
