# Doc delta: ws-close-code-1

Seeded from plan.md § Doc Delta. The implementation log carries no `doc-delta:` line.

**surfaces**
- Becomes true: nothing in `docs/features/surfaces/spec.md` (the spec names no close code).
- Becomes true: in `docs/protocol.md`, under `kb:anchor/terminal.ws` and
  `kb:anchor/terminal.shell-ws`, the shutdown close code's label reads "Going away (1001)"
  where it read "Normal close (1001)" / "normal close (1001)". The code itself was already 1001
  in the contract; `closeShutdown` in `internal/server/terminal.go` now sends it.
- Stops being true: nothing.

**connection**
- Becomes true: the `/ws` section of `docs/protocol.md` (`kb:anchor/ws.hello`'s parent section,
  "WebSocket `/ws` — the state stream") says the daemon closes every open `/ws` socket with
  close code 1001 (going away, reason `musterd shutting down`) at shutdown. One sentence, in the
  section's bullet list; no protocol version bump
  (kb:adr/connection-protocol-bumps-only-on-shape-change). `wsHub.closeAll` in
  `internal/server/ws.go` sends it.
- Stops being true: nothing.
