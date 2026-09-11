---
id: rail-whole-card-drag-drop-decides-pin
type: decision
status: accepted
date: 2026-08-30
summary: Rail cards drag by the whole card with insert-and-shift semantics; the drop position decides pin state, and a pin control lifts a card into the pinned block.
features: [rail]
tags: [ux]
files: [web/src/render/dragreorder.ts, web/src/render/sessions.ts, web/src/sessions/card.ts]
tests: [web/e2e/rail-order.spec.ts]
refs: [docs/history/spec-changelog.md, plan:order-sidebar, kb:adr/tiles-drag-reorder-header-handle-insert-shift, kb:adr/rail-order-daemon-owned-per-session-fields]
supersedes: []
---
**Context.** Manual rail order needs a reorder gesture and a way to pin. A rail card has no header bar, and a click on it already focuses the session.

**Options.** Handle: (A) a dedicated grip, or (B) the whole card, since a drag needs movement and a click still focuses. Pinning: (C) only through an explicit pin control, or (D) also by where a card is dropped, onto a pinned card pins it there, onto an unpinned card unpins it.

**Decision.** B and D, with the pin control kept as well. Drop follows the Tiles rule, insert-and-shift, never swap.

**Consequences.** One drop is one atomic order call carrying the ids and the pinned count, so crossing the pin boundary never needs two requests. The pinned block separator is the only new chrome.
