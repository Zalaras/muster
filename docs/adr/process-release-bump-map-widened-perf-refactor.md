---
id: process-release-bump-map-widened-perf-refactor
type: decision
status: accepted
date: 2026-09-01
summary: A feat bumps minor; fix, perf and refactor bump patch; every other type releases nothing. svu hardwires only feat and fix, so the workflow shims the other two.
features: [release]
tags: [pipeline, user-decision]
files: [.github/workflows/release.yml, docs/conventions.md]
tests: []
refs: [docs/history/spec-changelog.md, docs/conventions.md, kb:adr/release-versioning-automatic-from-conventional-commits, kb:adr/process-release-commitlint-eleven-types, kb:adr/process-release-notes-derived-from-bumping-types, kb:adr/process-release-breaking-marker-bang-gated]
supersedes: [release-versioning-automatic-from-conventional-commits]
---
**Context.** Versions are computed from conventional commits on every push to the default branch. The first mapping bumped on feat and fix only, and the type list has since widened to the standard eleven. A performance fix or a refactor that ships changed behaviour was releasing nothing, so users on the install path never received it.

**Options.** (A) Keep feat and fix as the only releasing types. (B) Widen: feat bumps minor; fix, perf and refactor bump patch; the remaining types release nothing. (C) Release on every push regardless of type.

**Decision.** B, settled with Damian after re-measuring the version tool. It hardwires only feat and fix and its configuration has no type-to-bump mapping, so the workflow carries a small shim: when the tool reports no bump but a perf or refactor commit exists since the last tag, it forces a patch.

**Consequences.** The release-note filter is defined as exactly the set of bumping types, so the two cannot drift apart. The published-subject length cap now binds perf and refactor as well as feat and fix. The breaking marker's meaning on a pre-1.0 line is decided separately and mechanically guarded rather than left to convention, which this record's predecessor had relied on.
