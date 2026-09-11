---
id: canary-live-tier-fails-never-skips
type: decision
status: accepted
date: 2026-09-10
summary: The canary's live tier runs the production Keychain, usage and theme readers on the real machine and fails, never skips, when a credential is missing.
features: [canary]
tags: [claude-code-format, testing, user-decision]
files: [test/canary/live_test.go]
tests: [TestKeychainCredentialShape, TestUsageAPIResponseShape, TestThemeConfigParses]
refs: [docs/history/spec-changelog.md, plan:canary-full-coverage, kb:fact/oauth-token-in-keychain, kb:fact/usage-api-oauth-shape, kb:fact/theme-config-key-and-enum, kb:adr/usage-keychain-token-read-only]
supersedes: []
---
**Context.** Three of Muster's Claude Code dependencies are not hook traffic at all: the OAuth token in the Keychain, the usage endpoint's response and the theme key in the user's config file. Each was re-checked by hand on every version bump, and the daemon code that reads them carried a comment saying so.

**Options.** (A) Keep the hand check. (B) A live tier in the canary that runs the production readers against the real machine, skipping when a credential is absent so the suite stays green elsewhere. (C) The same tier, but a missing credential fails the run.

**Decision.** C, Damian's call. The gate exists for exactly one machine, and on that machine a skip passes silently, which is the failure mode the tier is meant to remove. The tier reads only; nothing it reads is printed.

**Consequences.** The canary costs one HTTPS request more and needs a logged-in Claude Code. The offline mode still runs nothing live. A machine without the credential cannot run the full canary, which is the honest statement of what it verifies.
