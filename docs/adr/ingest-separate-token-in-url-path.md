---
id: ingest-separate-token-in-url-path
type: decision
status: accepted
date: 2026-08-20
summary: Two tokens: the UI token is exchanged for a strict same-site cookie, and a separate ingest token is embedded in the hook URL path.
features: [ingest, connection]
tags: [auth, security]
files: [internal/server/auth.go, internal/server/ingest.go]
tests: [TestHandleIngest_WrongTokenReturns404AndPersistsNothing, TestRequireCookie, TestHandleAuth_ValidTokenSetsCookieAndRedirects]
refs: [docs/history/spec-changelog.md, kb:anchor/transport, kb:anchor/ingest.transport]
supersedes: []
---
**Context.** The daemon binds loopback only, but any local process or a webpage open in the same browser can reach loopback. Hooks post from a shell script with no cookie jar, while the dashboard is a browser client.

**Options.** (A) One shared token used by both the browser and the hook scripts. (B) Two tokens: a UI token exchanged once at an auth endpoint for a strict same-site cookie, and an ingest token that lives only in the hook and status-line URL path.

**Decision.** B. A forged event needs the ingest token, which never appears in the browser; a request from a stray webpage carries no cookie and is refused.

**Consequences.** A wrong ingest token answers not-found and persists nothing, so the endpoint does not confirm its own existence. The ingest token must stay out of any committable file, which shapes where Muster writes its settings. Both tokens live in the daemon's key-value table for the install's life.
