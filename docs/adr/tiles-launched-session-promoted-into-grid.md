---
id: tiles-launched-session-promoted-into-grid
type: decision
status: accepted
date: 2026-08-30
summary: A session launched from Tiles is promoted into the live grid, demoting the lowest-priority tile when full, rather than admitted only if a slot is free.
features: [tiles, launch]
tags: [ux]
files: [web/src/features/tiles.ts, web/src/sessions/live.ts]
tests: [web/e2e/tiles-launch.spec.ts]
refs: [docs/history/spec-changelog.md, kb:adr/tiles-sticky-live-membership, kb:adr/tiles-new-session-button-in-toolbar]
supersedes: []
---
**Context.** With a launch button in Tiles, a new session had to land somewhere. A fresh session starts at the bottom of the attention order, so the grid's admission rule alone would leave it in the strip whenever the grid was full.

**Options.** (A) Admit the new session only if a slot is free, else leave it in the strip. (B) Promote it exactly as a strip-card click does, demoting the lowest-priority live tile when the grid is full.

**Decision.** B. The user just asked for this session; hiding it in the strip would be the one outcome they did not want.

**Consequences.** Launching reuses the promotion path, so slot placement follows the slot-stable rule. Focus behaviour is unchanged.
