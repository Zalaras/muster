# E2E re-levelling — groups (2026-10-20)

The groups feature's four E2E files classified and moved, per `../test-audit-2026-10-20-relevel.md`
§ Method (`groups` and `groups-select` in a first pass, `groups-focus` and `groups-launch` in a second). Counts below are tests as Playwright runs them (loops expanded); the file headings in the
audit index count declarations. Two facts decided most borderlines: the dashboard adopts
`railSort`, `view` and a section's `collapsed` only from the daemon's broadcast
(`web/src/features/views.ts`, `rail.ts`, `groups.ts`), so a test that switches the view or sort
or collapses by click is a journey, and a test whose only daemon claim was "nothing was created"
is a property once the request log proves nothing was sent.

Every test moved keeps its title, its computed-property checks, its widths and its host views.
The DOM locators, request log, tick-survival check and header sizing moved to
`web/render/helpers/groups.ts`; `web/e2e/helpers/groups.ts` re-exports them and keeps the
endpoints, `GET /api/state` oracles and the frame/response holds. The tick-survival check takes
the tier's own hold (`settleFor`): the render harness advances its installed clock, the E2E
helper wraps it with the real-time wait.

## `groups.spec.ts` — 46 tests → 29 E2E, 17 render, 0 vitest

| Test | Criteria | Level | Reason |
|---|---|---|---|
| with no groups the rail is today's plus Select and ⋯, and Rail actions → New group… names the first group… | REQ-1, REQ-15, I6, E1 | journey | Enter commits through `POST /api/groups`; the header and filter come from the broadcast |
| Escape in the new-group textbox discards the pending section and creates nothing | REQ-1, E2 | **property** | the pending section is window state; the request log proves nothing was sent |
| Enter on {an empty, a whitespace-only} name discards the pending section… (×2) | REQ-1, E2 | **property** | same |
| tabbing out of the new-group textbox discards the pending section… | REQ-1 | **property** | same |
| double-clicking a group's name edits it in place and the new name shows in the header, the popover, the launch dialog and the Focus header | REQ-2, E3 | journey | rename PUT; every surface re-reads the broadcast |
| Escape while editing a name, and a whitespace-only name on Enter, each restore the old name and send nothing | REQ-2, E3, edge 12 | **property** | the editor restores locally; no PUT in the log |
| ⋯ → Rename opens the same in-place editor, and leaving the field commits a non-empty name | REQ-2 | journey | PUT commit |
| a header's name is uppercased by CSS while its text stays the raw name, and the header is sticky | REQ-2 | **property** | computed CSS for a given group |
| clicking a header, its caret and ⋯ → Collapse each toggle the section, and a collapsed section shows only its header | REQ-3 | journey | a collapse is a PUT adopted from the `groups` broadcast (borderline, below) |
| Collapse all groups and Expand all groups from the rail menu toggle every section | REQ-3 | journey | PUTs, daemon flags read back |
| deleting the last session of a group leaves the group with a 0 count, the drop line and a menu… | REQ-4, REQ-20, E4 | journey | the single Remove round-trip |
| a group made empty shows the drop line, and an Ungrouped section whose sessions all moved says no ungrouped sessions | REQ-4, REQ-15 | **property** | both empty lines for a snapshot — `groups-summary` holds an empty group and an empty Ungrouped |
| Delete group… with Move them to Ungrouped (the default)… | REQ-5, E7 | journey | DELETE with disposition |
| Delete group… with Move them to another group… | REQ-5, E7 | journey | same |
| Delete group… with Stop and remove them… | REQ-5, I3, E7 | journey | same, plus tmux liveness |
| deleting the last group removes the Ungrouped header and the filter, and the dialog's Target group select is absent… | REQ-5, REQ-15, I6, E7 | journey | DELETE (the dialog half is display; borderline, below) |
| Delete group… on an empty group says nothing else changes and removes it | REQ-4, REQ-5 | journey | DELETE |
| Cancel and Escape in the Delete group dialog leave the group and its members as they were | REQ-5 | **property** | no DELETE in the log; the section's cards unchanged |
| ⋯ → Ungroup dissolves the group with no dialog… | REQ-6 | journey | DELETE, order read from the daemon |
| ⋯ → Stop all… confirms with the count, stops every member… | REQ-7, I3 | journey | the batch end |
| a header shows the member count and one state item per state present in attention order, an ended member counts under a neutral ended dot | REQ-16, E8 | **property** | the summary for a set of states — `groups-summary` |
| a state change in a collapsed {manual, attention}-sorted group changes its summary and moves no section… (×2) | REQ-16, I8, E8 | journey | hooks change a member |
| hovering a header shows a tooltip naming the group, its session count, each state present and each member's title under its state | REQ-16, E9 | **property** | the popover for a snapshot |
| the popover of an empty group says empty | REQ-4, REQ-16, E9 | **property** | same |
| keyboard focus reaching a header's caret shows the same popover | REQ-16 | **property** | real Tab presses, client-side |
| attention sort keeps every section in its place while cards sort inside each section, with a pinned block per section | REQ-18, REQ-23, E8 | journey | the sort toggle is a prefs PUT and the test toggles back; the oracle is the daemon's order (borderline, below) |
| dropping a card on a group header moves it to the end of that section and the move survives a reload | REQ-9, REQ-23, E5 | journey | a drop that moves |
| dropping a card among another section's cards places it directly before the target… | REQ-9, REQ-23, E5 | journey | same |
| dropping a grouped card on the Ungrouped header leaves its group | REQ-9, E5 | journey | same |
| cards and headers are both draggable in attention sort | REQ-25, E10 | **property** | attributes under the attention pref — `groups-titled-attention` |
| dragging a group header above another section, and the Ungrouped header above a group, reorders the sections in {manual, attention} sort and the order survives a reload (×2) | REQ-8, REQ-25, E10 | journey | order PUT and reload |
| dropping a header onto a card and a card onto the rail head or the filter row send no request and change no order | REQ-25, E11 | **property** | the drops send nothing; request log plus DOM order |
| a drag, a collapse and a section reorder survive a reload and then a daemon restart… | REQ-8, REQ-20, E6 | journey | persistence |
| the filter offers All, Groups and Ungrouped, the count reads n of m while it hides cards, and it resets to All on reload | REQ-17, E22 | **property** | the filter is window state; the reload re-reads the same snapshot |
| with the daemon down an open menu closes and every group control is disabled… | REQ-21, E24 | journey | kill and restart |
| the Delete group dialog closes when the daemon goes down | REQ-5, E24 | journey | kill |
| a group created, renamed, collapsed, given a member and deleted in one window appears so in a second window | REQ-21, edge 7, E25 | journey | two windows on one daemon |
| a group deleted and another renamed through the API appear in the open dashboard on the groups broadcast | REQ-21 | journey | API then broadcast |
| the filter segment, the caret and the Select toggle keep focus and the same node across a render tick after a real key | REQ-3, REQ-12, REQ-17 | journey | the caret's Enter is a collapse PUT (borderline, below) |
| the rail ⋯ and header ⋯ buttons open their menus from the keyboard, the opener stays the same node and the menu survives a render tick | REQ-1, REQ-3 | **property** | menus are client-side |
| a group header's ⋯ menu offers the full item list while the Ungrouped header offers no Rename, Ungroup or Delete group… | REQ-2, REQ-5, REQ-6 | **property** | menu items for a snapshot |
| a rename's daemon answer closes only the field it committed… | REQ-2, edge 12 | journey | a held response |
| a new group's daemon answer closes only the pending field it committed… | REQ-1, REQ-2, W11 | journey | a held response |

