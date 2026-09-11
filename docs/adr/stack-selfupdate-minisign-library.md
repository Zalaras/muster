---
id: stack-selfupdate-minisign-library
type: decision
status: accepted
date: 2026-09-10
summary: Signature verification for self-update uses the aead.dev minisign module rather than hand-rolled Ed25519 plus BLAKE2b; same dependency count, less code.
features: [update]
tags: [deps, security]
files: [internal/selfupdate/verify.go, go.mod]
tests: []
refs: [SPEC.md, docs/conventions.md, plan:auto-update, kb:adr/update-trust-root-minisign-signed-checksums]
supersedes: []
---
**Context.** The self-updater trusts a release only if its checksums file carries a valid minisign signature against a compiled-in key. Something has to verify that signature offline, in pure Go, in both of minisign's signature modes.

**Options.** (A) Hand-roll the verification from the standard library's Ed25519 and a BLAKE2b package: the format is small, but both signature modes and the trusted-comment handling have to be written and tested here. (B) Import the minisign module, which is pure Go and implements both modes, at the cost of one dependency, the same count as the hashing package A would need.

**Decision.** B.

**Consequences.** The module's import path differs from its repository name, which the conventions record so nobody fetches the wrong path. Verification stays in the self-update package; a refused signature leaves the binary untouched. Releases cross-compile unchanged because the module needs no cgo.
