---
id: subagent-stopfailure-carries-agent-id
type: fact
status: active
date: 2026-10-12
summary: A background subagent whose API call fails emits StopFailure carrying its agent_id and the parent's already-closed prompt_id, after the main Stop.
features: [lifecycle]
tags: [claude-code-format, state-machine]
files: [internal/claudecode/interpret.go, internal/session/machine.go]
tests: []
refs: [kb:fact/stopfailure-replaces-stop, kb:fact/subagent-hooks-carry-agent-id, "#86"]
verified: 2.1.296..2.1.296
guard: none
---
A general-purpose agent was launched in the background, and the main turn's `Stop` closed prompt
`5f50e527` with 1 background task. The fail-proxy was then switched from pass-through to
answering 500 (`CLAUDE_CODE_MAX_RETRIES=0`). Within 0.15 s two `StopFailure{error:"server_error"}`
arrived, both carrying `prompt_id` `5f50e527` and an `agent_id`: one the launched agent's, the
other an internal helper's (2 of 2). The main agent then took its background-completion turn
(`UserPromptSubmit`, fresh `prompt_id`). That turn failed too, with an **unmarked** `StopFailure`,
because the proxy failed every call.

So a `StopFailure` can name a subagent and a prompt that a `Stop` already closed. Fed through
`Interpret` + `applyInput`, it moves an `idle` session to `failed` while the main agent sits at
its input box.

Evidence: interface probe 2026-10-12, instance 3, session `c60b4b`, through
`bin/probe-failproxy` (pass-through, then `-status 500`). A plain turn makes no API call after its
`Stop` (session `506299`: the startup call and the turn's only).

Raw probe capture (local only, not in git): `capture-3-state-2026-10-12c.jsonl`.
