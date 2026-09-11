---
id: release-installer-verifies-sha256-against-checksums
type: decision
status: accepted
date: 2026-09-10
summary: The installer checks the archive's SHA-256 against the release's own checksums file before installing anything; a precedent for verification, not a trust root.
features: [release]
tags: [security]
files: [scripts/install.sh, .goreleaser.yaml]
tests: []
refs: [docs/history/spec-changelog.md, kb:adr/release-install-front-door-curl-sh, kb:adr/update-trust-root-minisign-signed-checksums]
supersedes: []
---
**Context.** An unverified curl-to-sh installer is the standard criticism of the shape, and a widely copied installer in the same space does no verification at all. The release tool already publishes a checksums file beside every archive.

**Options.** (A) Download and extract, trusting transport security alone. (B) Fetch the checksums file too and refuse to install an archive whose SHA-256 does not match its line.

**Decision.** B. It costs one small extra download and turns a corrupted or substituted archive into a named failure.

**Consequences.** The check guards integrity, not authenticity: the checksums file comes from the same host as the archive. The self-update work treated this as a precedent for its verification question, not an answer, and put a signature over the checksums file. The installer could adopt the same signature later without changing its shape.
