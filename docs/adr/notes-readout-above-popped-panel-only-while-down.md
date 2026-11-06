---
id: notes-readout-above-popped-panel-only-while-down
type: decision
status: accepted
date: 2026-11-06
summary: The banner always draws above a popped-out note panel; the masthead's connection readout does so only while it shows the outage.
features: [notes, connection]
tags: [ux, user-decision]
files: [web/src/style.css]
tests: [web/render/notes-places.spec.ts]
refs: [plan:sweep-2026-11-06-1, plans/sweep-2026-11-06/research/e1.md, kb:adr/connection-health-dot, kb:adr/notes-popout-per-session-anywhere-in-window]
supersedes: [notes-banner-above-popped-panel]
---
**Context.** kb:adr/notes-banner-above-popped-panel put the daemon-down banner and the masthead's
connection readout above a popped panel so a placed panel never hides an outage. Its rationale is
the outage only, but the readout was raised in every state, so a panel dragged to the top right
while musterd was connected had the 14px dot drawn over its header and taking its clicks (#116).

**Options.** (a) The readout draws above the panel only while it reports the outage
(`data-health="down"`). (b) The panel always draws above the readout; only the banner stays above
it. (c) Keep the order and close #116 as decided.

**Decision.** (a), the developer's choice. The banner stays above the panel, as before. The
readout draws above the panel only while `data-health="down"`, the state that matches the banner
through its 3 s window (kb:adr/connection-health-dot); while it reads connected, connecting or
reconnecting for an update, the panel draws above it.

**Consequences.** A panel placed over the top right covers the green or pending dot; while musterd
is down the red dot and the banner both show over it, with the clickable-header cost the superseded
ADR measured. The z-order is: top-layer dialogs, hover popovers, menus, the banner and (only while
down) the connection readout, then the popped panel, then the readout in any other state.
