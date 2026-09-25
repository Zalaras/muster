---
id: update-failure-one-sentence-chain-in-log
type: decision
status: accepted
date: 2026-09-25
summary: A failed check or apply reaches the wire as one sentence naming the innermost cause, never a URL; the full error chain goes to the daemon log at warn.
features: [update]
tags: [ux]
files: [internal/selfupdate/release.go, internal/selfupdate/apply.go, internal/server/updatemanager.go, internal/server/update.go]
tests: []
refs: [plan:settings-update-failures, kb:anchor/update.check, kb:anchor/ws.update, kb:adr/update-manual-check-is-a-synchronous-post, kb:adr/update-release-knowledge-in-selfupdate-package]
supersedes: []
---
**Context.** A failed check put Go's whole wrapped transport error in the Settings status line. That was four lines with the URL twice, and it pushed the action row down. A failed download did the same through the apply error.

**Options.** (A) Show the chain as it is. (B) Put a short sentence on the wire and keep the chain reachable in the dashboard, e.g. as a tooltip. (C) Put a short sentence on the wire and the chain in the daemon log.

**Decision.** C, the developer's call: the chain is the log's job. The sentence names what failed and the innermost cause. Timeouts read "timed out" and DNS failures "host not found". Other transport failures read as the deepest error's own text, and status answers read as the status.

**Consequences.** The composition lives in the self-update package with the rest of the release-host knowledge. The server stores and returns the sentence and logs the wrapped error at warn, for a user-initiated check and for every apply. A failed automatic check stays at debug and off the wire, as before. Verification refusals keep their existing sentences.
