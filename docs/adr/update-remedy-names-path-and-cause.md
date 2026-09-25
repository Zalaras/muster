---
id: update-remedy-names-path-and-cause
type: decision
status: accepted
date: 2026-09-25
summary: An unmanaged install's remedy names the running binary's resolved path and the concrete reason it can't be updated, never a claim about who installed it.
features: [update]
tags: [ux]
files: [internal/selfupdate/install.go, cmd/musterd/main.go]
tests: []
refs: [plan:settings-update-failures, "#53", kb:anchor/ws.update, kb:adr/update-install-rechecked-on-every-check]
supersedes: []
---
**Context.** The unmanaged remedy said "not installed by the muster installer". The classifier can't know that: it sees an unwritable directory or an enclosing git tree. In #53 the developer had installed with the installer, so the sentence read as a contradiction, and it gave no clue which copy was running or why it was refused.

**Options.** (A) Keep one fixed sentence. (B) Compose the remedy from what the classifier observed: the resolved path, then either the directory with the write probe's own error text, or the root of the enclosing git checkout. The installer one-liner follows.

**Decision.** B. The panel should state what Muster measured, and the probe's error separates the cases that matter. "Permission denied" means file modes, and "operation not permitted" means a sandbox or privacy block.

**Consequences.** The fixed installer-remedy constant goes, and tests assert the composed text per reason. The startup log line carries the resolved path, so a refusal can be traced after the fact. The Homebrew remedy is unchanged.
