---
id: process-release-notes-derived-from-bumping-types
type: decision
status: accepted
date: 2026-09-01
summary: Release notes are derived: the changelog filter includes exactly the four bumping types, whose subjects publish verbatim and are capped at 72 characters.
features: [release]
tags: [pipeline, user-decision]
files: [.goreleaser.yaml, docs/conventions.md, .githooks/commit-msg]
tests: []
refs: [docs/history/spec-changelog.md, docs/conventions.md, kb:adr/process-release-bump-map-widened-perf-refactor]
supersedes: []
---
**Context.** The goreleaser changelog used an exclude list. It had already let pre-convention subjects into the first release's notes and would have published bullets for types that shipped no release at all, so the notes described the commits rather than the release.

**Options.** (A) Keep the exclude list and extend it as new types appear. (B) Maintain a hand-written changelog per release. (C) An include filter naming exactly the bumping types, so the notes are a pure function of the commits that caused the release.

**Decision.** C. A subject of a releasing type is not only a log line; it is published verbatim as a release note, so the summary cap binds those four types and only those. Other types may run long to carry a retro finding, because the filter keeps them out of the notes.

**Consequences.** Adding a releasing type is one edit to the bump map and one to the filter, and they are documented side by side so a reviewer sees both. The commit-msg hook enforces the cap on the default branch only, because plan-branch subjects are squashed away. Early long subjects on the default branch remain as they are; nothing rewrites history.
