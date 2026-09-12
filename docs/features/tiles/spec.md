---
id: tiles
type: spec
status: active
date: 2026-09-12
summary: Tiles view: slot-stable grid, strip, tile drag, density, snapshot-not-live rule.
features: [tiles]
tags: [ux]
go: []
web: [web/src/features/tiles.ts, web/src/render/tiles*.ts, web/src/render/tiledrag*.ts]
e2e: [web/e2e/tiles.spec.ts]
protocol: []
refs: [kb:adr/tiles-live-top-n-snapshot-rest, kb:adr/tiles-sticky-live-membership, kb:adr/tiles-slot-stable-grid-never-self-sorts, kb:adr/tiles-drag-reorder-header-handle-insert-shift, kb:adr/tiles-order-ephemeral-per-window, kb:adr/tiles-launched-session-promoted-into-grid, kb:adr/tiles-new-session-button-in-toolbar, kb:adr/surfaces-one-live-client-per-session, docs/design/ux-flows.md]
---
Tiles is the peer view to Focus (kb:spec/views): a grid of live terminal tiles over a
snapshot strip, under the same masthead (docs/design/ux-flows.md "Shape — Tiles").

The live grid holds the top N sessions by attention, filled at view entry and when the grid
grows; every other session is a snapshot card in the strip, in the rail's order
(kb:adr/tiles-live-top-n-snapshot-rest). Membership is sticky: after entry it changes only by
user action or a newly launched session filling a free slot, so a terminal never vanishes
mid-keystroke (kb:adr/tiles-sticky-live-membership). The grid never re-sorts itself by
attention; a promoted session takes the demoted tile's slot and survivors keep their order
(kb:adr/tiles-slot-stable-grid-never-self-sorts). Clicking a strip card promotes it. A
session launched from Tiles is promoted into the grid, demoting the lowest-priority tile
when full (kb:adr/tiles-launched-session-promoted-into-grid); the New session button lives in
the density toolbar (kb:adr/tiles-new-session-button-in-toolbar).

Tiles reorder by dragging the tile header onto another tile, which inserts and shifts, never
swaps, with no daemon involvement (kb:adr/tiles-drag-reorder-header-handle-insert-shift).
Order and membership are per-window, client-only state and are never persisted
(kb:adr/tiles-order-ephemeral-per-window).

Density (`prefs.density`, 2×2 or 3×2) sets N and every tile's geometry; each tile states
its real geometry. A tile carries the title (with inline rename), state, meta, a footer
action row with End, Resume, Remove and the surface switch, and a dead surface when its
session is not alive. Snapshot cards render static state only: a session is live on exactly
one surface (kb:adr/surfaces-one-live-client-per-session).
