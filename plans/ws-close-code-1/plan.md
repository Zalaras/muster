# Plan: ws-close-code-1

**Status**: completed
**Shape**: fix
**Work Type**: daemon
**E2E Scope**: none
**Fixture plan**: none
**Render fixtures**: none
**Features**: surfaces, connection
**Description**: musterd closes every open WebSocket at shutdown with close code 1001 (Going Away), the code `docs/protocol.md` already pins for the terminal sockets, instead of 1000.

## Symptom

### e1 — Shutdown's `/ws` close code disagrees with the protocol

> - [ ] **Shutdown's `/ws` close code disagrees with the protocol** — musterd closes dashboard
>   sockets with 1000 at shutdown; `docs/protocol.md` says 1001. From `plans/maintainability-cleanup/`.

No GitHub issue.

## Findings

- Reproduced against a scratch daemon with a Node WebSocket client on `/ws`, then SIGTERM:
  `client: /ws close code=1000 reason="musterd shutting down"`. The terminal sockets
  (`/ws/terminal/{id}`, `/ws/shell/{id}`) send the same code, and the two existing unit tests
  assert the library's normal-closure constant (1000) and pass today.
- The documented disagreement is on the **terminal sockets**: `docs/protocol.md` under
  `kb:anchor/terminal.ws` says "Normal close (1001) on daemon shutdown" and under
  `kb:anchor/terminal.shell-ws` says "normal close (1001) on daemon shutdown". The `/ws` section
  names no close code at all, so `/ws` contradicted nothing in writing.
- Cause: `internal/server/terminal.go:128-130`, `closeShutdown` calls `ws.Close` with the
  library's normal-closure constant (1000). It is the only shutdown close for terminal sockets; its
  three callers are `terminalRegistry.closeAll` (:249), takeover's second closed check (:172) and
  `attachAndPump`'s `errRegistryClosed` path (:367). The `closeAll` doc comment at :236 already
  says "normal close 1001". `wsHub.closeAll` at `internal/server/ws.go:98` has the same literal.
- RFC 6455 §7.4.1 defines 1001 "Going Away" as "an endpoint is going away, such as a server
  going down"; 1000 is a finished-purpose close. 1001 is the correct code. No ADR, fact or spec
  decides close codes. The dashboard treats 1000 and 1001 alike (`web/src/terminal/overlay.ts`
  maps everything except 4000/4001 to "disconnected"; `web/src/ws.ts` ignores the code), so the
  change is invisible to the user and needs no web, render or E2E test.
- Developer's answers (research `## Answers`): best practice decides. (1) `/ws` also moves to 1001,
  and the `/ws` section of `docs/protocol.md` gains one sentence saying so — behaviour
  documentation, no message shape change, no protocol version bump
  (kb:adr/connection-protocol-bumps-only-on-shape-change). (2) The label "Normal close (1001)"
  becomes "Going away (1001)" at both terminal-socket places.

## Requirements

### Must Have
- **REQ-1**: At daemon shutdown every open `/ws/terminal/{id}` and `/ws/shell/{id}` socket
  receives a close frame with code 1001 (`websocket.StatusGoingAway`) and reason
  `musterd shutting down`, on all three paths that today share `closeShutdown`: the `closeAll`
  teardown loop, a takeover whose attach finishes after `closeAll`, and a takeover refused before
  attach ran. (e1)
- **REQ-2**: At daemon shutdown every open `/ws` state socket receives a close frame with code
  1001 (`websocket.StatusGoingAway`) and reason `musterd shutting down`. (e1)
- **REQ-3**: Behaviour unchanged: `4000 superseded` and `4001 pane_ended` keep their codes, and the
  drain of queued `/ws` messages before close is untouched. (e1)

## Affected Files
### Daemon (daemon-impl)
- `internal/server/terminal.go` — REQ-1: `closeShutdown` sends `websocket.StatusGoingAway`; its
  doc comment and `closeAll`'s stop saying "normal close".
- `internal/server/ws.go` — REQ-2: `wsHub.closeAll` closes each client with
  `websocket.StatusGoingAway`.
### Existing tests this breaks
- `internal/server/terminal_closeall_takeover_test.go`: two assertions name the 1000 constant;
  the Proof moves them to `StatusGoingAway` (red first).

## Proof

Written by **daemon-tests**, all in `internal/server/`:

1. `terminal_closeall_takeover_test.go`,
   `TestTerminalRegistry_TakeoverAfterCloseAllClosesNewConnWithShutdownCode` and
   `TestAttachAndPump_RegistryAlreadyClosedGetsShutdownCloseFrame`: the assertion
   `assert.Equal(t, websocket.StatusGoingAway, ce.Code)` replaces the one naming the 1000
   constant (two places). Red today: expected 1001, actual 1000. (REQ-1, takeover paths)
2. `terminal_test.go`, `TestHandleTerminal_ShutdownClosesOpenTerminalSocketsNormally`: the read
   error after `Shutdown` is a `websocket.CloseError` whose `Code` is `StatusGoingAway` and whose
   `Reason` is `musterd shutting down`. Red today: code 1000. (REQ-1, `closeAll` path on a live
   socket)
3. `ws_test.go`, `TestServerShutdown_ClosesOpenWSConnections`: the read error after `Shutdown` is
   a `websocket.CloseError` whose `Code` is `StatusGoingAway` and whose `Reason` is
   `musterd shutting down`. Red today: code 1000. (REQ-2)

REQ-3 is held by the existing `4000`/`4001` tests in the same package, which stay green.

## Edge Cases
1. `closeAll` runs while a takeover's attach is in flight → the new conn gets 1001, not left
   dangling → D1.
2. A takeover arrives after the registry is already closed → the conn gets 1001 before attach →
   D1 (shared with edge case 1).

## Acceptance Criteria
### Automated Checks
```checks
D1 go test -count=1 -run 'TestTerminalRegistry_TakeoverAfterCloseAllClosesNewConnWithShutdownCode|TestAttachAndPump_RegistryAlreadyClosedGetsShutdownCloseFrame' ./internal/server/
D2 go test -count=1 -run 'TestHandleTerminal_ShutdownClosesOpenTerminalSocketsNormally' ./internal/server/
D3 go test -count=1 -run 'TestServerShutdown_ClosesOpenWSConnections' ./internal/server/
D4 ! rg -n 'StatusNormalClosure' internal/server/terminal.go internal/server/ws.go
D5 make lint
D6 go test -count=1 ./internal/server/
```
### Reviewer-Verified
- The comments on `closeShutdown` and `closeAll` in `internal/server/terminal.go` name the
  code the function now sends, not "normal close".

## Doc Delta
**surfaces** — becomes true: nothing in the spec (the spec names no close code). In
`docs/protocol.md`, under `kb:anchor/terminal.ws` and `kb:anchor/terminal.shell-ws`, the label
"Normal close (1001)" / "normal close (1001)" becomes "Going away (1001)". Stops being true:
nothing; the contract was already 1001.
**connection** — becomes true: the `/ws` section of `docs/protocol.md` says the daemon closes
every open `/ws` socket with close code 1001 (going away, reason `musterd shutting down`) at
shutdown. No protocol version bump (kb:adr/connection-protocol-bumps-only-on-shape-change).
Stops being true: nothing.

## Out of scope
Nothing.
