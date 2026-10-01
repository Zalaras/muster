---
id: plan-feedback-emits-only-post-tool-batch
type: fact
status: active
date: 2026-09-30
summary: Rejecting ExitPlanMode with feedback emits only PostToolBatch, with no PostToolUse, PostToolUseFailure or PermissionDenied, before the next tool call.
features: [lifecycle, ingest]
tags: [claude-code-format, state-machine]
files: [internal/claudecode/interpret.go, internal/claudecode/settings.go]
tests: []
refs: [test/rig/captures/capture-9.jsonl, kb:fact/plan-mode-hook-sequence, kb:fact/tool-failure-hook-events, "#32"]
verified: 2.1.285..2.1.285
guard: none
---
In plan mode, `PreToolUse{ExitPlanMode}` → `PermissionRequest{ExitPlanMode}` → (6 s)
`Notification{permission_prompt}`. Choosing "Tell Claude what to change" and submitting text
then emits exactly one hook, `PostToolBatch`, and nothing else until Claude's next
`PreToolUse` 4.3 s later (1 of 1). No `PostToolUse`, `PostToolUseFailure` or
`PermissionDenied` fires. Approving the plan instead emits `PostToolUse`.

`PostToolBatch` keys: `cwd`, `hook_event_name`, `permission_mode`, `prompt_id`,
`scratchpad_dir`, `session_id`, `tool_calls`, `transcript_path` (4 of 4). A subagent's
`PostToolBatch` also carries `agent_id` (3 of 3).

Consequence for Muster: `PostToolBatch` is not registered, so after feedback the card stays
`needs_input` until the next tool call — for a long-thinking model, the whole replan (#32).

Evidence: interface probe 2026-09-30, instance 9, 1 interactive haiku session in plan mode.
