---
id: subagent-declared-mode-on-hooks
type: fact
status: active
date: 2026-10-12
summary: A subagent whose definition declares a permission mode reports it on its hooks; built-in claude-code-guide declares dontAsk, even under a plan-mode parent.
features: [lifecycle]
tags: [claude-code-format, state-machine]
files: [internal/claudecode/interpret.go, internal/session/machine.go]
tests: []
refs: [test/rig/captures/capture-3-state-2026-10-12c.jsonl, kb:fact/subagent-hooks-carry-parent-permission-mode, kb:fact/permission-mode-presence-split, "#70"]
verified: 2.1.296..2.1.296
guard: none
---
The built-in `claude-code-guide` agent is defined in the 2.1.296 bundle with `model:"haiku",
permissionMode:"dontAsk"`. The spawn code lets a declared mode replace the parent's. The
exceptions are a declared `bypassPermissions` the session may not grant, and an `auto` that is
unavailable; both keep the parent's mode.

In a session launched with `--permission-mode plan`, the main agent's hooks carried `plan`. The
`claude-code-guide` subagent's `PreToolUse`/`PostToolUse`/`PostToolBatch` carried
`permission_mode:"dontAsk"` with its `agent_id` (12 of 12), and so did its `SubagentStop`, plus
one internal helper's. Explore and Plan declare no mode and carry the parent's
(kb:fact/subagent-hooks-carry-parent-permission-mode).

A plan-mode session also kept `plan` on a message queued mid-turn and on the next new prompt
(4 of 4 `UserPromptSubmit`).

Fed through `Interpret` + `applyInput`, the first marked hook latches `dontAsk`, and the session
reads `working` instead of `planning` with no plan approved.

Evidence: interface probe 2026-10-12, instance 3, session `c283d4`. The other built-in agents'
definitions were read from the same bundle.
