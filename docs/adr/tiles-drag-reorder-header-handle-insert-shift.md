---
id: tiles-drag-reorder-header-handle-insert-shift
type: decision
status: accepted
date: 2026-08-29
summary: Tiles reorder by dragging the tile header only; a drop on another tile inserts and shifts, never swaps, with neutral feedback and no daemon involvement.
features: [tiles]
tags: [ux]
files: [web/src/render/tiledrag.ts, web/src/features/tiles.ts]
tests: [web/e2e/tiles.spec.ts]
refs: [docs/history/spec-changelog.md, plan:move-tiles, kb:adr/tiles-slot-stable-grid-never-self-sorts]
supersedes: []
---
**Context.** Once the grid stopped sorting itself the user needed a way to put tiles where they wanted. A tile is mostly a live terminal, so the gesture had to avoid stealing pointer events from the pane.

**Options.** Handle: (A) the whole tile, or (B) the tile header only. Drop semantics: (C) swap the two tiles, or (D) insert the dragged tile at the target and shift the others, as a tab bar does.

**Decision.** B and D. Feedback uses the neutral line token only; the reorder changes no tile's geometry and works with the daemon down.

**Consequences.** The terminal body never begins a drag. Pressing on the header blurs any focused control before the drag starts, so focus is captured on the press and handed back to the grid reconcile. Rail cards later adopted the same insert-and-shift rule with a different handle, recorded separately.
