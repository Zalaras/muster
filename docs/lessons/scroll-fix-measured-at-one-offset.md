---
id: scroll-fix-measured-at-one-offset
type: lesson
status: active
date: 2026-10-17
summary: Two scroll fixes in a row were proved at the reviewer's mid-document offset only; each regressed at an end of the range and cost a review cycle.
features: [reader-find]
tags: [testing, pipeline]
roles: [web-impl, e2e-specs, review-browser]
files: []
tests: []
refs: [plan:docs-search-bar, plans/docs-search-bar/review.cycle2.md, plans/docs-search-bar/review.cycle3.md]
---
**What happened.** Review cycle 1 found the open find bar covering the first line; the fix
reserved its space with padding, and cycle 2 found the text jumping when the bar opened mid-scroll.
That fix compensated `scrollTop` after the bar's flip; cycle 3 found it double-counting at the end
of the body, where Chrome had already clamped `scrollTop` to the smaller range. Each fix was proved
by re-running the reviewer's repro at its one mid-document offset, and the new tests used the same
offset.

**Cost.** Review cycles 3 and 4 with their fix waves, about 97 minutes, and a cycle beyond the
budget the developer had to grant.

**The lesson.** A fix that writes `scrollTop` or changes a scroll container's size is measured at
scrollTop 0, mid-range and the maximum, because the browser clamps at both ends.
