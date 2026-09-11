---
id: surfaces-tmux-preflight-at-startup
type: decision
status: accepted
date: 2026-08-31
summary: tmux is a hard dependency checked by a bounded preflight before the data dir or listener exists; a missing or broken tmux is fatal with the remedy on stderr.
features: [surfaces, connection]
tags: [tmux, ux]
files: [internal/tmux/preflight.go, cmd/musterd/preflight.go, cmd/musterd/main.go]
tests: [TestPreflight_NotFoundOnPath, TestPreflight_HangingTmuxIsBoundedAndFatal, TestRunTmuxPreflight_NotFoundReportsInstallRemedy, TestRun_FailedPreflightLeavesNoSideEffects]
refs: [docs/history/spec-changelog.md, plan:tmux-installation, "#2", kb:adr/surfaces-shared-attach-single-pty]
supersedes: []
---
**Context.** On a machine without tmux the first launch died inside the create-session handler with a raw exec error shown in the launch dialog. Nothing checked for tmux before that moment.

**Options.** (A) Check at first launch and improve the error. (B) Check at startup, before creating the data directory or binding the listener, and refuse to run.

**Decision.** B. Absent, not executable, exiting non-zero, or not answering a version query within a short bound are all fatal, with a report on stderr and an error naming the install or upgrade command. tmux is the only gating dependency; the Claude Code version check stays a warning.

**Consequences.** A failed preflight leaves no side effects. Version knowledge lives in the tmux package; the entry point only renders and gates. The version flag still works with tmux absent. The readme's remedy is tested to match the preflight's.
