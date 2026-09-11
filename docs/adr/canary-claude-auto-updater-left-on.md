---
id: canary-claude-auto-updater-left-on
type: decision
status: accepted
date: 2026-08-16
summary: Muster never freezes Claude Code's auto-updater; it detects and classifies the installed version at startup and lets the canary gate what is verified.
features: [canary]
tags: [claude-code-format, user-decision]
files: [docs/claude-code-versions.md, internal/claudecode/version.go, cmd/musterd/main.go]
tests: [TestCheckVersion, TestCheckClaudeCode_UnknownOutcomeNeverFailsStartup]
refs: [docs/history/todo-done.md, docs/claude-code-versions.md, kb:adr/canary-verified-range-observed-not-pinned, kb:adr/connection-installed-claude-classified-never-refused, kb:adr/update-check-pref-governs-checking-only]
supersedes: []
---
**Context.** Muster depends on undocumented wire formats that a new Claude Code release can change at any time, and Claude Code updates itself most weekdays. Freezing the binary would make Muster's assumptions safe at the cost of every other use of Claude Code on the machine, since there is one binary for all of Damian's work.

**Options.** (A) Disable Claude Code's auto-updater through its environment variable and move it only after a green canary. (B) Detect and classify: read the installed version at startup, warn on both sides of what the canary has verified, never refuse to run, and let the canary be the authority on what is known to work.

**Decision.** B, taken at the start and reaffirmed when the pin became a range. The only freeze mechanism is an environment variable in the user's global settings, which Muster never touches.

**Consequences.** The user's Claude Code stays current everywhere. Muster's own self-update is a separate, opt-outable mechanism that never touches Claude Code. The cost is that a breaking upstream release is discovered by the canary or by a user, never prevented.