Deliberate differences: the "creates nothing" / "send nothing" claims read the daemon's group
list in E2E; the render ports assert the request log (`trackMutations`) is empty of the write and
the display unchanged, which falsifies the same claim without a daemon. The draggable test takes
the attention sort from the fixture's pref and asserts the sort select reads `attention` rather
than choosing it. The empty-sections test asserts its three conditions at once from
`groups-summary` (an empty group, an empty Ungrouped, a group with members showing no line)
rather than before and after a move. The keyboard-popover test reaches the first section's caret,
which is `Mixed` in `groups-summary`. The ended dot's token is read with `tokenColor` (a probe's
`color`), the same `rgb()` string the E2E `resolvedCssVar(…, "background-color")` produced.

## `groups-select.spec.ts` — 22 tests → 12 E2E, 10 render, 0 vitest

| Test | Criteria | Level | Reason |
|---|---|---|---|
| in attention sort Select shows a checkbox per card and per header and the bar's buttons follow the selection | REQ-12, E12 | **property** | affordances for a snapshot under the attention pref |
| in manual sort a selected card in select mode is draggable and an unselected one is not, the pin control is hidden, and dragging an unselected card moves nothing | REQ-12, REQ-24, E12 | **property** | attributes; the drags send nothing |
| a selected card carries the selected class and its ground is the --bg-hover token | REQ-12 | **property** | token colour |
| in select mode a card click toggles instead of focusing, the mainhead keeps its session, and a header checkbox selects all its members | REQ-12, E13 | **property** | selection is window state |
| ⋯ → Select all (n) on a header turns on select mode with that group's members selected | REQ-12 | **property** | same |
| Move to lists the groups, New group… and Ungrouped, and choosing a group moves the selection to the end of it | REQ-13, E14 | journey | `PUT /api/sessions/group` |
| Move to → New group… asks for a name in a small modal and creates the group with the selection in it | REQ-1, REQ-13 | journey | POST (the Cancel half is display; borderline, below) |
| the Ungroup button and Move to → Ungrouped take the selection out of its groups | REQ-12, REQ-13 | journey | PUT |
| Stop… states the count, Stop N ends exactly the selection in one batch… | REQ-13, REQ-22, I3, E14 | journey | the batch end |
| Remove… states how many are live and will be stopped first, Remove N removes the selection in one batch… | REQ-13, REQ-22, I3, E14 | journey | the batch remove |
| Remove… over ended sessions only says a removed session cannot be resumed, with no live count | REQ-13 | journey | the confirm removes (borderline, below) |
| a selection of one reads in the singular: Stop 1 session? with Stop 1, and Remove 1 session? with Remove 1 | REQ-13 | **property** | dialog copy for a selection, cancelled |
| Cancel and Escape in a bulk dialog close it without a request, leaving the selection and select mode as they were | REQ-12, REQ-13 | **property** | nothing sent |
| {Escape, Done} leaves select mode with no checkbox and nothing selected (×2) | REQ-12, E16 | **property** | window state |
| switching to Tiles leaves select mode, the Tiles strip shows no header, section or checkbox, and coming back shows no checkbox | REQ-12, I7, E16 | journey | the view switch is adopted only from the prefs broadcast |
| a bulk Remove where one selected session is already gone reports the partial result… | REQ-27, edge 8 | journey | a partial batch |
| a card checkbox, a header checkbox and the All button keep focus and the same node across a render tick after a real key | REQ-12 | **property** | real keys; the tick is the page's own interval under the installed clock |
| with the daemon down in select mode every bar button and both kinds of checkbox are disabled… | REQ-12, REQ-21, E24 | journey | kill and restart |
| Escape leaves select mode while the daemon is down… | REQ-12, E16, E24 | journey | kill |

