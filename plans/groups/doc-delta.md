# Doc delta — plan `groups`

Seeded by the orchestrator from `plan.md` § Doc Delta on 2026-10-05, then amended with every
`doc-delta:` line from the implementation logs and the amendments decided during the run.
`doc-reconcile` promotes what is true of the code; `plan.md` stays as approved.

## From the plan

Carried from the spec's Feature Spec Delta, amended for planning.

**rail** — becomes true:
- A session belongs to at most one group; the rail renders each group as a collapsible section — a sticky header of caret, name, summary and ⋯ — and, while any group exists, an Ungrouped section of the same shape for the rest, which cannot be renamed or deleted.
- The header summary is the member count and, per state present, a dot in that state's colour with its number — needs input, failed, started, planning, working, idle, then ended in a neutral dot; hovering the header shows a popover naming each state and its sessions.
- While a group exists the rail head has a second row — the All · Groups · Ungrouped filter, Select, and a ⋯ menu of New group (also ⌥⌘G), Collapse all and Expand all; the count reads `n of m` while the filter hides cards; the filter and the selection are per-window state.
- Sections keep their place in both sort modes; the manual and attention rules order the cards inside each section, with its own pinned block; a section is reordered by dragging its header in either mode, and a card dropped on a header or among a section's cards joins that group (manual mode).
- Select mode shows a checkbox per card and per header, makes cards non-draggable, and shows a bar at the rail's foot with Move to, Ungroup, Stop, Remove, All and Done; Escape, Done and leaving Focus clear it.
- Groups are daemon rows broadcast whole as `kb:anchor/ws.groups`; membership is the session's `groupId`; name, order, collapsed state and membership survive restart; a group can be empty; Delete group asks whether its sessions go to Ungrouped, to another group, or are stopped and removed; Ungroup dissolves it in place.
- The invariant that every pinned session's position precedes every unpinned one's holds within a section and is held by the daemon.

**rail** — stops being true:
- "The rail head shows the sort select, the session count and the density control." (replaced by the two-row sentence)
- "Manual, the default, is the user-owned order: a pinned block first, then positional order, and no state change ever moves a card" — re-cut as the same rule scoped to a section.
- "The invariant that every pinned session's position precedes every unpinned one's is held by the daemon." (replaced by the per-section sentence)
- For the 800-word cap: the activity-line pref enumeration ("turn-aware by default … or the prompt, the reply, or both") shortens to one clause citing kb:spec/settings, and the Does-not line's title-mapping clause goes (kb:spec/rename owns it).

**actions** — becomes true:
- Stop and Remove also apply to a selection and to a whole group through `kb:anchor/sessions.end-many` and `kb:anchor/sessions.remove-many`, daemon batches that process each id under its own lock and report done, skipped and failed; a bulk Remove on live sessions stops them first and its dialog says so; each batch confirms with the count, and a partial result is reported in the action-error line.

**actions** — stops being true:
- "There are no bulk actions and no undo for Remove." → "There is no undo for Remove."

**launch** — becomes true:
- The form has a Group row under Title on both tabs — existing groups, No group, New group… with a name field — defaulting to the focused session's group; the request carries `groupId` or `newGroup`, the group is created with the session, and a refused launch creates neither.

**launch** — stops being true:
- Nothing in substance; at the cap, the duplicated Start-in default explanation that kb:adr/launch-start-in-explicit-flag-auto-fallback already carries is cut to a citation.

**focus** — becomes true:
- The mainhead shows the focused session's group as a control between the name and the repo readout; it offers the groups, New group… and No group; it is hidden while the header's content box is under 640px; above that a long title may shorten beside it, never below its 6rem floor; the repo block keeps its 8-character floor and never hides (amended twice on 2026-10-05 — see below).
- The focused session defaults to the top of the rail's *visible* order; a focus landing in a filtered-out section resets the filter to All.

**focus** — stops being true:
- The narrowing sentence as written ("the `↳` block hides whole first, then the title shortens…") is re-cut to include the group control's step.
- "The focused session defaults to the top of the rail's displayed order" (re-cut with *visible*).

