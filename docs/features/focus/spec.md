---
id: focus
type: spec
status: active
date: 2026-09-12
summary: Focus view: mainhead, main slot, dead surface, default focus, focus marker.
features: [focus]
tags: [ux]
go: []
web: [web/src/features/focus.ts, web/src/render/mainhead*.ts, web/src/render/focus*.ts]
e2e: [web/e2e/focus-marker.spec.ts, web/e2e/sessions.spec.ts]
protocol: []
refs: [kb:adr/focus-rail-plus-one-live-pane, kb:adr/focus-rail-click-focuses-terminal, kb:adr/rail-current-marker-means-shown-in-focus, kb:adr/actions-placement-mainhead-and-card-rows, docs/design/ux-flows.md]
---
Focus is the default view: the rail of static cards (kb:spec/rail) beside exactly one live
terminal pane, under the persistent masthead (kb:adr/focus-rail-plus-one-live-pane,
docs/design/ux-flows.md "Shape — Focus"). It answers "who needs me, and let me deal with
them".

Above the pane sits the mainhead: the session name with its inline rename trigger
(kb:spec/rename), a meta line of repo and branch, model, and ended age when dead, the
`claude | shell` surface switch (kb:spec/surfaces) and the End, Resume and Remove action row
(kb:adr/actions-placement-mainhead-and-card-rows). The main slot hosts the focused
session's live surface; when the session is dead and the Claude surface is selected it shows
the dead surface instead (kb:spec/actions). A size note under the pane states the pane's
real geometry.

The focused session defaults to the top of the rail's displayed order when nothing is
focused or the focused session vanished. A pointer click on a card focuses it and puts
keyboard focus in the terminal; chords and keyboard activation only select
(kb:adr/focus-rail-click-focuses-terminal). The rail marks the shown session with a neutral
current treatment (kb:adr/rail-current-marker-means-shown-in-focus).
