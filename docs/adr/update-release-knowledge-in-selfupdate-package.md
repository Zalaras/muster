---
id: update-release-knowledge-in-selfupdate-package
type: decision
status: accepted
date: 2026-09-10
summary: All GitHub-release knowledge lives in one package; the server owns the poller and wire, the command owns the flag, install classification and re-exec.
features: [update]
tags: [deps]
files: [internal/selfupdate/doc.go, internal/selfupdate/release.go, internal/selfupdate/apply.go, internal/server/update.go, cmd/musterd/update.go]
tests: [TestAssetName, TestDownloadURL, TestParseRelease_Table, TestApply_SuccessfulInstall]
refs: [docs/history/spec-changelog.md, plan:auto-update, kb:adr/ingest-all-hooks-command-wrappers, kb:adr/update-trust-root-minisign-signed-checksums, kb:adr/process-composition-roots-registration-only]
supersedes: []
---
**Context.** Self-update touches the release host's URL layout, the release tool's asset naming, two file formats and the process image. Spread across the server and the command, that knowledge would leak into packages that have nothing to do with releases, the same way Claude Code's wire format once threatened to leak out of its package.

**Options.** (A) Implement the check and apply inside the server package where the poller lives. (B) One package that owns all release knowledge and exposes resolve, download, verify and apply; the server owns the poller, the serialisation and the wire messages; the command owns the flag, the install classification and the re-exec.

**Decision.** B, on the precedent of the Claude Code package boundary.

**Consequences.** A change in the release host's layout or the release tool's naming is a change in one package with its own tests. The server never imports anything about minisign or archives. Nothing here touches the Claude Code package or Claude Code's own updater.
