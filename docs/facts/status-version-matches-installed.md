---
id: status-version-matches-installed
type: fact
status: active
date: 2026-09-11
summary: The status-line version field equals the installed claude --version.
features: [canary, connection]
tags: [claude-code-format]
files: [internal/claudecode/version.go]
tests: [TestCheckVersion]
refs: [spikes/FINDINGS.md]
verified: 2.1.233..canary
guard: TestStatusLineVersionMatchesInstalled
---
The status line's top-level `version` string equals the output of `claude --version` for the
binary that produced it (`"2.1.233"` on the spike).

Evidence: 2.1.233 spike captures; asserted on every canary run against the last status-line
post of the interactive session.
