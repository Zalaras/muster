---
id: canary-skips-on-ceiling-bump-extends-record
type: decision
status: accepted
date: 2026-09-10
summary: The canary skips its token-burning tiers when installed equals the ceiling unless forced; a green run outside the range appends the version, uncommitted.
features: [canary]
tags: [claude-code-format, testing]
files: [test/canary/harness_test.go, test/canary/skip_test.go, tools/versions/main.go, Makefile]
tests: [TestSkipDecision, TestSkipDecision_ReasonNamesTheForceEnvVar, TestCmdBump_AboveAppendsAndRegenerates, TestCmdBump_InsideRangeEditsNothing, TestCmdBump_RefusesOnDirtyRecord]
refs: [docs/history/spec-changelog.md, plan:version-claude-interface, docs/claude-code-versions.md, kb:adr/canary-verified-range-observed-not-pinned, kb:adr/canary-live-tier-fails-never-skips]
supersedes: []
---
**Context.** With the range held in a record, something has to extend it, and every full canary run burns subscription. Running the harness against a version already at the ceiling proves nothing new.

**Options.** (A) Always run everything and edit the record by hand. (B) Skip the harness and live tiers when installed equals the ceiling, with a force variable for reviews that need evidence on an unchanged install; a green non-offline run outside the range appends the version through a tool that also regenerates the doc fragments and leaves the tree uncommitted. (C) Auto-commit the bump.

**Decision.** B. The offline variable always wins over force. The tool refuses when the record already has uncommitted changes, and a check subcommand in the standard gate fails on a stale fragment.

**Consequences.** A no-change run costs zero tokens while the static tier and the classification test still run. The bump is a reviewed commit, not a side effect. A change inside the Claude Code package on an unchanged install needs the force variable, which is written down as the review convention.
