---
id: tiles-never-refit-behind-pattern-match
type: lesson
status: active
date: 2026-08-23
summary: No tile ever sent a resize frame while footers pattern-matched geometry and passed; five Criticals lived in the second view the plan's source states omitted.
features: [tiles, surfaces]
tags: [ux, testing, tmux]
roles: [e2e-specs, web-impl, plan-work, orchestrator]
files: []
tests: []
refs: [plan:m2-terminal, plans/m2-terminal/review.cycle-1.md, .claude/agents/e2e-specs.md, .claude/skills/orchestrate/SKILL.md]
---
**What happened.** The tiles view built every terminal into a detached fragment and called fit before attaching it; fit on a zero-size container is a no-op, so no tile ever sent a resize frame. Footers pattern-matched `/\d+×\d+/` and passed on stale geometry, 119×34 shown inside a 597×311 tile. Tiles also lost keyboard focus within a second of the render tick. Five Criticals lived in states the plan's source-state lists omitted, interaction inside the second view, and one requirement contradicted its own acceptance criteria and was amended mid-run.

**Cost.** A review cycle with five Criticals, on a view that rendered correctly and worked nowhere.

**What changed.** A displayed value with an independent oracle is cross-checked against tmux or the API, both sides re-read inside the retry so a stale display times out. A live interactive surface gets an input round-trip in every view that hosts it, spanning a render tick. Plans name each hosting view as a source state for the invariants. A non-protocol requirement is amended mid-run only against a measured defect.
