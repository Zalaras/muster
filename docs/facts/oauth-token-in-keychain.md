---
id: oauth-token-in-keychain
type: fact
status: active
date: 2026-09-11
summary: The subscription OAuth token lives in the macOS Keychain item "Claude Code-credentials" as claudeAiOauth.accessToken.
features: [usage]
tags: [claude-code-format, auth, security]
files: [internal/claudecode/credentials.go]
tests: [TestInstalledBinaryCarriesInterfaceStrings, TestKeychainTokenReader_Success_ParsesAccessTokenAndPassesExpectedArgs]
refs: [spikes/FINDINGS.md, plan:usage-model-bar]
verified: 2.1.251..canary
guard: TestKeychainCredentialShape
---
The subscription OAuth access token is stored in the macOS Keychain generic-password item
`Claude Code-credentials`, readable with `security find-generic-password -a "$USER" -w -s
"Claude Code-credentials"`; the payload is JSON whose `claudeAiOauth.accessToken` is the bearer
token.

Evidence: read live 2026-08-30 against 2.1.251 with Damian's own token (FINDINGS per-model
usage addendum). The guard runs the production `KeychainTokenReader` for the current OS user
on every non-offline canary run and fails, never skips, on missing credentials; the static tier
asserts `claudeAiOauth` and `find-generic-password` as byte strings in the installed bundle.
