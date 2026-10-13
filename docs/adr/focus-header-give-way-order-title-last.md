---
id: focus-header-give-way-order-title-last
type: decision
status: accepted
date: 2026-10-13
summary: The Focus header gives way in order — ↳ block hides, switch and actions drop to row two, readout ellipsizes to its floor, title shortens last.
features: [focus]
tags: [ux, user-decision]
files: [web/src/style.css, web/src/render/mainhead.ts, web/src/features/focus.ts]
tests: []
refs: [plan:title-crop-stop-resume-button, kb:adr/focus-header-readout-sized-by-text, kb:adr/focus-mainhead-title-keeps-a-floor, kb:adr/focus-model-never-truncates-name-blocks-give-way]
supersedes: [focus-mainhead-wraps-to-second-row-when-narrow, focus-repo-block-keeps-floor-beside-group-control, focus-mainhead-title-keeps-a-floor, focus-group-control-stays-while-title-shortens]
---
**Context.** The superseded records let the readout shrink to its 8-character floor before the title lost a pixel, and wrapped the action buttons to a second row while the surface switch stayed on the first. Measured on `main` (2026-10-13, Chromium): at a 700 px header a 35-character folder showed 147 of 251 px while row two held only the buttons — room wasted.

**Options.** (A) Keep the order: readout first, title last among the text, buttons wrap alone. (B) Readout and title swap: the title shortens before the readout. (C) A fixed order in which the controls leave the row before any text is cut, the readout gives way next, and the title last.

**Decision.** C (the developer, 2026-10-13: "I still need to keep the title at a decent length so no you can't change the title"). As the header narrows: the `↳` block hides whole; then the surface switch and the action buttons move onto a second row together; then the folder and branch lines ellipsize, never below the 8-character floor; then the title shortens, never below its 6rem floor. A later step never starts while an earlier one has room to give; widening reverses the order. The model never truncates and the repo block never hides, as before. Where the title floor, readout floor and model no longer fit side by side, the model, with a dead session's ended clause under it, stacks under the readout; title and readout stay side by side. The 6rem floor of kb:adr/focus-mainhead-title-keeps-a-floor stands; its "title shrinks first" half is replaced, as is the title-first order of kb:adr/focus-group-control-stays-while-title-shortens; the control still hides whole below 640 px.

**Consequences.** A long title is cut only once the readout is at its floor. The two-row header appears at a wider window than before.
