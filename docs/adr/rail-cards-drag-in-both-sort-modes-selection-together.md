---
id: rail-cards-drag-in-both-sort-modes-selection-together
type: decision
status: accepted
date: 2026-10-14
summary: Cards and headers drag in both sort modes; an attention-mode card drop changes only the group; in Select mode a selected card drags the whole selection.
features: [rail, groups]
tags: [ux]
files: [web/src/features/rail.ts, web/src/render/dragreorder.ts, web/src/sessions/railorder.ts, web/src/sessions/sections.ts]
tests: []
refs: [plan:rail-card-organise, "#77", kb:adr/rail-whole-card-drag-drop-decides-pin, kb:adr/rail-select-mode-persists-across-bar-actions]
supersedes: [rail-select-mode-disables-card-drag, rail-section-headers-drag-in-both-sort-modes]
---
**Context.** Organising sessions into groups took Move to or the selection bar: cards dragged only
in manual mode, and not at all in Select mode (#77).

**Decision.** Section headers drag to reorder sections in both sort modes, as before. Cards now
drag in both too. In attention mode a card dropped on a header or among a section's cards changes
only its group, keeping its pin (`kb:anchor/sessions.group`), and attention order then places it;
a drop inside its own section changes nothing. In manual mode a drop among a section's cards also
sets position and pin (`kb:anchor/sessions.order` with `groupId`), and a drop on a header changes
only the group (`kb:anchor/sessions.group`), both as before. In Select mode a press released without
moving toggles selection, a selected card drags every selected session, and an unselected card
does not drag; the mode and the selection survive the drop. A drag released where it started,
outside a section, or rejected by the daemon moves nothing.

**Consequences.** The order call lists several dragged ids for a selection drag; its contract
already allows that. Native drag's own movement threshold separates a click from a drag.
