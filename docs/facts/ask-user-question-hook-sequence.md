---
id: ask-user-question-hook-sequence
type: fact
status: active
date: 2026-09-30
summary: AskUserQuestion fires PreToolUse, PermissionRequest and permission_prompt; answering a question fires nothing; submitting fires PostToolUse.
features: [lifecycle]
tags: [claude-code-format, state-machine]
files: [internal/claudecode/interpret.go]
tests: []
refs: [test/rig/captures/capture-9.jsonl, kb:fact/notification-types-observed, "#40"]
verified: 2.1.285..2.1.285
guard: none
---
One `AskUserQuestion` call holding two questions: `PreToolUse{AskUserQuestion}` →
`PermissionRequest{AskUserQuestion}` → (6.0 s) `Notification{permission_prompt}`. Answering
the first question and moving to the second fires **no hook**. Submitting the answers fires
`PostToolUse{AskUserQuestion}` then `PostToolBatch`, then the turn continues (1 of 1).

So the question dialog, on its own, keeps a session in `needs_input` until the answers are
submitted. A session that leaves `needs_input` part-way through answering is being moved by
something else — a background subagent's hooks (kb:fact/subagent-hooks-during-permission-wait).

Evidence: interface probe 2026-09-30, instance 9, 1 interactive haiku session.
