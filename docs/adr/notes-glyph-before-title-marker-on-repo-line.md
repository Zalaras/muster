---
id: notes-glyph-before-title-marker-on-repo-line
type: decision
status: accepted
date: 2026-10-21
summary: The Focus header's note glyph leads the title and never gives way; a card's note marker ends its repo line, and a tile's sits before its context readout.
features: [notes, focus, tiles]
tags: [ux, user-decision]
files: []
tests: []
refs: [plan:session-notes, plans/session-notes/mockups/header-options.html, plans/session-notes/mockups/marker-options.html, kb:adr/focus-header-give-way-order-title-last]
supersedes: []
---
**Context.** The mockups compared four header placements (before or after the title, boxed, or in
the action cluster) and three card placements (the state row, after the title, or the end of the
repo line).

**Decision.** The header glyph is a bare 13px button before the session title (header option A).
It is fixed-width and never gives way: the title's give-way order is unchanged, with the glyph's
width added before it. The rail card and the Tiles strip card show the marker right-aligned at the
end of the repo line, and a tile header shows it before the context readout (marker option C).

**Consequences.** The glyph's position never moves when a title is renamed or truncated. The
markers line up in a column down the rail, at the cost of a little of the repo line's truncation
width.