**shortcuts** — becomes true:
- ⌥⌘1–9 count the cards as displayed — a collapsed or filtered-out card is skipped; ⌥⌘G opens a new group in the rail and is inert in Tiles; ⌥⌘0 expands the section it lands in and resets a filter that hides it.

**shortcuts** — stops being true:
- "select the nth card in the rail's displayed order, manual or attention" (re-cut with the skip).

**tiles** — becomes true:
- The grid and strip ignore groups and render the flat list.

**tiles** — stops being true: nothing.

**lifecycle** — nothing in prose; kb:ref/data-model gains the `rail_group` table, the session's `group_id` column and the `rail_ungrouped` kv key; kb:diagram/store-schema and kb:diagram/domain-model take the Diagrams deltas.

**connection** — becomes true (protocol only, via the Protocol Contract): the snapshot carries `groups` and `ungrouped`; the `groups` message exists.

**past-sessions** — becomes true:
- The Resume tab carries the same Group row as the New tab; a resumed-from-list session joins the chosen group.

**rename** — stops being true: nothing; `sessions.go` is touched for routing only.

## Amendments decided during the run (override the plan text above where they conflict)

- **focus** — REQ-10 / E27 amended by user decision (`decisions/focus-header-floor-rule/decision.md`,
  kb:adr/focus-repo-block-keeps-floor-beside-group-control): the "becomes true" sentence's
  "the title floor and the never-truncating repo block are unchanged" reads instead "the title
  floor and the repo block's 8-character floor are unchanged; the repo block never hides, and a
  long folder may ellipsize above its floor as before". The control hides, by a container query
  on the header's own content box, strictly under 640px.
- **focus** — REQ-10 amended again by consensus debate (`decisions/control-hide-rule/decision.md`,
  kb:adr/focus-group-control-stays-while-title-shortens): "hides before the title shortens" is
  withdrawn; above the 640px breakpoint the title may shorten beside the control, never below its
  6rem floor; the title gives way first and the control is the first item removed whole. Any spec
  sentence saying the control hides before the title shortens stops being true.
- **Features header** widened to `update` and `surfaces` (`decisions/features-header-widened/decision.md`):
  only fixture repairs — `web/src/features/updaterestart.test.ts` and `web/e2e/shell.spec.ts`
  carry the snapshot's `groups` / `ungrouped` keys. No sentence in either feature's spec changes.
- **rail** — the pin-invariant sentence stands; `railPos` is **not** renumbered 0..n-1 per
  section (kb:adr/rail-pin-invariant-scoped-per-section, option C′): a section keeps the values
  it holds, a Remove's gap survives later moves, a group move puts movers at the next free value.
  Say nothing about contiguity in the spec.
- **rail** — a single click on a renameable group's **name** does not fold the section; the caret,
  summary, free space and ⋯ do (kb:adr/rail-group-name-click-does-not-fold); Ungrouped's name folds.
- **rail** — bar actions keep select mode and the surviving selection; the mode ends on Done,
  Escape, a switch to Tiles, or an empty rail (kb:adr/rail-select-mode-persists-across-bar-actions).
  The plan's "Escape, Done and leaving Focus clear it" sentence is still true; add the empty-rail exit.
- **launch / past-sessions** — the Group row sits under Title on New and in a slot under the
  past-sessions list on Resume, one set of nodes (kb:adr/launch-group-row-moves-between-tabs);
  "a Group row under Title on both tabs" is true of New only.
- **actions** — the batch result parser is `protocol/batch.ts` (kb:adr/web-batch-result-type-lives-in-protocol); no spec sentence.
- **launch** — a store-write failure in the record step after the group was announced deletes the
  group and announces it gone; a crash mid-launch can leave an empty group row the developer
  deletes (kb:adr/launch-new-group-created-with-the-row-or-not-at-all, consequences).

## Protocol sentences that stop being true (review cycle 1, code Major 2 and Note 2)

- `kb:anchor/sessions.group` — "Sessions outside `ids` are never touched" is false: a pinned mover
  joining a section re-enforces that section's invariant, so its unpinned members may take new
  `railPos` values and are broadcast (`TestSetSessionsGroup`, `TestBystanders_…`). True sentence:
  sessions outside `ids` never change `groupId` or `pinned`; the target section's members may be
  renumbered within it and are broadcast when they are; sessions in other sections are untouched.