Deliberate differences: E12 iterates the fixture's four cards and three header checkboxes
(`Alpha`, `Bravo`, `Ungrouped`) where the journey had three cards and two headers; the
Cancel-and-Escape test and the tick test read `4 selected` after All, the fixture's count, where
the journeys read 2; the manual-drag test proves the dragged card is still in its group and the
selected one still loose from the section card ids rather than `GET /api/state`.

## `groups-focus.spec.ts` — 29 tests → 7 E2E, 22 render, 0 vitest

| Test | Criteria | Level | Reason |
|---|---|---|---|
| the Focus header shows the focused session's group between the name and the repo readout, and no group for an ungrouped one | REQ-10 | **property** | the control's place, name and tokens; focus is a card click |
| the Focus header's control opens Move to with the groups, New group… and No group, and choosing a group moves the focused session… | REQ-10, flow 8 | journey | PUT |
| New group… in the Focus header's menu names a group that the focused session joins | REQ-1, REQ-10 | journey | POST |
| the Focus header's group control keeps its node and its open menu across a render tick when opened from the keyboard | REQ-10 | **property** | menu is client-side |
| at a header width of {1140, 724, 600, 500}px the Focus header's group control is {present, absent}, the title keeps its 6rem floor and the repo block stays present at its 8-character floor or wider (×4) | REQ-10, E27 | **property** | layout at a width — `groups-focus-header` |
| at a header width of {…}px a folder within the repo block's floor reads whole beside the group control… (×4) | REQ-10, E27 | **property** | same, the `muster` checkout |
| with a header content box of {640, 639}px the Focus header's group control is {present, absent} (×2) | REQ-10, E27 | **property** | the container rule's edge |
| sweeping the header width from 900px down to 480px and back… (×2) | REQ-10, E27 | **property** | the same invariants swept |
| ⌥⌘1 and ⌥⌘2 count the cards as displayed in {manual, attention} sort, skipping a collapsed section (×2) | REQ-19, I5, E20 | **property** | chords are client-side; the collapsed section and the sort come from `groups-titled-collapsed{,-attention}` |
| with the filter on Groups ⌥⌘1 focuses the first grouped card and the chords never reach a filtered-out card | REQ-17, REQ-19, I5, E20 | **property** | filter and chords are window state |
| ⌥⌘0 with the neediest session in a collapsed section expands that section and focuses the session | REQ-19, E21 | journey | the expand is a PUT and the daemon's `collapsed` is the oracle |
| ⌥⌘0 onto a grouped needs-input session while the filter is Ungrouped flips the filter to All | I4, E22 | **property** | `groups-needs-input` |
| a page load lands default focus on the first displayed card when the first section is collapsed | focus Doc Delta | **property** | the default focus for a snapshot |
| ⌥⌘1 and ⌥⌘0 change nothing while {the Delete group dialog, the New group from selection modal, a bulk Remove dialog} is open (×3) | edge 17, E26 | **property** | dialogs open without a request; nothing sent |
| ⌥⌘G in Focus opens a new group in the rail with a focused name field that Enter keeps, and ⌘G or ⌥⇧⌘G alone do nothing | REQ-1, W11 | journey | Enter commits through POST |
| ⌥⌘G is inert in Tiles: no name field appears, nothing is created, and Focus shows no pending group on return | REQ-1, W11 | journey | the view switch is adopted only from the prefs broadcast |
| Tiles renders the grid and the strip in the flat {manual, attention} order with no header, section or checkbox, with groups present, one collapsed and the filter set (×2) | REQ-21, I7, E23 | journey | view switch, order PUT, sort pref; the filter is set in Focus before the switch |

