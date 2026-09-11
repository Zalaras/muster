---
id: release-builds-cross-compiled-on-linux
type: decision
status: accepted
date: 2026-08-31
summary: Release builds run on a Linux runner and cross-compile darwin with cgo disabled, which every dependency permits; a standing reason not to add cgo casually.
features: [release]
tags: [deps]
files: [.goreleaser.yaml, .github/workflows/release.yml, go.mod]
tests: []
refs: [docs/history/spec-changelog.md, kb:adr/stack-db-database-sql-hand-sql]
supersedes: []
---
**Context.** A macOS-only product invites a macOS runner, which on a private repository costs many times the runner minutes of a Linux one.

**Options.** (A) Build on macOS. (B) Build on Linux with cgo disabled and cross-compile both darwin architectures.

**Decision.** B. Every Go dependency, the SQLite driver, the PTY library and the WebSocket library among them, is pure Go, so cross-compilation is exact.

**Consequences.** Introducing a cgo dependency would force A and is therefore a deliberate decision, not a convenience. Signing and notarisation, if ever wanted, would need to happen outside the build step.
