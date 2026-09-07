# Daemon Tests: v1 Cleanup

**Plan**: v1-cleanup
**Verdict**: pass

## Summary

Tests created/changed: 21 new or rewritten test functions (22 counting the new
`TestHandleLocateFile_NilLocatorStillValidatesBodyFirst`'s two subtests as one function)
+ 2 socket-helper-only edits (real tests unchanged, just the helper they call) | Passing:
all | Failing: 0

This is a re-verification pass after daemon-impl's Fix Attempt 1 (commit `eb35cba`,
"move nil-Locator guard below body validation"), which addressed the sole defect this
agent reported in cycle 1 (`plans/v1-cleanup/daemon-tests.cycle1.md`). No other test
content changed from cycle 1 except the one addition below.

`go build ./...`, `go vet ./...` (via `make lint`) and `golangci-lint run ./...` are all
clean. `gofmt -l` over every touched file reports nothing. Full `go test -count=1 ./...`
is green across every package.

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
| `locate_test.go` | TestHandleLocateFile_NilLocatorStillValidatesBodyFirst | **new (this cycle)**: pins Fix Attempt 1's regression directly — with `Config.Locator` nil, a request whose *body* is invalid (`missing_file_part` subtest: no file part → 400 invalid_request; `too_large` subtest: oversize upload → 413 too_large) still gets the body-validation branch's own status/code, never the nil-Locator guard's 500 | pass |

### Fix Verification (cycle 1's implementation-bug, now closed)

Cycle 1 reported `internal/server/locate.go`'s nil-`Locator` guard firing ahead of the
handler's body-validation branches, turning five pre-existing tests' 400/413 into 500.
daemon-impl's Fix Attempt 1 (`eb35cba`) moved the guard down to sit immediately before
`s.locator.Locate(...)`, after `readFilePart` succeeds — see its `## Fix Attempt 1`
section in `daemon-implementation.md` for the full rationale.

Re-verified in this cycle:
- The reporter's exact repro, `go test -count=1 ./internal/server/ -run TestHandleLocateFile`,
  now passes in full (all 10 test functions, including
  `TestHandleLocateFile_NilLocatorIs500NotAPanic`, which still passes unchanged).
- Added `TestHandleLocateFile_NilLocatorStillValidatesBodyFirst` (above) as a direct pin
  on the exact regression shape — a nil Locator combined with an invalid body — rather
  than relying only on the five originally-broken tests (which use `newTestServer`'s
  incidental nil default) to keep this from recurring.
- Full suite (`go test -count=1 ./...`), `go build ./...`, `go vet ./...` (via
  `make lint`), and `golangci-lint run ./...` are all green — see Test Run Output below.

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

## Test Run Output

```
$ go build ./...
$ go vet ./...   (via make lint)
$ golangci-lint run
0 issues.

$ go test -count=1 ./internal/server/ -run TestHandleLocateFile -v
=== RUN   TestHandleLocateFile_RequiresCookie
--- PASS: TestHandleLocateFile_RequiresCookie (0.01s)
=== RUN   TestHandleLocateFile_UnknownSession
--- PASS: TestHandleLocateFile_UnknownSession (0.01s)
=== RUN   TestHandleLocateFile_MissingFilePart
--- PASS: TestHandleLocateFile_MissingFilePart (0.01s)
=== RUN   TestHandleLocateFile_NotMultipartBody
--- PASS: TestHandleLocateFile_NotMultipartBody (0.01s)
=== RUN   TestHandleLocateFile_BadFilename
--- PASS: TestHandleLocateFile_BadFilename (0.01s)
=== RUN   TestHandleLocateFile_TooLarge
--- PASS: TestHandleLocateFile_TooLarge (0.12s)
=== RUN   TestHandleLocateFile_OutcomesMatchLocatorResult
--- PASS: TestHandleLocateFile_OutcomesMatchLocatorResult (0.05s)
=== RUN   TestHandleLocateFile_NeverWritesUploadToDisk
--- PASS: TestHandleLocateFile_NeverWritesUploadToDisk (0.08s)
=== RUN   TestHandleLocateFile_FinderErrorReturnsInternalError
--- PASS: TestHandleLocateFile_FinderErrorReturnsInternalError (0.01s)
=== RUN   TestHandleLocateFile_NilLocatorIs500NotAPanic
--- PASS: TestHandleLocateFile_NilLocatorIs500NotAPanic (0.01s)
=== RUN   TestHandleLocateFile_NilLocatorStillValidatesBodyFirst
=== RUN   TestHandleLocateFile_NilLocatorStillValidatesBodyFirst/missing_file_part
=== RUN   TestHandleLocateFile_NilLocatorStillValidatesBodyFirst/too_large
--- PASS: TestHandleLocateFile_NilLocatorStillValidatesBodyFirst (0.07s)
PASS
ok  	github.com/Zalaras/muster/internal/server	1.208s

$ go test -count=1 ./...
ok  	github.com/Zalaras/muster/cmd/musterd	12.039s
ok  	github.com/Zalaras/muster/internal/claudecode	0.949s
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
ok  	github.com/Zalaras/muster/internal/ghissue	1.767s
ok  	github.com/Zalaras/muster/internal/gitutil	2.336s
ok  	github.com/Zalaras/muster/internal/locate	2.157s
ok  	github.com/Zalaras/muster/internal/server	23.085s
ok  	github.com/Zalaras/muster/internal/session	4.080s
ok  	github.com/Zalaras/muster/internal/store	3.744s
ok  	github.com/Zalaras/muster/internal/termbridge	3.874s
ok  	github.com/Zalaras/muster/internal/tmux	8.053s
ok  	github.com/Zalaras/muster/internal/tmux/tmuxtest	4.093s
ok  	github.com/Zalaras/muster/internal/usage	5.645s
ok  	github.com/Zalaras/muster/internal/webui	4.934s
```

## Doc note (not committed by this agent)

Unchanged from cycle 1: `docs/design/test-strategy.md`'s REQ-19 measurement table and
`TODO.md`'s doc upkeep are the orchestrator's to transcribe/commit per the plan's
Implementation Notes → "Doc upkeep" section (already recorded in
`daemon-tests.cycle1.md`, and now committed per `daemon-implementation.md`'s log,
commit `0b1a27f`) — nothing further needed from this agent on that front.
