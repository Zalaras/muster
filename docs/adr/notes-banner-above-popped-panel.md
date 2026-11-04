---
id: notes-banner-above-popped-panel
type: decision
status: accepted
date: 2026-11-04
summary: The daemon-down banner and the masthead's connection readout draw above a popped-out note panel, so a placed panel never hides the outage.
features: [notes]
tags: [ux, consensus]
files: [web/src/style.css]
tests: []
refs: [plan:popped-out-note-enhance, plans/popped-out-note-enhance/decisions/banner-above-popped-panel/decision.md, kb:adr/notes-popout-per-session-anywhere-in-window]
supersedes: []
---
**Context.** Popping out now places the note panel anywhere in the window, over the rail, the
masthead and the Focus header (kb:adr/notes-popout-per-session-anywhere-in-window). Review cycle 2
measured a panel dragged to the top left hiding the banner's `musterd unreachable` opening, leaving
only a tail that never says musterd is down. Menus and hover popovers already draw above the panel.

**Options.** (A) The banner and the masthead's connection readout draw above the panel. (B) Accept
the placement: the developer put the panel there and can move it.

**Decision.** A, by consensus of a two-advocate debate. Surfacing daemon-down is a correctness rule
(design-system §6, rule 7); hiding it is an honesty failure nothing else on screen explains, while
A's cost is a usability loss over a narrow band of panel positions that the covering banner itself
explains.

**Consequences.** While musterd is down, a panel whose top sits roughly 12–78px from the window's
top has part of its header under the banner, and for tops of roughly 30–55px its three controls
cannot be clicked (measured, review cycle 3 browser Note 1); a strip of the header stays grabbable,
Escape from inside and the glyph still close it, and its rectangle is kept. The z-order is: top-layer dialogs, hover popovers, menus, the banner and the
connection readout, then the popped panel.
