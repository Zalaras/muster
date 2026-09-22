---
id: mockup-vindicates-markup-not-cascade
type: lesson
status: active
date: 2026-09-22
summary: Both cycle-1 Majors were cascade defects the mockup carried or hid and a geometry-only spec missed one; measure a CSS effect as its computed property in-app.
features: [rail]
tags: [ux, testing]
roles: [plan-work, web-impl, e2e-specs, review]
files: []
tests: []
refs: [plan:rail-card-improvements, plans/rail-card-improvements/review.cycle1.md, plans/rail-card-improvements/decisions/read-idle-title-colour/decision.md, kb:lesson/shared-class-css-hid-resume-button]
---
**What happened.** The plan named a mockup as design authority and the implementer matched its stylesheet line for line. Two of those lines were wrong in the app's cascade and right, or invisible, in the mockup's: `text-overflow: ellipsis` sat on an inline span inside a block row, so the compact title was clipped mid-word with no ellipsis, the same inert rule the mockup carried; and the read-idle title rose from the rail's inherited dim token to the muted token, because the mockup's stylesheet omitted the rail's ancestor colour rule, so its drop was real and the app's was inverted. The E2E test for the one-line title asserted bounding-box height and the `title` attribute, both of which clipping satisfies, and stayed green.

**Cost.** The whole second review cycle, about 49 minutes: a debate, a fix wave, a wave-3 test and a re-review, for two defects a computed-style read in the built app would have shown the implementer.

**What changed.** A mockup vindicates markup and layout, never the cascade. A CSS effect a requirement names is measured in the built app as the computed property that produces it: an ellipsis or clamp is `display` and `text-overflow` plus `scrollWidth > clientWidth`, a wrap is box height against one line, a token colour is `getComputedStyle` against the live variable on every surface that hosts the element. The implementer reads it before its log; the spec asserts it, never a proxy that passes without it.
