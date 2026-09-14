---
id: reader-nav-toggle-is-one-fixed-button
type: decision
status: accepted
date: 2026-09-14
summary: One nav-toggle button pinned to the reader docbar's right edge replaces the two-position arrow pair, and the bar's auto margin moves onto it.
features: [reader]
tags: [ux]
files: [web/index.html, web/doc.html, web/src/style.css, web/src/render/reader.ts]
tests: [web/e2e/reader.spec.ts]
refs: [plan:markdown-render-fixes, kb:adr/reader-docs-is-third-surface-segment, docs/design/design-system.md]
supersedes: []
---
**Context.** The reader's nav-collapse control shipped as two buttons with exactly one unhidden at a time: one in `nav.rnav`'s header while the nav is open, one in `.docbar` while it is collapsed. Issue #24 reported the arrow jumping "next to the path" on collapse, and being lost. Two independent causes: the open one lost the `margin-left: auto` the mockup gives it, and the collapsed one was only pushed right by `margin-left: auto` on `.docbar .chg` — an element removed from the DOM whenever no write has been seen for the open file, which is the normal case.

**Options.** (A) Right-align both arrows, restoring the mockup's arrangement. (B) Delete the nav-header arrow and keep one button, permanently in the docbar and pinned to its right edge, whose glyph and `aria-expanded` change with the nav's state.

**Decision.** B. A is the smaller diff but leaves a one-row vertical hop, because the nav header is in grid row 3 and the docbar is row 1; one button is the only arrangement where the control does not move at all. The bar's `margin-left: auto` moves off `.chg` onto the arrow — the one always-present element — so it is flush right in every presence combination, and the rest of the bar stops re-aligning the first time a write lands.

**Consequences.** This deviates from the mockup, whose two-position arrangement was drawn as a static render and never exercised as a transition. `prepareNavArrowFocusRestore` goes with the second button: it existed only because toggling hid the arrow the user had just pressed (the `markdown-viewing` review's cycle-4 Major 1), and a never-hidden button cannot reach that state. Two buttons whose accessible names swapped become one stable name with the state on `aria-expanded`. A dead session's nav header row, now empty, hides with the plan slot.
