# Daemon Tests: ws-close-code-1

**Plan**: ws-close-code-1
**Verdict**: authored
**Pack**: kb: pack 12701 words (budget 30000)

## Summary

Red-first. Tests created/changed: 4 | Passing: 0 | Failing: 4 (all red on the assertion, expected 1001, actual 1000). `go build ./...` and `make lint` are clean.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/server/terminal_closeall_takeover_test.go` | TestTerminalRegistry_TakeoverAfterCloseAllClosesNewConnWithShutdownCode | takeover after closeAll closes the new conn with `StatusGoingAway` (REQ-1) | red |
| `internal/server/terminal_closeall_takeover_test.go` | TestAttachAndPump_RegistryAlreadyClosedGetsShutdownCloseFrame | takeover refused before attach gets `StatusGoingAway` (REQ-1) | red |
| `internal/server/terminal_test.go` | TestHandleTerminal_ShutdownClosesOpenTerminalSocketsNormally | live terminal socket read error is a `CloseError` with 1001 and reason `musterd shutting down` (REQ-1) | red |
| `internal/server/ws_test.go` | TestServerShutdown_ClosesOpenWSConnections | live `/ws` socket read error is a `CloseError` with 1001 and reason `musterd shutting down` (REQ-2) | red |

## Handoff Received

None (red-first; no implementation log).

## Notes

REQ-3 is held by the existing 4000/4001 tests, left untouched. The terminal test keeps its `...Normally` name because the plan's check D2 runs it by that name.

## Test Run Output

```
--- FAIL: TestTerminalRegistry_TakeoverAfterCloseAllClosesNewConnWithShutdownCode (0.00s)
    terminal_closeall_takeover_test.go:118:
        	Error:      	Not equal:
        	            	expected: 1001
        	            	actual  : 1000
--- FAIL: TestAttachAndPump_RegistryAlreadyClosedGetsShutdownCloseFrame (0.03s)
    terminal_closeall_takeover_test.go:174:
        	Error:      	Not equal:
        	            	expected: 1001
        	            	actual  : 1000
--- FAIL: TestHandleTerminal_ShutdownClosesOpenTerminalSocketsNormally (0.23s)
    terminal_test.go:691:
        	Error:      	Not equal:
        	            	expected: 1001
        	            	actual  : 1000
--- FAIL: TestServerShutdown_ClosesOpenWSConnections (0.03s)
    ws_test.go:299:
        	Error:      	Not equal:
        	            	expected: 1001
        	            	actual  : 1000
FAIL	github.com/Zalaras/muster/internal/server
```
