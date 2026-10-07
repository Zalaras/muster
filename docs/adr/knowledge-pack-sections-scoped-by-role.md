---
id: knowledge-pack-sections-scoped-by-role
type: decision
status: accepted
date: 2026-10-06
summary: A pack carries only the sections its role acts on (decisions, facts, design docs, conventions per role); the role list is checked against the agent files.
features: [knowledge]
tags: [pipeline]
files: [kb.yaml, .claude/agents/daemon-impl.md, .claude/agents/web-impl.md, .claude/agents/daemon-tests.md, .claude/agents/web-tests.md, .claude/agents/review-browser.md]
tests: []
refs: [kb:adr/process-size-linters-warn-never-fail]
---
**Context.** Packs measured 26k–47k words against a 20k budget on ordinary plans and 58k–60k on
a fourteen-feature one. Every role got the same accepted decisions (12.7k words on a
three-feature plan) and facts (7.4k) whether or not it acts on them, and five agent files sent
their reader to `docs/conventions.md` for sections "not in your pack", so the pack figure
understated the real cost. The role list had been typed from pipeline step names, and a lesson
tagged with a step nobody packs as (`plan-work`, `e2e-validate`) reached no agent.

**Options.** (A) Raise the budget. (B) Cut the lowest-value section first past the budget.
(C) Scope each section to the roles that act on it, pack what agent files sent readers to
fetch by hand, and tie the role list to the agent directory by test.

**Decision.** C. Accepted decisions are packed for the roles that build or judge against them
(impl agents, e2e-specs as a safety net, review, planner, orchestrator); facts for the roles that
code against the wire (daemon-impl, daemon-tests, e2e-specs, review, planner, orchestrator);
`docs/design/*` for the web roles (web-impl whole, review-browser §6 and §7); each role's
conventions slice is the full set it reads. A packed decision renders its Decision paragraph
alone, the rest one `kb show` away. A dropped section leaves a one-line pointer. `Roles` holds
agent names plus the session roles, `review` aliasing review-work, and a test fails when the
list and `.claude/agents/` drift.

**Consequences.** Test, browser-review and doc-reconcile packs roughly halve. The budget stays a
warning (kb:adr/process-size-linters-warn-never-fail), re-based on the scoped packs. An agent
needing a dropped section runs the pointer's command. A new pipeline agent must be given a role.
