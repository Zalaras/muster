---
id: rail-select-mode-disables-card-drag
type: decision
status: accepted
date: 2026-10-05
summary: While select mode is on, rail cards are not draggable and the pin control is hidden; moves go through the selection bar.
features: [rail, groups]
tags: [ux]
files: [web/src/render/sessions.ts, web/src/features/rail.ts]
tests: []
refs: [plan:groups, kb:spec/groups]
supersedes: []
---
**Context.** Select mode shows a checkbox per card and a bar of bulk actions. A card drag during select mode would raise the question of whether the whole selection moves.

**Options.** (A) Multi-drag: dragging a selected card carries the selection. (B) Cards keep single-drag behaviour, ignoring the selection. (C) Cards are `draggable="false"` in select mode; Move to on the bar is the way to move a selection.

**Decision.** C. One move model per mode. The bar already offers every destination a drop could reach, and a selected card that cannot be dragged cannot be dropped half-way.

**Consequences.** A test can assert `draggable="false"` on a selected card. Leaving select mode restores the sort mode's own drag rule.
