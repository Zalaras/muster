---
id: plan-placement-never-overrides-directory-rule
type: lesson
status: active
date: 2026-09-23
summary: A plan put pure logic in features/ against that directory's CLAUDE.md and required a seam that decided nothing; the impl followed it, costing a fix wave.
features: []
tags: [pipeline]
roles: [plan-work, web-impl, daemon-impl]
files: []
tests: []
refs: [plan:new-session-improvement, plans/new-session-improvement/review.maintainability.cycle1.md]
---

**What happened.** The new-session-improvement plan put a pure restore module in `web/src/features/`, whose `CLAUDE.md` says pure logic lives in `sessions/` or `terminal/`, and required a pure `openFallback(outcome)` seam so a unit test could pin it. web-impl built both as planned, its `design:` line saying the plan had named the location. Review found the module in the controllers directory (Major) and the seam a 1:1 relabel of `NavigateOutcome` whose caller branched exactly as it would on the outcome itself (Minor).

**Cost.** Two fix waves, an amended criterion, and a new E2E test for the path the deleted seam had been the only check on.

**The lesson.** A plan's Affected Files placement is a suggestion under the directory's own CLAUDE.md; an impl agent that finds them in conflict follows the directory and records the grep. A seam a plan requires for testing must decide something its caller could not write as the same branch.
