# Daemon Implementation: tmux-server-env-leak

**Plan**: tmux-server-env-leak
**Mode**: initial
**Pack**: kb: pack 8500 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/tmux/tmux.go` | modified | `execSeparated` sets `cmd.Env` to `os.Environ()` minus `MUSTER_SESSION`; new exported const `MusterSessionEnvVar` (REQ-1, REQ-2) |

## Decisions

- REQ-1: every tmux invocation passes through `execSeparated` (the `Client.exec` seam), so the server is never started by an unscrubbed call. `NewSession`'s `-e` map is untouched and still reaches the pane.
- REQ-2: met by the same change; the two server-package tests pass with `MUSTER_SESSION=9` (output below). The tests are unedited.
- design: `MusterSessionEnvVar` is a const, not a var, so there is no package-level mutable state; it is exported so the server package's later guard test can compare it with `claudecode.MusterSessionEnvVar`. `internal/tmux` does not import `internal/claudecode`.
- design: no existing helper to reuse. `rg -n "os\.Environ\(\)" --glob '*.go' --glob '!*_test.go'` found only `cmd/musterd/update.go` (re-exec, adds a variable), `internal/termbridge/termbridge.go` (attach, adds two) and `tools/gatelock/main.go`; none filters a variable out. Matched the sibling shape of `termbridge`: `cmd.Env` set inline on the command, no wrapper type. The filter is `slices.DeleteFunc` on the copy `os.Environ()` already returns, matching on the `NAME=` prefix so no other variable is touched.
- size: `internal/tmux/tmux.go` was already over the file-length threshold (757 lines before, 763 after); the six added lines are the seam change and belong beside `execSeparated`.

doc-delta: none; the plan's `## Doc Delta` for surfaces still holds as written.

## Handoff

**Build status**: `go build ./...` exits 0. No test file is sanctioned-broken, so plain `make lint` is a valid signal.

None. The guard test in `internal/server/shells_test.go` (scrubbed name equals `claudecode.MusterSessionEnvVar`) is daemon-tests' next step; the symbol it compares is `tmux.MusterSessionEnvVar`.

## Verification output

```
$ go test -count=1 -run 'TestNewSession_PaneNeverInheritsMusterSessionFromTheClientEnvironment' ./internal/tmux/
ok  	github.com/Zalaras/muster/internal/tmux	0.958s

$ MUSTER_SESSION=9 go test -count=1 -run 'TestShellRegistry_(EnsurePaneEnvironmentNeverCarriesMusterSession|RespawnsAfterExternalKillWithNoMusterSession)' ./internal/server/
ok  	github.com/Zalaras/muster/internal/server	1.852s

$ make lint
golangci-lint run
0 issues.

$ go test -race -count=1 ./internal/tmux/...
ok  	github.com/Zalaras/muster/internal/tmux	12.919s
ok  	github.com/Zalaras/muster/internal/tmux/tmuxtest	2.584s
```
