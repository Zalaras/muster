---
id: process-cost-knobs-cache-effort-usage-column
type: decision
status: accepted
date: 2026-11-07
summary: One-hour subagent cache, effort per role, batches wait out a near reset, a weekly-usage delta per step; no Haiku pin for exploration, no usage threshold.
features: []
tags: [pipeline, user-decision]
files: [.claude/settings.json, scripts/sweep.py, .claude/skills/orchestrate/scripts/orch-state.py, docs/runbooks/weekly-usage-review.md, .claude/agents/daemon-impl.md, .claude/agents/web-impl.md, .claude/agents/daemon-tests.md, .claude/agents/doc-reconcile.md]
tests: []
refs: [kb:fact/subagent-cache-ttl-5m, kb:fact/print-mode-background-wait-ceiling, kb:fact/rate-limits-wire-shape, plans/_audit/exploration-probe-2026-11-07/README.md, plans/_audit/agentic-practice-improvements.md]
---
**Context.** Subagents ran on the five-minute cache while test agents held five-to-seven-minute
gates, so each gate cost a full prefix re-write; effort was chosen when changing it broke the
cache; runs recorded wall-clock only. The developer is on a Team plan with a weekly cap. The
field review found the cache TTL for subagents settable to an hour since Claude Code 2.1.242,
effort cache-safe on the 5.5 models, and a retry watchdog for unattended runs.

**Options.** (A) Leave cost to the models' defaults. (B) Set the knobs that cost nothing and
record usage per step. (C) Also pin exploration to Haiku and refuse runs above a usage threshold.

**Decision.** B. `subagentPromptCacheTtl: "1h"` in project settings; effort `high` for the
reviewers, judges and the E2E oracle, `medium` for the implementers and the daemon tester, `low`
for doc-reconcile and the proposers; `scripts/sweep.py` sets `CLAUDE_CODE_RETRY_WATCHDOG=1` with
a two-hour ceiling on waiting for a reset; `orch-state.py` reads the daemon's latest
`usage_sample` at every step start and finish and `timings` prints the Δweekly column. C was
ruled out by the developer: a threshold cannot know the work ahead, and exploration quality is
the asymmetric risk. A probe of ten reuse-before-add cases (three passes) found Haiku at least as
accurate as Opus on targeted lookups at about thirty times lower list cost; it measured nothing
about open-ended exploration, so the pin stays out until it does.

**Consequences.** One prefix write saved per gate per agent; effort differences are measurable
in the usage column rather than argued; a batch that hits a limit waits or fails with the reason.
Staggering parallel spawns to avoid a cold-prefix race was not mechanised: the main session
cannot observe a subagent's first response, so both still start in one message.
