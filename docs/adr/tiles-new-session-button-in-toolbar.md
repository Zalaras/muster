---
id: tiles-new-session-button-in-toolbar
type: decision
status: accepted
date: 2026-08-30
summary: Tiles gets its own New session button in the density toolbar, opening the shared launch dialog; a plus pseudo-tile in the grid was rejected.
features: [tiles, launch]
tags: [ux]
files: [web/src/features/tiles.ts, web/src/features/launch.ts]
tests: [web/e2e/tiles-launch.spec.ts]
refs: [docs/history/spec-changelog.md, kb:adr/tiles-slot-stable-grid-never-self-sorts, docs/design/ux-flows.md]
supersedes: []
---
**Context.** The rail's New session button is hidden with the rail, so in Tiles the only way to launch was the keyboard chord.

**Options.** (A) A plus pseudo-tile inside the grid. (B) A button in the Tiles density toolbar that opens the same launch dialog the rail uses.

**Decision.** B. A pseudo-tile would fight the slot-stable reconcile, the drag delegation and the fixed grid geometry, all for a control that is not a session.

**Consequences.** The launch dialog is initialised with a list of opener buttons rather than one, and the launch flow is unchanged. No protocol, schema or daemon change.
