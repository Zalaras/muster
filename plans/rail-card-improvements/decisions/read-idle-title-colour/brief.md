# Decision brief: read-idle-title-colour

**Question**: How should a read idle card's title be rendered so that "drops to muted" is true, given that every card title already inherits `--fg-dim`, which sits *below* `--fg-muted` in the token ladder?
**Source**: review.md, Decisions for the orchestrator, item 1, cycle 1
**Option A**: **match the mockup's ladder**: add `color: var(--fg)` to `.card .name`, leaving the read-idle rule as shipped. The drop becomes real, but every card title in the rail and the strip gets brighter than it has ever been, which is a visual change wider than this plan's scope and would want a fresh `make contrast` read.
**Option B**: **keep the base, drop the colour change**: leave titles at the inherited `--fg-dim` and let the read-idle treatment carry itself on the weight drop alone (700 → 600), since no token sits below `--fg-dim`. Narrower, but weight becomes the sole carrier of "read" on the title, with the dot's presence/absence as the second carrier.

## Pinned reading list (both advocates read all of it before turn 1)
- plans/rail-card-improvements/review.md — Decisions for the orchestrator item 1 (quoted below), and the Manual Verification section's density/mode readout
- plans/rail-card-improvements/plan.md — REQ-9, REQ-4, the UI Specifications preamble (design-system §2, §3 binding), Testable UI Elements rows "Unread card" and "Card title", Doc Delta's rail line "a read idle title is muted", Implementation Notes on kb:adr/rail-unread-marker-neutral-dot
- plans/rail-card-improvements/mockups/final.html and mockups/mock.css (the design authority; note mock.css omits the `.cards { color: var(--fg-dim) }` rule that `web/src/style.css:522` has) and mockups/unread.html (the option page the neutral-dot choice came from)
- docs/design/design-system.md §1 (token ladder: `--fg` › `--fg-muted` › `--fg-dim`, all three themes), §2 Type roles, §3 State colour is meaning, §5 Components "Rail card"
- docs/design/ux-flows.md §3.3 Rail card, §3.5 Degraded and honest states
- docs/adr/rail-unread-marker-neutral-dot.md (this plan's proposed ADR — its text says "a read idle title drops to muted"; a proposed ADR of the plan may be amended by this decision, an accepted one may not)
- docs/adr/rail-card-state-row-then-wrapping-title.md (proposed, this plan), docs/adr/rail-current-marker-means-shown-in-focus.md (accepted: neutral treatments on cards), docs/adr/theme-instrument-visual-direction.md (accepted), docs/adr/nongoal-accessibility-i18n-multiuser-other-platforms.md (accepted: the WCAG AA contrast gate is the one bounded exception)
- web/src/style.css — `.cards` colour rule (~line 522), `.card .name` rules, the read-idle rule (~lines 1855-1858), the unread dot rule, the three theme token blocks (lines ~41-43, ~86-88, ~127-129); `web/scripts/contrast-pairs.json` and `make contrast` (what the gate measures)
- The reviewer's measurements: working card title `rgb(166, 171, 188)` versus read idle title `rgb(178, 182, 195)` in one render, instrument theme

## The issue, verbatim

1. **[orchestrator:decision]** A read idle card's title renders *brighter* than every other card's, inverting the "drops to muted" intent. `.card.s-idle:not(.unread) .name { color: var(--fg-muted) }` (`style.css:1855-1858`) is REQ-9 to the letter, but the card title's inherited colour is `--fg-dim`, set by `.cards { color: var(--fg-dim) }` (`style.css:522`). In the instrument theme the ladder is `--fg` #e8e6e1 › `--fg-muted` #b2b6c3 › `--fg-dim` #a6abbc, so the rule moves a read title *up* the ladder. Measured side by side in one render: working card title `rgb(166, 171, 188)`, read idle title `rgb(178, 182, 195)`. The mockup does not show this because `mockups/mock.css` omits the `.cards` colour rule, so its titles start at `--fg` and the drop is real there. This also decides whether the plan's Doc Delta line "a read idle title is muted" ships true.

   - **Option A — match the mockup's ladder**: add `color: var(--fg)` to `.card .name`, leaving the read-idle rule as shipped. The drop becomes real, but every card title in the rail and the strip gets brighter than it has ever been, which is a visual change wider than this plan's scope and would want a fresh `make contrast` read.
   - **Option B — keep the base, drop the colour change**: leave titles at the inherited `--fg-dim` and let the read-idle treatment carry itself on the weight drop alone (700 → 600), since no token sits below `--fg-dim`. Narrower, but weight becomes the sole carrier of "read" on the title, with the dot's presence/absence as the second carrier.

## Rules
Up to 3 turns each, ≤400 words per turn, advocate-a opens. Argue from the pinned docs and
measurable consequences; cite file:line; steelman before rebutting; concede when convinced.
Append each turn to debate.md before sending it. The ending turn's author reports once to
`main`. Agent names: advocate-a (Option A), advocate-b (Option B).

Constraints both sides accept: neither option may use a state colour token (design-system §3);
neither may touch the protocol or the plan's scope beyond this one rule; the outcome must keep
`make contrast` green (measure it, do not assume). Whichever wins, the plan's Doc Delta line and
kb:adr/rail-unread-marker-neutral-dot's wording will be brought into line with the shipped
render by the orchestrator, not by either advocate. Debaters edit only debate.md.
