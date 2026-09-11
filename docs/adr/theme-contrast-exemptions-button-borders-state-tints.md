---
id: theme-contrast-exemptions-button-borders-state-tints
type: decision
status: accepted
date: 2026-09-02
summary: Fields and the segmented track take a new edge token at the non-text ratio; button borders and state border tints are exempt, each with a reason.
features: [theme]
tags: [ux, user-decision]
files: [web/src/style.css, web/scripts/contrast-pairs.json]
tests: []
refs: [docs/history/spec-changelog.md, plan:new-ui-design-colors, docs/design/design-system.md, kb:adr/theme-aa-contrast-gated-in-check]
supersedes: []
---
**Context.** The contrast gate asks every non-text boundary to meet the non-text ratio, and the existing hairline control border met none of it. Raising every border would have made the dense chrome heavy; exempting every border would have left a text field with no visible extent.

**Options.** (A) Raise all control borders to the ratio. (B) Exempt all borders as decorative. (C) Split: buttons keep the hairline under the standard's allowance for a control whose label already meets the text ratio; fields and the segmented-control track get a new edge token at the non-text ratio because nothing else marks their extent; the four state border tints are exempt because the badge word and position already carry the state.

**Decision.** C, taken by Damian at planning.

**Consequences.** The pairs file records each exemption with its reason, so the next reviewer does not re-raise it. A new kind of control has to say which side of the split it falls on. The edge token later also draws the current-card ring in the rail, keeping that marker neutral.
