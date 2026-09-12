---
id: pid-file-captures-subshell
type: lesson
status: active
date: 2026-08-16
summary: A PID file from $! after a backgrounded cd && nohup chain holds the subshell's PID; a later kill misses or hits a recycled PID. Use pgrep -f.
features: []
tags: [testing]
roles: [daemon-tests, e2e-validate, orchestrator]
files: []
tests: []
refs: [docs/history/spikes/canary-fields.md, .claude/skills/interface-probe/SKILL.md, .claude/skills/orchestrate/scripts/orch-cleanup.sh]
---
**What happened.** Spike processes were tracked with a PID file written via `echo $!` after a backgrounded `cd && … && nohup claude …` chain. `$!` is the subshell's PID, and the subshell exits at once, so the file never pointed at the claude process.

**Cost.** A later `kill` hit nothing, or could hit a recycled PID belonging to something else, while the real session kept running and burning subscription.

**What changed.** Processes are found by `pgrep -f` on the exact command line, never by a PID file written around a chain; the orchestrator's cleanup script sweeps orphaned claude and tmux processes the same way.
