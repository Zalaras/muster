---
id: launch-opens-launched-session
type: decision
status: accepted
date: 2026-09-23
summary: A successful launch opens the launched session: Focus focuses it, and both views move keyboard focus into its terminal.
features: [launch, focus, tiles]
tags: [ux, user-decision]
files: [web/src/features/launch.ts, web/src/main.ts]
tests: []
refs: [plan:new-session-improvement, kb:adr/tiles-launched-session-promoted-into-grid, kb:adr/focus-rail-click-focuses-terminal, kb:adr/rail-current-marker-means-shown-in-focus]
supersedes: []
---
**Context.** Issue #41: launching a session while another ran left Focus on the running one. The Tiles record promotes a launched session into the grid but said Focus behaviour was unchanged, and nothing moved keyboard focus in either view.

**Options.** (A) Select the launched session only. (B) Select it and put keyboard focus in its terminal, in both views.

**Decision.** B, the developer's choice ("focus as well so can start typing"). A launch is a deliberate "go there" even when it is submitted from the keyboard, so it takes the pointer-click treatment of the rail-click record rather than the select-only treatment of chords.

**Consequences.** In Focus the launched session carries the current marker and fills the mainhead. In Tiles it is promoted as before, and its tile's terminal takes focus. The first keystroke after a launch reaches the new session, which also covers answering the trust prompt. Render ticks, reconcile and view switches still never move focus.