Deliberate differences: the header-width tests draw both checkouts (`muster-app`, `muster`) from
one fixture (`groups-focus-header`), pick the card by its folder line (`railCardByFolder`: the two
sessions share the 65-character title) and read the group name `Wide control` from the fixture
where the journeys named `Wide control`, `Boundary` and `Swept`; the 640/639 boundary tests use
the `muster-app` session (long title, a checkout) where the journey launched a plain `e27b-one`, a
stricter header for the same rule. The two floor oracles (`titleFloorAndReadoutProblems`,
`titleAndRepoFloorProblems`) moved from the spec into the render helper unchanged. The chord
tests take the collapsed first section (`Alpha`) from `groups-titled-collapsed{,-attention}`
rather than clicking its caret, and assert the sort select reads the fixture's pref; the filter
chord test runs on `groups-titled`. The default-focus test asserts the page load itself, where the
journey reloaded after a PUT. The flip and inert tests run on `groups-needs-input` (`hidden-one`
needs input in the one group `Hidden`, `loose-one` and `loose-two` ungrouped) where the journeys
named `e22z-*`/`e26-*` and had two groups: the inert tests open the Delete dialog on `Hidden` and
the bulk Remove over all 3, and ⌥⌘1 and ⌥⌘0 would each reach `hidden-one`, so a chord that acted
would still move the focus. The group-control and keyboard-menu tests run on `groups-titled`
(`alpha-one` in `Alpha`, `loose-one` ungrouped) where the journeys made `Alpha`/`Header tick`.

## `groups-launch.spec.ts` — 13 tests → 8 E2E, 5 render, 0 vitest

