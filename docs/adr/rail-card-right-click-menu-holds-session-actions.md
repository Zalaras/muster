---
id: rail-card-right-click-menu-holds-session-actions
type: decision
status: superseded
date: 2026-10-14
summary: A rail or strip card renders no Stop, Resume or Remove button; its right-click menu holds them with Move to and Pin, and the pin control stays on the card.
features: [rail, actions, groups]
tags: [ux]
files: [web/src/sessions/card.ts, web/src/render/sessions.ts, web/src/features/rail.ts, web/src/render/menu.ts]
tests: []
refs: [plan:rail-card-organise, "#56", kb:adr/web-menu-component-single-builder]
supersedes: [rail-live-card-offers-no-actions, actions-placement-mainhead-and-card-rows]
---
**Context.** The superseded decision took End off the live card and promised it back through a
right-click menu (#56); an ended card still kept Resume and Remove in a hover-revealed row.

**Decision.** No rail or strip card renders an action row. Right-clicking a card, or the
context-menu key or Shift+F10 on a focused card, opens a menu built by the one menu builder:
`Stop…` on a live session, or `Resume` (only when resumable — absent, not disabled, otherwise)
and `Remove…` on an ended one, then a `Move to` section (each group, `New group…`, `No group`) and
`Pin` or `Unpin`. The actions confirm exactly as from the Focus header. In Select mode the menu is
for the one card and leaves the selection alone. The card's pin control stays: it is a control on
the card, not an action row (the developer's call at planning). Rename is not in the menu.

**Consequences.** Every action on a card is one right-click away in both views; nothing appears on
hover except the pin control. E2E specs that pressed an ended card's Resume or Remove move to the
menu.
