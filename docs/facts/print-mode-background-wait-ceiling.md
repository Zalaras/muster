---
id: print-mode-background-wait-ceiling
type: fact
status: active
date: 2026-10-23
summary: After a claude -p main turn ends, background subagents are killed after 10 min of idle wait unless CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS raises it.
features: []
tags: [claude-code-format, pipeline]
files: [scripts/sweep.py]
tests: []
refs: [kb:adr/process-fix-sweep-fresh-process-per-batch, kb:fact/print-mode-spawns-subagents-and-fires-subagent-stop]
verified: 2.1.308..2.1.308
guard: none
---
Measured twice in the `bugs-one-batch` sweep's batch log (stream-json, `task_updated` end times):
the batch's main turn ended waiting on one background subagent, and that subagent was `killed`
10:07 later (20:58:27 → 21:08:34, a daemon-impl) and 10:02 later (21:54:44 → 22:04:46, a
review-browser). Each time the process then exited 0 with result subtype `success` and no further
turn. Idle gaps under 10 min (a 20 min background gate run whose main turn idled about 9.5 min)
survived, and each handled notification restarted the wait.

Claude Code's headless docs name the control: `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS`, default
600000, `0` waits indefinitely, v2.1.182+. No CLI flag sets it. A child process launched with every
`CLAUDE*` variable stripped gets the default, so `scripts/sweep.py` sets it after the strip.

Not measured: the raised ceiling holding past 10 min (the next batch run is the first evidence), and
whether `CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS` (same 10 min default, for a subagent that stops
producing output) can kill an active agent.
