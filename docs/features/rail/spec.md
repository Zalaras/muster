---
id: rail
type: spec
status: active
date: 2026-09-12
summary: Rail cards, attention versus manual order, pin, drag reorder, session count.
features: [rail]
tags: [ux]
go: [internal/server/sessions*.go, internal/session/railorder*.go]
web: [web/src/features/rail.ts, web/src/render/sessions*.ts, web/src/render/dragreorder.ts, web/src/sessions/card*.ts, web/src/sessions/railorder*.ts, web/src/sessions/format*.ts, web/src/sessions/sort*.ts]
e2e: [web/e2e/rail-order.spec.ts, web/e2e/rail-cards.spec.ts, web/e2e/helpers/railorder.ts]
protocol: [sessions.pin, sessions.order]
refs: [kb:adr/rail-user-owned-manual-order-default, kb:adr/rail-attention-sort-order, kb:adr/rail-order-daemon-owned-per-session-fields, kb:adr/rail-whole-card-drag-drop-decides-pin, kb:adr/rail-current-marker-means-shown-in-focus, kb:adr/focus-rail-click-focuses-terminal, kb:adr/usage-context-gauge-shows-tokens-and-compactions, kb:adr/drop-reorder-drag-mime-custom-type, docs/design/ux-flows.md, docs/design/design-system.md]
---
The rail is the session list in the Focus view; the Tiles strip is the same list laid on
its side (kb:spec/tiles). Every session has a card.

## Card

A card shows the display title, the state badge, time in the current state, the repo and
branch line (with a worktree marker when the directory is a linked worktree, and nothing
when it is not a git checkout), the context gauge with absolute tokens and the compaction
counter (kb:adr/usage-context-gauge-shows-tokens-and-compactions), and a reason line:
the attention reason for `needs_input`, the raw error for `failed`, the last activity for
`idle`, and the first-launch or no-signal note for `started` (docs/design/ux-flows.md
"Rail card", "Degraded and honest states"). Unknown context renders the word unknown, never
an empty gauge. A dead card greys out and offers Resume and Remove in its hover-revealed
action row (kb:spec/actions). Cards render a static state summary, never a live terminal.

A pointer click on a card focuses that session and puts keyboard focus in its terminal;
keyboard activation and the number chords only select
(kb:adr/focus-rail-click-focuses-terminal). The card whose session the Focus pane shows
carries a neutral current marker and `aria-current`; the marker means "shown in Focus", so
the Tiles strip renders none (kb:adr/rail-current-marker-means-shown-in-focus). The rail
head shows the session count.

## Order

Two sort modes, chosen by a rail-head toggle persisted as `prefs.railSort`
(kb:spec/settings). Manual, the default, is the user-owned order: a pinned block first,
then positional order, and no state change ever moves a card
(kb:adr/rail-user-owned-manual-order-default). Attention sorts the unpinned group by
`needs_input` longest-blocked first, then `failed` most recent first, `planning`, `working`,
`started`, and `idle` longest-idle first (kb:adr/rail-attention-sort-order). Dead sessions
sort last in either mode. Sorting is client-side over the `pinned` and `railPos` fields;
the daemon persists and broadcasts them as ordinary session upserts and never orders for
display (kb:adr/rail-order-daemon-owned-per-session-fields).

Cards drag by the whole card with insert-and-shift semantics; the drop position decides pin
state, and a pin control lifts a card into the pinned block
(kb:adr/rail-whole-card-drag-drop-decides-pin). A drop commits through
`kb:anchor/sessions.order` in one atomic call; the pin control uses `kb:anchor/sessions.pin`.
Reorder drags carry a Muster-specific MIME type so the terminal drop target and the document
guard can tell them from dragged files (kb:adr/drop-reorder-drag-mime-custom-type). The
invariant that every pinned session's position precedes every unpinned one's is held by
the daemon.

## Does not

The rail does not render a second live client, does not show cost, and does not maintain
its own title mapping (kb:spec/rename).
