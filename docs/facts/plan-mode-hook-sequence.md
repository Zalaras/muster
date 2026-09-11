---
id: plan-mode-hook-sequence
type: fact
status: active
date: 2026-09-11
summary: Leaving plan mode fires PreToolUse{ExitPlanMode, plan}, then PermissionRequest{ExitPlanMode}, then PostToolUse{ExitPlanMode, acceptEdits}.
features: [lifecycle]
tags: [claude-code-format]
files: [internal/session/machine.go]
tests: [TestApplyInput_NeedsInput]
refs: [spikes/FINDINGS.md, plan:canary-full-coverage]
verified: 2.1.233..canary
guard: TestPlanModeSequence
---
Leaving plan mode produces, in order:

1. `PreToolUse{tool_name:"ExitPlanMode", permission_mode:"plan"}`
2. `PermissionRequest{tool_name:"ExitPlanMode"}`
3. `PostToolUse{tool_name:"ExitPlanMode", permission_mode:"acceptEdits"}`

Evidence: all three steps measured against 2.1.233 (FINDINGS §4, plan mode). The guard drives
run E (a resumed session in plan mode asked to call `ExitPlanMode`) and asserts steps 1–2 and
their order; the dialog is deliberately never answered, so step 3 is logged as an
`/interface-probe` residual, not asserted.
