---
id: rail-live-card-offers-no-actions
type: decision
status: accepted
date: 2026-10-01
summary: A live rail or strip card offers no action button; End stays in the Focus mainhead and tile footers and returns to the card via a right-click menu.
features: [rail, actions]
tags: [ux]
files: [web/src/sessions/card.ts, web/src/render/sessions.ts]
tests: []
refs: [plan:status-inconsistencies, "#56"]
supersedes: [actions-placement-mainhead-and-card-rows]
---
**Context.** The card's bottom line now carries the background-task count, and the developer asked
for End to leave the rail card, to come back through a right-click menu (#56).

**Decision.** A live card, in the rail or the Tiles strip (one template), renders no action row.
An ended card keeps Resume then Remove in its hover-revealed row. The mainhead and tile footers
keep End, Resume and Remove behind their confirm dialogs, as the superseded decision placed them.

**Consequences.** Ending a session from Focus takes selecting it first, until the right-click menu
lands. Every E2E spec that ended a session from a card moves to the mainhead.
