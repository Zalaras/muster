---
id: rail-user-owned-manual-order-default
type: decision
status: accepted
date: 2026-08-30
summary: The rail has two sort modes: manual, the default, keeps a user-owned pinned-then-positional order; attention is the old needs-input-first sort, kept as a mode.
features: [rail, settings]
tags: [ux, user-decision]
files: [web/src/sessions/railorder.ts, web/src/sessions/sort.ts, web/src/features/rail.ts, internal/server/prefs.go]
tests: [TestLoadPrefs_DefaultRailSortIsManual, web/e2e/rail-order.spec.ts]
refs: [docs/history/spec-changelog.md, docs/history/protocol-changelog.md, plan:order-sidebar, kb:anchor/prefs.put, kb:anchor/ws.snapshot, docs/design/ux-flows.md, kb:adr/rail-attention-sort-order]
supersedes: [rail-attention-sort-order]
---
**Context.** The rail re-sorted itself by attention on every render, so a session jumped to the top when it needed input and back down when answered. With a handful of long-lived sessions Damian wanted muscle memory: cards stay where he put them, and the ones he keeps returning to sit in a block at the top.

**Options.** (A) Keep attention as the only order. (B) Replace it with a manual order. (C) Keep both as modes, selectable from the rail head and persisted, with manual the default.

**Decision.** C, decided at planning. "Where am I needed" and "where did I put things" are both wanted at different moments.

**Consequences.** The pinned block leads in both modes. In manual mode an ended session keeps its slot; attention mode keeps the ended-last rule. The Tiles strip follows the rail's displayed order minus the live tiles, so there is one order across both views; the Tiles grid is untouched. The daemon still never orders for display.
