---
id: invariant-missed-by-per-transition-tests
type: lesson
status: active
date: 2026-08-22
summary: 157 passing per-transition tests missed both Criticals: stated invariants broken from a source state no test started in. Invariants are named and crossed.
features: [lifecycle]
tags: [state-machine, testing]
roles: [daemon-tests, plan-work, review]
files: []
tests: []
refs: [plan:m1-sessions, plan:claude-status-fixes, .claude/agents/daemon-tests.md, .claude/skills/plan-work/SKILL.md]
---

**What happened.** The protocol stated two invariants: attention non-null iff needs_input, failure non-null iff failed. 157 per-transition tests passed, each starting from the convenient state. Both review Criticals were those invariants broken from a state no test started in: a re-bind from needs_input or failed forced the state to started and left the fields set. In a later plan a path described as unchanged was reached by a named invariant and cost a fix wave.

**Cost.** Two Criticals and a review cycle, on a machine with a high test count and no invariant coverage.

**What changed.** A plan lists every always, never and iff as a named invariant and walks each state-changing path against them before approval. The tester asserts invariants from every reachable source state, crossing each input against each starting state; a transition test that always starts from the convenient state proves nothing about the invariant.
