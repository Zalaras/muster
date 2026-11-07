---
id: weekly-usage-review
type: runbook
status: active
date: 2026-11-07
summary: Once a week, read what the subscription was spent on and act on anything over ten percent; after each run, paste the per-agent token table into the retro.
features: []
tags: [pipeline]
files: [.claude/skills/orchestrate/scripts/orch-state.py, scripts/sweep.py, .claude/settings.json]
tests: []
refs: [kb:adr/process-cost-knobs-cache-effort-usage-column, kb:fact/rate-limits-wire-shape, kb:fact/subagent-cache-ttl-5m]
---
The plan has a weekly cap shared by every surface and every subagent; nothing refuses to start
a run on its account (the developer's ruling: a threshold cannot know the work ahead), so the
only control is to look. Two readings, five minutes.

**Weekly, in any session.** Run `/usage`. It attributes the recent period by skill, subagent
type, plugin and loop and flags anything over ten percent with a one-line fix. Act on the flagged
rows: a reviewer type at the top means its pack or its cycle count; cache misses at the top mean
a step that ran longer than the subagent cache (one hour, `subagentPromptCacheTtl` in
`.claude/settings.json`) or a prefix that changed mid-run; long-context at the top means an
agent that should have been split. Note what changed in the retro of the next run.

**After each run.** `python3 .claude/skills/orchestrate/scripts/orch-state.py <plan> timings`
carries a Δweekly % column per step, read from the daemon's latest `usage_sample` row at each
step boundary (the main session reads the daemon's `muster.db` under `~/Library/Application
Support/Muster/` through `sqlite3 -readonly`; `MUSTER_DB` overrides the path). The column is
whole percent, so a short step shows `+0`; the run total is the number to compare across runs.
For per-agent tokens, `npx ccusage@latest session --json --by-agent` over the run's session, and
paste the table beside the timings in the completion summary; `/retro` reads both.

**When a batch stalls on a limit.** `scripts/sweep.py` sets `CLAUDE_CODE_RETRY_WATCHDOG=1` with
a two-hour ceiling on waiting for a usage-limit reset: a near reset is waited out, a far one fails
the batch with the reason in its log, and `scripts/sweep.py resume` re-runs it after the reset.
