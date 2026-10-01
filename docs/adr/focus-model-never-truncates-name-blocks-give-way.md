---
id: focus-model-never-truncates-name-blocks-give-way
type: decision
status: accepted
date: 2026-10-01
summary: In the Focus header the model never truncates at any width; the ↳ block gives way first and the header wraps before the repo block would.
features: [focus]
tags: [user-decision]
files: [web/src/style.css, web/src/render/mainhead.ts, web/src/features/focus.ts]
tests: []
refs: [plan:stale-dirs-models-branches, plans/stale-dirs-models-branches/decisions/focus-model-never-truncates/decision.md]
supersedes: []
---
**Context.** REQ-13 says the Focus header's model never truncates. Measured in review cycle 2,
it held from 1024 px up; at 960 px and below `.meta` clipped the model (34 of 169 px at 960,
`claude-haik` at 900, nothing at 800), moved or not, because the bind now shows the full model
id until the status line confirms a display name.

**Options.** (A) The model never truncates at any width; the name blocks give way first. (B)
The model holds from 1024 px up and ellipsizes below, as the masthead's does
(kb:adr/usage-masthead-narrow-width-shrinks-bars-truncates-model).

**Decision.** A (the developer, 2026-10-01). Below the width where the folder and branch lines
reach their floors, those blocks hide or collapse to the `↳` glyph before the model loses a
pixel. No `.rf`/`.rb` box overflows its container or overlaps a separator or the model.

**Consequences.** The `↳` block hides whole when space runs out. The repo block never hides: a
later decision (kb:adr/focus-mainhead-wraps-to-second-row-when-narrow) wraps the header onto a
second row before the repo block would drop below its floor. The Focus header and the masthead now differ on narrow-width truncation by design.
