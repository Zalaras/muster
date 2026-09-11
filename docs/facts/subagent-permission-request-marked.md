---
id: subagent-permission-request-marked
type: fact
status: active
date: 2026-09-11
summary: A subagent's PermissionRequest carries agent_id and agent_type; the permission_prompt Notification that follows carries no agent marker.
features: [lifecycle, ingest]
tags: [claude-code-format]
files: [internal/claudecode/interpret.go, internal/session/machine.go]
tests: [TestApplyInput_NeedsInputPermission_ClosedPromptSubagentMarked]
refs: [spikes/FINDINGS.md, "#14"]
verified: 2.1.259..2.1.267
guard: none
---
A subagent's `PermissionRequest` carries the parent `prompt_id` plus `agent_id` and
`agent_type` (keys: `agent_id, agent_type, cwd, hook_event_name, permission_mode,
permission_suggestions, prompt_id, scratchpad_dir, session_id, tool_input, tool_name,
transcript_path`) and arrives after the parent's `Stop` (+1.6 s). The `Notification`
`permission_prompt` that follows it (+7.7 s) carries no agent marker (keys: `cwd,
hook_event_name, message, notification_type, prompt_id, scratchpad_dir, session_id,
transcript_path`) — only the `PermissionRequest` identifies a subagent-originated permission
wait. 1/1 session.

Evidence: 2.1.259 probe 2026-09-03 (capture-6), issue #14. Ritual-only (needs a subagent that
requests permission).
