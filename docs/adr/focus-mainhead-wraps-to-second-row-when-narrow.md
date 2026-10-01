---
id: focus-mainhead-wraps-to-second-row-when-narrow
type: decision
status: accepted
date: 2026-10-01
summary: The Focus mainhead wraps to a second row as soon as the repo block would drop below its floor, so the model, actions and repo readout all stay whole.
features: [focus]
tags: [ux, user-decision]
files: [web/src/style.css, web/src/render/mainhead.ts, web/src/features/focus.ts]
tests: []
refs: [plan:stale-dirs-models-branches, plans/stale-dirs-models-branches/web-implementation.md, kb:adr/focus-model-never-truncates-name-blocks-give-way, plans/stale-dirs-models-branches/decisions/focus-header-wraps-before-repo-drops/decision.md, plans/stale-dirs-models-branches/decisions/claude-at-may-reappear-on-wrap/decision.md]
supersedes: []
---
**Context.** kb:adr/focus-model-never-truncates-name-blocks-give-way keeps the Focus header's
model whole at every width. With the title at its 6rem floor, a whole model id plus the surface
switch and the action buttons does not fit on one row at 960 px or less.

**Options.** (A) Keep one row and let the actions run off screen. (B) Let the mainhead wrap, so
the surface switch and/or the actions drop to a second row.

**Decision.** B, and it wraps early (the developer, 2026-10-01, after review cycle 3 measured the
first version, which wrapped only when the model alone no longer fit, showing the repo at
1100 px, none at 1024–976 px and the repo again at 975 px). The mainhead wraps as soon as the
repo block would drop below its floor, so the repo readout shows at every width where a second
row can hold it and narrowing never brings it back. Within the row the `↳` block gives way
first (hidden whole, never half-drawn), then the title shortens; the repo block never hides.

**Consequences.** Over a wider band of widths (1024 px included) the header is 80 px instead of
49 px, about 31 px less terminal. Wide windows are unchanged. The `↳` block, unlike the repo block, may show
again at a narrower width once the header has gained a row (the developer, review cycle 4).
