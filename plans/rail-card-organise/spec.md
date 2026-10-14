# Spec: Rail card menu, drag into groups, and cache warmth

**Plan**: rail-card-organise
**Created**: 2026-10-14
**Features**: rail, groups, actions, usage, canary
**Touches**: ingest — only if the status-line reading lands on its side; `/plan-work` drops it otherwise
**Status**: Approved

## Goal

Make the rail quicker to organise and to read at a glance:

- **Right-click menu (#56):** a card's actions move into a right-click menu. No card carries
  buttons; Stop, Resume and Remove live in the menu with Move to and Pin/Unpin.
- **Drag into groups (#77):** cards move into and out of groups by drag in both sort orders, and a
  selection drags together.
- **Cache warmth (#84):** the timer of a session between turns shows whether its prompt cache is
  still warm, on the card and on its group's header, so the developer can pick a warm session up
  before it goes cold and avoid paying to re-send its context.

It closes #56, #77 and #84, and adds the canary guard for the `prompt_cache` fields the warmth
relies on.

## Background & Context

- **Cache data — kb:fact/prompt-cache-status-shape.** The status line carries `prompt_cache` with
  `expires_at` (Unix seconds, the last main-thread request plus the TTL), `ttl`, `warm` and
  `recache_tokens_if_cold`. It is absent until a session's first request, and sometimes after it;
  absent means unknown, never cold.
- **Subagents — kb:fact/subagent-cache-ttl-5m.** Subagent caches use a 5-minute TTL and are not in
  `prompt_cache`; they are out of scope.
- **Idle sessions send nothing — kb:fact/refresh-interval-seconds.** Production writes no
  `refreshInterval`, so warmth is read from `expires_at` against the clock, not from posts arriving.
  kb:fact/unknown-before-first-response covers the startup gap.
- **Superseded by this work:**
  - kb:adr/rail-select-mode-disables-card-drag — selected cards now drag together.
  - kb:adr/rail-live-card-offers-no-actions — no card has a hover action row; every action is in
    the right-click menu.
- **Standing decisions:** kb:adr/rail-whole-card-drag-drop-decides-pin (insert-and-shift, the drop
  decides pin), kb:adr/rail-section-headers-drag-in-both-sort-modes,
  kb:adr/web-menu-component-single-builder (the right-click menu uses the one builder),
  kb:adr/rail-summary-dot-order-is-attention-order-idle-once, kb:adr/rail-pin-invariant-scoped-per-section,
  and design-system §3: a state colour means only its state, so warmth uses white-to-grey.
- **Behaviour relied on:** the card's timer is time in the current state (`mm:ss`, then hours, then
  days); the group header has a summary and a hover popover; Move to and No group change a
  session's group; attention order is computed, so a drop in attention order changes only the group;
  the Tiles strip renders the rail's card template and ignores groups (kb:spec/tiles).
- **Diagram:** kb:diagram/domain-model — the Session gains its cache warmth beside Context Usage.

## Scope

**In Scope:**
- The right-click menu on rail and Tiles strip cards; the removal of every card hover action row.
- Drag into and out of groups in both sort orders, and drag of a selection in Select mode, with the
  click-or-drag rules below.
- Cache-warmth tint, underline and hover on the timers of idle and needs-input sessions on rail and
  strip cards.
- The group header's warmth timer, its hover, and tinted timers in the header popover.
- The canary guard for the `prompt_cache` fields.

**Out of Scope:**
- Tiles grid tiles and their footer buttons; the Focus header's timer and buttons.
- Drag in the Tiles strip (it ignores groups).
- Rename in the menu (renaming is already simple).
- Subagent cache warmth.
- Notifications or toasts near expiry.
- Measuring whether Claude Code re-posts the status line at expiry.
- Tiles per group.

## Requirements

**Right-click menu (#56)**
1. Right-clicking a rail or strip card opens a menu of that session's actions; the browser's own
   menu does not appear.
2. A live session's menu offers Stop; an ended session's offers Resume and Remove. Every session's
   menu offers Move to (each group, New group…, No group) and Pin or Unpin. "No group" is how a
   session leaves its group.
3. Stop, Resume and Remove ask for confirmation exactly as they do from the Focus header. An item
   that cannot apply is absent, not disabled (Resume with no Claude session to resume).
4. No card shows an action button, on hover, on focus, live or ended.
5. Right-clicking a card in Select mode opens the same menu for that one card; the selection is
   unchanged.
6. The menu closes on Escape, a click outside it, or a choice. A focused card opens it with the
   context-menu key or Shift+F10.
7. While the daemon is down the menu's actions are disabled.

**Drag into groups (#77)**

8. In both sort orders, a card dragged onto a group's header or among its cards joins that group;
   one dropped among Ungrouped's cards leaves its group.
9. In attention order the drop changes only the group; the card then sits where attention order
   places it.
10. In manual order the drop also sets position and pin, as today.
11. In Select mode a press released without moving past a small threshold toggles selection;
    pressing and moving past it drags. Dragging a selected card carries the whole selection; an
    unselected card does not drag.
12. Outside Select mode a drag carries just that card.
13. A drag released where it started, or anywhere it cannot drop, does nothing: the selection is
    unchanged and nothing moves.
14. Group headers keep dragging to reorder sections in both sort orders.

**Cache warmth (#84)**

15. On rail and strip cards, the timer of an idle or needs-input session fades in a straight line
    from bright white to the usual timer grey over that session's own cache lifetime, and stays
    grey once cold.
16. In the last 15% of the lifetime the timer also carries a dotted underline.
17. Working and started timers look as they do today.
18. Hovering the timer shows one line: "cache warm · cold in 6m", "cache cold · ~24k to re-send",
    "cache warm · refreshing" (working), or "cache unknown · no reply yet".
19. When warmth is unknown (no reply yet, or a status line without it) the timer looks as today
    and the hover says unknown.
20. Warmth keeps fading while the session sits idle and no updates arrive.
21. A group header shows one extra timer after its state dots: the group's most recently active
    session that is idle or waiting on input, tinted and underlined the same way. Its hover reads
    "3 of 4 warm · next cold in 15m" or "all 2 cold".
22. The header's popover gives each such session its own tinted timer.
23. Warmth is shown correctly after a daemon restart and a dashboard reload.

**Canary**

24. A Claude Code update that changes or drops the `prompt_cache` fields turns the canary red.

## Edge Cases & Considerations

- **`/clear`:** warmth returns to unknown until the next reply, as the context gauge does.
- **Resume:** warmth is unknown until the first reply in the new process; never shown cold for
  lack of data.
- **Ended sessions:** no warmth; the timer is the ended age, as today.
- **5-minute TTL:** fades over 5 minutes and underlines for the last 45 seconds; nothing assumes
  an hour.
- **Lost status-line update:** the expiry can be stale until the next update corrects it; warmth
  is never guessed from anything else.
- **Daemon down:** the dashboard keeps fading from the last known expiry.
- **Group with no waiting session:** no header timer; the timer shows collapsed or expanded.
- **Menu:** right-clicking while another menu is open replaces it; while an action is already
  running on that session its actions are disabled; a session removed while its menu is open
  closes the menu.
- **Selection across groups:** dropped on one group, all of it moves there; dropped on Ungrouped,
  all of it leaves its groups. Ended sessions in a selection move like the rest.
- **Pins:** a card moved into a group by drag in attention order keeps its pin as Move to does,
  with pinned-first held in the new section.
- **Filter:** sections the filter hides cannot be dropped onto.
- **Rejected drop** (the group was deleted meanwhile): the card stays put and the error shows where
  action errors show today.

## Acceptance Criteria

- [ ] Right-clicking a live rail card opens a menu with Stop, Move to and Pin/Unpin and no browser
      menu; an ended card offers Resume, Remove, Move to and Pin/Unpin. The same holds on Tiles
      strip cards.
- [ ] Stop, Resume and Remove from the menu open the same confirm dialogs as the Focus header;
      confirming acts, cancelling sends nothing.
- [ ] Move to → a group / New group… / No group changes the session's group.
- [ ] No rail or strip card shows an action button, on hover, on focus or ended.
- [ ] The context-menu key or Shift+F10 on a focused card opens its menu; Escape closes it.
- [ ] With the daemon down the menu's actions are disabled.
- [ ] In attention order, dragging a card onto another group's header puts it in that group, and it
      sits where attention order places it; dropping onto Ungrouped removes it from its group.
- [ ] In manual order, a drop among a group's cards puts the card in that group at the drop
      position.
- [ ] In Select mode a click without movement toggles selection; dragging a selected card moves
      every selected session into the target group; an unselected card cannot be dragged.
- [ ] A drag released where it started changes neither selection nor group.
- [ ] Group headers still reorder sections by drag in both orders.
- [ ] An idle card whose cache was just refreshed shows a near-white timer; halfway through the TTL
      a midway colour; inside the last 15% a dotted underline; past expiry today's grey with no
      underline — with no new status-line posts arriving.
- [ ] A needs-input card's timer is tinted the same way; working and started timers are unchanged.
- [ ] Each hover text in requirement 18 appears in its matching state.
- [ ] A session with no `prompt_cache` yet, or just after `/clear` or a resume, shows the plain
      timer and "cache unknown".
- [ ] A 5-minute-TTL session fades over 5 minutes.
- [ ] A group header shows the extra timer for its most recently active waiting session, with the
      "n of m warm · next cold in Xm" hover; a group with none shows no extra timer.
- [ ] The header popover tints each waiting session's timer.
- [ ] Warmth is still shown correctly after a daemon restart and a page reload.
- [ ] The canary fails if `prompt_cache`, its `ttl`, or an `expires_at` of about the last request
      plus the TTL is missing after the first turn.

## Feature Spec Delta

**rail** — becomes true:
- No card renders an action button; right-clicking a rail or strip card, or the context-menu key
  or Shift+F10 on it, opens a menu of that session's actions — Stop on a live session, Resume and
  Remove on an ended one, then Move to and Pin or Unpin. A dead card greys out.
- The timer of a session idle or waiting on input shows its prompt-cache warmth: it fades in a
  straight line from bright white to the timer grey over the cache's lifetime, carries a dotted
  underline in the last 15%, and is plain grey once cold or when warmth is unknown; a hover names
  the warmth in one line (kb:spec/usage).
- In either sort mode a card dragged onto a group's header or among its cards joins that group; in
  attention mode only the group changes (kb:spec/groups).

**rail** — stops being true:
- "A live card offers no action button (kb:adr/rail-live-card-offers-no-actions); a dead card greys
  out and offers Resume and Remove in its hover-revealed action row (kb:spec/actions)."

**groups** — becomes true:
- In either sort mode a card dropped on a header or among a section's cards joins that group, and
  one dropped among Ungrouped's cards leaves its group; in attention mode the drop changes only the
  group. Move to does the same.
- While Select mode is on, a click toggles a card instead of focusing it; dragging a selected card
  carries the whole selection, an unselected card does not drag, and a drag released where it
  started changes nothing.
- After the state dots, the summary shows the timer of the group's most recently active session
  that is idle or waiting on input, tinted by its cache warmth, with a hover counting the warm ones
  and naming when the next goes cold; the popover tints each waiting session's timer the same way.

**groups** — stops being true:
- "In manual mode a card dropped on a header or among a section's cards joins that group; Move to
  does the same in either mode."
- "Cards are not draggable while it is on, and a click toggles a card instead of focusing it
  (kb:adr/rail-select-mode-disables-card-drag)."

**actions** — becomes true:
- They live in the Focus mainhead above the terminal, in tile footers, and in the right-click menu
  of rail and strip cards; no card renders an action button.

**actions** — stops being true:
- "They live in the Focus mainhead above the terminal, in tile footers, and in hover-revealed
  action rows on ended rail and strip cards; a live rail or strip card offers no action button
  (kb:adr/rail-live-card-offers-no-actions)."

**usage** — becomes true:
- Each session also carries its prompt-cache warmth from the status line's `prompt_cache`
  (kb:fact/prompt-cache-status-shape): when it expires, its lifetime, and the tokens a cold start
  re-sends. It is unknown before the session's first reply in this process and after `/clear`, and
  survives a daemon restart. The dashboard reads the expiry against its own clock, so warmth keeps
  changing while an idle session sends nothing.

**usage** — stops being true:
- nothing

**canary** — becomes true:
- After the first turn, the live tier asserts that the status line's `prompt_cache` carries a `ttl`
  and an `expires_at` of about the last request plus that TTL (kb:fact/prompt-cache-status-shape).

**canary** — stops being true:
- nothing

The two superseding ADRs are written by `/plan-work`; their slugs replace the superseded ones cited
above.

## References

- Mockup: `plans/cache-warmth/mockups/timer-tint.html` (the Recommended row); `cards.html` and
  `groups.html` hold the rejected ideas.
- Facts: kb:fact/prompt-cache-status-shape, kb:fact/subagent-cache-ttl-5m,
  kb:fact/refresh-interval-seconds, kb:fact/unknown-before-first-response.
- Superseded: kb:adr/rail-select-mode-disables-card-drag, kb:adr/rail-live-card-offers-no-actions.
- `TODO.md` group "Together — rail card (#56, #77, #84)" and its canary-guard entry; issues #56,
  #77, #84.
- Research (2026-10-14): click-or-drag threshold — dnd-kit's mouse default is a 5 px distance
  ([sensors](https://mintlify.wiki/clauderic/dnd-kit/api/abstract/sensors)); cache-expiry displays
  in other tools step through discrete states ([wmedia.es](https://wmedia.es/en/tips/claude-code-status-line-cache-warning),
  [claude-code-usage-bar](https://raw.githubusercontent.com/leeguooooo/claude-code-usage-bar/main/docs/cache-countdown.md),
  [prompt-cache-control](https://www.aitmpl.com/component/mods/observability/prompt-cache-control));
  the chosen design is a linear fade with an end-of-life underline.
