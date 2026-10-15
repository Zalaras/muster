---
id: focus
type: spec
status: active
date: 2026-09-12
summary: Focus view: mainhead, main slot, dead surface, default focus, focus marker.
features: [focus]
tags: [ux]
go: [internal/server/effort*.go, internal/session/effort*.go, internal/store/effort*.go]
web: [web/src/features/focus.ts, web/src/features/effort*.ts, web/src/render/effortstrip*.ts, web/src/sessions/effort*.ts, web/src/render/mainhead*.ts, web/src/render/focus*.ts, web/src/render/slotmount*.ts]
e2e: [web/e2e/focus-marker.spec.ts, web/e2e/sessions.spec.ts, web/e2e/focus-header.spec.ts, web/e2e/helpers/focus-header.ts, web/e2e/effort-header.spec.ts, web/e2e/helpers/effort.ts]
protocol: [sessions.effort-warning-dismiss]
refs: [kb:adr/focus-rail-plus-one-live-pane, kb:adr/focus-rail-click-focuses-terminal, kb:adr/rail-current-marker-means-shown-in-focus, kb:adr/launch-opens-launched-session, kb:adr/launch-bypass-offered-with-danger-guardrails, kb:adr/launch-resume-null-model-reads-unknown, docs/design/ux-flows.md, kb:adr/focus-group-control-hides-below-640px-container-width, kb:adr/focus-header-readout-sized-by-text, kb:adr/focus-header-give-way-order-title-last, kb:adr/focus-surface-switch-pinned-with-actions, kb:adr/actions-mainhead-one-stop-resume-button, kb:adr/focus-model-never-truncates-name-blocks-give-way]
---
Focus is the default view: the rail of static cards (kb:spec/rail) beside exactly one live
terminal pane, under the persistent masthead (kb:adr/focus-rail-plus-one-live-pane,
docs/design/ux-flows.md "Shape — Focus"). It answers "who needs me, and let me deal with
them".

Above the pane sits the mainhead: the session name with its inline rename trigger
(kb:spec/rename), a danger `bypass` chip after the name while the session's last-known
permission mode is bypass (kb:adr/launch-bypass-offered-with-danger-guardrails), the session's group as
a control that offers the groups, New group… and No group (kb:spec/groups), a meta line of
the repo readout (folder over branch, each line as wide as its text, kb:adr/focus-header-readout-sized-by-text),
a `↳` block while Claude works in another checkout, and the model followed by its effort in brackets — a resumed session with no recorded
model reads `unknown`, as any null model does (kb:adr/launch-resume-null-model-reads-unknown). The
brackets read `(…)` until a new session's first status-line report and are absent when the model has no
effort or a dead session never reported one (the header still reserves the width of ` (…)`, so Stop and
Resume never move it); a resumed session shows the level it resumed at. On a dead
session the ended age sits under the model, without a leading `·`, in a slot the header reserves whether
or not it shows. A right-aligned cluster holds the `claude | shell | docs` surface switch
(kb:spec/surfaces, kb:adr/focus-surface-switch-pinned-with-actions) and the actions: one Stop/Resume
button, `Stop` while alive and `Resume` while dead, the same box under both, and Remove
(kb:adr/actions-mainhead-one-stop-resume-button), so a Stop or a Resume moves nothing at any width.
The session name and the repo readout carry hover text (the name's is its full title; the
readout's is the launch path and branch, plus where Claude is when it has moved). A title too
long for the row ends in an ellipsis, so the action cluster always stays in view. The model never
truncates at any width (kb:adr/focus-model-never-truncates-name-blocks-give-way). As the row narrows
the header gives way in a fixed order: the `↳` block hides whole, then the surface switch and the
actions move together to a second row, then the folder and branch lines ellipsize to their 8-character
floor, and only then the title shortens, never below its 6rem floor
(kb:adr/focus-header-give-way-order-title-last). The `↳` block is drawn only when the whole header,
the cluster included, fits on one row, so it can hide at ordinary window widths. Where the title floor,
the readout floor and the model no longer fit side by side, the model stacks under the readout inside the
meta (the ended age a third line); the title and the readout stay side by side, the readout at its floor
whenever the title is shortened. Below about 316px of header content the cluster tightens its padding
and stays one row. The group control hides whole while the header's content box is under 640px and
stays above it (kb:adr/focus-group-control-hides-below-640px-container-width). The main slot hosts the focused
session's live surface; when the session is dead and the Claude surface is selected it shows
the dead surface instead (kb:spec/actions). A size note under the pane states the pane's
real geometry.

A session launched at a level it did not come up at shows a warning strip under the mainhead, in the
warning tokens, naming the requested and actual level, and tints the effort the same; Dismiss clears both
for that session only, and until then the warning survives reloads, other windows and daemon restarts
(kb:adr/focus-effort-mismatch-warning-persisted-per-session).

The focused session defaults to the top of the rail's visible order (else its first card) when nothing is
focused or the focused session vanished; a focus landing in a filtered-out section resets the
rail's filter to All. A pointer click on a card focuses it and puts
keyboard focus in the terminal; chords and keyboard activation only select
(kb:adr/focus-rail-click-focuses-terminal). A launch focuses the launched session and puts
keyboard focus in its terminal (kb:adr/launch-opens-launched-session). The rail marks the
shown session with a neutral current treatment (kb:adr/rail-current-marker-means-shown-in-focus).
