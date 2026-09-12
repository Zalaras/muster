---
id: shortcuts
type: spec
status: active
date: 2026-09-12
summary: Keyboard chords routed to views, focus and tiles.
features: [shortcuts]
tags: [ux]
go: []
web: [web/src/features/shortcuts.ts, web/src/shortcuts*.ts]
e2e: [web/e2e/shortcuts.spec.ts]
protocol: []
refs: [kb:adr/shortcuts-option-command-family-off-reserved-chords, kb:adr/shortcuts-cmd-n-follows-rail-order, kb:adr/shortcuts-jump-to-neediest-option-command-zero, kb:adr/shortcuts-match-event-code-in-pure-module, docs/design/design-system.md]
---
One binding table, matched on the keyboard event's physical code in a pure module, drives
every chord (kb:adr/shortcuts-match-event-code-in-pure-module). Session chords use the
Option-Command family (kb:adr/shortcuts-option-command-family-off-reserved-chords):

- Option-Command-N opens the launch dialog; Command-Up goes to the parent directory inside
  it (kb:spec/launch).
- Command-Backslash toggles Focus and Tiles (kb:spec/views).
- Option-Command-1 to 9 select the nth card in the rail's displayed order, manual or
  attention; in Tiles this promotes the session into the grid
  (kb:adr/shortcuts-cmd-n-follows-rail-order).
- Option-Command-0 selects the neediest live session by attention priority, ignoring the
  rail's sort mode and pinned block; with no live session it does nothing
  (kb:adr/shortcuts-jump-to-neediest-option-command-zero).

Session-focusing chords are inert while a modal dialog other than the launch dialog is open.
Selection by chord does not move keyboard focus into the terminal; only a pointer click does
(kb:spec/focus). The keyboard model beyond these chords is not designed
(docs/design/design-system.md "Switching").