- `kb:anchor/sessions.order` — "`railPos` = index in `ids`" is false under option C′
  (kb:adr/rail-pin-invariant-scoped-per-section): the listed ids take, in listed order, the
  `railPos` values the section already holds; nothing is renumbered 0..n-1.
- `kb:anchor/sessions.group` — a missing or mistyped `groupId` answers `400 invalid_request` with
  the message `groupId is required and must be an integer or null`; the single `ids…` message
  covers the `ids` causes only. Record the shipped message.
- **rail** — the `n of m` count hides only filtered-out sections' cards; members of a collapsed
  section the filter keeps still count (browser Note 5). The plan's "computed from
  `visibleCards`" is an implementation note, not the spec sentence; the spec says "while the
  filter hides cards", which is what holds.

## `doc-delta:` lines from the implementation logs (verbatim)

- (daemon-impl) the plan's Doc Delta says nothing about how `railPos` values are assigned inside a section. After this work a section keeps the values it already has (gaps from a Remove survive any move) and a group move puts the movers at `nextRailPos`, the end of everything. If `kb:ref/data-model` or the rail spec states that a rebuild renumbers 0..n-1, that sentence is now wrong; the invariant sentence in the delta is still exact.
- (daemon-impl) `kb:anchor/groups.collapsed` is the anchor name in `docs/protocol.md` for `PUT /api/groups/collapsed`; the plan's anchor list and Affected Files use the same name, so no change, noted only because `groups.collapse-all` reads naturally and is wrong.
- (web-impl) focus — the group control hides when the header's content box (the header minus its 14px side padding) is under 640px, so at a header width under 668px; the e2e sweep notes the same band.
- (web-impl) focus — the title does not shorten before repo / branch at every width. The existing layout gives the title the free space ahead of `.meta`, so a folder name longer than the 8-character floor ends in an ellipsis whenever the title is shortened; measured below. The plan's "repo / branch never truncate" overstates it ("the repo block never hides" is what holds).
- (web-impl) rail — select mode stays on after a bar action; it ends on Done, Escape, switching to Tiles, or when no session remains.
- (web-impl) rail — a click on a renameable group's name does not fold it; double-click renames.
- (web-impl) rail — Select all (n) in a header menu turns select mode on with that group's members selected.
- (web-impl) launch / past-sessions — the Group row sits under Title on New and under the past-sessions list on Resume; one select, one choice across both tabs.
- (web-impl) focus — default focus falls back to the first card of the whole rail when every kept section is empty or collapsed, un-filtering if that card's section is filtered out.
- (web-impl) `docs/features/rail/spec.md` `web` globs must also cover `web/src/features/groups*.ts`, `web/src/features/launchgroup*.ts`, `web/src/features/groupscopy.ts` and `web/src/protocol/batch.ts`; `make check-kb` lists the new files as owned by no feature.
- (web-impl, review cycle 1 fix wave) select mode's bar buttons All and Done, and the card checkboxes, are now disabled while the daemon is down (the plan's Daemon down list already says "bar buttons"); the Doc Delta's select-mode sentence does not mention the daemon-down state and needs no change, but any feature-spec sentence saying "Done and All still work while down" is now wrong (none found in `docs/`).
- (web-impl, review cycle 1 fix wave) `render/CLAUDE.md` and `features/CLAUDE.md` name the rail's modules by hand; the registry globs and those lists need `features/groupsselect.ts`, `features/groupsdialogs.ts`, `render/anchored.ts` and `render/options.ts`.

## Amendments from the fix waves (override where they conflict)

- **rail** — while the daemon is down, in select mode every selection-bar button (Move to, Ungroup, Stop…, Remove…, All, Done) and both checkbox kinds (card, header) are disabled and selection changes are no-ops; Escape still leaves the mode; all re-enable on reconnect (web fix wave, review cycle 1; pinned by E2E 5eea292a).
- **focus** — the group control's hide boundary is strict: a 640px content box shows it, 639px hides it (`@container (width < 640px)`).
- **rail** — the daemon-level fix that a launch-held `newGroup` no longer makes `PUT /api/groups/order` fail is daemon-internal (the held group is slotted back above Ungrouped); no spec sentence, the protocol's `groups.order` text is already exact.
