---
id: stack-websocket-coder
type: decision
status: accepted
date: 2026-08-16
summary: WebSockets use coder/websocket; the stdlib has none, x/net/websocket is deprecated, and Echo would wrap a third-party library anyway.
features: [connection, surfaces]
tags: [deps, user-decision]
files: [internal/server/ws.go, internal/server/terminal.go, go.mod]
tests: [TestServerShutdown_ClosesOpenWSConnections]
refs: [docs/history/spec-changelog.md, docs/conventions.md, kb:anchor/ws, kb:anchor/terminal.ws]
supersedes: []
---
**Context.** The daemon pushes state over one WebSocket and bridges PTY bytes over another, so it needed a maintained implementation with ping handling, continuation frames and a way to treat a socket as a byte stream.

**Options.** (A) x/net/websocket, which is deprecated and lacks pings and continuation frames. (B) gorilla/websocket. (C) coder/websocket, with a context-first API, a net.Conn adapter and no transitive dependencies. (D) Echo's WebSocket support, which wraps one of the above.

**Decision.** C. The net.Conn adapter suits the PTY bridge and the dependency footprint is a single module.

**Consequences.** Close codes and control frames follow that library's API, and the terminal bridge writes binary frames through the adapter. Pings and idle handling are the library's; the daemon does not implement its own keepalive.
