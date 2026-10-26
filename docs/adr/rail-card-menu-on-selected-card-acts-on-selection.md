---
id: rail-card-menu-on-selected-card-acts-on-selection
type: decision
status: superseded
date: 2026-10-23
summary: In Select mode a right-click on a selected card opens a menu over the whole selection (Stop, Remove, Move to); an unselected card keeps its own menu.
features: [rail, actions, groups]
tags: [ux]
files: [web/src/features/railmenu.ts, web/src/features/railmenuitems.ts, web/src/features/groups.ts]
tests: [web/e2e/rail-menu.spec.ts]
refs: [plan:bugs-one-batch-1, "#97", plans/bugs-one-batch/research/e2.md, kb:adr/rail-select-mode-persists-across-bar-actions, kb:adr/actions-bulk-stop-remove-are-daemon-batches]
supersedes: [rail-card-right-click-menu-holds-session-actions, rail-live-card-offers-no-actions, actions-placement-mainhead-and-card-rows]
---
**Context.** The superseded decision kept the card's right-click menu to the one card even in
Select mode, and an E2E guarded it. #97 reports exactly that: with several cards selected, the
menu's action reached only the card under the pointer. The desktop convention (Finder, Explorer,
Gmail, VS Code) is that a right-click on a selected item acts on the whole selection, the menu
names the count, and items that cannot apply to many are hidden or greyed.

**Options.** (A) Keep the single-card menu and close #97 as designed. (B) In Select mode a
right-click on a card in the selection opens a menu over the selection; a card outside it keeps the
single-card menu and the selection as it was.

**Decision.** B. The selection menu's label names the count. Stop…, Remove… and Move to (each
group, New group…, No group) apply to every selected session, confirming with the count exactly as
the selection bar does and dispatching the same daemon batches
(kb:adr/actions-bulk-stop-remove-are-daemon-batches). With live and ended sessions mixed, Stop…
and Remove… both show and each applies to the sessions it fits, as the bar does. Resume and
Pin/Unpin have no batch route and are absent from that menu. Select mode and the surviving
selection stay on afterwards (kb:adr/rail-select-mode-persists-across-bar-actions). Right-clicking
a card outside the selection opens that card's ordinary menu and leaves the selection alone, as
dragging an unselected card already does. Outside Select mode and on the Tiles strip card nothing
changes; the rest of the superseded decision (no action buttons on the card, the pin control on
it, no Rename) stands.

**Consequences.** The card menu is a third origin of the Stop and Remove batches beside the
selection bar and the group header. Resume or Pin for many sessions would be protocol work, not a
menu change.
