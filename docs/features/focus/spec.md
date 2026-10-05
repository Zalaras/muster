---
id: focus
type: spec
status: active
date: 2026-09-12
summary: Focus view: mainhead, main slot, dead surface, default focus, focus marker.
features: [focus]
tags: [ux]
go: []
web: [web/src/features/focus.ts, web/src/render/mainhead*.ts, web/src/render/focus*.ts, web/src/render/slotmount*.ts]
e2e: [web/e2e/focus-marker.spec.ts, web/e2e/sessions.spec.ts]
protocol: []
refs: [kb:adr/focus-rail-plus-one-live-pane, kb:adr/focus-rail-click-focuses-terminal, kb:adr/rail-current-marker-means-shown-in-focus, kb:adr/actions-placement-mainhead-and-card-rows, kb:adr/launch-opens-launched-session, kb:adr/launch-bypass-offered-with-danger-guardrails, kb:adr/launch-resume-null-model-reads-unknown, docs/design/ux-flows.md, kb:adr/focus-repo-block-keeps-floor-beside-group-control, kb:adr/focus-group-control-hides-below-640px-container-width, kb:adr/focus-group-control-stays-while-title-shortens]
---
Focus is the default view: the rail of static cards (kb:spec/rail) beside exactly one live
terminal pane, under the persistent masthead (kb:adr/focus-rail-plus-one-live-pane,
docs/design/ux-flows.md "Shape — Focus"). It answers "who needs me, and let me deal with
them".

Above the pane sits the mainhead: the session name with its inline rename trigger
(kb:spec/rename), a danger `bypass` chip after the name while the session's last-known
permission mode is bypass (kb:adr/launch-bypass-offered-with-danger-guardrails), the session's group as
a control that offers the groups, New group… and No group (kb:spec/groups), a meta line of
the repo readout (folder over branch, capped at 30ch and 44ch, kb:adr/rail-repo-line-wraps-at-slash),
a `↳` block while Claude works in another checkout, the model — a resumed session with no recorded
model reads `unknown`, as any null model does (kb:adr/launch-resume-null-model-reads-unknown) —
and ended age when dead, the
`claude | shell` surface switch (kb:spec/surfaces) and the Stop, Resume and Remove action row
(kb:adr/actions-placement-mainhead-and-card-rows). The session name and the repo readout carry hover text (the name's is its full title; the
readout's is the launch path and branch, plus where Claude is when it has moved). A title too
long for the row ends in an ellipsis, so the action row always stays in view. The model never
truncates at any width (kb:adr/focus-model-never-truncates-name-blocks-give-way): as the row
narrows the `↳` block hides whole first, then the title shortens, never below its 6rem floor, and the
repo block never hides, though a long folder may ellipsize above its 8-character floor
(kb:adr/focus-repo-block-keeps-floor-beside-group-control). The group control hides whole while the
header's content box is under 640px and stays above it, the title shortening beside it
(kb:adr/focus-group-control-hides-below-640px-container-width,
kb:adr/focus-group-control-stays-while-title-shortens). The mainhead wraps the surface switch and
actions onto a second row (a third in the narrowest windows with the ended age or bypass chip) before
the repo block would drop below its floor (kb:adr/focus-mainhead-wraps-to-second-row-when-narrow). The main slot hosts the focused
session's live surface; when the session is dead and the Claude surface is selected it shows
the dead surface instead (kb:spec/actions). A size note under the pane states the pane's
real geometry.

The focused session defaults to the top of the rail's visible order (else its first card) when nothing is
focused or the focused session vanished; a focus landing in a filtered-out section resets the
rail's filter to All. A pointer click on a card focuses it and puts
keyboard focus in the terminal; chords and keyboard activation only select
(kb:adr/focus-rail-click-focuses-terminal). A launch focuses the launched session and puts
keyboard focus in its terminal (kb:adr/launch-opens-launched-session). The rail marks the
shown session with a neutral current treatment (kb:adr/rail-current-marker-means-shown-in-focus).
