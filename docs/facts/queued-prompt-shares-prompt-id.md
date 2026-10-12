---
id: queued-prompt-shares-prompt-id
type: fact
status: active
date: 2026-10-12
summary: A message typed while a turn runs fires UserPromptSubmit when queued, under the running turn's prompt_id, and one Stop closes both.
features: [lifecycle]
tags: [claude-code-format]
files: [internal/session/machine.go]
tests: []
refs: [test/rig/captures/capture-3-state-2026-10-12.jsonl]
verified: 2.1.296..2.1.296
guard: none
---
Submitting a second message while a turn runs ("Press up to edit queued messages") fires
`UserPromptSubmit` straight away. Its `prompt_id` is the **running** turn's, not a fresh one.
Claude folds the message into that turn, and a single `Stop` closes it (1 of 1).

When the queued message is pulled back out by Esc, its own transcript `promptId` turned up on
nothing but one `SubagentStop` (1 of 1). No `UserPromptSubmit` or `Stop` carried it.

Evidence: interface probe 2026-10-12, instance 3, session `f7c88c`.
