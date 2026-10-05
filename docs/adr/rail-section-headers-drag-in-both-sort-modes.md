---
id: rail-section-headers-drag-in-both-sort-modes
type: decision
status: accepted
date: 2026-10-05
summary: Section headers drag to reorder sections in both sort modes because section order is user-owned in both; cards keep dragging in manual mode only.
features: [rail, groups]
tags: [ux]
files: [web/src/render/dragreorder.ts, web/src/features/rail.ts]
tests: []
refs: [plan:groups, kb:spec/groups]
supersedes: []
---
**Context.** Sections keep their place in both sort modes (the spec). Cards are draggable in manual mode only, because a card's position means nothing under attention sort (kb:adr/rail-user-owned-manual-order-default).

**Options.** (A) Headers drag in manual mode only, matching cards. (B) Headers drag in both modes; cards unchanged.

**Decision.** B. A section's position is the developer's in both modes, so there is no mode in which dragging a header would be meaningless. Card-to-section moves under attention sort go through Select mode or the Focus header control.

**Consequences.** The drag wiring is installed twice on the rail container, once for cards and once for headers; both carry the existing internal drag marker. A header dropped on a card, or a card dropped on the rail head, is not a target.
