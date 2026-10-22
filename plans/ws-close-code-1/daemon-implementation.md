# Daemon Implementation: ws-close-code-1

**Plan**: ws-close-code-1
**Mode**: initial
**Pack**: kb: pack 17214 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/server/terminal.go` | modified | `closeShutdown` sends `websocket.StatusGoingAway`; its comment and `closeAll`'s now say going away / 1001 (REQ-1) |
| `internal/server/ws.go` | modified | `wsHub.closeAll` closes each client with `websocket.StatusGoingAway` (REQ-2) |

## Decisions

- REQ-3 deliberately not touched: 4000/4001 closes and the `/ws` outbox drain are unchanged; their existing tests stay green.
- design: no new type or helper; the existing `closeShutdown` and `wsHub.closeAll` call sites change one constant each (`rg StatusNormalClosure internal/server/terminal.go internal/server/ws.go` now matches nothing).
- Size warnings: none on touched files (the 115 `size-warn` hits are pre-existing, in other files).

## Handoff

**Build status**: `go build ./...` exits 0; `make lint` 0 issues; `go test -race -count=1 ./internal/server/` ok (all four red-by-design tests green).
None — no test file needs changes.
