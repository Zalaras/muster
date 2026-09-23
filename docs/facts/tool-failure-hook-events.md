---
id: tool-failure-hook-events
type: fact
status: active
date: 2026-09-23
summary: A tool that fails emits PostToolUseFailure, not PostToolUse; a validation-rejected call emits only PostToolBatch.
features: [lifecycle, ingest]
tags: [claude-code-format]
files: [internal/claudecode/settings.go, internal/claudecode/interpret.go]
tests: []
refs: [test/rig/captures/capture-8.jsonl, kb:fact/hook-payload-fields]
verified: 2.1.280..2.1.280
guard: none
---
- **Failed tool.** `Read` on a missing file: `PreToolUse` → `PostToolUseFailure` →
  `PostToolBatch`, with no `PostToolUse`. The payload has `tool_name`, `tool_input`,
  `tool_use_id`, `error` (the tool's message), `is_interrupt: false`, `duration_ms`,
  `permission_mode` and `prompt_id` (1 of 1).
- **Validation-rejected call.** A standalone `sleep 30`, which the Bash tool blocks with a
  `tool_use_error` before running it, emitted **no** `PreToolUse` or `PostToolUse`, only
  `PostToolBatch` (1 of 1).

Muster registers neither `PostToolUseFailure` nor `PostToolBatch`. So a failed tool's closing
event never reaches the ingest, and a validation-rejected call is invisible. Neither changes
the state today: the turn is already `working` and carries on.

`PostToolBatch` is also the only event that marks the end of a batch. It fired once per batch
in every capture, after every `PostToolUse` of the batch had finished
(kb:fact/hook-await-per-event).

Evidence: interface probe 2026-09-23, instance 8. 1 headless and 1 interactive haiku session.
