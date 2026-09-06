# Daemon Tests: Plain terminal session

**Plan**: plain-terminal-session
**Verdict**: pass

## Summary

Tests created: 35 top-level (45 including `TestIsShellSessionName_Table`'s 10 subtests) | Passing: 35/35 | Failing: 0

(35th test, `TestHandleCreateShell_LeavesSettingsLocalJSONUnchanged`, added in the
review cycle 1 fix wave — see `## Fix Attempt` below.)

Four new files, no existing test file modified:

- `internal/tmux/shellname_test.go` — the naming convention and the `NewNamedSession` seam.
- `internal/server/shells_test.go` — `shellRegistry` (`Ensure`/`Kill`) directly, against a real per-test tmux socket.
- `internal/server/plainshell_test.go` — the two HTTP/WS handlers, `handleRemoveSession`/`handleEndSession`'s shell-touching behaviour, and the row-count INV-2 proof.
- `internal/session/reconcile_shell_test.go` — `Reconcile`'s shell sweep (D11/D12).

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/tmux/shellname_test.go` | TestShellSessionName_IsMusterDashIDDashShell | `ShellSessionName` format | pass |
| `internal/tmux/shellname_test.go` | TestIsShellSessionName_Table | `IsShellSessionName` parse table, incl. non-numeric/empty/double-suffix middles | pass |
| `internal/tmux/shellname_test.go` | TestShellSessionName_IsShellSessionName_RoundTrip | The two functions are inverses across several ids | pass |
| `internal/tmux/shellname_test.go` | TestNewNamedSession_CreatesASessionWithTheExactRequestedName | Arbitrary-name seam honors the name verbatim | pass |
| `internal/tmux/shellname_test.go` | TestNewNamedSession_SetsExtraEnvironmentInThePane | env param still works on the named-session entry point | pass |
| `internal/tmux/shellname_test.go` | TestNewNamedSession_DistinctNamesCreateDistinctTmuxSessions | Claude + shell names coexist as independent sessions | pass |
| `internal/server/shells_test.go` | TestShellRegistry_EnsureSpawnsATmuxSessionNamedMusterIDShell | D1 | pass |
| `internal/server/shells_test.go` | TestShellRegistry_EnsureIsIdempotentNoSecondSpawn | D2 (proven via invocation-log line count, not just tmux naming) | pass |
| `internal/server/shells_test.go` | TestShellRegistry_EnsurePaneEnvironmentNeverCarriesMusterSession | D3/INV-1, source state "freshly spawned" | pass |
| `internal/server/shells_test.go` | TestShellRegistry_RespawnsAfterExternalKillWithNoMusterSession | D7 + INV-1 source state "respawned after exit" | pass |
| `internal/server/shells_test.go` | TestShellRegistry_ConcurrentEnsureOnlySpawnsOnce | The mutex-across-the-round-trip decision (daemon-implementation.md Decisions) | pass |
| `internal/server/shells_test.go` | TestShellRegistry_KillIsANoOpWhenNoShellExists | `Kill`'s documented no-op behaviour | pass |
| `internal/server/shells_test.go` | TestShellRegistry_KillRemovesOnlyItsOwnSession | INV-4 at the registry layer, 2 sessions coexisting | pass |
| `internal/server/plainshell_test.go` | TestHandleCreateShell_NoShellYetSpawnsOneAndReturnsCreatedTrue | D1 (HTTP layer) | pass |
| `internal/server/plainshell_test.go` | TestHandleCreateShell_RepeatCallReturnsCreatedFalse | D2 (HTTP layer) | pass |
| `internal/server/plainshell_test.go` | TestHandleCreateShell_UnknownSessionIs404 | 404 `unknown_session` | pass |
| `internal/server/plainshell_test.go` | TestHandleCreateShell_DirectoryMissingIs409 | D6 | pass |
| `internal/server/plainshell_test.go` | TestHandleCreateShell_DeadSessionSucceeds | D5/REQ-7 | pass |
| `internal/server/plainshell_test.go` | TestHandleCreateShell_RequiresCookie | Auth wiring | pass |
| `internal/server/plainshell_test.go` | TestHandleCreateShell_LeavesSettingsLocalJSONUnchanged | REQ-2 settings half (review cycle 1 fix) | pass |
| `internal/server/plainshell_test.go` | TestHandleShellTerminal_NoShellIs409NoShell | D8 | pass |
| `internal/server/plainshell_test.go` | TestHandleShellTerminal_UnknownSessionIs404 | Pre-upgrade 404 | pass |
| `internal/server/plainshell_test.go` | TestHandleShellTerminal_AttachOnlyNeverSpawns | Protocol Contract's "attach only, never spawns" | pass |
| `internal/server/plainshell_test.go` | TestHandleShellTerminal_StreamsPTYOutputAndAcceptsInput | Basic round trip | pass |
| `internal/server/plainshell_test.go` | TestHandleShellTerminal_RunsInTheSessionsOwnDirectory | REQ-1's cwd, daemon-side half of E3 | pass |
| `internal/server/plainshell_test.go` | TestHandleShellTerminal_SecondSocketSupersedesFirstButNeverTheClaudeSocket | INV-3, one direction | pass |
| `internal/server/plainshell_test.go` | TestHandleTerminal_OpeningClaudeSocketNeverSupersedesAnOpenShellSocket | INV-3, other direction | pass |
| `internal/server/plainshell_test.go` | TestHandleShellTerminal_ShellDeathNeverNudgesTheParentsLiveness | §6.1 `nudgeOnEOF:false` — see Notes | pass |
| `internal/server/plainshell_test.go` | TestHandleShellTerminal_KilledExternallyClosesSocketWith4001 | External-kill PTY EOF variant | pass |
| `internal/server/plainshell_test.go` | TestHandleRemoveSession_KillsBothTmuxSessionsForThatSessionOnlyAnotherSurvives | D9 + INV-4, 2 sessions coexisting | pass |
| `internal/server/plainshell_test.go` | TestHandleEndSession_LeavesShellRunning | D10 | pass |
| `internal/server/plainshell_test.go` | TestShellLifecycle_NeverWritesAnySQLiteRow | D13/INV-2, full spawn→attach→resize→exit→respawn→kill cycle | pass |
| `internal/session/reconcile_shell_test.go` | TestReconcile_KillsEveryShellSessionUnconditionallyAndCountsThem | D11, crossed against 3 source states for `<n>` | pass |
| `internal/session/reconcile_shell_test.go` | TestReconcile_NeverListsAnyShellSessionAsUnknown | D12, same 3 source states | pass |
| `internal/session/reconcile_shell_test.go` | TestReconcile_AFailedShellKillIsNotCountedButStillNeverReportedAsUnknown | Error branch: not counted, still never "unknown" | pass |

## Test Run Output

```
$ go build ./...
(exit 0, no output)

$ gofmt -l .
(no output)

$ go vet ./...
(exit 0, no output)

$ golangci-lint run
0 issues.

$ golangci-lint run --tests=false ./...
0 issues.

$ make test
go test -count=1 ./...
ok  	github.com/Zalaras/muster/cmd/musterd	10.039s
ok  	github.com/Zalaras/muster/internal/claudecode	0.934s
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
ok  	github.com/Zalaras/muster/internal/ghissue	1.760s
ok  	github.com/Zalaras/muster/internal/gitutil	2.271s
ok  	github.com/Zalaras/muster/internal/locate	2.117s
ok  	github.com/Zalaras/muster/internal/server	24.963s
ok  	github.com/Zalaras/muster/internal/session	4.472s
ok  	github.com/Zalaras/muster/internal/store	4.511s
ok  	github.com/Zalaras/muster/internal/termbridge	5.558s
ok  	github.com/Zalaras/muster/internal/tmux	12.298s
ok  	github.com/Zalaras/muster/internal/usage	5.302s
ok  	github.com/Zalaras/muster/internal/webui	3.743s

$ go test -race ./internal/server/... ./internal/session/... ./internal/tmux/...
ok  	github.com/Zalaras/muster/internal/server	52.807s
ok  	github.com/Zalaras/muster/internal/session	16.426s
ok  	github.com/Zalaras/muster/internal/tmux	10.705s
```

## Notes

- **A real test bug was caught and fixed before this report, not left in.**
  `TestHandleShellTerminal_SecondSocketSupersedesFirstButNeverTheClaudeSocket` initially
  used a single `shell1.Read(ctx)` call to look for the 4000 supersede close — under
  `make test`'s full-package concurrent run this occasionally captured an ordinary tmux
  repaint output frame instead of the close (a real race, reproduced once, not the
  daemon's fault: `readUntilError`'s own doc comment in `terminal_test.go` names exactly
  this trap). Fixed to use the existing `readUntilError` helper like every other
  supersede test in the package; reran 5x solo and the full suite twice more with no
  recurrence, plus `-race` clean.
- **`TestHandleShellTerminal_RunsInTheSessionsOwnDirectory` deliberately does not
  `filepath.EvalSymlinks` the expected directory**, unlike `internal/tmux`'s own
  `TestNewSession_SpawnsInTheGivenDirectory`. Measured directly (first draft failed):
  tmux sets a new pane's `$PWD` verbatim from `new-session -c`'s argument, and an
  *interactive* shell's `pwd` builtin echoes that logical value back rather than calling
  `getcwd()` — the tmux test's own comparison only works because it spawns a
  *non-interactive* `sh -c` with no inherited `$PWD`, a different case. On macOS,
  `t.TempDir()` lives under a `/var/folders` path that is itself a symlink to
  `/private/var/folders`, which is what exposed the difference.
- **Every test that spawns a real shell surface sets `t.Setenv("SHELL", "/bin/sh")`**
  before calling `Ensure`/`POST .../shell`, rather than relying on whatever `$SHELL` the
  machine running the tests happens to have configured. `interactiveShellArgv()`
  (`internal/server/shells.go`) has no other seam to inject a test command — it always
  reads `os.Getenv("SHELL")` — and a real developer shell (zsh with `nvm`/oh-my-zsh, as
  this repo's own dev machine has) can take several seconds to become interactive, which
  first showed up as a flaky/failing `TestHandleShellTerminal_RunsInTheSessionsOwnDirectory`
  before the override was added. Proving "the daemon spawns *some* real interactive
  shell and behaves correctly around it" is this suite's job; "the user's actual `$SHELL`
  really works" is the E2E suite's job per `test-specs.md`'s own REQ-1 note.
- **INV-1 coverage across its four named source states**: "freshly spawned" and
  "respawned after exit" are covered directly
  (`TestShellRegistry_EnsurePaneEnvironmentNeverCarriesMusterSession`,
  `TestShellRegistry_RespawnsAfterExternalKillWithNoMusterSession`). "Spawned on a dead
  session" and "spawned after the parent was Resumed" are **not** independently covered
  here: `shellRegistry.Ensure` takes no `alive`/session-state parameter at all and its
  env-setting code path (`nil` env, no `sessionLauncher`) is identical regardless of the
  caller's session state — `TestHandleCreateShell_DeadSessionSucceeds` (this file) proves
  the dead-session path reaches `Ensure` at all (D5/REQ-7), and that's the same `Ensure`
  the two direct env tests already cover byte-for-byte. Re-running the identical
  env-assertion after an HTTP-level dead-session/resume setup would exercise no new code
  path — it was on this basis, not by omission, that those two states were left to the
  E2E suite's own INV-1 note (test-specs.md: "D3/E7 primarily a daemon-unit-test oracle").
- **D3/INV-1's oracle is the stub shell process observing its own environment**, not
  `tmux show-environment` — matching `sessions_test.go`'s `newStubClaudeBin`
  doc comment ("show-environment reflects a separate update-environment table, not the
  process env passed at spawn"), confirmed the same way here: a first draft using
  `tmux show-environment` would have proven nothing about what the spawned process
  actually received.
- **§6.1's `nudgeOnEOF:false` is proven by an engineered failure mode, not merely by
  "Alive stays true"**: an ordinary shell-under-a-healthy-parent test would pass whether
  or not the shell handler wrongly nudged the liveness poll, because nudging a target
  that still exists is a harmless no-op either way (`internal/session.Manager.Nudge`
  checks the *parent's Claude* `TmuxTarget`, not the shell's). Given the plan says a
  wrong `nudgeOnEOF:true` here must never happen,
  `TestHandleShellTerminal_ShellDeathNeverNudgesTheParentsLiveness` seeds a parent whose
  Claude `TmuxTarget` was never actually created in tmux (`seedDeadSessionWithBogusClaudeTarget`),
  so a wrongly-firing nudge would flip `Alive` to `false` almost instantly; the test
  waits 500ms past the socket's 4001 close and asserts `Alive` is still `true` — a real,
  falsifiable oracle for the specific behavioural difference the plan calls out, not a
  no-op assertion.
- **D13/INV-2** is asserted as one total-row-count invariant (`session` + `repo` +
  `event`) taken before and after a full spawn → attach → type input → resize → exit
  (PTY EOF) → respawn → kill cycle, per the plan's own D13 wording ("a total row count
  ... taken before and after"). The one legitimate session row already exists before the
  count baseline is taken, so only the shell operations themselves are under test.
- **Declined coverage, cited**: `TestHandleTerminal_KillingOneSessionAmongMultipleNeverMisroutesToAnother`
  in the existing `internal/server/terminal_test.go` (review.md Critical 3's regression
  test) already proves `detach-on-destroy=on` keeps one Claude session's destruction from
  misrouting a client to a different Claude session's pane, with the same
  survivor/bystander multi-instance shape this plan's D9/INV-4 test reuses for shells —
  I did not duplicate a from-scratch "does tmux's own detach-on-destroy work" test for
  the shell topology since it is the same tmux server option, same code path
  (`termbridge.Attach`/`terminalRegistry`), applied to a second attach-target key; the
  new coverage here (`TestHandleRemoveSession_KillsBothTmuxSessionsForThatSessionOnlyAnotherSurvives`)
  targets what's actually new: that `Remove`/`Kill` route correctly to *both* of one
  session's tmux sessions and *only* that session's.
- **What's out of scope for this suite, and why**: E1/E4 (Focus↔Tiles persistence),
  E14/E16 (file-drop/resize UI plumbing), and the mockup/CSS-driven W-series criteria are
  web/E2E concerns with no daemon-side logic distinct from what the existing Claude-pane
  terminal tests (`internal/server/terminal_test.go`) already prove about
  `TerminalSurface`'s shared resize/drop machinery — REQ-11 states the shell surface
  reuses that machinery unchanged, and daemon-tests.md's own log confirms no new resize/
  drop code was added for the shell path. Edge cases 1/2/9/10 (nested `claude`, unrouted
  `/clear` pairs) are pre-existing ingest-routing behaviour this plan does not touch (the
  plan's own edge-case list marks them "untested: pre-existing behaviour, not changed by
  this plan").

## Boundary check

`internal/tmux` and `internal/server/shells.go` import no `internal/claudecode` symbol,
confirmed by `go build ./...`/`golangci-lint run` passing and by inspection of both new
production files' import blocks (unchanged from daemon-implementation.md's own log) —
no Claude-Code-format knowledge leaked into the shell spawn path.

## Fix Attempt (review cycle 1)

**Issue addressed**: review.md Major 2 — no test anywhere asserted REQ-2's settings
half ("`POST .../shell` writes no `.claude/settings.local.json` into the session's
directory"). Grepping every new Go test file and the E2E spec for `settings.local.json`
returned nothing prior to this fix.

**Code path that reaches the defect area, and how it's now closed**: there is exactly
one call site in production code that could write `.claude/settings.local.json` —
`sessionLauncher.writeSettings` (`internal/server/sessions.go:255`), called only from
`sessionLauncher.Launch` and `sessionLauncher.Resume`. `shellRegistry.Ensure`
(`internal/server/shells.go:56`), the only code `handleCreateShell` calls, has no
reference to `writeSettings`, `claudecode.MergeSettings`, or any `.claude` path at all —
confirmed by `go build ./...`/`golangci-lint run` passing and by inspection of
`shells.go`'s complete import block (`context`, `fmt`, `os`, `sync`, `zerolog`,
`internal/tmux` only). So the one path that reaches the shell POST handler
(`handleCreateShell` → `shellRegistry.Ensure` → `tmux.NewNamedSession`) is now covered
directly by asserting the file the *parent's own launch* wrote is untouched across that
POST — there is no second path into `handleCreateShell` that bypasses `Ensure`.

Added `TestHandleCreateShell_LeavesSettingsLocalJSONUnchanged`
(`internal/server/plainshell_test.go`): launches a session through the real
`sessionLauncher.Launch` (not this file's `launchRealSession` helper, which bypasses the
launcher and its `writeSettings` step entirely and so would let a test wrongly assert
"absent" — the caveat named in the fix-mode task), which writes
`dir/.claude/settings.local.json` as an ordinary side effect of a real launch. The test
captures that file's content and mtime, fires `POST /api/sessions/{id}/shell`, then
re-reads both and asserts byte-for-byte content equality and an unchanged `ModTime()`.

**Verified the test is a real oracle, not vacuously green**: temporarily patched the
test (self-only, reverted immediately after, implementation untouched throughout) to
overwrite `settingsPath` with tampered content between the before/after reads. Both the
content assertion and the mtime assertion failed as expected:

```
Error Trace:	/Users/damian/Documents/code/Projects/muster/internal/server/plainshell_test.go:299
Error:      	Not equal: (settings.local.json content, real JSON) != (len=8) {TAMPERED}
Messages:   	REQ-2: POST .../shell must never modify settings.local.json's content
Error Trace:	/Users/damian/Documents/code/Projects/muster/internal/server/plainshell_test.go:300
Error:      	Not equal: 2026-09-05 23:09:59.967217998 +0200 SAST != 2026-09-05 23:10:00.111775202 +0200 SAST
Messages:   	REQ-2: POST .../shell must never rewrite settings.local.json, even byte-identically
```

Reverted from `/tmp/plainshell_test.go.bak` back to the clean version (confirmed via
`git diff --stat` showing only the intended 49-line addition) before the final run below.

**Result**: `go build ./...` clean, `gofmt -l` clean, `go vet ./...` clean,
`golangci-lint run` 0 issues, `make test` green across every package including the new
test. Verdict stays `pass`.

### Test Run Output (fix verification)

```
$ go build ./...
(exit 0, no output)

$ gofmt -l internal/server/plainshell_test.go
(no output)

$ go vet ./...
(exit 0, no output)

$ golangci-lint run ./...
0 issues.

$ make test
go test -count=1 ./...
ok  	github.com/Zalaras/muster/cmd/musterd	15.246s
ok  	github.com/Zalaras/muster/internal/claudecode	1.510s
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
ok  	github.com/Zalaras/muster/internal/ghissue	2.131s
ok  	github.com/Zalaras/muster/internal/gitutil	3.631s
ok  	github.com/Zalaras/muster/internal/locate	3.354s
ok  	github.com/Zalaras/muster/internal/server	25.906s
ok  	github.com/Zalaras/muster/internal/session	5.999s
ok  	github.com/Zalaras/muster/internal/store	5.521s
ok  	github.com/Zalaras/muster/internal/termbridge	7.473s
ok  	github.com/Zalaras/muster/internal/tmux	18.869s
ok  	github.com/Zalaras/muster/internal/usage	6.129s
ok  	github.com/Zalaras/muster/internal/webui	7.921s
```
