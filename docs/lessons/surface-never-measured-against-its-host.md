---
id: surface-never-measured-against-its-host
type: lesson
status: active
date: 2026-09-14
summary: Three layout Criticals in three cycles — nav below the body, sections clipped, a pop-out unbounded — each past a green suite that only resolved locators.
features: []
tags: [ux, testing]
roles: [e2e-specs, web-impl, plan-work, review, review-browser]
files: []
tests: []
refs: [plan:markdown-viewing, plans/markdown-viewing/review.cycle1.md, plans/markdown-viewing/review.cycle2.md, plans/markdown-viewing/review.cycle3.md, .claude/agents/e2e-specs.md, kb:lesson/tiles-never-refit-behind-pattern-match]
---

**What happened.** The reader shipped 32 green E2E tests, and three consecutive review cycles each found a layout Critical the suite could not see: the nav rendered below the body and overflowed its tile by 25.5px; bounding it made `overflow: hidden` clip the tree (`scrollHeight 294 / clientHeight 152`, no scrollbar); the pop-out host had no CSS rule, so its grid resolved `1fr` against an indefinite height and the article never scrolled. Every spec involved asserted only that its locator resolved and its text matched.

**Cost.** Three Opus review cycles, roughly 150 minutes, on a feature that looked right in every screenshot.

**What changed.** A surface inside a host is measured against the host's box in every host it has: `boundingBox()` for position and containment, `scrollHeight` vs `clientHeight` plus computed `overflow` for reachability. A resolving locator proves existence, not placement. Overflow cases need content that genuinely exceeds the box and an assertion that fails on the pre-fix build.
