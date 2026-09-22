---
id: rail-unread-marker-neutral-dot
type: decision
status: accepted
date: 2026-09-22
summary: An unread idle card shows a neutral dot before its title and a read idle title drops to muted; no word, no state colour.
features: [rail]
tags: [ux, user-decision]
files: [web/src/render/sessions.ts, web/src/sessions/card.ts, web/src/style.css]
tests: []
refs: [plan:rail-card-improvements, "#34", docs/design/design-system.md, kb:adr/rail-current-marker-means-shown-in-focus]
supersedes: []
---
**Context.** The unread state needed a visible carrier on the card. The design system reserves every state colour for its state and requires that colour is never the only carrier, so the marker had to be neutral and carried by shape or word.

**Options.** (1) A small filled dot before the title, the mail-client convention, with the read idle title dropping to the muted text token. (2) The badge reading idle-new and filling with the idle token. (3) Weight and fade alone, with nothing named on the card. (4) A small outlined new tag leading the activity line.

**Decision.** 1, the developer's choice from side-by-side mockups. A 7px dot in the foreground token precedes the title while unread; once read the dot goes and an idle title renders in the muted token at weight 600. Assistive technology gets the word through the card's accessible name, which ends in unread.

**Consequences.** The marker composes with any card layout because it lives on the title. It uses no state token, so a contrast or colour review finds nothing to exempt. The Tiles strip shares the template and shows the same dot.
