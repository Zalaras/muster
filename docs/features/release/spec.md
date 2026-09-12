---
id: release
type: spec
status: active
date: 2026-09-12
summary: GoReleaser, the curl-pipe-sh installer, minisign signing, the Homebrew tap, the commit-msg guard.
features: [release]
tags: [pipeline, deps]
files: [.goreleaser.yaml, .github/workflows/**, scripts/install.sh, .githooks/commit-msg]
go: []
web: []
e2e: []
protocol: []
refs: [kb:adr/release-versioning-automatic-from-conventional-commits, kb:adr/process-release-v0-clamp-v1-deliberate, kb:adr/process-release-bump-map-widened-perf-refactor, kb:adr/process-release-commitlint-eleven-types, kb:adr/process-release-breaking-marker-bang-gated, kb:adr/process-release-notes-derived-from-bumping-types, kb:adr/release-builds-cross-compiled-on-linux, kb:adr/release-two-arch-archives-not-universal, kb:adr/release-drops-js-sourcemap, kb:adr/update-trust-root-minisign-signed-checksums, kb:adr/release-install-front-door-curl-sh, kb:adr/release-installer-verifies-sha256-against-checksums, kb:adr/release-installer-no-sudo-no-prompt, kb:adr/release-latest-resolved-via-redirect-not-api, kb:adr/release-distribution-github-release-not-brew, kb:adr/release-homebrew-tap-via-casks-and-tap-pat, kb:adr/release-no-ci-test-job-yet, kb:adr/process-land-skill-is-the-landing-ritual]
---
Every push to `main` may cut a release; nothing else does.

**Versioning.** The release workflow computes the next version from conventional commits
since the last tag: a feat bumps minor, fix, perf and refactor bump patch, every other type
releases nothing (kb:adr/release-versioning-automatic-from-conventional-commits,
kb:adr/process-release-bump-map-widened-perf-refactor). The run is clamped to 0.x so no
marker cuts 1.0.0 by accident (kb:adr/process-release-v0-clamp-v1-deliberate). Commit
subjects are enforced by the commit-msg hook armed per clone by `make hooks`: the
eleven-strong type list plus a review type on plan branches, a 72-character summary cap on
the four bumping types, the breaking footer banned outright and the exclamation marker legal
only with an explicit human environment variable
(kb:adr/process-release-commitlint-eleven-types, kb:adr/process-release-breaking-marker-bang-gated).
Release notes are the bumping types' subjects verbatim
(kb:adr/process-release-notes-derived-from-bumping-types).

**Building.** Tagging and releasing happen in one job on a Linux runner: the dashboard is
built without its sourcemap and embedded, then GoReleaser cross-compiles darwin amd64 and
arm64 with cgo disabled into two archives (kb:adr/release-builds-cross-compiled-on-linux,
kb:adr/release-two-arch-archives-not-universal, kb:adr/release-drops-js-sourcemap). The
checksums file is signed with minisign from a repository secret; a missing secret fails the
release rather than publishing unsigned, because the signed checksums file is the trust root
the self-updater accepts (kb:adr/update-trust-root-minisign-signed-checksums, kb:spec/update).
No test or lint job runs in CI; the release build is the compile gate
(kb:adr/release-no-ci-test-job-yet).

**Installing.** The front door is a POSIX sh script piped from curl, wrapped by
`make install` (kb:adr/release-install-front-door-curl-sh). It resolves latest through the
releases redirect, downloads the archive for the machine's architecture into a fresh
temporary directory, checks its SHA-256 against the release's own checksums file, and
installs into a user-writable bin directory with no sudo and no prompt; an unwritable target
fails naming the remedy (kb:adr/release-installer-verifies-sha256-against-checksums,
kb:adr/release-installer-no-sudo-no-prompt, kb:adr/release-latest-resolved-via-redirect-not-api).
Distribution is the GitHub Release; a Homebrew tap is scoped but not built
(kb:adr/release-distribution-github-release-not-brew, kb:adr/release-homebrew-tap-via-casks-and-tap-pat).

**Landing.** Plan branches reach `main` through the land ritual, which squash-merges with a
subject that closes the issue and pushes, so the push is what releases
(kb:adr/process-land-skill-is-the-landing-ritual).
