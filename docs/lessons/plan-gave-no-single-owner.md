---
id: plan-gave-no-single-owner
type: lesson
status: active
date: 2026-08-29
summary: SPEC.md under the Daemon track got edited by daemon-impl; a REQ with no owner was nobody's; a config change sat in an E2E subsection. One owner per file.
features: []
tags: [pipeline]
roles: [plan-work, orchestrator, daemon-impl]
files: []
tests: []
refs: [plan:m4-hook-lifetime, plan:post-worktree-spike-issues, plan:m0-skeleton, .claude/skills/plan-work/SKILL.md, .claude/skills/orchestrate/SKILL.md]
---
**What happened.** Three ownership gaps in plans. `SPEC.md` and `TODO.md` were listed under the Daemon track, so the daemon implementer edited both, which the review rules forbid. A requirement whose file had no owner in Affected Files was nobody's until the orchestrator noticed at completion. A test-config change sat in an E2E subsection, where the agent judged by the suite would have held the knobs that define passing.

**Cost.** A forbidden edit to unwind, a requirement found late, and an ambiguity resolved by argument.

**What changed.** `SPEC.md` and `TODO.md` are never under an impl track; required upkeep goes under Implementation Notes → Doc upkeep, addressed to the orchestrator. A requirement whose file has no owner is the orchestrator's. A config change lists under the owning impl track explicitly, never in an E2E subsection.
