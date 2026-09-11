---
id: canary-version-gated-adapters-not-built
type: decision
status: rejected
date: 2026-09-10
summary: No version-gated adapters, change-point table or startup probe while every observed shape holds across the range; only the parsed-version seam is built.
features: [canary]
tags: [claude-code-format, revisit]
files: [internal/claudecode/version.go, docs/claude-code-versions.md]
tests: [TestClassifyAgainst, TestFormatRange]
refs: [docs/history/spec-changelog.md, plan:version-claude-interface, kb:adr/canary-verified-range-observed-not-pinned, docs/history/spikes/canary-fields.md]
supersedes: []
---
**Context.** Versioning the Claude Code interface was first framed as a full mechanism: per-field applicability, adapters selected once at startup where shapes diverge, and a small in-built probe to tell which side of a change point an unseen version falls on. Every shape in the field inventory had held from the first measured version to the current one, and every recorded delta was an addition.

**Options.** (A) Build the mechanism against a hypothetical change point. (B) Build only the declaration and the seam, a parsed and comparable installed version inside the Claude Code package, and add the first gate when a red canary run shows a real change.

**Decision.** A is rejected for now; B stands. Gates with nothing to gate and a probe with nothing to disambiguate would be speculative code on the hot path of every launch.

**Consequences.** The red-canary ritual is where the first adapter is added, keeping the old code so older versions stay supported. Until then the classification is the whole mechanism. This record is revisited by that first red run.
