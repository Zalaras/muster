---
id: connection-banner-only-after-first-hello
type: decision
status: accepted
date: 2026-08-22
summary: The daemon-down banner appears only after a first successful hello; a fresh page load shows a connecting state instead.
features: [connection]
tags: [ux]
files: [web/src/render/banner.ts, web/src/features/connection.ts]
tests: [web/e2e/resilience.spec.ts]
refs: [docs/history/spec-changelog.md, plan:m0-skeleton, kb:anchor/ws.hello]
supersedes: []
---
**Context.** The spec asks the dashboard to be loud when the daemon is down. On a fresh load the socket is not yet open for a moment, and a banner claiming the daemon is unreachable would flash from a daemon that had just served the page.

**Options.** (A) Show the down banner whenever the socket is closed, including before the first connection. (B) Show a quiet connecting state until the first hello arrives, and reserve the banner for a connection that was up and dropped.

**Decision.** B, a web-implementation judgement endorsed in review.

**Consequences.** Loud-when-down applies to a lost connection, not to startup. Reconnection uses backoff and clears the banner on the next hello. Action buttons disable while the banner is up so a command cannot be sent into a dead socket.
