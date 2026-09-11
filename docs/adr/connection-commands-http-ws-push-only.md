---
id: connection-commands-http-ws-push-only
type: decision
status: accepted
date: 2026-08-20
summary: Commands go over HTTP; the state WebSocket is server-to-client only, and the only client-to-server socket traffic is terminal input and resize.
features: [connection]
tags: [envelope]
files: [internal/server/ws.go, web/src/ws.ts, web/src/api.ts]
tests: [TestHandleWS_RequiresCookie, web/e2e/auth.spec.ts]
refs: [docs/history/spec-changelog.md, kb:anchor/transport, kb:anchor/ws, kb:anchor/terminal.ws]
supersedes: []
---
**Context.** The protocol was written before any daemon code. A single bidirectional socket carrying commands and state is common, but it blurs request-response semantics with a broadcast stream and makes E2E oracles harder.

**Options.** (A) One WebSocket carrying commands, replies and pushed state. (B) HTTP endpoints for every command, with a push-only state socket; terminal sockets carry the one genuinely streaming client input.

**Decision.** B.

**Consequences.** Every command has a status code and an error envelope, is callable from a test with a plain request, and shows up in the state stream as a broadcast rather than a reply. The state socket sends a hello and a full snapshot on connect and never reads from the client. The full snapshot is also served as JSON so tests and debugging have the same object the UI sees.
