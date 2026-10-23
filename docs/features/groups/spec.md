---
id: groups
type: spec
status: active
date: 2026-10-05
summary: Rail groups: sections, header summary and popover, select mode, filter, group create, rename, ungroup and delete, persistence.
features: [groups]
tags: [ux]
go: [internal/server/groups*.go, internal/store/group*.go]
web: [web/src/features/groups*.ts, web/src/render/menu*.ts, web/src/render/anchored*.ts, web/src/render/options*.ts, web/src/render/railsections*.ts, web/src/render/grouppopover*.ts, web/src/render/hovertip*.ts, web/src/render/selectbar*.ts, web/src/render/groupdialogs*.ts, web/src/sessions/sections*.ts, web/render/groups.spec.ts, web/render/helpers/groups.ts]
e2e: [web/e2e/groups*.spec.ts, web/e2e/helpers/groups.ts]
protocol: [sessions.group, groups.create, groups.update, groups.order, groups.collapsed, groups.delete, ws.groups]
refs: [kb:adr/rail-groups-daemon-rows-whole-list-broadcast, kb:adr/rail-pin-invariant-scoped-per-section, kb:adr/rail-ungrouped-is-section-zero-on-the-wire, kb:adr/rail-new-group-is-named-before-it-exists, kb:adr/rail-cards-drag-in-both-sort-modes-selection-together, kb:adr/rail-timer-tinted-wherever-cache-warmth-known, kb:adr/rail-select-mode-persists-across-bar-actions, kb:adr/rail-filter-and-selection-are-window-state, kb:adr/rail-summary-dot-order-is-attention-order-idle-once, kb:adr/rail-group-name-click-does-not-fold, kb:adr/web-menu-component-single-builder]
---
A group is a named section of the rail that the developer makes. A session belongs to at most one
group, and a session in none is Ungrouped. The Tiles grid and strip ignore groups and render the
flat list (kb:spec/tiles).

## Sections

Each group is a collapsible section under a sticky header of caret, name, summary and ⋯. While any
group exists the remaining sessions sit in an Ungrouped section of the same shape, which cannot be
renamed or deleted; with no group the rail has no header, no filter and no Ungrouped section.

Sections keep their place in both sort modes.
Inside a section the sort mode orders the cards, with its own pinned block, and the pinned-first
invariant holds per section (kb:adr/rail-pin-invariant-scoped-per-section, kb:spec/rail). A section
is reordered by dragging its header in either mode. In either sort mode a card dropped on a header or
among a section's cards joins that group, and one dropped among Ungrouped's cards leaves its group.
In attention mode a drop changes only the group; in manual mode a drop among cards also sets position
and pin, and one on a header changes only the group. A drop outside the rail, or on its own section in
attention mode, changes nothing. Move to does the same (kb:adr/rail-cards-drag-in-both-sort-modes-selection-together).

A click on the caret, summary or header's free space folds the section. A click on a
renameable group's name does not, so a double-click can rename it, and ⋯ opens the header menu
(kb:adr/rail-group-name-click-does-not-fold). Ungrouped's name folds like the rest.

The summary is the member count and, per state present, a dot in that state's colour with its
number: needs input, failed, started, planning, working, idle, then ended in a neutral dot
(kb:adr/rail-summary-dot-order-is-attention-order-idle-once). After the dots the summary shows the
timer of the last member to start waiting on the developer, tinted by cache warmth, its hover counting the
warm ones (kb:adr/rail-timer-tinted-wherever-cache-warmth-known). Hovering the header briefly, or
keyboard focus on the caret, opens a popover naming each state with its sessions' titles and
warmth-tinted timers.

## Making and changing groups

New group, from the rail's ⋯ menu or ⌥⌘G, opens a pending section with a name field above the
sections. Nothing reaches the daemon until Enter with a non-empty name; Escape, blur or an empty
name discards it (kb:adr/rail-new-group-is-named-before-it-exists). New group… from Move to asks
for the name in a dialog and creates the group with those sessions. A name is 1 to 40 characters
after trimming; a group may be empty.

The rail's ⋯ menu also offers Collapse all and Expand all. A header's menu offers Rename, Collapse
or Expand, Select all, New group, Stop all…, Ungroup and Delete group…; Ungrouped's has only the
ones that fit it. Move to lists every group, New group… and No group, and is also what the Focus
header's group control opens (kb:spec/focus). One builder serves every menu
(kb:adr/web-menu-component-single-builder).

Ungroup dissolves a group at once, its sessions keeping their rail positions in Ungrouped. Delete
group asks whether its sessions go to Ungrouped, to another group, or are stopped and removed; a
remove that leaves a member behind keeps the group (kb:spec/actions).

## Select mode

Select in the rail head shows a checkbox per card and per header and a bar at the rail's foot with
Move to, Ungroup, Stop…, Remove…, All and Done. A click toggles a card instead of focusing it;
dragging a selected card carries the whole selection and an unselected card does not drag. Select
all in a header's menu turns the mode on with that group's members selected. A bar action or the card menu on a selected card keeps
the mode and the surviving selection; Done, Escape, switching to Tiles and an empty rail end it
(kb:adr/rail-select-mode-persists-across-bar-actions). While the daemon is down every bar button
and both kinds of checkbox are disabled and selection changes nothing; Escape still leaves.

## Filter

While a group exists the rail head's second row carries an All, Groups or Ungrouped filter that
hides the sections it excludes; the head's count then reads `n of m`, and members of a collapsed
section the filter keeps still count. Select's All takes every card the filter keeps. The filter
and the selection are per-window state, the filter returning to All on reload
(kb:adr/rail-filter-and-selection-are-window-state). It also resets when focus would land in a
hidden section: a launch, ⌥⌘0 or the default focus (kb:spec/focus, kb:spec/shortcuts).

## Persistence

Groups are daemon rows broadcast whole as `kb:anchor/ws.groups` on every change; membership is the
session's `groupId`, carried by the session upsert
(kb:adr/rail-groups-daemon-rows-whole-list-broadcast). Name, order, collapsed state, Ungrouped's
place and collapsed state, and membership survive a restart. Group endpoints address Ungrouped as
id 0, while a session in none has `groupId` null
(kb:adr/rail-ungrouped-is-section-zero-on-the-wire). The writes are `kb:anchor/groups.create`,
`kb:anchor/groups.update`, `kb:anchor/groups.order`, `kb:anchor/groups.collapsed`,
`kb:anchor/groups.delete` and `kb:anchor/sessions.group`.
