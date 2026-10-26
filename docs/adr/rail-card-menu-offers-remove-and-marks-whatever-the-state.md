---
id: rail-card-menu-offers-remove-and-marks-whatever-the-state
type: decision
status: accepted
date: 2026-10-26
summary: The card and selection menus offer Remove… on live sessions too and always offer Mark as read and Mark as unread.
features: [rail, actions, groups]
tags: [ux, user-decision]
files: [web/src/features/railmenu.ts, web/src/features/railmenuitems.ts]
tests: [web/e2e/rail-menu.spec.ts, web/render/rail.spec.ts]
refs: [plan:remove-unread-right-click-1, "#103", "#104", plans/remove-unread-right-click/research/e1.md, plans/remove-unread-right-click/research/e2.md, kb:adr/actions-remove-allowed-on-live-session, kb:adr/rail-unread-also-marked-by-hand, kb:adr/actions-bulk-stop-remove-are-daemon-batches]
supersedes: [rail-card-menu-on-selected-card-acts-on-selection, rail-card-right-click-menu-holds-session-actions, rail-live-card-offers-no-actions, actions-placement-mainhead-and-card-rows]
---
**Context.** The card menu offered Remove… only on an ended session, although
kb:adr/actions-remove-allowed-on-live-session lets Remove end a live session first (#104). It had no
way to mark a session read or unread (#103).

**Options.** (A) Keep Remove… on ended cards only. (B) Offer Remove… on every card and on every
non-empty selection, after Stop… or Resume. For marking: (A) one item that toggles by the current
flag, (B) two fixed items always shown.

**Decision.** B and B (the developer, 2026-10-26). A single card's menu holds Stop… (live) or Resume
(resumable ended), then Remove… (danger, today's confirm, which says the session is ended first),
Move to, Pin or Unpin, then Mark as read and Mark as unread. Both marks always show, never greyed by
session state; the one that would change nothing is a no-op. In Select mode a right-click on a
selected card still opens a menu over the whole selection, its label naming the count: Stop… when
any is live, Remove… for any non-empty selection, Move to, and the two marks, which send one
per-session request per selected id. Stop… and Remove… dispatch the daemon batches as the select
bar does. Resume and Pin/Unpin stay off that menu. Every item is disabled while disconnected or busy.
Right-clicking a card outside the selection opens that card's ordinary menu and leaves the
selection alone. Outside Select mode and on the Tiles strip card the single-card menu applies; the
card still renders no action button, keeps its pin control and offers no Rename.

**Consequences.** Remove… on a live session in Focus is reached from the rail and strip menus and
from the header's Session actions ⋯, which opens the same menu
(kb:adr/focus-header-holds-switch-and-session-menu). Select mode stays on after an action
(kb:adr/rail-select-mode-persists-across-bar-actions). Batch Resume or Pin would still
be protocol work.
