---
id: surface-never-measured-against-its-host
type: lesson
status: active
date: 2026-09-14
summary: Three layout Criticals in three cycles — nav below the body, sections clipped, a pop-out unbounded — each past a green suite that only resolved locators.
features: []
tags: [ux, testing]
roles: [e2e-specs, web-impl, plan-work, review]
files: []
tests: []
refs: [plan:markdown-viewing, plans/markdown-viewing/review.cycle1.md, plans/markdown-viewing/review.cycle2.md, plans/markdown-viewing/review.cycle3.md, .claude/agents/e2e-specs.md, kb:lesson/tiles-never-refit-behind-pattern-match]
---
**What happened.** The reader shipped 32 authored E2E tests, all green, and three consecutive
review cycles each found a Critical the suite could not see, every one a box in the wrong place or
the wrong size. The nav rendered *below* the body instead of beside it and overflowed a tile by
25.5px, painting over the chrome under it. Bounding it then made `overflow: hidden` on the tree and
outline bite: `scrollHeight 294 / clientHeight 152`, with no scrollbar on either element or the
nav, so files and headings were rendered but unreachable. The pop-out host had no CSS rule at all,
so its grid resolved `1fr` against an indefinite height — 2559px of page in a 720px viewport, with
`article.md` never scrolling and scroll-spy and click-to-scroll both dead. Each was found by the
reviewer measuring in a browser; each spec involved asserted only that its locator resolved and its
text matched.

**Cost.** Three Opus review cycles, roughly 150 minutes, on a feature that rendered correctly in
every screenshot.

**What changed.** A surface that renders inside a host is measured against that host's box in every
host it has — `boundingBox()` for position and containment, `scrollHeight` vs `clientHeight` plus
computed `overflow` for reachability — because a locator that resolves proves only that the element
exists, not that it is where the design put it or that its content can be reached. A fixture sized
to fit is not evidence: the overflow cases need content that genuinely exceeds the box, and the
assertion should fail against the pre-fix build.
