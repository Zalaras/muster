# Daemon Tests: tmux-server-env-leak

**Plan**: tmux-server-env-leak
**Verdict**: pass
**Pack**: kb: pack 6292 words (budget 30000)

## Summary

Tests created: 2 | Passing: 2 | Failing: 0 (final run, second section below). The first section is the red-first record, kept as written.

## Red-first record

Red-first run. Tests created: 1 | Passing: 0 | Failing: 1 (red on an assertion, as the plan's diagnosis predicts)

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/tmux/tmux_test.go` | TestNewSession_PaneNeverInheritsMusterSessionFromTheClientEnvironment | REQ-1: with `MUSTER_SESSION=leaked` in the client process, a pane on a freshly started per-test server sees it empty | red |

The second guard test in `internal/server/shells_test.go` (the scrubbed name equals `claudecode.MusterSessionEnvVar`) is deferred until the implementation lands.

## Handoff Received

None

## Notes

The test compiles, passes `go vet ./internal/tmux/` and `golangci-lint run ./internal/tmux/...` (0 issues). It is red from a shell without the variable too, because it sets the variable itself with `t.Setenv`.

## Test Run Output

```
$ go test -count=1 -run 'TestNewSession_PaneNeverInheritsMusterSessionFromTheClientEnvironment' ./internal/tmux/
--- FAIL: TestNewSession_PaneNeverInheritsMusterSessionFromTheClientEnvironment (0.17s)
    tmux_test.go:114:
        	Error Trace:	/Users/damian/Documents/code/Projects/muster/internal/tmux/tmux_test.go:114
        	Error:      	Not equal:
        	            	expected: "[]\n"
        	            	actual  : "[leaked]\n"
        	Test:       	TestNewSession_PaneNeverInheritsMusterSessionFromTheClientEnvironment
FAIL
FAIL	github.com/Zalaras/muster/internal/tmux	0.911s

$ env -u MUSTER_SESSION go test -count=1 -run '...' ./internal/tmux/
expected: "[]\n"  actual: "[leaked]\n"   (same failure)
```

## Guard test (second pass, after the implementation landed)

Tests created: 1 | Passing: 1 | Failing: 0

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/server/shells_test.go` | TestTmuxScrubbedEnvVarNameMatchesTheWrapperContract | `tmux.MusterSessionEnvVar` equals `claudecode.MusterSessionEnvVar`, so the scrubbed name and the pane variable name cannot drift | pass |

The proof test from the first section now passes (the full `make test` below includes it). Existing tests and production files are untouched; only an import and one appended test function were added to `shells_test.go`.

**Handoff Received (second pass)**: None. The impl log sanctioned no broken test file.

**Notes**: this session's shell carried `MUSTER_SESSION` (`env | grep -c '^MUSTER_SESSION='` printed 1), and `make test` still exited 0, including the two shell-registry tests that the memory note says fail on main in that situation. That is the fix working, measured.

```
$ go build ./...            (exit 0)
$ make test                 (exit 0)
ok  	github.com/Zalaras/muster/internal/server	86.187s
ok  	github.com/Zalaras/muster/internal/tmux	22.920s
ok  	github.com/Zalaras/muster/internal/tmux/tmuxtest	8.823s
ok  	github.com/Zalaras/muster/internal/claudecode	16.443s
(all 22 packages with tests ok, no FAIL)
$ make lint
golangci-lint run
0 issues.
```
