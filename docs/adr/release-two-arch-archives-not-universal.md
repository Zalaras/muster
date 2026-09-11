---
id: release-two-arch-archives-not-universal
type: decision
status: accepted
date: 2026-08-31
summary: The release ships separate amd64 and arm64 darwin archives rather than a universal binary; the installer picks by machine architecture.
features: [release]
tags: [deps]
files: [.goreleaser.yaml, scripts/install.sh]
tests: []
refs: [docs/history/spec-changelog.md, kb:adr/release-builds-cross-compiled-on-linux]
supersedes: []
---
**Context.** Darwin has two live architectures and Go can build either; the release tool can also stitch a universal binary.

**Options.** (A) One universal archive. (B) One archive per architecture.

**Decision.** B. Downloads are half the size, and selecting the right one is a single architecture query in the install script.

**Consequences.** Two assets per release; any later Homebrew formula or cask must map both.
