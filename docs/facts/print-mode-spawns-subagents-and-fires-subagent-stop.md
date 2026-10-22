---
id: print-mode-spawns-subagents-and-fires-subagent-stop
type: fact
status: active
date: 2026-10-22
summary: A claude -p process spawns subagents through the Agent tool, and the project's SubagentStop hook fires with agent_type and cwd as it does interactively.
features: []
tags: [claude-code-format, pipeline]
files: [scripts/sweep.py, .claude/skills/orchestrate/scripts/subagent-stop-hook.sh]
tests: []
refs: [kb:adr/process-fix-sweep-fresh-process-per-batch, kb:fact/print-mode-untrusted-workspace-loads-skills-but-not-allow-list, kb:fact/hook-payload-fields]
verified: 2.1.308..2.1.308
guard: none
---
Measured in a scratch `git init` repo whose project `.claude/settings.json` registered a
`SubagentStop` command hook appending its stdin to a file, launched **from inside a running
Claude Code session's Bash tool** with every `CLAUDE*` and `MUSTER_SESSION` variable removed from
the environment (the sweep loop's `child_env`):

```
claude -p "… 3. Use the Agent tool with subagent_type general-purpose and the prompt: Reply with
the single word pong …" --model claude-haiku-4-5-20251001 --output-format json
--permission-mode acceptEdits --allowedTools "Bash,Agent"
```

- Exit 0; the nested launch was not refused. The result reported the subagent's reply `pong`.
- The hook file received one payload: `hook_event_name: SubagentStop`, `agent_type:
  general-purpose`, `agent_id`, `stop_hook_active: false`, and `cwd` = the scratch repo — the
  keys `subagent-stop-hook.sh` reads to pick the role and the tree.
- One turn, 16 s wall clock, `total_cost_usd` 0.064 on Haiku 4.5.

Not measured: a hook exit 2 blocking the subagent's finish in print mode (the interactive
behaviour is in the hook script's header comment, 2.1.282).
