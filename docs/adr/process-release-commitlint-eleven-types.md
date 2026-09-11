---
id: process-release-commitlint-eleven-types
type: decision
status: accepted
date: 2026-09-01
summary: Commit types are the eleven-strong commitlint conventional list, plus review(<plan>) on plan branches only; the list is enforced by a commit-msg hook.
features: [release]
tags: [pipeline, user-decision]
files: [docs/conventions.md, .githooks/commit-msg]
tests: []
refs: [docs/history/spec-changelog.md, docs/conventions.md, kb:adr/process-release-bump-map-widened-perf-refactor, kb:adr/release-versioning-automatic-from-conventional-commits]
supersedes: []
---
**Context.** The commit convention had become load-bearing: the release workflow reads types to choose a version. Yet the type list lived in five places that had drifted, defined seven types, and left four in common use undefined, so agents and the goreleaser filter disagreed about what a valid subject was.

**Options.** (A) Keep the home-grown seven and document them more firmly. (B) Adopt the standard commitlint conventional list of eleven types, with one repo-specific addition, the review verdict commit, legal only on plan branches because landing squashes it away.

**Decision.** B, settled with Damian. A standard list is one nobody has to re-derive, tooling already understands it, and it leaves no type that appears in practice unclassified.

**Consequences.** The list is written once in the conventions and enforced by the commit-msg hook armed per clone, binding humans and pipeline agents on every branch. The review type never reaches the default branch. Every other release rule, the bump map, the notes filter and the breaking marker, keys off this list.
