---
id: usage-keychain-token-read-only
type: decision
status: accepted
date: 2026-08-30
summary: The daemon reads Claude Code's OAuth token from the macOS Keychain read-only for usage polling; never logged, stored or sent on the wire; tests use file seams.
features: [usage]
tags: [security, claude-code-format, testing]
files: [internal/claudecode/credentials.go, cmd/musterd/main.go]
tests: [TestKeychainTokenReader_Success_ParsesAccessTokenAndPassesExpectedArgs, TestFetchUsage_ErrorMessagesNeverContainTheToken]
refs: [docs/history/spec-changelog.md, docs/history/protocol-changelog.md, plan:usage-model-bar, kb:fact/oauth-token-in-keychain, kb:adr/usage-model-window-polled-from-oauth-api]
supersedes: []
---
**Context.** Calling the usage endpoint needs the subscription's bearer token. Claude Code keeps it in a Keychain item it owns and refreshes.

**Options.** (A) Ask the user to paste a token into Muster's config. (B) Run Muster's own OAuth flow. (C) Read Claude Code's Keychain item at fetch time, read-only, and hold the token only for the duration of the request.

**Decision.** C. The token is never written to disk, never logged, never placed on the dashboard wire, and never refreshed by Muster; if it is missing or rejected the bar reads unknown or stale.

**Consequences.** Knowledge of the item name and its JSON shape stays inside the Claude Code adapter package. A token-file flag and an API-URL flag are the test seams, so no Go or E2E test touches the real Keychain or the real endpoint. Error text is tested to never contain the token.
