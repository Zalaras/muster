---
id: conditional-test-routing-resolves-to-nobody
type: lesson
status: active
date: 2026-09-03
summary: 'A unit test if unit-testable, otherwise E4 covers it' routed a Should-Have to nobody; it shipped with zero coverage and 'not mine' cost a review cycle.
features: []
tags: [pipeline, testing]
roles: [plan-work, daemon-tests, web-tests]
files: []
tests: []
refs: [plan:fix-auto-mode-select, .claude/skills/plan-work/SKILL.md, .claude/agents/daemon-tests.md, .claude/agents/web-tests.md]
---
**What happened.** A plan routed a Should-Have's coverage conditionally: a unit test if the logic was unit-testable, otherwise an E2E criterion. The unit agent read it as the E2E agent's; the criterion never covered that case. The requirement shipped with zero coverage until review, and the tester's answer, that it was not theirs, cost the cycle.

**Cost.** A review cycle and an untested Should-Have.

**What changed.** Every requirement names exactly one owning test agent. If unit-testability is unknown at planning, the plan requires the implementer to expose a pure function and routes the test to the unit agent. A tester who finds no covering test owns the item or reports implementation-bug; "not mine" is never a verdict.
