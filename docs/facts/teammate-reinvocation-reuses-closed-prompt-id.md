---
id: teammate-reinvocation-reuses-closed-prompt-id
type: fact
status: active
date: 2026-11-12
summary: A named Agent runs as a teammate; when it finishes, the main agent is re-invoked with no UserPromptSubmit under the prompt_id its own Stop already closed.
features: [lifecycle]
tags: [claude-code-format, state-machine]
files: [internal/claudecode/interpret.go, internal/session/machine.go]
tests: []
refs: [kb:fact/background-completion-new-prompt-id, kb:fact/subagent-hooks-carry-agent-id, kb:fact/ask-user-question-hook-sequence, "#122", "#123"]
verified: 2.1.322..2.1.322
guard: none
---
An `Agent` call with a `name` starts a **teammate**: the TUI says "1 teammate started", and
`SubagentStart.agent_type` is that name. The teammate's tool hooks carry `agent_id`, with
`agent_type` set to the name. It ends with `SubagentStop` and then a `TeammateIdle` hook.

When a teammate finishes, the TUI shows "Teammate @<name> finished" and the **main agent takes
another turn with no `UserPromptSubmit`**, under the `prompt_id` of the most recent turn, even
though that turn's `Stop` has already closed it. Every main-agent hook of the new turn carries
the closed id and no `agent_id`: `PreToolUse` and `PostToolUse`, and for `AskUserQuestion` also
`PermissionRequest` and `Notification{permission_prompt}`. The turn ends with a second `Stop` on
the same id. A finished background shell still opens a new prompt_id
(kb:fact/background-completion-new-prompt-id).

A teammate's `SendMessage` to the main agent shows as "Message from @<name>". It fires no main
hook while the main agent is in a turn or has a dialog open. The next time the main agent takes
it up, it fires a main-agent `UserPromptSubmit` whose `prompt` begins `<agent-message from="…">`.
That event is under the open prompt_id (1 of 1), or under a new one if the main turn had already
stopped (1 of 1).

Replayed through `applyInput`, the closed-id turn produces both reported symptoms. Main tool
calls on a closed prompt are ignored, so the session stays `idle` while the main agent works
(#122). The `AskUserQuestion` wait is ignored too, while a still-running teammate's
`agent_id`-marked hooks move the session to `working` (#123).

Evidence: interface probe 2026-11-12, instance 3, `capture-3.jsonl`. There were 4 teammate
re-invocations in total: 3 in interactive haiku sessions in manual mode, and 1 in a Sonnet 5.5
session in auto mode whose hooks report `permission_mode: "auto"`. All 4 reused the closed
prompt_id with no `UserPromptSubmit`. Ritual-only: a teammate costs at least two model turns.
