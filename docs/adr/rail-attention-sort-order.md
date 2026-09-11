---
id: rail-attention-sort-order
type: decision
status: superseded
date: 2026-08-16
summary: The rail sorts by attention: Needs-Input longest-blocked first, then Failed, Planning, Working, Started, Idle longest-idle first.
features: [rail]
tags: [ux]
files: [web/src/sessions/sort.ts]
tests: [web/e2e/rail-cards.spec.ts]
refs: [docs/history/spec-changelog.md, docs/design/ux-flows.md, kb:anchor/ws.snapshot]
supersedes: []
---
**Context.** The rail is the place the user looks to decide which session to serve next, so its order had to encode urgency rather than launch order or alphabet.

**Options.** (A) Launch order or title. (B) Most recent activity first. (C) A fixed state ranking with a tie-break inside each state that favours the session that has waited longest.

**Decision.** C. Needs-Input first, longest-blocked at the top; then Failed, most recent first; then Planning, Working, Started; Idle last, longest-idle first.

**Consequences.** Sorting is a pure client-side function of the session objects; the daemon never orders for display. Any surface that lists sessions by urgency reuses the same comparator so the rail and the Tiles strip agree. A user-owned manual order is a separate question, decided later.
