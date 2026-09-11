---
id: release-cask-quarantine-strip-not-signing
type: decision
status: proposed
date: 2026-09-10
summary: A cask install would need a post-install quarantine strip because the binary is unsigned and unnotarized; a recorded workaround, signing unaddressed.
features: [release]
tags: [security, deferred, revisit]
files: [.goreleaser.yaml, TODO.md]
tests: []
refs: [docs/history/spec-changelog.md, kb:adr/release-homebrew-tap-via-casks-and-tap-pat, kb:adr/release-builds-cross-compiled-on-linux]
supersedes: []
---
**Context.** Release binaries are cross-compiled on Linux and carry no code signature or notarization. A cask-installed binary is quarantined by the system and dies on first run; the installer path avoids this because a file written by curl and tar in a shell is not quarantined the same way.

**Options.** (A) Sign and notarize releases, which needs a developer account and a signing step outside the Linux build. (B) A post-install hook in the cask that removes the quarantine attribute. (C) Ship the cask and let the first run fail.

**Decision.** B is the recorded shape for the tap when it is built. It is a workaround, not a signing decision; signing stays open and is the record to revisit if the tool ever reaches users who would balk at a stripped attribute.

**Consequences.** Any later signing decision changes the build step, the cask and the self-update apply path together. Until then the installer path stays the front door precisely because it sidesteps the question.
