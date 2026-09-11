---
id: canary-static-tier-asserts-bundle-strings
type: decision
status: accepted
date: 2026-09-10
summary: A static canary tier reads the installed Claude Code bundle for the interface strings Muster depends on but cannot drive; it catches rename or removal only.
features: [canary]
tags: [claude-code-format, testing]
files: [test/canary/static_test.go, internal/claudecode/launch.go]
tests: [TestInstalledBinaryCarriesInterfaceStrings]
refs: [docs/history/spec-changelog.md, plan:canary-full-coverage, kb:fact/scroll-speed-env-present, kb:fact/theme-config-key-and-enum, kb:adr/surfaces-scroll-speed-via-launch-env]
supersedes: []
---
**Context.** Some of the interface Muster relies on cannot be exercised by launching a session: an undocumented scroll-speed environment variable, the theme enum, the usage endpoint path and header, the credential key and Keychain mechanism, the permission-mode flag name. An upstream rename of any of them degrades silently.

**Options.** (A) Leave them unasserted and rely on manual checks at each bump. (B) Drive each one end to end, which for several is impossible or costs subscription turns. (C) Read the installed bundle and assert every such string is present, taking the launch-environment keys from the production builder so the list cannot drift from the code.

**Decision.** C. A string surviving proves nothing about semantics; the tier catches rename or removal, which is exactly the silent-degrade case, and costs zero tokens.

**Consequences.** The tier runs even in offline mode and even when the harness skips on an unchanged install. Semantics stay measured where they were measured, in the probes and spikes.
