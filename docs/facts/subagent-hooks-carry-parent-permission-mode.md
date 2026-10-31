---
id: subagent-hooks-carry-parent-permission-mode
type: fact
status: active
date: 2026-10-12
summary: Subagent tool hooks carry the session's permission_mode unless the agent declares its own; declining a background subagent's prompt emits its PostToolBatch.
features: [lifecycle]
tags: [claude-code-format]
files: [internal/session/machine.go]
tests: []
refs: [kb:fact/subagent-declared-mode-on-hooks, kb:fact/subagent-hooks-carry-agent-id, kb:fact/plan-mode-hook-sequence, "#70"]
verified: 2.1.296..2.1.296
guard: none
---
In a session launched with `--permission-mode plan`, an Explore subagent's `PreToolUse`,
`PostToolUse` and `PostToolBatch` carried `permission_mode:"plan"`, the same as the main
agent's (4 of 4). In `acceptEdits` and `default` sessions they carried that mode. That holds
for agents that declare no mode of their own; one that declares a mode reports that mode instead
(kb:fact/subagent-declared-mode-on-hooks).

In the same plan-mode turn, approving the plan ("Yes, auto-accept edits") fired
`PostToolUse{ExitPlanMode, permission_mode:"acceptEdits"}`. The rest of that turn's tools ran in
`acceptEdits`, so the card goes `planning` → `needs_input` → `working` → `idle` inside one
`prompt_id`.

Pressing Esc on a **background** subagent's permission prompt fires `PermissionRequest` (marked),
then `permission_prompt`, then a subagent-marked `PostToolBatch`, then that agent's
`SubagentStop`. The background-completion `UserPromptSubmit` and `Stop` follow. No
`PermissionDenied` fired (1 of 1).

Evidence: interface probe 2026-10-12, instance 3, sessions `23d8f5` (plan mode, Explore
subagent, approval) and `f7c88c` (background permission declined).

Raw probe capture (local only, not in git): `capture-3-state-2026-10-12.jsonl`.
