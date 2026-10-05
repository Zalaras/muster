---
id: process-plan-fixes-boundaries-not-shape
type: decision
status: accepted
date: 2026-10-05
summary: A plan fixes only what crosses an agent boundary; Affected Files is the planner's impact read, and code shape is the implementer's.
features: []
tags: [pipeline, user-decision]
files: [.claude/skills/plan-work/SKILL.md, .claude/skills/orchestrate/scripts/plan-lint.sh]
tests: []
refs: [kb:lesson/plan-placement-never-overrides-directory-rule, kb:lesson/conditional-test-routing-resolves-to-nobody, kb:lesson/test-pinned-signature-bent-the-design, docs/conventions.md]
supersedes: []
---
**Context.** `docs/conventions.md` § Design says a plan states *what* and the shape is the
implementer's, but plans had grown to pin function signatures, struct fields, new file names,
helper reuse, test seams and buffer sizes under Affected Files. Implementers complied, so the
maintainability reviewer judged the planner's design rather than theirs, and one plan-required seam
and placement cost two fix waves (kb:lesson/plan-placement-never-overrides-directory-rule). No
record backed the detail: plan-work's "expose a pure function" sentence came from a test-ownership
lesson, whose need is one owning test agent, not a named function.

**Decision.** A plan fixes the protocol, the schema, Testable UI names and the DOM tests and the
design system rely on, invariants, and ADR'd decisions. Affected Files lists existing files by
exact path and new code by the feature glob it falls under, each with the REQs it carries and the
behaviour that changes, plus the existing tests the change breaks; it is an impact read, not a
fence. What the planner learned that may save time is an Implementation Notes hint, non-binding.
When unit-testability is unknown, the plan routes the test to the unit agent and the implementer
chooses the seam.

**Consequences.** plan-lint's ownership check (check 12) still resolves every line, since a feature
glob resolves through `kb for`; a bare directory would not, so plans never use one. A new warn-only
check flags a signature under Affected Files. Harness, config and negative-grep-hit files stay
named exactly, because they already exist and the orchestrator and e2e-specs look for them. Test
agents already find seams from the impl log and code, after implementation.
