---
id: agent-tool-async-by-default
type: fact
status: active
date: 2026-09-30
summary: On 2.1.285 the Agent tool runs async by default; a subagent done mid-turn re-invokes under the open prompt_id, one done after Stop under a new one.
features: [lifecycle]
tags: [claude-code-format, state-machine]
files: [internal/session/machine.go]
tests: []
refs: [test/rig/captures/capture-9.jsonl, kb:fact/background-completion-new-prompt-id, kb:fact/background-tasks-field, "#64"]
verified: 2.1.285..2.1.285
guard: none
---
An `Agent` call whose `tool_input` has no `run_in_background` key returned at once with
`tool_response.isAsync: true`, and `PostToolUse{Agent}` arrived with `SubagentStart` (3 of 3).

When the subagent finished **after** the main turn's `Stop`, the completion arrived as a
`UserPromptSubmit` whose prompt begins `<task-notification>`, under a **new** `prompt_id`
(2 of 2). When it finished while the main agent was still inside a foreground tool, the
completion `UserPromptSubmit` reused the **still-open** `prompt_id`, with no `Stop` in
between, and the turn carried on (1 of 1).

`Stop.background_tasks` listed the running subagent and an auto-backgrounded Bash call
(`run_in_background: true`, `{type:"shell", status:"running"}`) until each finished; the
`Stop` of the last completion turn carried `[]`. A `SubagentStop`'s own list still names that
subagent as `running`, so only `Stop`'s list is current.

Evidence: interface probe 2026-09-30, instance 9, 1 interactive haiku session.
