---
id: update-trust-root-minisign-signed-checksums
type: decision
status: accepted
date: 2026-09-10
summary: A release applies only if its checksums file carries a valid minisign signature against a compiled-in key and the archive's SHA-256 matches; no unsigned.
features: [update, release]
tags: [security, deps, user-decision]
files: [internal/selfupdate/verify.go, internal/selfupdate/minisign.pub, internal/selfupdate/pubkey.go, .goreleaser.yaml, .github/workflows/release.yml, docs/runbooks/release-signing.md]
tests: [TestVerifyChecksums_AcceptsBothSignatureModes, TestVerifyChecksums_Refusals, TestRunUpdate_BadSignatureRefusesAndLeavesBinaryUnchanged, TestApply_RefusalsLeaveTheBinaryByteIdentical]
refs: [docs/history/spec-changelog.md, plan:auto-update, docs/runbooks/release-signing.md, kb:adr/release-installer-verifies-sha256-against-checksums, kb:adr/update-check-pref-governs-checking-only]
supersedes: []
---
**Context.** A self-replacing binary that trusts whatever the release host serves turns a compromised host or account into code execution on every user's machine. The installer's checksum check was a precedent for verification but not a trust root, since the checksums file comes from the same host as the archive.

**Options.** (A) The checksum alone, as the installer does. (B) A signature over the checksums file with a key compiled into the binary, so trust roots in the source tree rather than the host; the archive's hash is then checked against the signed file. (C) The same with an unsigned fallback for releases that predate signing.

**Decision.** B, Damian's decision, using minisign with both its signature modes accepted. No fallback: a release without a signature is refused, and the release pipeline fails the release rather than publish one unsigned.

**Consequences.** The private key and its passphrase are secrets Damian created and holds; a release without them fails at the signing step by design. Local snapshot builds skip signing. Rotating the key means shipping a new public key in a release the old key signed, which the signing document walks through. A refused apply leaves the binary byte-identical.
