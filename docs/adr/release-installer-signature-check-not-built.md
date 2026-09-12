---
id: release-installer-signature-check-not-built
type: decision
status: rejected
date: 2026-09-12
summary: install.sh stops at SHA-256 and never checks checksums.txt.minisig; a key the host itself delivers is no trust root, and macOS has no Ed25519 verifier.
features: [release]
tags: [security, never, user-decision]
files: [scripts/install.sh, README.md]
tests: []
refs: [kb:adr/release-installer-verifies-sha256-against-checksums, kb:adr/update-trust-root-minisign-signed-checksums, kb:adr/release-install-front-door-curl-sh, kb:runbook/release-signing]
supersedes: []
---
**Context.** Every release from v0.12.1 publishes `checksums.txt.minisig`, and `musterd` refuses any update whose signature does not verify against its compiled-in key. The first install has no such check: `install.sh` matches the archive's SHA-256 against `checksums.txt` and trusts that file's origin. Closing that gap was carried as a backlog item.

**Options.** (A) Shell out to `minisign` when it is on PATH, warn otherwise. (B) Require `minisign`, refusing to install without it. (C) Leave the installer at SHA-256 and document the by-hand check.

**Decision.** C, Damian's decision. A public key pasted into a script fetched from `raw.githubusercontent.com` arrives from the same host, over the same TLS, as the assets it would police — not an independent trust root the way the embedded key is, so the gain is confined to release assets being tampered with while repo contents are not. macOS ships nothing that verifies Ed25519 (LibreSSL 3.3.6 lists no such algorithm; there is no `signify`), so any check means a Homebrew prerequisite on a one-line front door. Projects that sign verify in the tool, not the bootstrap script, which is the shape already in place.

**Consequences.** The installer's guarantee stays integrity, not authenticity, and `README.md` says so and carries the `minisign -Vm` recipe for anyone who wants more. Authenticity begins the moment `musterd` is on disk. Build provenance attestation, which would root trust outside the host, is a separate unbuilt question.
