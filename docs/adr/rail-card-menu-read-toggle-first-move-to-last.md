---
id: rail-card-menu-read-toggle-first-move-to-last
type: decision
status: accepted
date: 2026-11-03
summary: The card and selection menus lead with one Mark as read/unread toggle, then Stop… or Resume and Remove…, then Pin or Unpin, with Move to last.
features: [rail, actions, groups]
tags: [ux, user-decision]
files: [web/src/features/railmenu.ts, web/src/features/railmenuitems.ts]
tests: [web/e2e/rail-menu.spec.ts, web/render/rail.spec.ts]
refs: [plan:sweep-2026-11-03-2, "#115", plans/sweep-2026-11-03/research/e6.md, kb:adr/actions-remove-allowed-on-live-session, kb:adr/rail-unread-also-marked-by-hand, kb:adr/actions-bulk-stop-remove-are-daemon-batches]
supersedes: [rail-card-menu-offers-remove-and-marks-whatever-the-state, rail-card-menu-on-selected-card-acts-on-selection, rail-card-right-click-menu-holds-session-actions, rail-live-card-offers-no-actions, actions-placement-mainhead-and-card-rows]
---
**Context.** Move to sat second in the card menu, above Pin and the marks, and the developer wants
it at the bottom (#115). The superseded record chose two fixed mark items always shown; asked about
the order, the developer also asked for the marks to toggle by state as Stop… and Resume do.

**Options.** Order: (A) Stop…/Resume, Remove… | Pin | marks | Move to; (B) the developer's own,
the read mark first | Stop…/Resume, Remove… | Pin | Move to. Marks: (A) one item that toggles by
the current flag, (B) two fixed items always shown.

**Decision.** B and A (the developer, 2026-11-03). A single card's menu (rail card, Tiles strip
card, Focus header Session actions ⋯) holds one read toggle — Mark as read when the session is
unread, Mark as unread when it is read — then Stop… (live) or Resume (resumable ended) and Remove…
(danger, today's confirm, live sessions too), then Pin or Unpin, then Move to (groups in rail
order, New group…, No group). Items that do not apply are omitted. In Select mode a right-click on a
selected card opens a menu over the whole selection, its label naming the count: the toggle (Mark
as read when any selected session is unread, otherwise Mark as unread, one per-session request per
id), Stop… when any is live, Remove… for any non-empty selection, then Move to. Stop… and Remove…
dispatch the daemon batches as the select bar does; Resume and Pin/Unpin stay off that menu. Every
item is disabled while disconnected or busy. Right-clicking a card outside the selection opens that
card's ordinary menu and leaves the selection alone.

**Consequences.** A mark that would change nothing is no longer offered. Select mode stays
on after an action (kb:adr/rail-select-mode-persists-across-bar-actions).
