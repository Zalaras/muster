---
id: canary-plan-mode-step-three-sole-residual
type: decision
status: accepted
date: 2026-09-10
summary: Permission requests, notifications and the first two plan-mode steps are asserted with the dialog unanswered; only the post-approval step stays a probe.
features: [canary]
tags: [claude-code-format, testing, revisit]
files: [test/canary/harness_test.go, test/canary/canary_test.go, docs/claude-code-versions.md]
tests: [TestPlanModeSequence, TestNotifications]
refs: [docs/history/spec-changelog.md, plan:canary-full-coverage, kb:adr/canary-interactive-dialog-rows-accepted-residual, kb:adr/process-interface-probe-rig-in-repo, kb:fact/plan-mode-hook-sequence, kb:fact/permission-suggestions-optional, kb:fact/subagent-hooks-carry-agent-id]
supersedes: [canary-interactive-dialog-rows-accepted-residual]
---
**Context.** Four rows had been left outside the canary because they seemed to need an interactive dialog answered. Re-examined, most of them fire before any answer: a permission request and its notification arrive when the dialog opens, the idle notification arrives by waiting, and the first two plan-mode steps arrive when the model asks to exit plan mode.

**Options.** (A) Keep all four rows skipped. (B) Script the dialog through tmux. (C) Drive one turn that ends in a plan-mode exit request and assert everything that fires before the dialog is answered, leaving it unanswered; keep only the step that needs the answer as a named probe ritual.

**Decision.** C. The dialog-driving fragility that justified the skip never arises when the dialog is simply left open.

**Consequences.** One interactive residual remains, the post-approval plan-mode step, named beside the range ritual. The subagent stop row is no longer a residual because it is not a surface. The subagent marker on tool hooks stays a probe ritual since producing it costs at least two turns.
