---
id: connection-ui-token-reusable-not-one-time
type: decision
status: accepted
date: 2026-08-22
summary: The UI token is reusable at the auth endpoint for the install's life; one-time described the launcher flow, not token burning.
features: [connection]
tags: [auth]
files: [internal/server/auth.go]
tests: [TestHandleAuth_ValidTokenSetsCookieAndRedirects, TestHandleAuth_BadTokenGetsRelaunchPage, web/e2e/auth.spec.ts]
refs: [docs/history/spec-changelog.md, plan:m0-skeleton, kb:anchor/transport]
supersedes: []
---
**Context.** The spec spoke of a one-time tokenized URL. Read literally, the token would be consumed on first exchange and a second browser or a cleared cookie jar would need a new token minted by the daemon.

**Options.** (A) Burn the token on exchange and mint a fresh one per launch. (B) Keep one token in the key-value table for the install's life; every exchange sets a cookie with a long max-age.

**Decision.** B. The one-time quality belongs to the launcher opening the URL once, not to the token.

**Consequences.** Opening the dashboard from a second browser needs only the same URL. The threat model is unchanged: a same-user attacker who can read the token file can already read the Claude credentials. A bad token gets a page telling the user to relaunch, not a bare error.
