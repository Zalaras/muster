# Doc Reconcile: ws-close-code-1

**Verdict**: reconciled
**Pack**: not run (pipeline `kb pack` line not recorded for this run)
**Features derived**: surfaces, connection (plan header: surfaces, connection)

## Claims

| Feature | Claim | Verified against | Action |
|---------|-------|------------------|--------|
| surfaces | `kb:anchor/terminal.ws` close-code label reads "Going away (1001)" | `internal/server/terminal.go:closeShutdown` sends `websocket.StatusGoingAway` | edited `docs/protocol.md` (commit 4682750a) |
| surfaces | `kb:anchor/terminal.shell-ws` close-code label reads "going away (1001)" | same `closeShutdown`, called by `terminalRegistry.closeAll` for both surfaces | edited `docs/protocol.md` (commit 4682750a) |
| connection | `/ws` section says shutdown closes every open socket with 1001, reason `musterd shutting down`; no version bump | `internal/server/ws.go:wsHub.closeAll` sends `StatusGoingAway`, "musterd shutting down" | added one bullet to `docs/protocol.md` (commit 4682750a) |
| surfaces, connection | "Normal close (1001)" wording no longer true | — | deleted (replaced in place) |

No feature `spec.md` changed; the delta targeted `docs/protocol.md` only.

## Contradictions
None

## For the orchestrator
None

## Checks
`make gen-kb && make check-kb`: regenerated `docs/features/connection/contract.md` and `docs/features/surfaces/contract.md`; `kb: 636 records, 29 features, 0 problem(s)`; `kb: all checks pass`. No spec touched, so no word counts. Committed as 4682750a.