| Test | Criteria | Level | Reason |
|---|---|---|---|
| the launch dialog's Group row defaults to the focused session's group and lists No group, each group and New group… | REQ-11, E17 | **property** | the row for a snapshot and a focused card |
| the Resume tab carries the same Group row with the same default | REQ-11, past-sessions, E17 | **property** | same, on the other tab |
| a launch dialog opened from Tiles defaults the Group row to the focused session's group | edge 27, E17 | journey | the view switch is adopted only from the prefs broadcast |
| choosing New group…, naming it and launching creates the group and the session together… | REQ-1, REQ-11, E18 | journey | a launch |
| a refused launch with New group… creates neither the group nor the session, and a retry creates exactly one of each | REQ-11, edge 11, E18 | journey | a launch refused and retried |
| a session launched into an existing group lands at the end of that section, after its pinned block | REQ-11, REQ-23, E18 | journey | a launch |
| choosing No group while a grouped session is focused launches into Ungrouped and creates no group | REQ-11 | journey | a launch |
| a session resumed from the Resume tab joins the group chosen there | REQ-11, past-sessions | journey | a resume |
| a group deleted while the dialog still shows it selected is refused as unknown group… | REQ-11, edge 28, E19 | journey | a held `groups` frame and a refused launch |
| launching an ungrouped session while the filter is Groups flips the filter to All… | I4, E22 | journey | a launch |
| the {New, Resume} tab's Group select keeps focus, the same node and its choice across a render tick after typeahead (×2) | REQ-11 | **property** | a real key on a client-side select |
| the New group… name field keeps focus, its node and what was typed across a render tick | REQ-11 | **property** | same |

