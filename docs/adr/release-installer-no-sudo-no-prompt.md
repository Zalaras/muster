---
id: release-installer-no-sudo-no-prompt
type: decision
status: accepted
date: 2026-09-10
summary: The installer defaults to a user-writable bin directory, never escalates and asks no confirmation; an unwritable target fails naming the remedy first.
features: [release]
tags: [security, ux]
files: [scripts/install.sh]
tests: []
refs: [docs/history/spec-changelog.md, kb:adr/release-install-front-door-curl-sh, "#7"]
supersedes: []
---
**Context.** Installers of this shape commonly prompt for confirmation and reach for sudo to write into a system directory. When the script is piped to the shell, standard input is the script itself, so a prompt would have to open the terminal device directly.

**Options.** (A) Prompt and escalate when the target is unwritable. (B) Default to a directory under the user's home that is always writable, never escalate, never prompt, and fail with the remedy when a chosen directory cannot be written.

**Decision.** B. A prompt would add ceremony for no safety, and escalation is a decision the user should make outside a piped script.

**Consequences.** The writability check runs before the download, because the first version discovered an unwritable directory only after fetching the archive. A warning names an earlier copy on the search path so an upgrade never silently keeps running the old binary.
