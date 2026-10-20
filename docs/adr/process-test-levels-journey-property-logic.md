---
id: process-test-levels-journey-property-logic
type: decision
status: accepted
date: 2026-10-20
summary: A test lives at the cheapest level that can falsify its claim — journeys E2E, display properties render tests without a daemon, logic unit tests.
features: []
tags: [testing, pipeline, user-decision]
files: [web/e2e/**, web/render/**, .claude/agents/e2e-specs.md, .claude/agents/render-tests.md, .claude/agents/web-tests.md, .claude/skills/plan-work/SKILL.md, .claude/skills/orchestrate/scripts/plan-lint.sh, web/scripts/e2e-lint.sh]
tests: []
refs: [kb:adr/process-web-unit-tests-vitest, kb:adr/process-render-fixtures-generated-from-daemon, kb:adr/process-e2e-gates-scoped-full-sweep-once-at-completion, kb:lesson/dom-behaviour-gap-between-test-agents, kb:lesson/layout-invariant-needs-its-width-range, kb:lesson/surface-never-measured-against-its-host, plans/_audit/test-audit-2026-10-19.md]
supersedes: [process-testing-bar-e2e-always-unit-for-logic]
---
**Context.** The superseded bar said "functional E2E always", and the E2E agent gave every
must-have requirement an E2E test. The 2026-10-19 audit measured the result: the median test is
1.34 s, the floor for a daemon, a browser page and a launch; 743 of 1,001 tests sit under 2 s and
are almost all floor. Their titles are correct requirements at the wrong level — tokens, density
layout, chords, find-bar logic, width sweeps — none needing a daemon to falsify.

**Options.** (A) Keep the bar, share daemons. (B) Levels by what falsifies the claim, with a
daemon-less render tier for display properties. (C) Display properties in Vitest with a DOM shim.

**Decision.** B. A requirement is a journey (what the developer does and then sees across the live
seam: launch, hooks changing a card, resume, restart, kill), a property (what is true of the
display for a given state) or logic. Journeys are `E*` criteria and E2E specs; properties
are `R*` criteria and render tests — the built bundle in Chromium fed a fixture recorded from the
daemon (kb:adr/process-render-fixtures-generated-from-daemon); logic is `W*`/`D*` and unit tests.
The planner states the level per criterion; e2e-lint refuses a new E2E test that never touches the
daemon; plan-lint requires a render section where `R*` exists and warns when E2E outnumbers the
rest. C fails: layout needs a layout engine. The scoped-gates remark that mocking hides the seam
stands: the render tier replays a recorded seam, journeys cross the live one.

**Consequences.** A `render-tests` role runs beside web-tests after web-impl and in fix wave 2;
e2e-specs keeps authoring, validate and wave 3 for journeys. Existing specs stay put;
`e2e-lint --census` names candidates for a separate audit. The Vitest decision's "DOM and a
daemon → E2E" still holds; DOM without a daemon is now render.
