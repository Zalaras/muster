---
id: process-features-header-widens-for-forced-fixture-repairs
type: decision
status: accepted
date: 2026-10-05
summary: A plan's Features header widens, by developer decision, to a feature whose only change is a test fixture the protocol delta forces; its spec does not change.
features: []
tags: [pipeline, user-decision]
files: [kb.yaml, plans/groups/plan.md]
tests: []
refs: [plan:groups, plans/groups/decisions/features-header-widened/decision.md, kb:lesson/plan-gave-no-single-owner]
supersedes: []
---
**Context.** The groups plan added two required keys to the snapshot. Two test files outside its Features header build that snapshot literally — the update feature's restart test and the surfaces feature's shell spec — so they could not compile or pass unrepaired, and the features-scope gate refuses a change to a file whose feature the header does not name.

**Options.** (A) Leave the header; the files stay untouched, leaving a compile failure and a red spec for the developer to fix by hand. (B) Widen the header to both features for this plan, letting the mechanical repairs land; the widened pack reaches later agents.

**Decision.** B (the developer, 2026-10-05). A protocol delta that changes a shared wire shape owns the fixture repairs it forces, wherever they sit.

**Consequences.** `plan.md` carries the amended header with an inline note; no spec sentence of `update` or `surfaces` changes, and doc-reconcile has nothing to promote there. A planner who changes a shared shape should list the features whose fixtures build it at approval, so the widening is not a mid-run question.
