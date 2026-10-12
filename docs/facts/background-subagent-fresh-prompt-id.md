---
id: background-subagent-fresh-prompt-id
type: fact
status: active
date: 2026-10-12
summary: After the main Stop, background subagents' tool hooks can carry a fresh prompt_id that no UserPromptSubmit opened and no Stop closes.
features: [lifecycle]
tags: [claude-code-format, state-machine]
files: [internal/session/machine.go]
tests: []
refs: [kb:fact/subagent-hooks-carry-agent-id, kb:fact/background-completion-new-prompt-id, "#72"]
verified: 2.1.296..2.1.296
guard: none
---
kb:fact/subagent-hooks-carry-agent-id measured background subagents' hooks carrying the
**parent** turn's `prompt_id` after its `Stop`. The 2026-10-12 probe saw the same (session
`23d8f5`). The developer's live sessions on 2.1.296 also show a second shape.

Live session 14 (developer's event log, 2026-10-12 16:27–16:33): `Stop` closed prompt
`dac81107` with 2 background tasks running. 2 s later the subagents' `PreToolUse`/`PostToolUse`
arrived under a new `prompt_id` `f6b55573`. No `UserPromptSubmit` opened that id and no `Stop`
closed it. It ran for 2.5 min, until a `SubagentHandback` and the background-completion
`UserPromptSubmit` (a fresh id again, closed by its own `Stop`). The pattern repeated with
`9385f7c6` (2 of 2 background stretches in that session).

What decides which shape occurs is not measured. A prompt id like this is never closed by a
hook, so an `idle_prompt` naming it is an open-prompt notice, the shape #72 reported.

Evidence: read-only replay of the developer's live `event` table, 2026-10-12: event types,
`prompt_id`s and agent-marker presence only.
