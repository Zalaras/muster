# Spec: Rail groups

**Plan**: groups
**Created**: 2026-10-05
**Features**: rail, actions, launch, focus, shortcuts, tiles, lifecycle
**Status**: Approved

## Goal

Sessions can be put into named groups that show as collapsible sections of the rail, so a set of
related sessions (reviews of several PRs, validation runs, one repo's work) reads as one unit with
a one-line summary of how many need attention, and can be moved, stopped or removed together.
Closes #74 and the "select several sessions and remove those" half of #27; the "remove
everything" half of #27 falls out of Select → All → Remove.

## Background & Context

The design was settled through three rounds of functional mockups in
`docs/design/mockups/groups/` (option A chosen; `README.md` there records what each round
locked). The developer runs the rail in **attention** sort with ~10 live sessions (#74's
snapshot), so groups-under-attention is the primary design: sections keep their place, cards sort
inside them, and a state change in a collapsed group changes its summary dot and moves nothing.

What the implementer inherits:

- **Rail order is settled; groups slot into it.** kb:adr/rail-user-owned-manual-order-default
  (manual = pinned block then positions, nothing moves a card),
  kb:adr/rail-attention-order-your-turn-before-active (the ranking),
  kb:adr/rail-order-daemon-owned-per-session-fields (the daemon persists `pinned`/`railPos` as
  plain session fields and never orders for display — a session's group is the same kind of
  thing), kb:adr/rail-whole-card-drag-drop-decides-pin. Pins are per section.
- **Actions.** kb:adr/actions-placement-mainhead-and-card-rows,
  kb:adr/actions-remove-allowed-on-live-session (bulk Remove on live sessions inherits "stop
  first, the dialog says so"). The actions spec's "no bulk actions" goes; "no undo" stays.
- **Launch.** kb:adr/launch-new-session-button-in-masthead (why New session is not in the rail's
  ⋯ menu), kb:adr/launch-form-seeds-model-and-permission-mode (the form already carries
  per-launch choices; Group is one more).
- **Focus header.** kb:adr/focus-model-never-truncates-name-blocks-give-way and
  kb:adr/focus-mainhead-wraps-to-second-row-when-narrow define the narrowing order; the group
  control becomes a step in it (hidden after the `↳` block, before the title shortens). #73 is a
  bug in that same row and is not owned here.
- **Shortcuts.** kb:adr/shortcuts-cmd-n-follows-rail-order — ⌥⌘1–9 pick "the nth card in the
  rail's displayed order", which must now say what collapsed and filtered-out cards count as.
- **Diagrams.** kb:diagram/domain-model and kb:diagram/store-schema gain a Group;
  kb:ref/data-model gains the table and the session's group column. No new diagram — the
  group's life (create → rename → delete with three outcomes) is prose-sized.
- Groups never depend on hooks: they are developer-made state, not inferred, so there is no
  hook-loss story beyond ordinary upsert delivery.

## Scope

**In Scope:**

- Groups in the rail: create (rail ⋯ menu, ⌥⌘G, selection bar, launch dialog, Focus header),
  rename inline, collapse/expand, reorder a section by its header, delete with three outcomes
  (move to Ungrouped / move to another group / stop and remove), Ungroup (dissolve, keep the
  sessions), Stop all.
- Membership: drag a card onto a header or between a section's cards; Select mode with checkboxes,
  a per-section "all" checkbox and the bottom bar (Move to ▾, Ungroup, Stop…, Remove…, All, Done);
  the group control in the Focus header; the Group row in the launch dialog (New and Resume tabs).
- The Ungrouped section: appears with the first group, disappears with the last, has the same
  header, summary, collapse, Stop all and Select all, but no rename and no delete.
- Header summary: count plus a dot-and-number per state, with a hover popover listing the
  sessions under each state.
- Filter row: All · Groups · Ungrouped, shown only while a group exists.
- Order: sections keep their position in both sort modes; cards sort inside a section by the
  existing rules; pins are per section.
- Everything survives a reload and a daemon restart.
- Bulk Remove (the #27 ask) via Select → All → Remove.

**Out of Scope:**

- Tiles: the grid and strip ignore groups and stay flat (one sentence in the tiles spec). A
  per-group Tiles view is a post-v1 backlog note.
- The card right-click menu (#56) — its own item; nothing here depends on it.
- Fixing #73 itself — this work adds its step to the narrowing order but does not own the bug.
- Nested groups, groups by rule (auto-group by repo), colours or icons on groups, a session in
  more than one group.
- Undo for anything; archive (#39).
- Group-scoped keyboard navigation beyond what ⌥⌘1–9 and ⌥⌘0 already do.

## Requirements

Each states what the developer observes. `[pick]` marks a choice the interview settled.

**Groups**

1. From the rail ⋯ menu, ⌥⌘G, the selection bar's Move to ▾, the launch dialog or the Focus
   header, the developer can make a group; it appears as a section with its name in an edit
   field, and Enter with a non-empty name keeps it, Escape or an empty name discards it.
   `[pick]` names are trimmed, non-empty, up to 40 characters, and need not be unique — the name
   is a label, not an identity.
2. Double-clicking a header's name, or ⋯ → Rename, edits it in place; the new name shows
   everywhere at once (header, popover, launch dialog, Focus header).
3. Clicking a header, its caret, or ⋯ → Collapse/Expand toggles the section; collapsed, only the
   header shows. `[pick]` the collapsed state is remembered with the group — it survives a reload
   and a daemon restart.
4. A group may be empty; an empty section shows a "drop sessions here" line and still offers
   Rename and Delete.
5. ⋯ → Delete group… asks what happens to its sessions — move to Ungrouped (default), move to
   another group, or stop and remove them — and does exactly that; the dialog says how many
   sessions are affected.
6. ⋯ → Ungroup dissolves the group and leaves its sessions in Ungrouped, in their order, with no
   dialog.
7. ⋯ → Stop all… confirms, then stops every live session in the group; they stay in the group as
   ended, resumable cards.
8. The developer can drag a section by its header above or below another section, and the order
   survives a reload.

**Membership**

9. Dropping a card on a header or between a section's cards moves it there; a card dragged into
   the Ungrouped section leaves its group. Drop position still decides pin, per section.
10. The Focus header shows the focused session's group as a control between the name and the
    repo readout; choosing another group, New group…, or No group moves it. When the header is
    too narrow this control hides before the title shortens, the title never shortens below its
    floor, and repo / branch never truncate.
11. The launch dialog has a Group row under Title (New and Resume tabs): existing groups, No
    group, and New group… which adds a name field; Launch creates the group and the session
    together. `[pick]` the default is the group of the session that was focused when the dialog
    opened, else No group. A launched session lands at the end of its section.

**Select mode**

12. Select in the rail head turns on a checkbox per card and per header; clicking a card toggles
    it instead of focusing it; the bar at the rail's foot shows the count and offers Move to ▾,
    Ungroup, Stop…, Remove…, All, Done. Escape or Done leaves the mode and clears the selection;
    switching to Tiles clears it too.
13. Move to ▾ lists the groups, New group… and Ungrouped; Stop… and Remove… confirm with the
    count and, for Remove, say how many are live and will be stopped first.
14. Select → All → Remove… removes every session (the #27 ask).

**Ungrouped, summary, filter**

15. With no groups the rail is exactly today's plus the Select button and the ⋯ menu (New group,
    Collapse all, Expand all) — no header, no filter row. The first group brings in the Ungrouped
    header and the filter; deleting the last group removes them.
16. Every header shows the member count and, per state present, a dot in that state's colour
    with its number, in attention order; ended members count with a neutral dot. Hovering a
    header (about a third of a second) shows a popover listing each state and the sessions in it.
    A state change in a collapsed group changes the summary and moves nothing.
17. The filter row offers All · Groups · Ungrouped; the session count reads `n of m` while
    something is hidden. `[pick]` the filter resets to All on reload.

**Order and chords**

18. In both sort modes the sections keep their place; inside a section the existing manual
    (pinned block, then positions) or attention rules apply; dead cards last within their section.
19. ⌥⌘1–9 count the cards as displayed — a collapsed section's cards are skipped, filtered-out
    cards too. ⌥⌘0 (neediest live session) ignores groups and expands the section it lands in.

**Durability**

20. Groups, membership, section order and collapsed state survive reload and daemon restart; a
    session removed any other way (its row deleted, swept at start) simply leaves its group.

## Edge Cases & Considerations

- **Daemon down / reconnect.** Group edits while the down banner shows are refused like any
  other write; on reconnect the snapshot carries the groups and the rail re-renders from it with
  no duplicates or orphans.
- **Two dashboard windows.** A group made, renamed, collapsed or deleted in one window shows in
  the other within the same beat as a session upsert does today; collapsed state is shared, not
  per window.
- **Delete group or bulk action while sessions change.** Stop all / Remove on a group or
  selection hold the same per-session locks the single actions do; a session that vanishes
  mid-batch is skipped; the dialog's count is what was true when it opened and the batch reports
  how many it actually did.
- **Last session in a group removed or swept at start.** The group stays, empty — the developer
  deletes it, never the daemon.
- **Resume of a session in a group** keeps its group, as it keeps its title and rail position.
- **Launch with New group… that is refused** (model check, missing directory). No group is
  created — group and session are one request, both or neither.
- **Renaming to blank or whitespace** is treated as Escape: the old name stays.
- **A collapsed group gains a needs-input session under attention sort.** The header dot goes
  amber; the section stays put; ⌥⌘0 still finds it and expands the section.
- **Filter = Groups and an ungrouped session is launched.** Launch always opens the session; the
  filter flips to All so the focused card is visible — a focused card that cannot be seen is the
  one state the rail must never produce.
- **Select mode and the focused session.** Clicking cards toggles selection; the focused session
  does not change until Done. Removing the focused session as part of a selection falls back to
  the focus default (top of displayed order).
- **Drag a header onto a card, or a card onto the filter row.** Nothing happens; only
  header↔header and card↔section drops are targets.
- **Shortcuts while a group dialog is open** are inert, as with every confirm dialog.

## Acceptance Criteria

- [ ] With no groups, the rail shows no section headers and no filter row; ⋯ → New group creates
      a section with its name field focused, and after Enter both the Ungrouped header and the
      filter row are present.
- [ ] Dragging a card onto a group header moves it into that group; reloading the dashboard and
      restarting musterd both show it still there, in the same section order and collapsed state.
- [ ] A header shows `n` and one coloured dot-and-number per state present; when a faked
      `Notification` makes a member need input, the header's amber dot appears within the usual
      upsert latency and no section changes position in either sort mode.
- [ ] Hovering a header shows a popover naming each state and the sessions under it.
- [ ] Rename via double-click updates the header, the popover, the launch dialog's Group row and
      the Focus header's control.
- [ ] Delete group… with each of its three options leaves the sessions where the option says
      (Ungrouped / the chosen group / gone), and the group is absent afterwards; the dialog states
      the member count.
- [ ] Ungroup leaves the sessions in Ungrouped in their previous order with no dialog.
- [ ] Stop all… stops every live member; each shows as ended inside the group and can be resumed
      into it.
- [ ] Select mode: checkboxes appear; a header checkbox selects its members; Move to ▾ moves
      them; Remove… states how many are live, stops those first, and removes all; All → Remove…
      leaves "No sessions yet".
- [ ] Escape, Done, and switching to Tiles each leave select mode with nothing selected.
- [ ] The launch dialog's Group row defaults to the focused session's group; New group… plus
      Launch yields both the group and the session; a refused launch yields neither.
- [ ] The Focus header shows the group control between the title and repo / branch; at a header
      width below the breakpoint it is gone, the title is ellipsised no shorter than its floor,
      and repo / branch are intact.
- [ ] Filter = Groups hides the Ungrouped section and the count reads `n of m`; launching an
      ungrouped session flips the filter to All and the new card is visible and focused.
- [ ] ⌥⌘3 selects the third *visible* card when a section above it is collapsed; ⌥⌘0 selects the
      neediest live session and expands its section.
- [ ] The Tiles grid and strip render the same flat list they do today with groups present.
- [ ] Two dashboard windows see each other's group changes without a reload.
- [ ] `make check`, `make web-test` and `make e2e` green; the contrast gate passes with the new
      header and popover styles (no new colour literals).

## Feature Spec Delta

**rail** — becomes true:
- A session belongs to at most one group; the rail renders each group as a collapsible section —
  a sticky header of caret, name, summary and ⋯ — and, while any group exists, an Ungrouped
  section of the same shape for the rest, which cannot be renamed or deleted.
- The header summary is the member count and, per state present, a dot in that state's colour
  with its number, in attention order; hovering the header shows a popover naming each state and
  its sessions.
- While a group exists the rail head has a second row — the All · Groups · Ungrouped filter,
  Select, and a ⋯ menu of New group (also ⌥⌘G), Collapse all and Expand all; the count reads
  `n of m` while the filter hides cards.
- Sections keep their place in both sort modes; the manual and attention rules order the cards
  inside each section, with its own pinned block; a section is reordered by dragging its header,
  and a card dropped on a header or among a section's cards joins that group.
- Select mode shows a checkbox per card and per header and a bar at the rail's foot with Move to,
  Ungroup, Stop, Remove, All and Done; Escape, Done and leaving Focus clear it.
- A group's name, order, collapsed state and membership are daemon state carried on the snapshot
  and upserts, and survive restart; a group can be empty; Delete group asks whether its sessions
  go to Ungrouped, to another group, or are stopped and removed; Ungroup dissolves it in place.

**rail** — stops being true:
- "The rail head shows the sort select, the session count and the density control." (replaced by
  the two-row sentence)
- "Manual, the default, is the user-owned order: a pinned block first, then positional order, and
  no state change ever moves a card" — the same rule, scoped to a section.
- For the 800-word cap: the activity-line pref enumeration ("turn-aware by default … or the
  prompt, the reply, or both") shortens to one clause citing kb:spec/settings, and the Does-not
  line's title-mapping clause goes (kb:spec/rename owns it).

**actions** — becomes true:
- Stop and Remove also apply to a selection and to a whole group; a bulk Remove on live sessions
  stops them first and says so; each batch confirms with the count and reports what it did.

**actions** — stops being true:
- "There are no bulk actions and no undo for Remove." → "There is no undo for Remove."

**launch** — becomes true:
- The form has a Group row under Title on both tabs — existing groups, No group, New group… with
  a name field — defaulting to the focused session's group; Launch creates the group with the
  session, and a refused launch creates neither.

**launch** — stops being true:
- Nothing in substance; the spec is at the cap, so the duplicated Start-in default explanation
  that kb:adr/launch-start-in-explicit-flag-auto-fallback already carries is cut to a citation.

**focus** — becomes true:
- The mainhead shows the focused session's group as a control between the name and the repo
  readout; it offers the groups, New group… and No group; in the narrowing order it hides right
  after the `↳` block, before the title shortens.

**focus** — stops being true:
- The narrowing sentence as written ("the `↳` block hides whole first, then the title shortens…")
  is re-cut to include the step.

**shortcuts** — becomes true:
- ⌥⌘1–9 count the cards as displayed — a collapsed or filtered-out card is skipped; ⌥⌘G opens a
  new group; ⌥⌘0 expands the section it lands in.

**shortcuts** — stops being true:
- "select the nth card in the rail's displayed order, manual or attention" (re-cut with the skip).

**tiles** — becomes true:
- The grid and strip ignore groups and render the flat list.

**tiles** — stops being true: nothing.

**lifecycle** — nothing in prose; kb:ref/data-model and kb:diagram/store-schema gain the group
table and the session's group column.

## References

- Mockups: `docs/design/mockups/groups/` — `a-sections-select-mode.html` (locked),
  `a-refine-board.html` (summary and rail-head options), `a-round3.html` (create, launch Group
  row, Focus-header priority, no-groups state), `README.md` (what each round settled);
  `b-folders-right-click.html`, `c-stacks-picker.html`, `mix.html` kept as rejected alternatives.
- ADRs: kb:adr/rail-user-owned-manual-order-default,
  kb:adr/rail-attention-order-your-turn-before-active,
  kb:adr/rail-order-daemon-owned-per-session-fields, kb:adr/rail-whole-card-drag-drop-decides-pin,
  kb:adr/actions-placement-mainhead-and-card-rows, kb:adr/actions-remove-allowed-on-live-session,
  kb:adr/launch-new-session-button-in-masthead, kb:adr/launch-form-seeds-model-and-permission-mode,
  kb:adr/focus-model-never-truncates-name-blocks-give-way,
  kb:adr/focus-mainhead-wraps-to-second-row-when-narrow, kb:adr/shortcuts-cmd-n-follows-rail-order.
- Diagrams: kb:diagram/domain-model, kb:diagram/store-schema; kb:ref/data-model.
- TODO.md: #74 (owning entry), #27 (bulk remove), #56 (right-click menu — separate), #73 (mainhead
  squashing — separate).
