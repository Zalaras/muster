---
id: usage-masthead-narrow-width-shrinks-bars-truncates-model
type: decision
status: accepted
date: 2026-09-23
summary: The masthead never wraps its text; below 1840px its gaps tighten and bars drop to 40px, and only the model name truncates, with a hover title.
features: [usage]
tags: [ux]
files: [web/src/style.css, web/src/render/masthead.ts]
tests: [web/e2e/masthead-layout.spec.ts]
refs: [https://github.com/Zalaras/muster/issues/52, kb:adr/nongoal-ui-scaling-delegated-to-browser-zoom, kb:adr/usage-masthead-one-selectable-model-window, docs/design/design-system.md]
supersedes: []
---
**Context.** With every gauge known, the model-week selector showing and a long model name, the masthead's content measures about 1780px wide, and about 1820px with the longest strings (`reconnecting…`, a version warning glyph). A 14" laptop's default viewport is 1512px. The flex row gave its shrink to the text, which wrapped: each reset suffix went onto three lines and the masthead grew from 46px to 63px, while the 96px bars stayed full width.

**Options.** (A) Let the masthead wrap onto a second row when it runs out of room. (B) Hide the reset suffix at narrow widths. (C) Never wrap. Below a measured width, tighten the gaps and narrow the bars to 40px, and let the model name be the one readout that truncates.

**Decision.** C. A second row takes height from the terminal pane under it. Hiding the reset time removes information the gauge carries. The bar is a proportion and still reads at 40px, and a truncated model name keeps its full text as a tooltip.

**Consequences.** Below 1840px the gaps drop to 14px and 8px and the bars to 40px. Measured with same-day reset times on the real dashboard and a static copy, every realistic state is one 46px row with no overflow at 1512px and 1440px, and only the model name is trimmed. The rare pairing of `Claude installation unknown` with `reconnecting…` still overflows by about 25px at 1512px, where `#app` clips the rightmost readout. The daemon-down banner still carries that state (design-system §6.7). Below that, scaling stays browser zoom (kb:adr/nongoal-ui-scaling-delegated-to-browser-zoom). The 1840px breakpoint is a measured number, so it needs re-measuring when a readout is added to the masthead.
