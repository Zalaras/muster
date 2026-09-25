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

**What happened.** The plan named a mockup as design authority and the implementer copied its stylesheet line for line. Two lines were wrong in the app's cascade and right, or invisible, in the mockup's: `text-overflow: ellipsis` on an inline span inside a block row clipped the compact title mid-word with no ellipsis, and the read-idle title colour inverted because the mockup omitted the rail's ancestor colour rule. The E2E test asserted bounding-box height and the `title` attribute, both satisfied by clipping.

**Cost.** The whole second review cycle, about 49 minutes, for two defects a computed-style read in the built app would have shown.

**What changed.** A mockup vindicates markup and layout, never the cascade. A CSS effect a requirement names is measured in the built app as the computed property that produces it: an ellipsis is `text-overflow` plus `scrollWidth > clientWidth`, a wrap is box height against one line, a token colour is `getComputedStyle` on every hosting surface. The spec asserts it, never a proxy that passes without it.
