---
id: canary-interactive-dialog-rows-accepted-residual
type: decision
status: superseded
date: 2026-08-29
summary: Behaviours behind an interactive dialog (plan mode, PermissionRequest, Notification, SubagentStop) stay outside the canary and are verified by probe on demand.
features: [canary]
tags: [claude-code-format, testing, revisit]
files: [test/canary/skip_test.go, test/canary/harness_test.go]
tests: [TestSkipDecision]
refs: [docs/history/spec-changelog.md, kb:adr/canary-drives-installed-claude-through-production-chain, kb:adr/process-interface-probe-rig-in-repo, kb:fact/plan-mode-hook-sequence]
supersedes: []
---
**Context.** Once the canary drove a real claude, a handful of the facts it should guard could only be produced by answering an interactive dialog: leaving plan mode, a permission request, the notification that follows one, and a subagent's stop.

**Options.** (A) Script the dialogs through tmux so every row is binding. (B) Leave those rows skipped with a named reason and verify them by a controlled probe when the version moves.

**Decision.** B, as an accepted residual. Driving a dialog needs a terminal, timing and keystrokes the rest of the harness does not, and the probe rig already answers those questions.

**Consequences.** The skip decision is itself tested so a skipped row is never silent. The residual is a standing candidate for a later harness that can drive the terminal, at which point this record is superseded.
