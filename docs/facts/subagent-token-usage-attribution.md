---
id: subagent-token-usage-attribution
type: fact
status: active
date: 2026-11-19
summary: A subagent's token spend is only in its subagents/ transcript; the Agent result and task-notification report its last call's context, not the total.
features: [usage]
tags: [claude-code-format]
files: []
tests: []
refs: [kb:fact/subagent-cache-ttl-5m, kb:fact/background-agent-stop-marks-only-subagent-transcript, kb:fact/agent-tool-async-by-default]
verified: 2.1.328..2.1.328
guard: none
---
Where a subagent's token use can be read, and which figure is its real spend:

- **The transcript is the only full record.** `<session>/subagents/agent-<id>.jsonl` holds
  each assistant message with `message.model` and `message.usage` (`input_tokens`,
  `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, plus the
  `cache_creation.ephemeral_5m/1h` split). Each message appears more than once (10 lines for
  4 unique `message.id`s), so sum by unique id.
- **A sidecar names the agent.** `agent-<id>.meta.json` beside it is
  `{agentType, isBuiltIn, description, toolUseId, spawnDepth, requestShape
  ("foreground"|"background"), requestNonInteractive, model, pickedEffortModel, finished}`.
  `description` is the Agent call's `description`, so a caller that sets it can find its
  agent's file by it, or by `toolUseId`/agent id.
- **The id reaches the caller.** Hooks fired inside the subagent (`PreToolUse`, `PostToolUse`,
  `SubagentStart`/`SubagentStop`) carry `agent_id` and `agent_type`; `SubagentStop` also has
  `agent_transcript_path`. The Agent tool's `PostToolUse` `tool_response` carries `agentId`.
- **The totals handed back are not spend.** Interactive (background, the default):
  `tool_response` is `{agentId, description, isAsync: true, status: "async_launched",
  outputFile, resolvedModel, …}` with no usage, and the finish arrives as a
  `<task-notification>` prompt ending `<usage><subagent_tokens>N</subagent_tokens>
  <tool_uses>…</tool_uses><duration_ms>…</duration_ms></usage>`. Print mode (foreground):
  `tool_response` has `totalTokens` and a `usage` block. In both, the number is the **last**
  API call's context plus its output, not the run's total: a 4-call subagent reported
  `subagent_tokens` 33136 = last call's input + cache read + cache write + output, while the
  four calls summed to 127973 (input 34, output 464, cache read 111410, cache write 15065).
  The `usage` block is likewise a single-call figure.

So per-agent cost needs the transcript, priced by model and token type.

Evidence: interface probe 2026-11-19, instance 3, two haiku sessions: one print-mode
(`b1d76176`, 1 subagent, 1 call) and one interactive (`f6daddb0`, 2 subagents, the second
making 3 Bash calls across 4 API calls).

Raw probe capture (local only, not in git): `capture-3.jsonl`.
