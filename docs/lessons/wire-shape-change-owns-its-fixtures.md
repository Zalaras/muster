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

**What changed.** Unit tests no longer build a shared wire shape literally: each gets one from a factory (`web/src/sessions/testfixtures.ts`, `web/src/protocol/testfixtures.ts`, `web/src/api/testfixtures.ts`), and `web/scripts/shape-lint.mjs`, run by `make web-lint`, fails a test that spells one out. A new required key there touches the factory and the decoder tests' one raw copy, `web/src/protocol/wirefixtures.ts`, both in the feature that owns the shape.

What a plan still owns at planning is the two E2E assertions that state the daemon's whole answer, kept literal on purpose. `web/e2e/shell.spec.ts` (feature surfaces) asserts the whole empty-daemon `/api/state` snapshot, so a new snapshot, usage, prefs or update key edits it. `web/e2e/views.spec.ts` (feature views) asserts the whole prefs object, so a new prefs key edits it. A new Session key touches neither. When the Protocol Contract adds such a key, list that feature in the header; plan-lint check 12 also reads paths named outside Affected Files.
