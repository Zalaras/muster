---
id: tiles-sticky-live-membership
type: decision
status: accepted
date: 2026-08-23
summary: Tiles grid membership is computed at view entry and density change only; afterwards only user action changes it, so a terminal never vanishes mid-keystroke.
features: [tiles]
tags: [ux]
files: [web/src/sessions/live.ts, web/src/render/tiles.ts]
tests: [web/e2e/tiles.spec.ts]
refs: [docs/history/spec-changelog.md, plan:m2-terminal, kb:adr/surfaces-one-live-client-per-session]
supersedes: [tiles-live-top-n-snapshot-rest]
---
**Context.** The design session filled the live grid with the top sessions by attention. Attention changes constantly, so a live tile the user was typing into could be demoted to the strip by an unrelated session's state change.

**Options.** (A) Recompute membership on every state change. (B) Compute it from the attention order on view entry and on a density change, then hold it until the user promotes a strip card or ends a tile.

**Decision.** B. The grid still holds the top sessions by attention at the moment it is built, and every other session is a strip snapshot; density still sets the grid shape and every tile's geometry.

**Consequences.** A priority change updates a tile's chrome but never moves it. Promotion from the strip demotes exactly the lowest-priority live tile. Membership is client state, so a reload rebuilds it from attention order.
