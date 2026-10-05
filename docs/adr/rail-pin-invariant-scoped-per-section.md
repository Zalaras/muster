---
id: rail-pin-invariant-scoped-per-section
type: decision
status: accepted
date: 2026-10-05
summary: Pinned-before-unpinned holds within each section; railPos stays unique over all sessions, and a section's rebuild reuses the values it already holds.
features: [rail, lifecycle, groups]
tags: [store, ux]
files: [internal/session/railorder.go, internal/session/manager_rail.go, web/src/sessions/sort.ts, web/src/sessions/railorder.ts]
tests: []
refs: [plan:groups, kb:spec/groups, plans/groups/daemon-implementation.md]
supersedes: []
---
**Context.** Pins are per section (the spec's pick): each group has its own pinned block. The daemon's rebuild put every pinned session before every unpinned one across the whole rail, which would interleave sections' pinned blocks in one global prefix.

**Options.** (A) Keep the global invariant and let a section's pinned cards sit anywhere the global prefix puts them. (B) A per-section railPos namespace. (C) Keep railPos globally unique, re-scope the invariant: within a section every pinned session's railPos is below every unpinned one's; the rebuild walks the candidate order and, per section, emits pinned then unpinned in encounter order, renumbering 0..n-1. (C′) As C, but each section gets back the railPos values it already held, in ascending order; the contiguous renumber is only a repair for a corrupt duplicate.

**Decision.** C′ (the plan hinted C; the implementation measured against it). One position space keeps the flat Tiles strip, `PUT /api/sessions/order` and the drop math unchanged; the invariant gains a qualifier. A non-positional move (menu, Focus header, drop on a header) sets railPos to max+1, the end of its block. Reusing a section's own values keeps bystanders untouched: sections interleave in railPos (new sessions land at the end), so a contiguous renumber rewrote every other section on each move, against the plan's I3; with C′ ungrouping one group left the others byte-identical (plans/groups/daemon-implementation.md).

**Consequences.** Every pin, order, group, launch and ungroup write runs the rebuild and broadcasts only changed sessions, as today. railPos is not contiguous: a Remove's gap survives later moves and a group move puts the movers at the next free value. The protocol promises only the renumbering the invariant needs, never 0..n-1. The strip still reads pinned-then-positions over all sessions. The existing table-driven invariant tests gain a section axis.
