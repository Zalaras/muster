---
id: rail-card-title-foreground-token
type: decision
status: accepted
date: 2026-09-22
summary: A card title renders in the foreground token on every surface, so the read-idle drop to muted is a real drop in the rail as it already was in the strip.
features: [rail]
tags: [ux, consensus]
files: [web/src/style.css]
tests: []
refs: [plan:rail-card-improvements, plans/rail-card-improvements/decisions/read-idle-title-colour/decision.md, kb:adr/rail-unread-marker-neutral-dot, docs/design/design-system.md]
supersedes: []
---
**Context.** The rail's card list sets the metadata token as its inherited text colour, and the card title declared no colour of its own, so a rail title rendered in the metadata token while the same template's title in the Tiles strip inherited the foreground token from the page. The read-idle rule from kb:adr/rail-unread-marker-neutral-dot moves the title to the muted token, which sits between the two: a real drop in the strip, a rise in the rail. The review of the rail-card plan measured the inversion side by side.

**Options.** (A) Declare the foreground token on the card title itself, leaving the read-idle rule as shipped. (B) Leave the rail's inherited colour alone and let weight carry the read state on its own.

**Decision.** A, by consensus of a two-advocate debate. The session title has its own display role in the design system, listed apart from metadata, and the strip already showed it in the foreground token; declaring that token on the title makes the two surfaces agree on an appearance the app already shipped. The blast radius is one selector: every other card descendant declares its own colour, and the contrast gate measures token pairs the foreground token already passes on every card ground.

**Consequences.** Rail titles are brighter than before this plan, matching the strip and the mockups. The read-idle treatment is colour plus weight, as the neutral-dot record says. A future surface that hosts the card template inherits nothing surprising for the title.
