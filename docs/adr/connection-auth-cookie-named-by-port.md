---
id: connection-auth-cookie-named-by-port
type: decision
status: accepted
date: 2026-11-19
summary: The auth cookie is named muster_auth_<port>, so two daemons on one host never log each other out; a bare muster_auth cookie is still accepted and renamed.
features: [connection]
tags: [auth]
files: [internal/server/auth.go]
tests: [TestAuthCookie_NamedByPort, web/e2e/auth.spec.ts, web/e2e/embedded.spec.ts]
refs: [kb:anchor/transport, kb:adr/process-prototype-first-track]
supersedes: []
---
**Context.** A browser scopes a cookie to its host and ignores the port. Every musterd set one cookie, `muster_auth`, so a second daemon opened on 127.0.0.1 (a prototype, a scratch daemon) replaced the first one's cookie. The first dashboard then had every new terminal socket, its state socket on reconnect and a page refresh refused, which read as blank panes and "daemon down" (#128). Opening prototypes at `<name>.localhost` avoided it only while nobody opened the 127.0.0.1 link.

**Options.** (A) Keep one name and rely on tooling to keep second daemons off 127.0.0.1. (B) Name the cookie by the port the browser addressed, `muster_auth_<port>`, read from the request's Host; a Host with no port keeps the bare `muster_auth`. (C) B, plus accept a bare `muster_auth` cookie carrying the right token and replace it with the port-named one.

**Decision.** C. The name comes from the request's Host rather than the listener, so the daemon needs no configuration and a dashboard opened at `<name>.localhost:<port>` gets the same name. Only the name changes; the token check is unchanged.

**Consequences.** Any number of daemons on one host stay signed in side by side, whatever host name each is opened at. Upgrading does not sign an open dashboard out: its bare cookie is accepted and re-set under the port name on each request until the browser holds the new one; the bare cookie is left to expire. A bare cookie still never authenticates a daemon whose token it does not carry, so another daemon's leftover bare cookie is harmless. Accepting the bare name can be dropped once no browser holds one, 30 days after the last pre-port release was used.
