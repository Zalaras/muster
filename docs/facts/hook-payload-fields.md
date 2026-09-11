---
id: hook-payload-fields
type: fact
status: active
date: 2026-09-11
summary: Per-event hook field inventory: the common set on every hook, prompt_id on all but SessionStart, and each event's own fields.
features: [ingest]
tags: [claude-code-format]
files: [internal/claudecode/interpret.go, internal/claudecode/ingest.go]
tests: [TestInterpret_SessionStart, TestInterpret_TurnActivityEvents, TestInterpret_Stop, TestInterpret_StopFailure, TestInterpret_SessionEnd, TestInterpret_Notification, TestInterpret_PermissionRequest]
refs: [spikes/FINDINGS.md]
verified: 2.1.233..canary
guard: TestHookFields
---
Every hook carries `cwd`, `hook_event_name`, `session_id`, `transcript_path`. `prompt_id` is on
all except `SessionStart`. `scratchpad_dir` is on every hook seen since 2.1.259.

| Event | Fields beyond the common set | `permission_mode` |
|---|---|---|
| `SessionStart` | `source`; optional `model`, `session_title` | absent |
| `UserPromptSubmit` | `prompt` | present |
| `PreToolUse` | `tool_name`, `tool_input`, `tool_use_id` | present |
| `PostToolUse` | `tool_name`, `tool_input`, `tool_use_id`, `tool_response`, `duration_ms` | present |
| `Stop` | `last_assistant_message`, `stop_hook_active`, `background_tasks`, `session_crons` (last two since 2.1.259) | present |
| `StopFailure` | `error`, `last_assistant_message` | absent |
| `SubagentStop` | `agent_id`, `agent_type`, `agent_transcript_path`, `last_assistant_message`, `stop_hook_active`, `background_tasks`, `session_crons` | present |
| `SessionEnd` | `reason` | absent |
| `Notification` | `notification_type`, `message` | absent |
| `PermissionRequest` | `tool_name`, `tool_input`; optional `permission_suggestions` | present |

The optional fields are kb:fact/sessionstart-model-optional-string, kb:fact/name-flag-reaches-title
and kb:fact/permission-suggestions-optional; the 2.1.259 additions are kb:fact/background-tasks-field.

Evidence: 134 payloads across capture-1 (2.1.233) and capture-3 (2.1.237); asserted on every
canary run since 2026-08-29 for every row except `SubagentStop`, which Muster reads nothing
from (`interpret.go` treats it as inert) and whose keys come from the 2.1.259 probe only.
