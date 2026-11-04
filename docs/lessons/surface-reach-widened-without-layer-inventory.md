---
id: surface-reach-widened-without-layer-inventory
type: lesson
status: active
date: 2026-11-04
summary: A popped note panel allowed anywhere in the window covered the card menu, then the unpositioned daemon-down banner a z-index survey missed; two review cycles.
features: []
tags: [pipeline, ux]
roles: [planner, web-impl, review-browser]
files: []
tests: []
refs: [plan:popped-out-note-enhance, plans/popped-out-note-enhance/review.browser.cycle1.md, plans/popped-out-note-enhance/review.browser.cycle2.md, plans/popped-out-note-enhance/decisions/banner-above-popped-panel/decision.md]
---
**What happened.** REQ-5 let the popped note panel float anywhere in the window, over the rail, the
masthead and the Focus header, where it had been clamped into the main slot. The plan never listed
what already draws there. Review cycle 1 measured the card menu under the panel; its fix wave
surveyed every z-index layer, but the daemon-down banner was `z-index: auto` (unpositioned), so the
survey missed it and cycle 2 measured the banner's `musterd unreachable` hidden too.

**Cost.** A Major in two review cycles, a decision debate and part of a third cycle.

**Lesson.** When a plan lets a surface reach an area it could not reach before, the plan lists every
element already painted there, positioned or not, and says which draws on top; a z-index survey
misses unpositioned elements.
