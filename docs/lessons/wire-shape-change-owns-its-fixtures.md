---
id: wire-shape-change-owns-its-fixtures
type: lesson
status: active
date: 2026-10-05
summary: A required key added to the snapshot forced fixture repairs in two features outside the plan's header; the gate refused them until the developer widened it.
features: []
tags: [pipeline]
roles: [planner, orchestrator]
files: []
tests: []
refs: [plan:groups, plans/groups/decisions/features-header-widened/decision.md, kb:adr/process-features-header-widens-for-forced-fixture-repairs]
---

**What happened.** The groups plan added `groups` and `ungrouped` as required snapshot keys. The update feature's restart test and the surfaces feature's shell spec build that snapshot literally, so neither compiled or passed unrepaired, and the features-scope gate refused the repairs because neither feature was in the header.

**Cost.** A stop to the developer mid-run and a decision record, for two mechanical two-line fixture edits the planner could have foreseen.

**What changed.** A Protocol Contract that adds a required key to a shared shape (the snapshot, the Session object) owns every test fixture that builds that shape literally. At planning, grep `web/src/**/*.test.ts` and `web/e2e/**` for `toEqual(` on that endpoint and for literals of the shape, and list those files' features in the header; plan-lint check 12 now also reads paths named outside Affected Files.
