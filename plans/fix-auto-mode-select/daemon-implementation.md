# Daemon Implementation: fix-auto-mode-select

**Plan**: fix-auto-mode-select
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/session/session.go` | modified | Added `PermissionAuto PermissionMode = "auto"` constant beside the three existing ones, comment citing the 2026-09-03 permission-mode probe against 2.1.259. |
| `internal/server/sessions.go` | modified | `Launch`'s request-validation switch now accepts `"auto"`; the `invalidRequest` message on rejection is `permissionMode must be one of default, plan, acceptEdits, auto` (D4). |
| `internal/claudecode/launch.go` | modified | `LaunchParams.PermissionMode` comment now lists all four values; `BuildArgv`'s switch emits `--permission-mode auto` alongside `plan`/`acceptEdits` (D5); `"default"` still emits no flag (D6). Remains the only place the `--permission-mode` flag string appears (D9). |

## Decisions

- No changes needed in `internal/session/machine.go` (`latchPermissionMode`), `internal/store/repo.go`, `internal/store/session.go`, `internal/server/issue.go`, `internal/server/sessionwire.go`, or `internal/server/repos.go`: all of these treat `PermissionMode`/`lastPermissionMode` as an open string (DB columns are free-text, wire fields are pass-through), so `"auto"` flows through them with zero code change — matches the plan's Schema Changes section ("no schema changes required") and REQ-5's framing that latch correction is existing behaviour, not new code.
- `internal/claudecode/claudecodetest/claudecodetest.go` (a non-`_test.go` helper package used by daemon tests to synthesize hook payloads) also needs no change: its `PermissionMode` option is a plain string with no enum switch, so daemon-tests can already pass `"auto"` through it without modification.

## Handoff

**Build status**: `go build ./...` exits 0.

No test files needed changes I wasn't allowed to make. `go test ./...` is fully green (one `cmd/musterd` preflight test — `TestRunTmuxPreflight_UnrecognizedVersionIsNotFatal` — failed on the first run and passed on immediate re-run and in 3x isolation; unrelated to this change, matches the known "make test intermittently red on main" flake). `make lint` and `golangci-lint run --tests=false ./...` both report 0 issues.

Gate results, evidence:
```
$ go build ./...
(exit 0, no output)

$ gofmt -l .
(no output)

$ go vet ./...
(no output)

$ rg -n -e "--permission-mode" cmd/ internal/ test/ --glob '!internal/claudecode/**'
(no matches — D9 passes)

$ go test ./...
ok all packages (second run, after one flaky cmd/musterd failure resolved by isolated re-run 3/3 pass)

$ make lint
golangci-lint run
0 issues.

$ golangci-lint run --tests=false ./...
0 issues.
```
