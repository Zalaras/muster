---
id: rail
type: spec
status: active
date: 2026-09-12
summary: Rail cards, attention versus manual order, pin, drag reorder, session count.
features: [rail]
tags: [ux]
go: [internal/server/sessions*.go, internal/session/railorder*.go]
web: [web/src/features/rail.ts, web/src/render/sessions*.ts, web/src/render/actionbutton*.ts, web/src/render/dragreorder*.ts, web/src/render/keyedreorder*.ts, web/src/sessions/card*.ts, web/src/sessions/railorder*.ts, web/src/sessions/reorder*.ts, web/src/sessions/format*.ts, web/src/sessions/paths*.ts, web/src/sessions/sort*.ts, web/src/dragmime*.ts]
e2e: [web/e2e/rail-order.spec.ts, web/e2e/rail-cards.spec.ts, web/e2e/rail-unread.spec.ts, web/e2e/rail-layout.spec.ts, web/e2e/rail-activity.spec.ts, web/e2e/helpers/railorder.ts, web/e2e/helpers/railcards.ts]
protocol: [sessions.pin, sessions.order]
refs: [kb:adr/rail-user-owned-manual-order-default, kb:adr/rail-attention-order-your-turn-before-active, kb:adr/rail-order-daemon-owned-per-session-fields, kb:adr/rail-whole-card-drag-drop-decides-pin, kb:adr/rail-current-marker-means-shown-in-focus, kb:adr/focus-rail-click-focuses-terminal, kb:adr/usage-context-gauge-shows-tokens-and-compactions, kb:adr/drop-reorder-drag-mime-custom-type, kb:adr/rail-card-title-leads-and-density-ramp-corrected, kb:adr/rail-activity-line-turn-aware-default-with-pref, kb:adr/rail-unread-inferred-from-live-terminal-client, kb:adr/rail-unread-marker-neutral-dot, kb:adr/rail-card-title-foreground-token, docs/design/ux-flows.md, docs/design/design-system.md]
---
The rail is the session list in the Focus view; the Tiles strip is the same list laid on
its side (kb:spec/tiles). Every session has a card.

## Card

A card is a title that wraps, above a state row of badge, time in the current state and
pin, then the repo and branch line (with a worktree marker when the directory is a linked
worktree, and nothing when it is not a git checkout), the context gauge with absolute
tokens and the compaction counter (kb:adr/usage-context-gauge-shows-tokens-and-compactions),
and an activity line whose text `prefs.railActivity` chooses: turn-aware by default (the
user's prompt while a turn is open, Claude's reply once it closes), or the prompt, the
reply, or both (kb:adr/rail-activity-line-turn-aware-default-with-pref, kb:spec/settings).
The title, the repo line and the activity line each carry their full text as a hover title.
A reason line still follows: the attention reason for `needs_input`, the raw error for `failed`, and the
first-launch or no-signal note for `started` (docs/design/ux-flows.md "Rail card",
"Degraded and honest states"). Unknown context renders the word unknown, never an empty
gauge. A dead card greys out and offers Resume and Remove in its hover-revealed action row
(kb:spec/actions). Cards render a static state summary, never a live terminal.

An idle session that finished a turn while no window had its terminal open is unread until
one attaches — the daemon infers this from its terminal registry
(kb:adr/rail-unread-inferred-from-live-terminal-client). An unread card shows a neutral dot
before the title; a read idle title renders muted, on every surface
(kb:adr/rail-unread-marker-neutral-dot, kb:adr/rail-card-title-foreground-token).

Density is `prefs.railDensity`, chosen from an icon control in the rail head: comfortable
is the reference render and clamps the activity line to three lines, compact clamps the
title to one line and drops the activity line, expanded lets the activity line run to
however many lines it needs, and the gauge track renders in all three; the Tiles strip
follows the same density (kb:adr/rail-card-title-leads-and-density-ramp-corrected, kb:spec/settings).

A pointer click on a card focuses that session and puts keyboard focus in its terminal;
keyboard activation and the number chords only select
(kb:adr/focus-rail-click-focuses-terminal). The card whose session the Focus pane shows
carries a neutral current marker and `aria-current`; the marker means "shown in Focus", so
the Tiles strip renders none (kb:adr/rail-current-marker-means-shown-in-focus). The rail
head shows the sort select, the session count and the density control.

## Order

Two sort modes, chosen by a rail-head toggle persisted as `prefs.railSort`
(kb:spec/settings). Manual, the default, is the user-owned order: a pinned block first,
then positional order, and no state change ever moves a card
(kb:adr/rail-user-owned-manual-order-default). Attention sorts the unpinned group by
`needs_input` longest-blocked first, `failed` most recent first, unread `idle` longest-idle
first, `started`, `planning`, `working`, then read `idle` longest-idle first
(kb:adr/rail-attention-order-your-turn-before-active). Dead sessions sort last in either
mode. Sorting is client-side over the `pinned` and `railPos` fields; the daemon persists
and broadcasts them as ordinary session upserts and never orders for display
(kb:adr/rail-order-daemon-owned-per-session-fields).

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
