---
id: plan-asserted-surface-nobody-defined
type: lesson
status: active
date: 2026-08-23
summary: An E criterion asserted a card readout no plan section defined; a composed text pattern carried a middot the mockup never had. Guessed markup, false pattern.
features: [usage]
tags: [pipeline, ux]
roles: [plan-work, e2e-specs]
files: []
tests: []
refs: [plan:m3-gauges, .claude/skills/plan-work/SKILL.md]
---
**What happened.** An acceptance criterion asserted a card readout that no Requirement, UI Specification or Testable UI Elements row defined, so the E2E agent had to guess the markup. A Text Pattern composed for the same plan contained a ` · ` middot the mockup never had; the implementation followed the mockup, and the pattern survived as a false reference.

**Cost.** Guessed selectors and a spec asserting a separator that never rendered.

**What changed.** Every UI element a criterion asserts is defined somewhere in the plan and cross-checked before approval; a criterion tests the plan's surface and never introduces new surface. Patterns are derived from the mockup's actual markup, separators and element boundaries included, remembering that `textContent` concatenates sibling elements with no whitespace.
