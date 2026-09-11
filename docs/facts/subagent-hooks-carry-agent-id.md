---
id: subagent-hooks-carry-agent-id
type: fact
status: active
date: 2026-09-11
summary: Tool hooks fired by a subagent carry the parent prompt_id plus agent_id and agent_type, and arrive after the parent's Stop when backgrounded.
features: [ingest, lifecycle]
tags: [claude-code-format]
files: [internal/claudecode/interpret.go, internal/session/machine.go]
tests: [TestInterpret_FromSubagentMarker, TestApplyInput_TurnActivity_ClosedPromptSubagentMarked]
refs: [spikes/FINDINGS.md, "#14"]
verified: 2.1.259..2.1.267
guard: none
---
Tool hooks fired by a subagent carry the parent turn's `prompt_id` plus `agent_id` and
`agent_type` (`PreToolUse` keys: `agent_id, agent_type, cwd, hook_event_name,
permission_mode, prompt_id, session_id, tool_input, tool_name, tool_use_id, transcript_path`).
Main-agent tool hooks have no `agent_id`. 2/2 sessions, 4/4 subagent tool hooks.

When the subagent runs in the background they arrive after the parent's `Stop`: TUI run had
`Stop` at +0.0 s, the subagent's `PreToolUse`/`PostToolUse` at +2.1/+3.0 s, `SubagentStop` at
+5.2 s, all under the same `prompt_id`. Headless `-p` ordered them differently (main `Stop`
after `SubagentStop`), so neither order can be assumed.

Extra `SubagentStop` events whose `agent_id` never appears on any tool hook were observed (3 in
the TUI run) — internal helper agents. `SubagentStop` keys: `agent_id, agent_transcript_path,
agent_type, background_tasks, cwd, hook_event_name, last_assistant_message, permission_mode,
prompt_id, session_crons, session_id, stop_hook_active, transcript_path`.

Evidence: 2.1.259 probe 2026-09-03 (capture-6), issue #14. Ritual-only: a subagent costs at
least two haiku turns, more than any canary assertion needs.
