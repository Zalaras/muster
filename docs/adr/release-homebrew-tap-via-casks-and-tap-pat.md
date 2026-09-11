---
id: release-homebrew-tap-via-casks-and-tap-pat
type: decision
status: proposed
date: 2026-09-10
summary: A Homebrew tap would publish through the release tool's cask block with a fine-grained token for the tap repo; scoped, not built, not free.
features: [release]
tags: [deps, deferred]
files: [.goreleaser.yaml, .github/workflows/release.yml, TODO.md]
tests: []
refs: [docs/history/spec-changelog.md, kb:adr/release-distribution-github-release-not-brew, kb:adr/release-install-front-door-curl-sh, kb:adr/release-cask-quarantine-strip-not-signing, kb:adr/update-install-kinds-decide-who-may-apply]
supersedes: []
---
**Context.** Two earlier claims about a tap needed correcting once the repository was public: that a tap was blocked by a private-repository token, and then that going public had removed the token cost entirely. Scoping against the release tool's documentation and this repository's workflow showed a different shape.

**Options.** (A) The release tool's formula block for prebuilt binaries. (B) Its cask block, since the formula spelling is deprecated and the workflow floats on the current major, so the old spelling would break on its own schedule. For the publish token: the workflow's default token, or a fine-grained personal token with write access to the tap repository only.

**Decision.** B with the fine-grained token, recorded as the shape of the work and left unscheduled. The public flip removed the download-side token cost, not the publish-side one: the default token is scoped to this repository and cannot commit a cask into a second one.

**Consequences.** Two install paths would coexist and can shadow each other, which is why the self-update classifier refuses to overwrite a Homebrew-managed binary. The Gatekeeper question is recorded separately.
