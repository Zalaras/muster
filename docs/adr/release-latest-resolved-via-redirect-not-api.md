---
id: release-latest-resolved-via-redirect-not-api
type: decision
status: accepted
date: 2026-09-10
summary: Latest release is resolved by reading the releases-latest redirect, which is unmetered, never the REST API with its sixty unauthenticated calls an hour.
features: [release, update]
tags: [deps]
files: [scripts/install.sh, internal/selfupdate/release.go]
tests: [TestLatestTag_ResolvesAbsoluteAndRelativeRedirect, TestLatestTag_NeverFollowsTheRedirectItself]
refs: [docs/history/spec-changelog.md, kb:adr/release-install-front-door-curl-sh, kb:adr/update-check-runs-in-daemon-daily]
supersedes: []
---
**Context.** Both the installer and the daemon's update check need to know the newest release tag without a token. The obvious call is the releases API.

**Options.** (A) Query the API's latest-release endpoint. (B) Request the human-facing latest-release URL without following redirects and read the tag out of the redirect target.

**Decision.** B. Unauthenticated API calls are rate-limited per address, and a daily check from every daemon behind one office address, or an installer run in a loop, would trip it; the redirect is unmetered.

**Consequences.** The installer and the self-update package resolve latest the same way, so a change to the release host's layout breaks both at once and visibly. The redirect is read, never followed, so the tag is the only thing taken from it.
