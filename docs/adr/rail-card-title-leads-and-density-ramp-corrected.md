---
id: rail-card-title-leads-and-density-ramp-corrected
type: decision
status: accepted
date: 2026-09-22
summary: The rail card leads with its wrapping title and puts the state row beneath it; the density ramp grows monotonically from compact to expanded.
features: [rail, settings]
tags: [ux, user-decision]
files: [web/index.html, web/src/style.css, web/src/render/sessions.ts]
tests: []
refs: [plan:rail-card-improvements-2, "#49", "#50", kb:adr/rail-card-state-row-then-wrapping-title, kb:lesson/mockup-vindicates-markup-not-cascade, docs/design/design-system.md]
supersedes: [rail-card-state-row-then-wrapping-title]
---
**Context.** Two issues landed against the card layout four commits after it shipped. The title was reported as belonging above the state row. Separately, Comfortable was reported as rendering Expanded and vice versa: measured in the built dashboard, one long activity line gives a comfortable card of 248.5px against an expanded card of 169.8px, because comfortable puts no clamp on the activity line while expanded caps it at three. The superseded decision describes that ramp in prose, so the design was inverted, not drifted from. The same issue asked for the gauge track in compact because it costs no height — measured, the compact context row is 13px and the card 81.7px whether the track is hidden or shown.

**Options.** For the ramp: (A) swap the two labels; (B) swap the two behaviours; (C) bound both densities at different clamps. For the row order: (D) lift the pin beside the title and split the state row; (E) fold badge and timer into the repo line, the superseded decision's rejected option B; (F) move the whole state row below the title, pin included.

**Decision.** B and F, the developer's picks. Comfortable clamps the activity line to three lines and expanded runs uncapped, so height grows monotonically across the three steps. Compact renders the gauge track, still clamping the title to one line and dropping the activity line. Everything else in the superseded decision stands: the three-step `railDensity` pref on an icon control in the rail head, the New session button in the masthead, and density applied from the prefs echo, never the click.

**Consequences.** The activity line gains a hover title, because clamping the default density would otherwise hide text visible today. Density margins key on row position, not row class. The Tiles strip follows, sharing the template.
