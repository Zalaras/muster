---
id: release-distribution-github-release-not-brew
type: decision
status: superseded
date: 2026-08-31
summary: Distribution is the tagged GitHub Release: an install target downloads the latest darwin archive; Homebrew is deferred to any open-sourcing.
features: [release]
tags: [deps, deferred, user-decision]
files: [Makefile, scripts/install.sh, .goreleaser.yaml, .github/workflows/release.yml]
tests: []
refs: [docs/history/spec-changelog.md, kb:adr/connection-dashboard-embedded-in-binary, docs/history/todo-done.md]
supersedes: []
---
**Context.** A self-contained binary is only useful once there is a way to get one. The repo was private with a single user.

**Options.** (A) A GitHub Release per version, pulled by an install target or the GitHub CLI into a user bin directory. (B) A Homebrew tap. A private tap works only through a private-repository download strategy plus a permanent API token in the user's environment.

**Decision.** A now. B is deferred until the repo is public, when the download-side cost disappears, though the publish-side cost of a tap remains.

**Consequences.** Every push to main that carries a releasable commit cuts a release, so the install path is always the latest one. Architecture selection is one command in the install script. The later public-repo work revisited the front door and the tap and is recorded there.
