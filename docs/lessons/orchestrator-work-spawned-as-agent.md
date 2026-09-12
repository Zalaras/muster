---
id: orchestrator-work-spawned-as-agent
type: lesson
status: active
date: 2026-09-07
summary: Both harness-only runs spawned a validate agent with nothing to validate, one costing 244 minutes; a doc-only issue fixed beside a wave saved a wave.
features: []
tags: [pipeline]
roles: [orchestrator]
files: []
tests: []
refs: [plan:v1-cleanup, plan:m4-hook-quoting, plan:new-session-dialog, plan:fix-auto-mode-select, .claude/skills/orchestrate/SKILL.md, .claude/skills/plan-work/SKILL.md]
---
**What happened.** Both harness-only runs, plans with a helper or fixture edit and no new specs, spawned a validate agent that had nothing to validate; one lost 244 minutes to it. The converse also happened: a doc-only `[orchestrator]` issue was fixed while a fix wave ran and saved a whole wave, and a wording Minor was made in the orchestrator's own commit and verified by the delta re-review.

**Cost.** Four hours in one run; spawning is not free and an agent with no task invents one.

**What changed.** On a harness-only plan the orchestrator runs `make e2e` itself, reads the plan's criteria against the diff and records the step. `[orchestrator]` issues are never spawned to an agent; a doc-only one may be fixed beside a running wave iff its file set is disjoint from every file the wave may write, in the orchestrator's own docs commit, cited in the completion summary.
