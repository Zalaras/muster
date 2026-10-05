# Decision brief: control-hide-rule

**Question**: When the Focus header is wide enough for the group control by the 640 px content-box rule but too narrow for the full title beside it, does the control stay (and the title ellipsize) or hide (so the title never shortens while the control shows)?
**Source**: review.md cycle 1, browser Major 1 (`plans/groups/review.browser.md`, `[orchestrator:decision]`)
**Option A**: keep the 640 px rule and amend REQ-10. The control hides only below a 640 px content box, and above that the title may shorten beside it. This costs nothing in code. The measured cost is a 29-character title clipped to 123–227 px across 760–864 px.
**Option B**: make the hide title-aware. The control also hides whenever showing it would ellipsize the title, so the title never shortens while the control is shown. This needs a measure in the mainhead render, not a pure container query. The cost is that a long title (66 characters) hides the control at every header width up to about 1160 px.

## Pinned reading list (both advocates read all of it before turn 1)
- plans/groups/review.md — browser Major 1 (quoted below) and browser Notes 5–6; code Minor 2 (the 640 px boundary)
- plans/groups/review.browser.md — the measurements section for E27 and REQ-10 (widths, px readings)
- plans/groups/plan.md — REQ-10 and its *Amended* note; UI Specifications → Views → **Focus mainhead**; Testable UI Elements row "Mainhead group control"; E27 and its *Amended* note; Implementation Notes → Decisions → kb:adr/focus-group-control-hides-below-640px-container-width
- plans/groups/spec.md — the Focus header requirement and its mockup references
- plans/groups/decisions/focus-header-floor-rule/decision.md — the developer's earlier decision today on the same header (the repo block keeps its floor; the title gives way first)
- docs/design/mockups/groups/a-round3.html — the Focus header at four widths (the design authority)
- docs/design/design-system.md §5 **Focus mainhead** (the give-way order and the group control paragraph)
- docs/design/ux-flows.md §3.1 Shape — Focus
- ADRs for the focus feature (accepted ones bind; proposed ones are this plan's): kb:adr/focus-group-control-hides-below-640px-container-width, kb:adr/focus-mainhead-title-keeps-a-floor, kb:adr/focus-mainhead-wraps-to-second-row-when-narrow, kb:adr/focus-model-never-truncates-name-blocks-give-way, kb:adr/focus-rail-click-focuses-terminal, kb:adr/focus-rail-plus-one-live-pane, kb:adr/focus-repo-block-keeps-floor-beside-group-control
- web/src/style.css — the `.mainhead` rules, the `.ingroup` rules and the `@container` query; web/src/render/mainhead.ts — the render pass that would carry a measure under Option B
- web/e2e/groups-focus.spec.ts — the E27 tests and the width sweep as they stand after validate attempt 2
- plans/groups/web-implementation.md — Decisions → the measured cost of the control at 1280 px (card-location E11) and the 24ch name cap

## The issue, verbatim
1. **[orchestrator:decision]** The REQ-10 clause "it hides before the title shortens", which the amendment keeps, does not hold under the 640 px container rule the plan's Views section and kb:adr/focus-group-control-hides-below-640px-container-width mandate. The test used a 29-character title (228 px whole) and a 6-character folder. Between header widths 760 and 864 px the title is ellipsized, down to 123 px, while the control is shown. With the control hidden by an injected style the title reads whole at those widths. With longer titles the title is ellipsized beside the control from 1160 px down. The two halves of the plan contradict each other, so settling them is a choice, not a fix.
   - **Option A: keep the 640 px rule and amend REQ-10.** The control hides only below a 640 px content box, and above that the title may shorten beside it. This costs nothing in code. The measured cost is a 29-character title clipped to 123–227 px across 760–864 px.
   - **Option B: make the hide title-aware.** The control also hides whenever showing it would ellipsize the title, so the title never shortens while the control is shown. This needs a measure in the mainhead render, not a pure container query. The cost is that a long title (66 characters) hides the control at every header width up to about 1160 px.

## Rules
Up to 3 turns each, ≤400 words per turn, advocate-a opens. Argue from the pinned docs and
measurable consequences; cite file:line; steelman before rebutting; concede when convinced.
Append each turn to debate.md before sending it. The ending turn's author reports once to
`main`. Agent names: advocate-a (Option A), advocate-b (Option B).
