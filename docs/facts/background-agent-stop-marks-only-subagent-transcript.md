---
id: background-agent-stop-marks-only-subagent-transcript
type: fact
status: active
date: 2026-11-19
summary: Agent subagents always background; stopping one writes the interrupt line only into its subagents/ file, then re-invokes main with UserPromptSubmit and Stop.
features: [lifecycle]
tags: [claude-code-format, state-machine]
files: [internal/claudecode/interpret_transcript.go, internal/session/interrupt.go]
tests: []
refs: [kb:fact/agent-tool-async-by-default, kb:fact/background-completion-new-prompt-id, kb:fact/interrupt-recorded-in-transcript, "#127"]
verified: 2.1.328..2.1.328
guard: none
---
Asked three times for a foreground subagent ("run_in_background false", "wait for it"), haiku
called `Agent` with no `run_in_background` key each time. The TUI showed "Backgrounded agent".
The main turn's `Stop` fired about 1 s after `PostToolUse{Agent}`, while the TUI still read
"Waiting for 1 background agent to finish" (3 of 3).

With the subagent inside a foreground `Bash` call to a 30 s script:

- **Esc in the main prompt** does not stop it. The script ran to completion, and the agent's
  finish re-invoked the main agent under a fresh `prompt_id` (`UserPromptSubmit` with a
  `<task-notification>` prompt, then `Stop`) (1 of 1).
- **Stopping it from the agent view** (`↓`, select the agent, Enter, then Esc to stop) writes a
  `tool_result` with `is_error: true` and a `user` line `[Request interrupted by user for tool
  use]` with `isSidechain: true` and the parent's `promptId`. These go **only** into
  `<session>/subagents/agent-<id>.jsonl`, never the main transcript. No hook fires for the stop
  itself. The main agent is then re-invoked: `UserPromptSubmit` (task-notification, fresh
  `prompt_id`), "Agent stopped by user.", `Stop` (1 of 1).

Consequence for Muster: the main transcript never shows a subagent's interrupt, but none is
missed. The re-invocation's `UserPromptSubmit` and `Stop` close the turn through hooks, and the
interrupt sweep is not needed.

Evidence: interface probe 2026-11-19, instance 5, 1 interactive haiku session `5dd769da`.

Raw probe capture (local only, not in git): `capture-5.jsonl`.