Deliberate differences: in the render tier `GET /api/browse` answers 404 by design, so the
dialog shows its browse error beside the Group row under test; the row never depended on the
listing, and the Resume tab's list meets the same 404 without touching the row. Every port runs
on `groups-titled`. The typeahead tests click `alpha-one` first (the journey relied on the sole
session's default focus) and press `B` (Bravo from the default Alpha) where the journey pressed
`Y` (Yarrow from Zed); the claim — one key picks the option and the node, focus and choice
survive the tick — is unchanged. The name-field tick test opens the dialog over the fixture's two
groups where the journey created one empty `Existing`. The Resume tab locators (`newTab`,
`resumeTab`) moved from `web/e2e/helpers/resume.ts` to `web/render/helpers/shortcuts.ts`, beside
the dialog locator, and the E2E helper re-exports them.

## Scenarios added

All in `internal/server/renderfix_scenarios_groups.go`, appended in `init`.

| Scenario | Holds | Used by |
|---|---|---|
| `groups-titled` | Alpha [alpha-one, alpha-two], Bravo [bravo-one], Ungrouped [loose-one]; every session titled and `started` (launched, no hook, as the E2E `launchTitled` leaves them); manual sort | the rename editor, header CSS, Delete dialog cancel, no-op drops, filter, keyboard menus, header menu items, select mode (manual) |
| `groups-titled-attention` | the same under `railSort: attention` (`withPrefs`, the real PUT) | draggable in attention sort; E12 |
| `groups-summary` | Mixed [e8-need needs_input, e8-fail failed, e8-new started, e8-work1 and e8-work2 working, e8-idle idle, e8-dead ended]; Hover me [e9-need, e9-work, e9-new]; Void (empty); Ungrouped empty | the summary (E8), the hover and keyboard popovers (E9), the empty popover, the empty-section lines |
| `groups-titled-collapsed` | `groups-titled` with Alpha collapsed through the real `PUT /api/groups/{id}` `{"collapsed": true}`; manual sort | ⌥⌘1/⌥⌘2 over a collapsed section in manual sort (E20), the page load's default focus |
| `groups-titled-collapsed-attention` | the same under `railSort: attention` | ⌥⌘1/⌥⌘2 over a collapsed section in attention sort (E20) |
| `groups-needs-input` | Hidden [hidden-one needs_input]; Ungrouped [loose-one, loose-two], both `started` | ⌥⌘0's filter flip (E22), the chords inert under each dialog (E26) |
| `groups-focus-header` | Wide control [two sessions under the 65-character fit title, `started`, in checkouts `muster-app`/main and `muster`/main]; no ungrouped session | the Focus header's group control at the four widths, the 640/639 content-box edge and the 900→480→900 sweeps (E27) |

The rig gained `createGroup`, `launchTitled`, `bindTitled` and `driveToState` (the E2E helper's
walk: a turn, then the closing event, stamped so the fixture's timestamps are distinct) in the
first pass, and `driveGroupsNeedsInput` and `driveGroupsFocusHeader` in the second. Existing
fixtures are byte-identical across both passes (`make check-render-fixtures`: up to date).

## Deleted Tests

| File | Test | Covered | Now lives in |
|---|---|---|---|
| `groups.spec.ts` | Escape in the new-group textbox discards the pending section and creates nothing (REQ-1, E2) | pending section discarded, nothing created | `web/render/groups.spec.ts`, same title |
| `groups.spec.ts` | Enter on an empty / a whitespace-only name discards the pending section and creates nothing (REQ-1, E2) ×2 | same on Enter | same titles |
| `groups.spec.ts` | tabbing out of the new-group textbox discards the pending section and creates nothing (REQ-1, UI Specifications New group) | same on blur | same title |
| `groups.spec.ts` | Escape while editing a name, and a whitespace-only name on Enter, each restore the old name and send nothing (REQ-2, E3, edge case 12) | the rename editor's discard paths | same title |
| `groups.spec.ts` | a header's name is uppercased by CSS while its text stays the raw name, and the header is sticky (REQ-2, UI Specifications Sections) | `text-transform`, `position: sticky` | same title |
| `groups.spec.ts` | a group made empty shows the drop line, and an Ungrouped section whose sessions all moved says no ungrouped sessions (REQ-4, REQ-15) | both empty lines, 0 counts, no line on a filled group | same title |
| `groups.spec.ts` | Cancel and Escape in the Delete group dialog leave the group and its members as they were (REQ-5) | no DELETE, members unchanged | same title |
| `groups.spec.ts` | a header shows the member count and one state item per state present in attention order, an ended member counts under a neutral ended dot (REQ-16, E8) | count, dot order, numbers, titles, the ended token | same title |
| `groups.spec.ts` | hovering a header shows a tooltip naming the group, its session count, each state present and each member's title under its state (REQ-16, E9) | popover rows, `pointer-events`, leave and pointerdown dismiss | same title |
| `groups.spec.ts` | the popover of an empty group says empty (REQ-4, REQ-16, E9) | empty popover | same title |
| `groups.spec.ts` | keyboard focus reaching a header's caret shows the same popover (REQ-16, UI Specifications Popover) | Tab to the caret opens it, Tab away closes it | same title |
| `groups.spec.ts` | cards and headers are both draggable in attention sort (REQ-25, E10, plan rail-card-organise REQ-12, REQ-19) | `draggable` attributes | same title |
| `groups.spec.ts` | dropping a header onto a card and a card onto the rail head or the filter row send no request and change no order (REQ-25, E11) | no-op drops | same title |
| `groups.spec.ts` | the filter offers All, Groups and Ungrouped, the count reads n of m while it hides cards, and it resets to All on reload (REQ-17, E22) | filter buttons, `n of m`, hidden cards, reload reset | same title |
| `groups.spec.ts` | the rail ⋯ and header ⋯ buttons open their menus from the keyboard, the opener stays the same node and the menu survives a render tick (REQ-1, REQ-3) | keyboard menus across a tick | same title |
| `groups.spec.ts` | a group header's ⋯ menu offers the full item list while the Ungrouped header offers no Rename, Ungroup or Delete group… (REQ-2, REQ-5, REQ-6, UI Specifications Header menu) | both menus' items | same title |
| `groups-select.spec.ts` | in attention sort Select shows a checkbox per card and per header and the bar's buttons follow the selection (REQ-12, E12) | checkboxes, pin hidden, bar enablement | same title |
| `groups-select.spec.ts` | in manual sort a selected card in select mode is draggable and an unselected one is not, the pin control is hidden, and dragging an unselected card moves nothing (REQ-12, REQ-24, E12, plan rail-card-organise REQ-15) | `draggable` per selection, no-op drags, Done restores | same title |
| `groups-select.spec.ts` | a selected card carries the selected class and its ground is the --bg-hover token (REQ-12, UI Specifications Select mode) | class and token | same title |
| `groups-select.spec.ts` | in select mode a card click toggles instead of focusing, the mainhead keeps its session, and a header checkbox selects all its members (REQ-12, E13) | click toggles, mainhead kept, header checkbox | same title |
| `groups-select.spec.ts` | ⋯ → Select all (n) on a header turns on select mode with that group's members selected (REQ-12) | Select all from the menu | same title |
| `groups-select.spec.ts` | a selection of one reads in the singular: Stop 1 session? with Stop 1, and Remove 1 session? with Remove 1 (REQ-13) | singular dialog copy | same title |
| `groups-select.spec.ts` | Cancel and Escape in a bulk dialog close it without a request, leaving the selection and select mode as they were (REQ-12, REQ-13) | no request, mode and selection kept | same title |
| `groups-select.spec.ts` | Escape / Done leaves select mode with no checkbox and nothing selected (REQ-12, E16) ×2 | leaving the mode | same titles |
| `groups-select.spec.ts` | a card checkbox, a header checkbox and the All button keep focus and the same node across a render tick after a real key (REQ-12) | tick survival | same title |
| `groups-focus.spec.ts` | the Focus header shows the focused session's group between the name and the repo readout, and no group for an ungrouped one (REQ-10) | role, name, title, DOM place, border and colour tokens, `no group` | `web/render/groups.spec.ts`, same title |
| `groups-focus.spec.ts` | the Focus header's group control keeps its node and its open menu across a render tick when opened from the keyboard (REQ-10) | menu across a tick | same title |
| `groups-focus.spec.ts` | at a header width of {1140,724,600,500}px the Focus header's group control is present/absent, the title keeps its 6rem floor and the repo block stays present at its 8-character floor or wider (REQ-10, E27) ×4 | presence, title floor, repo floor, `mainheadFitProblems` | same titles |
| `groups-focus.spec.ts` | at a header width of {1140,724,600,500}px a folder within the repo block's floor reads whole beside the group control, which is present/absent, under a long title (REQ-10, E27) ×4 | same with `muster /` whole | same titles |
| `groups-focus.spec.ts` | with a header content box of 640/639px the Focus header's group control is present/absent (REQ-10, E27) ×2 | the container rule's edge, stable across a tick | same titles |
| `groups-focus.spec.ts` | sweeping the header width from 900px down to 480px and back… (REQ-10, E27) ×2 | the invariants at every 20 px step, down and back | same titles |
| `groups-focus.spec.ts` | ⌥⌘1 and ⌥⌘2 count the cards as displayed in manual/attention sort, skipping a collapsed section (REQ-19, I5, E20) ×2 | chords index displayed cards | same titles |
| `groups-focus.spec.ts` | with the filter on Groups ⌥⌘1 focuses the first grouped card and the chords never reach a filtered-out card (REQ-17, REQ-19, I5, E20) | chords under the filter | same title |
| `groups-focus.spec.ts` | ⌥⌘0 onto a grouped needs-input session while the filter is Ungrouped flips the filter to All (I4, E22) | filter flip on ⌥⌘0 | same title |
| `groups-focus.spec.ts` | a page load lands default focus on the first displayed card when the first section is collapsed (focus Doc Delta) | default focus | same title |
| `groups-focus.spec.ts` | ⌥⌘1 and ⌥⌘0 change nothing while {the Delete group dialog, the New group from selection modal, a bulk Remove dialog} is open (edge case 17, E26) ×3 | chords inert under a dialog, nothing sent | same titles |
| `groups-launch.spec.ts` | the launch dialog's Group row defaults to the focused session's group and lists No group, each group and New group… (REQ-11, E17) | default, options, name field, row order | same title |
| `groups-launch.spec.ts` | the Resume tab carries the same Group row with the same default (REQ-11, past-sessions, E17) | the row on both tabs | same title |
| `groups-launch.spec.ts` | the New / Resume tab's Group select keeps focus, the same node and its choice across a render tick after typeahead (REQ-11) ×2 | tick survival with a choice | same titles |
| `groups-launch.spec.ts` | the New group… name field keeps focus, its node and what was typed across a render tick (REQ-11) | tick survival with typed text | same title |

## Borderline, left in place

- `groups.spec.ts` "clicking a header, its caret and ⋯ → Collapse each toggle the section, and a
  collapsed section shows only its header" (REQ-3): the collapsed display (header class, body
  hidden, caret name) is a property `groups-titled-collapsed` could show, but every toggle in the
  test is a PUT the dashboard adopts from the broadcast. Kept whole.
- `groups.spec.ts` "deleting the last group removes the Ungrouped header and the filter, and the
  dialog's Target group select is absent with no other group": the dialog's missing select is
  display; the rest is the DELETE. Kept whole.
- `groups.spec.ts` "the filter segment, the caret and the Select toggle keep focus and the same
  node across a render tick": the filter and Select halves are client-side, the caret's Enter is a
  collapse PUT whose `aria-expanded` follows the broadcast. Kept whole rather than split.
- `groups.spec.ts` "attention sort keeps every section in its place while cards sort inside each
  section": a property of an attention-sorted snapshot with states and a pin, but the test
  switches the sort both ways (prefs PUTs) and reads the daemon's order. Kept.
- `groups-select.spec.ts` "Move to → New group… asks for a name in a small modal and creates the
  group with the selection in it": the Cancel half is display, the Create half is a POST. Kept.
- `groups-select.spec.ts` "Remove… over ended sessions only says a removed session cannot be
  resumed, with no live count": the copy is display, but the test confirms and asserts the empty
  rail. Kept whole.
- `groups-select.spec.ts` "switching to Tiles leaves select mode…", `groups-focus.spec.ts` "⌥⌘G is
  inert in Tiles…" and "Tiles renders the grid and the strip…" (×2), `groups-launch.spec.ts` "a
  launch dialog opened from Tiles…": every view switch is a prefs PUT the dashboard adopts only
  from the broadcast (`web/src/features/views.ts`). A `view: tiles` fixture could hold the
  grid-and-strip display, but not "the filter set", which is clicked in Focus before the switch.
- `groups-focus.spec.ts` "⌥⌘0 with the neediest session in a collapsed section expands that
  section and focuses the session": the expand is a PUT and the daemon's `collapsed` is the oracle.

## Notes

- No implementation bug found: every port passed against the current bundle on its first run.
- The render tier answers `GET /api/browse` with 404, so the launch dialog's tests run with the
  dialog's browse error shown; the Group row is independent of the listing and the assertions are
  unchanged. A render scenario cannot supply a browse listing (the harness mocks `/api/repos`
  alone), so a port of the picker itself would need a harness change.
- `groups-summary` has no `planning` member, as the E2E test had none (the ingest helper walks no
  session there).
- `make gen-render-fixtures` grew from 14 to 21 scenarios in the first pass; a full generation
  measured 22.5 s wall on this machine (every launch and every stamped post waits for a fresh
  second, scenarios run in parallel), which `make check` pays in `check-render-fixtures`. The
  second pass added four more (38 on the branch in all); a full generation measured 49 s wall
  under a load average of 13.
- Second pass gates: `make render-test` 184 passed, `make web-test` 2843 passed,
  `make e2e SPECS='e2e/groups-focus.spec.ts e2e/groups-launch.spec.ts'` 15 passed, e2e-lint and
  render-lint clean, `check-render-fixtures` up to date, `check-kb` 0 problems. `make check`
  stopped at `make lint`: a govet shadow at `internal/server/renderfix.go:356` (`err` in the
  launch step's `json.Unmarshal`), from the branch's earlier rig commit, not from this port; the
  file is untouched here. Under the same load two `internal/server` wrapper-script tests
  (`TestWrapperReply_AnAnswerThatNeverComesPrintsNothing`, `TestWrapperScriptsShellRoundTrip`)
  timed out in the full `make test` and passed when run alone in 6.5 s.
- Nothing in the second pass was unportable: every property row of both files moved. The
  render spec carries the four files' sections in one file (`web/render/groups.spec.ts`), so the
  first of the two port commits lands the render side whole and the second trims the launch
  journeys alone.
