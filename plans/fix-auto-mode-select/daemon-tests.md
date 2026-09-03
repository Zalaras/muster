# Daemon Tests: fix-auto-mode-select

**Plan**: fix-auto-mode-select
**Verdict**: pass

## Summary

Tests created: 39 (7 top-level `t.Run` groups/functions touched, 39 subtest cases new or extended) | Passing: 39 | Failing: 0

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/claudecode/launch_test.go` | `TestBuildArgv/auto_mode_adds_--permission-mode_auto` | D5: `BuildArgv` with `PermissionMode: "auto"` emits `--permission-mode auto` | pass |
| `internal/session/machine_test.go` | `TestApplyInput_TurnActivity/REQ-5_D8:_...` | D8/REQ-5: session seeded `auto`, `UserPromptSubmit{permission_mode:"default"}` (haiku fallback) lands `{default, hook}` and state `working`, never `planning` | pass |
| `internal/session/machine_test.go` | `TestActiveState/auto_latches_to_working` | `auto` is not `plan`, so `activeState()` returns `working` | pass |
| `internal/session/machine_test.go` | `TestLatchPermissionMode_SeedThenHookInvariant/*` (32 subtests) | INV-1 exhaustively: every seed value (`default`,`plan`,`acceptEdits`,`auto`) × every hook-reported value × both input kinds that call `latchPermissionMode` (`TurnActivity`, `TurnClosed`) always lands `{value, "hook"}` — not just the convenient starting seed the per-transition tests already used | pass |
| `internal/session/machine_test.go` | `TestLatchPermissionMode_SeedThenHookInvariant/*_nil_hook_leaves_seed_untouched` (4 subtests) | INV-1's other half via `TurnClosed`: a nil `permission_mode` never resets source from `seed`, from every starting seed including `auto` | pass |
| `internal/server/sessions_test.go` | `TestHandleCreateSession_UnknownPermissionModeMessageNamesAllFour` | D4: rejection message text is exactly `permissionMode must be one of default, plan, acceptEdits, auto` (existing table only asserted the error code) | pass |
| `internal/server/sessions_test.go` | `TestLauncher_AutoPermissionModeSeedsLatchAndRepoDefault` | D3 (launch with `auto` returns a session whose latch is `{"auto","seed"}`) and D7 (`GET /api/repos`-backing store row records `lastPermissionMode: "auto"` for that directory) via a real per-test tmux socket + stub `claude` binary, mirroring `TestLauncher_SuccessfulLaunchEndToEnd`'s existing pattern | pass |

D1/D2/D6/D9 were already covered before this pass (D6 by the pre-existing "default mode with no title omits..." case; D9 is a static grep check, not a unit test — reconfirmed clean below).

## Implementation Bugs

None found. The daemon implementation (`internal/session/session.go`'s `PermissionAuto` constant, `internal/server/sessions.go`'s validation switch and message, `internal/claudecode/launch.go`'s `BuildArgv` switch) matches the plan's REQ-1 through REQ-5 and D3–D9 exactly, including the CLAUDE.md-mandated confinement of the `--permission-mode` flag string to `internal/claudecode/`.

## Test Run Output

```
$ go build ./...
(exit 0, no output)

$ go vet ./...
(exit 0, no output)

$ gofmt -l internal/claudecode/launch_test.go internal/session/machine_test.go internal/server/sessions_test.go
(exit 0, no output)

$ make lint
golangci-lint run
0 issues.

$ make test
go test -count=1 ./...
ok  	github.com/Zalaras/muster/cmd/musterd	18.393s
ok  	github.com/Zalaras/muster/internal/claudecode	1.320s
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
ok  	github.com/Zalaras/muster/internal/ghissue	2.573s
ok  	github.com/Zalaras/muster/internal/gitutil	2.856s
ok  	github.com/Zalaras/muster/internal/locate	3.665s
ok  	github.com/Zalaras/muster/internal/server	21.912s
ok  	github.com/Zalaras/muster/internal/session	6.427s
ok  	github.com/Zalaras/muster/internal/store	6.193s
ok  	github.com/Zalaras/muster/internal/termbridge	5.642s
ok  	github.com/Zalaras/muster/internal/tmux	19.988s
ok  	github.com/Zalaras/muster/internal/usage	8.230s
ok  	github.com/Zalaras/muster/internal/webui	10.127s
?   	github.com/Zalaras/muster/test/rig/capture	[no test files]
?   	github.com/Zalaras/muster/test/rig/failproxy	[no test files]

Fully green this run — no recurrence of the known intermittent cmd/musterd preflight
flake noted in daemon-implementation.md.

$ rg -n -e "--permission-mode" cmd/ internal/ test/ --glob '!internal/claudecode/**'
(no matches — D9 still clean after the new test files)
```
