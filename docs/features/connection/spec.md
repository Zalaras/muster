---
id: connection
type: spec
status: active
date: 2026-09-12
summary: Token and cookie auth, the /ws hello and snapshot, protocol version, connection banner, Claude version readout.
features: [connection]
tags: [auth, security]
go: [cmd/musterd/**, internal/server/server*.go, internal/server/auth*.go, internal/server/ws*.go, internal/server/state*.go, internal/server/staticserve_test.go, internal/server/fakes_test.go, internal/server/helpers_test.go, internal/webui/**]
web: [web/src/features/connection.ts, web/src/ws*.ts, web/src/protocol*.ts, web/src/api*.ts, web/src/app*.ts, web/src/dom.ts, web/src/main.ts, web/src/render/banner*.ts]
e2e: [web/e2e/auth.spec.ts, web/e2e/resilience.spec.ts, web/e2e/claude-version.spec.ts, web/e2e/embedded.spec.ts, web/e2e/type-scale.spec.ts, web/e2e/helpers/daemon.ts, web/e2e/helpers/db.ts, web/e2e/helpers/fixtures.ts]
protocol: [transport, ws, ws.hello, ws.snapshot]
refs: [kb:adr/connection-ui-token-reusable-not-one-time, kb:adr/ingest-separate-token-in-url-path, kb:adr/connection-commands-http-ws-push-only, kb:adr/connection-whole-object-session-upserts, kb:adr/connection-banner-only-after-first-hello, kb:adr/connection-protocol-bumps-only-on-shape-change, kb:adr/connection-installed-claude-classified-never-refused, kb:adr/connection-dashboard-embedded-in-binary, kb:adr/connection-missing-web-build-fails-fast, kb:adr/connection-dashboard-auto-opens-on-terminal, kb:adr/surfaces-tmux-preflight-at-startup, kb:adr/theme-banner-tokens-not-rose, kb:adr/stack-http-stdlib-net-http, kb:adr/stack-websocket-coder, docs/design/ux-flows.md]
---
Connection is the daemon's front door and the dashboard's link to it.

## Transport and auth

The daemon binds `127.0.0.1` on one port (`-addr`) and serves the dashboard, the UI API,
the state WebSocket, the terminal WebSockets, ingest and an unauthenticated health check
(`kb:anchor/transport`, `kb:anchor/http`). The dashboard is embedded in the binary; a
directory flag overrides it for development, and a binary with neither exits at startup
naming both remedies (kb:adr/connection-dashboard-embedded-in-binary,
kb:adr/connection-missing-web-build-fails-fast).

Two random tokens are generated at first run and kept in the kv table. The UI token is
carried in the launcher's URL and exchanged at `GET /auth` for a strict same-site,
HTTP-only cookie; it stays valid at that endpoint for the install's life
(kb:adr/connection-ui-token-reusable-not-one-time). Every API, socket and static request
without the cookie is refused, and a WebSocket upgrade with a foreign Origin is rejected.
The ingest token is separate and lives in the hook URL path
(kb:adr/ingest-separate-token-in-url-path). There is no auth beyond this: the accepted
residual risk is same-user malware reading the token file, which could read Claude
Code's credentials directly anyway. Secrets stay out of any file Muster writes into a
repository, and hook payloads are never logged where they are world-readable.

## The state stream

Commands travel over HTTP; the WebSocket pushes state one way
(kb:adr/connection-commands-http-ws-push-only). On every connect the server sends
`kb:anchor/ws.hello`, then `kb:anchor/ws.snapshot`, then live deltas; there is no replay.
The hello carries the protocol version, the daemon version and the Claude Code
classification. The snapshot is the same object as `GET /api/state`. Sessions arrive as
whole objects and the client sorts them (kb:adr/connection-whole-object-session-upserts).
The protocol version bumps only when an existing field changes shape
(kb:adr/connection-protocol-bumps-only-on-shape-change); a client that does not know the
version shows a fatal "reload the dashboard" state.

## What the dashboard shows

A status readout reads connecting until the first hello, then connected; a socket lost
after a hello reads reconnecting and raises the full-width daemon-down banner, on its own
banner tokens, until a hello returns (kb:adr/connection-banner-only-after-first-hello,
kb:adr/theme-banner-tokens-not-rose, docs/design/ux-flows.md "Degraded and honest states").
Masthead controls are disabled while down. One client module owns reconnection with backoff.

The masthead's Claude Code readout renders the classification of the installed version
against the verified range: unknown as the words "Claude installation unknown", verified
plainly, below and above with a warning glyph and hover text; the daemon serves identically
in all four (kb:adr/connection-installed-claude-classified-never-refused, kb:spec/canary).

## Startup

tmux is checked before anything else and a missing or broken one is fatal
(kb:adr/surfaces-tmux-preflight-at-startup). When stdin is a real terminal the daemon opens
the dashboard in the browser through a tokenised URL (kb:adr/connection-dashboard-auto-opens-on-terminal).

## Scale and platform

Three to six concurrent sessions, one user, one machine, localhost. The daemon survives
the dashboard closing; sessions survive the daemon (kb:spec/lifecycle).
