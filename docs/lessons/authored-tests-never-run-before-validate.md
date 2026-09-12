---
id: authored-tests-never-run-before-validate
type: lesson
status: active
date: 2026-09-03
summary: Seven of eleven pins were never run and one hid a locator defect; eight of ten rename specs failed at validate on a bug nobody ran them against.
features: []
tags: [testing, pipeline]
roles: [e2e-specs, web-impl, daemon-impl, orchestrator]
files: []
tests: []
refs: [plan:terminal-focus, plan:ui-text-and-focus, .claude/agents/e2e-specs.md, .claude/agents/web-impl.md, .claude/skills/orchestrate/SKILL.md]
---
**What happened.** In one run seven of eleven authored specs pinned existing behaviour and none was run at authoring; one hid a locator defect, `toHaveText("Pin")` on an icon-only `aria-pressed` button, until validate. In another, eight of ten rename specs failed at validate on a bug the implementer could have found with one run.

**Cost.** A validate cycle each, for defects that were one command away.

**What changed.** Regression pins run green at authoring with the summary line pasted; each Tests row is `ran-green-at-authoring` or `collection-only`, and all collection-only on a plan with unchanged-behaviour REQs sends the agent back once. Implementers smoke-run the plan's specs before writing their log and name mismatches in Handoff, never as a verdict. A locator follows the shape an existing assertion already encodes, since icon-only buttons have no text.
