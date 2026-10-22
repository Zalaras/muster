# Correctness review: ws-close-code-1

**Plan**: ws-close-code-1
**Verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 23568 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes. `closeShutdown` (`internal/server/terminal.go:128-130`) sends `websocket.StatusGoingAway` with reason `musterd shutting down`. It is the only shutdown close for terminal sockets, and all three callers use it: takeover's second closed check (:172), `closeAll` (:249) and `attachAndPump`'s `errRegistryClosed` path (:367). Shell sockets share the same handler and registry (`surfaceShell`), so they are covered too. | Yes. D1 covers both takeover paths. D2 covers the `closeAll` path on a live socket and asserts the `CloseError` code and reason. | pass |
| REQ-2 | Yes. `wsHub.closeAll` (`internal/server/ws.go:98`) sends `StatusGoingAway` and `musterd shutting down`. | Yes. D3 asserts the `CloseError` code and reason after `Shutdown`. | pass |
| REQ-3 | Yes, unchanged. `closeSuperseded` (:160), `closePaneEnded` (:215, :440) and `drainOutboxes` (ws.go:95) are not in the diff. | Yes. The existing 4000/4001 tests (`terminal_test.go:407/431/490/542`, `plainshell_test.go:420/498/534`) are green in D6 and in the race suite. | pass |
| DIAG | `kb:diagram/daemon-components` (named by `kb for` on both changed files). It shows packages and imports only. No import changed and no close code is drawn. | — | pass |

Contract, both sides: the web side already treats 1000 and 1001 the same. `web/src/terminal/overlay.ts:6-11` maps everything except 4000/4001 to disconnected, and `pane.ts:228` acts only on 4001. So the shipped 1001 matches `docs/protocol.md:1656` and `:1716`, and no web change is needed.

## Build & Tests

E2E tests: pass (83, scoped to 11 files: auth, claude-version, embedded, masthead-update-dot, plain-shell, resilience, shell-activity, shell-keys, shell-scroll, shell, terminal) · Daemon tests (race): pass (27 packages ok, no FAIL) · Web tests: pass (2994 in 105 files) · Render tests: pass (407) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues; web lint clean) — all read from $GATES_LOG_DIR. The gate run had 0 failed lines. The `WARN size` line (`terminal.go` 521 lines) is maintainability's to read (see Note 2).

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `go test -count=1 -run 'TestTerminalRegistry_TakeoverAfterCloseAllClosesNewConnWithShutdownCode\|TestAttachAndPump_RegistryAlreadyClosedGetsShutdownCloseFrame' ./internal/server/` | pass (22-D1.log) |
| D2 | `go test -count=1 -run 'TestHandleTerminal_ShutdownClosesOpenTerminalSocketsNormally' ./internal/server/` | pass (23-D2.log) |
| D3 | `go test -count=1 -run 'TestServerShutdown_ClosesOpenWSConnections' ./internal/server/` | pass (24-D3.log) |
| D4 | `! rg -n 'StatusNormalClosure' internal/server/terminal.go internal/server/ws.go` | pass (25-D4.log empty, exit 0) |
| D5 | `make lint` | pass (deduped to lint, 03-lint.log: 0 issues) |
| D6 | `go test -count=1 ./internal/server/` | pass (26-D6.log) |
| DOC | doc upkeep + Doc Delta vs what shipped | FAIL. The `TODO.md` entry "Shutdown's `/ws` close code disagrees with the protocol" (TODO.md:214) is still unticked and has not moved to `docs/history/todo-done.md` (see Major 1). Everything else passes: no `deviation:` or `doc-delta:` lines in the logs, so no ADR or doc-delta amendment is owed. Each Doc Delta claim matches the code: terminal and shell sockets send 1001 at shutdown, `/ws` sends 1001 with reason `musterd shutting down`, and nothing changes shape, so the protocol version stays. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | The comments on `closeShutdown` and `closeAll` in `internal/server/terminal.go` name the code the function now sends, not "normal close" | pass | `terminal.go:125` "daemon-shutdown going-away code (1001)"; `terminal.go:236` "daemon shutdown — going away 1001" |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. The diff touches no Claude-Code-format knowledge. |
| 2 | Terminal-output state parsing | pass |
| 3 | Blocking hook handler | pass. No hook code was touched. |
| 4 | Bare tmux / resize-pane | pass. No tmux invocation was touched. |
| 5 | Payload logging | pass |
| 6 | Empty-gauge dishonesty | pass. There is no web change. |
| 7 | Session identity on `session_id` | pass. The registry still keys on `terminalKey{sessionID, surface}`, which is unchanged. |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary/probes | pass |

## Issues

### Critical

None.

### Major

1. **[orchestrator]** Doc upkeep is incomplete. `TODO.md:214` "Shutdown's `/ws` close code disagrees with the protocol" is still `- [ ]` on the branch, and REQ-1 and REQ-2 fully resolve it. A fix must tick it, add its `✅ done 2026-10-22 (plan ws-close-code-1)` line and move the block to `docs/history/todo-done.md` under the same heading. The entry has no GitHub issue, so no `closes` number is involved.

### Minor

None.

### Notes

1. **[note]** `TestHandleTerminal_ShutdownClosesOpenTerminalSocketsNormally` keeps "Normally" in its name, but it now asserts a 1001 going-away close. daemon-tests kept the name on purpose because check D2 runs the test by that exact name. No change is requested this cycle. A rename would have to change D2's `-run` pattern in the same commit.
2. **[note]** The gate run's `WARN size` line reports `internal/server/terminal.go` at 521 lines against a 500 threshold. It already went over before this plan, since the diff is 3 lines changed and 0 net lines. review-maintainability was skipped this cycle, so nobody read the line against a reason. daemon-implementation.md says "Size warnings: none on touched files", but terminal.go is a touched file. That statement is false in its log only; the code is unaffected.
