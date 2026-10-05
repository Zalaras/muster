---
id: focus-group-control-hides-below-640px-container-width
type: decision
status: accepted
date: 2026-10-05
summary: The Focus header's group control hides by a container query at 640px of the header's own width; the title floor stays 6rem, not the mockup's 22ch.
features: [focus, rail]
tags: [ux]
files: [web/src/render/mainhead.ts, web/src/style.css, web/src/features/focus.ts]
tests: []
refs: [plan:groups, kb:adr/focus-repo-block-keeps-floor-beside-group-control, kb:spec/rail]
supersedes: []
---
**Context.** The group control joins a header whose narrowing order is settled: the `↳` block gives way first, the title shortens to a floor, the repo block never hides and the header wraps (kb:adr/focus-model-never-truncates-name-blocks-give-way, kb:adr/focus-mainhead-wraps-to-second-row-when-narrow, kb:adr/focus-mainhead-title-keeps-a-floor). The spec locked "the control is the first thing dropped on a narrow pane".

**Options.** (A) Measure whether the title would ellipsise and hide the control first, in JavaScript. (B) A container query on the header's available width: below 640px the control is `display: none`. (C) Adopt the mockup's 22ch title floor as well.

**Decision.** B, measured against the pane, not the window — the spec's acceptance criterion names a breakpoint. The query reads the header's own content box (its border box less 14px of padding each side), so the control hides at a header border-box width under 668px. C is rejected: the 6rem floor is an accepted decision and the 22ch figure was a mockup convenience.

**Consequences.** The control is present at 1140 and 724px header widths and absent at 600 and 500 in the plan's checks. The repo block keeps its 8-character floor and never hides; a long folder may ellipsize above it, and the title gives way first (kb:adr/focus-repo-block-keeps-floor-beside-group-control). The step is stated in the focus spec's narrowing sentence.
