---
id: stack-http-stdlib-net-http
type: decision
status: accepted
date: 2026-08-16
summary: The daemon's HTTP server is the standard library's net/http with method-and-path routing; no web framework.
features: [connection]
tags: [deps, user-decision]
files: [internal/server/server.go, go.mod]
tests: [TestRoutes_APIStateRequiresCookie]
refs: [docs/history/spec-changelog.md, docs/conventions.md, kb:anchor/transport, kb:anchor/http]
supersedes: []
---
**Context.** The daemon serves a handful of JSON endpoints, two WebSocket upgrades and a static bundle to one user on loopback. Damian knew Echo from earlier work.

**Options.** (A) Echo, for familiarity and its middleware ecosystem. (B) The standard library's router with method and path patterns.

**Decision.** B. A dozen endpoints do not justify a dependency tree, and the pattern router already covers method dispatch and path variables.

**Consequences.** Middleware such as cookie auth is a plain handler wrapper. Every handler is testable with the standard test server, and the project takes on no framework upgrade cadence. Adding a framework later would reopen this record.
