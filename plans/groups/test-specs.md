# E2E Test Specs: Rail groups

**Plan**: groups
**Mode**: fix (attempt 1, review cycle 1)
**Pack**: kb: pack 48300 words (budget 20000)
**Verdict**: pass
**Tests created**: 110 (99 at authoring, 5 added at validate, 6 added at fix attempt 1)
**Live run**: 713/713 passing in the full suite (`make e2e`, 5.0m); the three spec files changed by fix attempt 1 soaked x10 green (groups-focus 290 passed, groups-select 220 passed, groups 460 passed)

## Tests

Authoring note, kept for history: every row was `collection-only` then. The plan is `new-specs` with no unchanged-behaviour requirement. The one candidate pin, the Tiles-inert chord test, was run against the current tree and went red on the new `groups` key of `GET /api/state`, so it is new behaviour:

```
Expected: []   Received: undefined   (groups-focus.spec.ts, state.groups after the chord in Tiles)
1 failed
```

Collection: `npx playwright test --list` reports `Total: 702 tests in 49 files` with no error. `sh scripts/e2e-lint.sh` reports `e2e-lint: clean`. `npx tsc --noEmit -p .` is clean, and it type-checks `e2e/`.

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/groups-focus.spec.ts | the Focus header shows the focused session's group between the name and the repo readout, and no group for an ungrouped one | REQ-10 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10 of the whole file: 270 passed (2.7m) |
| web/e2e/groups-focus.spec.ts | the Focus header's control opens Move to with the groups, New group… and No group, and choosing a group moves the focused session to the end of it | REQ-10, flow 8 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10 of the whole file: 270 passed (2.7m) |
| web/e2e/groups-focus.spec.ts | New group… in the Focus header's menu names a group that the focused session joins | REQ-1, REQ-10 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10 of the whole file: 270 passed (2.7m) |
| web/e2e/groups-focus.spec.ts | the Focus header's group control keeps its node and its open menu across a render tick when opened from the keyboard | REQ-10 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10 of the whole file: 270 passed (2.7m) |
| web/e2e/groups-focus.spec.ts | at a header width of 1140px the Focus header's group control is present, the title keeps its 6rem floor and the repo block stays present at its 8-character floor or wider | REQ-10, E27 | with a 12-character folder: the control, the 6rem title floor, and the repo block present and at least 8 characters wide (REQ-10 and E27 as amended 2026-10-05) | ran-green — attempt 2: 270 passed in the groups-focus soak x10, 707 passed in `make e2e` |
| web/e2e/groups-focus.spec.ts | at a header width of 724px the Focus header's group control is present, the title keeps its 6rem floor and the repo block stays present at its 8-character floor or wider | REQ-10, E27 | with a 12-character folder: the control, the 6rem title floor, and the repo block present and at least 8 characters wide (REQ-10 and E27 as amended 2026-10-05) | ran-green — attempt 2: 270 passed in the groups-focus soak x10, 707 passed in `make e2e` |
| web/e2e/groups-focus.spec.ts | at a header width of 600px the Focus header's group control is absent, the title keeps its 6rem floor and the repo block stays present at its 8-character floor or wider | REQ-10, E27 | with a 12-character folder: the control, the 6rem title floor, and the repo block present and at least 8 characters wide (REQ-10 and E27 as amended 2026-10-05) | ran-green — attempt 2: 270 passed in the groups-focus soak x10, 707 passed in `make e2e` |
| web/e2e/groups-focus.spec.ts | at a header width of 500px the Focus header's group control is absent, the title keeps its 6rem floor and the repo block stays present at its 8-character floor or wider | REQ-10, E27 | with a 12-character folder: the control, the 6rem title floor, and the repo block present and at least 8 characters wide (REQ-10 and E27 as amended 2026-10-05) | ran-green — attempt 2: 270 passed in the groups-focus soak x10, 707 passed in `make e2e` |
| web/e2e/groups-focus.spec.ts | sweeping the header width from 900px down to 480px and back, the group control is present exactly while the header is wide, and the title floor and the repo block's 8-character floor hold at every step | REQ-10, E27 | with a 12-character folder: the control, the 6rem title floor, and the repo block present and at least 8 characters wide (REQ-10 and E27 as amended 2026-10-05) | ran-green — attempt 2: 270 passed in the groups-focus soak x10, 707 passed in `make e2e` |
| web/e2e/groups-focus.spec.ts | at a header width of 1140px a folder within the repo block's floor reads whole beside the group control, which is present, under a long title | REQ-10, E27 | the control, the 6rem title floor and the 8-character repo floor hold under a long title | ran-green — soak x10: 270 passed (2.7m) |
| web/e2e/groups-focus.spec.ts | at a header width of 724px a folder within the repo block's floor reads whole beside the group control, which is present, under a long title | REQ-10, E27 | the control, the 6rem title floor and the 8-character repo floor hold under a long title | ran-green — soak x10: 270 passed (2.7m) |
| web/e2e/groups-focus.spec.ts | at a header width of 600px a folder within the repo block's floor reads whole beside the group control, which is absent, under a long title | REQ-10, E27 | the control, the 6rem title floor and the 8-character repo floor hold under a long title | ran-green — soak x10: 270 passed (2.7m) |
| web/e2e/groups-focus.spec.ts | at a header width of 500px a folder within the repo block's floor reads whole beside the group control, which is absent, under a long title | REQ-10, E27 | the control, the 6rem title floor and the 8-character repo floor hold under a long title | ran-green — soak x10: 270 passed (2.7m) |
| web/e2e/groups-focus.spec.ts | sweeping the header width from 900px down to 480px and back, a folder within the repo block's floor reads whole at every step beside a group control present exactly while the header is wide | REQ-10, E27 | the same sweep with a folder that fits the floor | ran-green — soak x10: 270 passed (2.7m) |
| web/e2e/groups-focus.spec.ts | ⌥⌘1 and ⌥⌘2 count the cards as displayed in manual sort, skipping a collapsed section | REQ-19, I5, E20 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10 of the whole file: 270 passed (2.7m) |
| web/e2e/groups-focus.spec.ts | ⌥⌘1 and ⌥⌘2 count the cards as displayed in attention sort, skipping a collapsed section | REQ-19, I5, E20 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10 of the whole file: 270 passed (2.7m) |
| web/e2e/groups-focus.spec.ts | with the filter on Groups ⌥⌘1 focuses the first grouped card and the chords never reach a filtered-out card | REQ-17, REQ-19, I5, E20 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10 of the whole file: 270 passed (2.7m) |
| web/e2e/groups-focus.spec.ts | ⌥⌘0 with the neediest session in a collapsed section expands that section and focuses the session | REQ-19, E21 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10 of the whole file: 270 passed (2.7m) |
| web/e2e/groups-focus.spec.ts | ⌥⌘0 onto a grouped needs-input session while the filter is Ungrouped flips the filter to All | I4, E22 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10 of the whole file: 270 passed (2.7m) |
| web/e2e/groups-focus.spec.ts | a page load lands default focus on the first displayed card when the first section is collapsed | focus Doc Delta | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10 of the whole file: 270 passed (2.7m) |
| web/e2e/groups-focus.spec.ts | ⌥⌘1 and ⌥⌘0 change nothing while the Delete group dialog is open | edge case 17, E26 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10 of the whole file: 270 passed (2.7m) |
| web/e2e/groups-focus.spec.ts | ⌥⌘1 and ⌥⌘0 change nothing while the New group from selection modal is open | edge case 17, E26 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10 of the whole file: 270 passed (2.7m) |
| web/e2e/groups-focus.spec.ts | ⌥⌘1 and ⌥⌘0 change nothing while a bulk Remove dialog is open | edge case 17, E26 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10 of the whole file: 270 passed (2.7m) |
| web/e2e/groups-focus.spec.ts | ⌥⌘G in Focus opens a new group in the rail with a focused name field that Enter keeps, and ⌘G or ⌥⇧⌘G alone do nothing | REQ-1, W11 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10 of the whole file: 270 passed (2.7m) |
| web/e2e/groups-focus.spec.ts | ⌥⌘G is inert in Tiles: no name field appears, nothing is created, and Focus shows no pending group on return | REQ-1, W11 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10 of the whole file: 270 passed (2.7m) |
| web/e2e/groups-focus.spec.ts | Tiles renders the grid and the strip in the flat manual order with no header, section or checkbox, with groups present, one collapsed and the filter set | REQ-21, I7, E23 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10 of the whole file: 270 passed (2.7m) |
| web/e2e/groups-focus.spec.ts | Tiles renders the grid and the strip in the flat attention order with no header, section or checkbox, with groups present, one collapsed and the filter set | REQ-21, I7, E23 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10 of the whole file: 270 passed (2.7m) |
| web/e2e/groups-launch.spec.ts | the launch dialog's Group row defaults to the focused session's group and lists No group, each group and New group… | REQ-11, E17 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 130 passed (1.5m) |
| web/e2e/groups-launch.spec.ts | the Resume tab carries the same Group row with the same default | REQ-11, past-sessions, E17 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 130 passed (1.5m) |
| web/e2e/groups-launch.spec.ts | a launch dialog opened from Tiles defaults the Group row to the focused session's group | edge case 27, E17 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 130 passed (1.5m) |
| web/e2e/groups-launch.spec.ts | choosing New group…, naming it and launching creates the group and the session together, and the new card is its only member and is focused | REQ-1, REQ-11, E18 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 130 passed (1.5m) |
| web/e2e/groups-launch.spec.ts | a refused launch with New group… creates neither the group nor the session, and a retry creates exactly one of each | REQ-11, edge case 11, E18 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 130 passed (1.5m) |
| web/e2e/groups-launch.spec.ts | a session launched into an existing group lands at the end of that section, after its pinned block | REQ-11, REQ-23, E18 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 130 passed (1.5m) |
| web/e2e/groups-launch.spec.ts | choosing No group while a grouped session is focused launches into Ungrouped and creates no group | REQ-11 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 130 passed (1.5m) |
| web/e2e/groups-launch.spec.ts | a session resumed from the Resume tab joins the group chosen there | REQ-11, past-sessions | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 130 passed (1.5m) |
| web/e2e/groups-launch.spec.ts | a group deleted while the dialog still shows it selected is refused as unknown group in the launch error, launches nothing, and the select drops it on the next render | REQ-11, edge case 28, E19 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 130 passed (1.5m) |
| web/e2e/groups-launch.spec.ts | launching an ungrouped session while the filter is Groups flips the filter to All, shows the plain total and focuses the new card | I4, E22 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 130 passed (1.5m) |
| web/e2e/groups-launch.spec.ts | the New tab's Group select keeps focus, the same node and its choice across a render tick after typeahead | REQ-11 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 130 passed (1.5m) |
| web/e2e/groups-launch.spec.ts | the Resume tab's Group select keeps focus, the same node and its choice across a render tick after typeahead | REQ-11 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 130 passed (1.5m) |
| web/e2e/groups-launch.spec.ts | the New group… name field keeps focus, its node and what was typed across a render tick | REQ-11 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 130 passed (1.5m) |
| web/e2e/groups-select.spec.ts | in attention sort Select shows a checkbox per card and per header and the bar's buttons follow the selection | REQ-12, E12 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 200 passed (1.9m) |
| web/e2e/groups-select.spec.ts | in manual sort a card in select mode has draggable false and the pin control hidden, and a drag moves nothing | REQ-12, REQ-24, E12 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 200 passed (1.9m) |
| web/e2e/groups-select.spec.ts | a selected card carries the selected class and its ground is the --bg-hover token | REQ-12, UI Specifications Select mode | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 200 passed (1.9m) |
| web/e2e/groups-select.spec.ts | in select mode a card click toggles instead of focusing, the mainhead keeps its session, and a header checkbox selects all its members | REQ-12, E13 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 200 passed (1.9m) |
| web/e2e/groups-select.spec.ts | ⋯ → Select all (n) on a header turns on select mode with that group's members selected | REQ-12 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 200 passed (1.9m) |
| web/e2e/groups-select.spec.ts | Move to lists the groups, New group… and Ungrouped, and choosing a group moves the selection to the end of it | REQ-13, E14 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 200 passed (1.9m) |
| web/e2e/groups-select.spec.ts | Move to → New group… asks for a name in a small modal and creates the group with the selection in it | REQ-1, REQ-13 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 200 passed (1.9m) |
| web/e2e/groups-select.spec.ts | the Ungroup button and Move to → Ungrouped take the selection out of its groups | REQ-12, REQ-13 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 200 passed (1.9m) |
| web/e2e/groups-select.spec.ts | Stop… states the count, Stop N ends exactly the selection in one batch and leaves every other session alive | REQ-13, REQ-22, I3, E14 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 200 passed (1.9m) |
| web/e2e/groups-select.spec.ts | Remove… states how many are live and will be stopped first, Remove N removes the selection in one batch and leaves every other session alone | REQ-13, REQ-22, I3, E14 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 200 passed (1.9m) |
| web/e2e/groups-select.spec.ts | Remove… over ended sessions only says a removed session cannot be resumed, with no live count | REQ-13 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 200 passed (1.9m) |
| web/e2e/groups-select.spec.ts | a selection of one reads in the singular: Stop 1 session? with Stop 1, and Remove 1 session? with Remove 1 | REQ-13 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 200 passed (1.9m) |
| web/e2e/groups-select.spec.ts | Cancel and Escape in a bulk dialog close it without a request, leaving the selection and select mode as they were | REQ-12, REQ-13 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 200 passed (1.9m) |
| web/e2e/groups-select.spec.ts | Select → All → Remove… with groups present removes every session, leaves the rail reading No sessions yet, the mainhead hidden and select mode off | REQ-14, #27, E15 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 200 passed (1.9m) |
| web/e2e/groups-select.spec.ts | Select → All → Remove… with no groups removes every session too | REQ-14, #27, E15 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 200 passed (1.9m) |
| web/e2e/groups-select.spec.ts | Escape leaves select mode with no checkbox and nothing selected | REQ-12, E16 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 200 passed (1.9m) |
| web/e2e/groups-select.spec.ts | Done leaves select mode with no checkbox and nothing selected | REQ-12, E16 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 200 passed (1.9m) |
| web/e2e/groups-select.spec.ts | switching to Tiles leaves select mode, the Tiles strip shows no header, section or checkbox, and coming back shows no checkbox | REQ-12, I7, E16 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 200 passed (1.9m) |
| web/e2e/groups-select.spec.ts | a bulk Remove where one selected session is already gone reports the partial result in the action-error line, and a complete batch shows nothing | REQ-27, edge case 8 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 200 passed (1.9m) |
| web/e2e/groups-select.spec.ts | a card checkbox, a header checkbox and the All button keep focus and the same node across a render tick after a real key | REQ-12 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 200 passed (1.9m) |
| web/e2e/groups.spec.ts | with no groups the rail is today's plus Select and ⋯, and Rail actions → New group… names the first group and brings the Ungrouped header and the filter | REQ-1, REQ-15, I6, E1 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | Escape in the new-group textbox discards the pending section and creates nothing | REQ-1, E2 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | Enter on an empty name discards the pending section and creates nothing | REQ-1, E2 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | Enter on a whitespace-only name discards the pending section and creates nothing | REQ-1, E2 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | tabbing out of the new-group textbox discards the pending section and creates nothing | REQ-1, UI Specifications New group | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | double-clicking a group's name edits it in place and the new name shows in the header, the popover, the launch dialog and the Focus header | REQ-2, E3 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | Escape while editing a name, and a whitespace-only name on Enter, each restore the old name and send nothing | REQ-2, E3, edge case 12 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | ⋯ → Rename opens the same in-place editor, and leaving the field commits a non-empty name | REQ-2 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | a header's name is uppercased by CSS while its text stays the raw name, and the header is sticky | REQ-2, UI Specifications Sections | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | clicking a header, its caret and ⋯ → Collapse each toggle the section, and a collapsed section shows only its header | REQ-3 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | Collapse all groups and Expand all groups from the rail menu toggle every section, Ungrouped included | REQ-3 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | deleting the last session of a group leaves the group with a 0 count, the drop line and a menu offering Rename and Delete group… | REQ-4, REQ-20, E4 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | a group made empty shows the drop line, and an Ungrouped section whose sessions all moved says no ungrouped sessions | REQ-4, REQ-15 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | Delete group… with Move them to Ungrouped (the default) keeps the members in Ungrouped in their order and states the count | REQ-5, E7 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | Delete group… with Move them to another group puts the members at the end of that group | REQ-5, E7 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | Delete group… with Stop and remove them removes every member, stops the live ones first and leaves another group's sessions alone | REQ-5, I3, E7 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | deleting the last group removes the Ungrouped header and the filter, and the dialog's Target group select is absent with no other group | REQ-5, REQ-15, I6, E7 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | Delete group… on an empty group says nothing else changes and removes it | REQ-4, REQ-5 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | Cancel and Escape in the Delete group dialog leave the group and its members as they were | REQ-5 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | ⋯ → Ungroup dissolves the group with no dialog and its sessions keep their relative order in Ungrouped | REQ-6 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | ⋯ → Stop all… confirms with the count, stops every member, keeps them in the group as ended and leaves another group's live sessions alone | REQ-7, I3 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | a header shows the member count and one state item per state present in attention order, an ended member counts under a neutral ended dot | REQ-16, E8 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | a state change in a collapsed manual-sorted group changes its summary and moves no section, and a repeated hook counts once | REQ-16, I8, E8 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | a state change in a collapsed attention-sorted group changes its summary and moves no section, and a repeated hook counts once | REQ-16, I8, E8 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | hovering a header shows a tooltip naming the group, its session count, each state present and each member's title under its state | REQ-16, E9 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | the popover of an empty group says empty | REQ-4, REQ-16, E9 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | keyboard focus reaching a header's caret shows the same popover | REQ-16, UI Specifications Popover | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | attention sort keeps every section in its place while cards sort inside each section, with a pinned block per section | REQ-18, REQ-23, E8 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | dropping a card on a group header moves it to the end of that section and the move survives a reload | REQ-9, REQ-23, E5 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | dropping a card among another section's cards places it directly before the target and it takes the target's pin state | REQ-9, REQ-23, E5 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | dropping a grouped card on the Ungrouped header leaves its group | REQ-9, E5 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | cards are not draggable in attention sort but a header still drags | REQ-25, E10 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | dragging a group header above another section, and the Ungrouped header above a group, reorders the sections in manual sort and the order survives a reload | REQ-8, REQ-25, E10 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | dragging a group header above another section, and the Ungrouped header above a group, reorders the sections in attention sort and the order survives a reload | REQ-8, REQ-25, E10 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | dropping a header onto a card and a card onto the rail head or the filter row send no request and change no order | REQ-25, E11 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | a drag, a collapse and a section reorder survive a reload and then a daemon restart with the same order, membership and collapsed state | REQ-8, REQ-20, E6 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | the filter offers All, Groups and Ungrouped, the count reads n of m while it hides cards, and it resets to All on reload | REQ-17, E22 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | with the daemon down an open menu closes and every group control is disabled, and after a restart each section renders once | REQ-21, E24 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | the Delete group dialog closes when the daemon goes down | REQ-5, E24 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | a group created, renamed, collapsed, given a member and deleted in one window appears so in a second window without a reload | REQ-21, edge case 7, E25 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | a group deleted and another renamed through the API appear in the open dashboard on the groups broadcast | REQ-21 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | the filter segment, the caret and the Select toggle keep focus and the same node across a render tick after a real key | REQ-3, REQ-12, REQ-17 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | the rail ⋯ and header ⋯ buttons open their menus from the keyboard, the opener stays the same node and the menu survives a render tick | REQ-1, REQ-3 | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |
| web/e2e/groups.spec.ts | a group header's ⋯ menu offers the full item list while the Ungrouped header offers no Rename, Ungroup or Delete group… | REQ-2, REQ-5, REQ-6, UI Specifications Header menu | the title's behaviour, checked against the daemon's own state and the rendered dashboard | ran-green — soak x10: 440 passed (3.8m) |

## Deleted Tests

None. No existing spec was changed.

## Fixture Changes

Added `web/e2e/helpers/groups.ts`, additive, with no existing helper edited. It holds locators transcribed from the plan's Testable UI Elements table, oracles read from `GET /api/state` (section order, per-section order, the pin and `railPos` invariant I1, dangling `groupId` I2), setup through the real group endpoints, `driveToState`, and three harness helpers:

- a recorder of mutating requests;
- a check that focus and node identity survive a render tick;
- `routeGroupsFrames`, which withholds the whole-list `groups` WebSocket frames so the E19 stale-dialog case is deterministic instead of a race with the 1 s render tick.

No new payload shape. Sessions are real launches, and state changes use the existing `envelopedSessionStart`, `rawUserPromptSubmit`, `rawNotification`, `rawStop` and `rawStopFailure` builders, already synthesized from the measured captures.

## Coverage

Tokens are those named in test titles. REQ-26 (a `groupId` naming no known group renders in Ungrouped) is not reachable through a real daemon, which never sends one. Plan criterion W5 covers it in Vitest. REQ-10 to REQ-27 appear below where tested.

| Requirement | E2E Tests |
|-------------|-----------|
| E1 | 1 test(s), e.g. with no groups the rail is today's plus Select and ⋯, and Ra |
| E2 | 3 test(s), e.g. Escape in the new-group textbox discards the pending section |
| E3 | 2 test(s), e.g. double-clicking a group's name edits it in place and the new |
| E4 | 1 test(s), e.g. deleting the last session of a group leaves the group with a |
| E5 | 3 test(s), e.g. dropping a card on a group header moves it to the end of tha |
| E6 | 1 test(s), e.g. a drag, a collapse and a section reorder survive a reload an |
| E7 | 4 test(s), e.g. Delete group… with Move them to Ungrouped (the default) keep |
| E8 | 4 test(s), e.g. a header shows the member count and one state item per state |
| E9 | 2 test(s), e.g. hovering a header shows a tooltip naming the group, its sess |
| E10 | 3 test(s), e.g. cards are not draggable in attention sort but a header still |
| E11 | 1 test(s), e.g. dropping a header onto a card and a card onto the rail head  |
| E12 | 2 test(s), e.g. in attention sort Select shows a checkbox per card and per h |
| E13 | 1 test(s), e.g. in select mode a card click toggles instead of focusing, the |
| E14 | 3 test(s), e.g. Move to lists the groups, New group… and Ungrouped, and choo |
| E15 | 2 test(s), e.g. Select → All → Remove… with groups present removes every ses |
| E16 | 3 test(s), e.g. Escape leaves select mode with no checkbox and nothing selec |
| E17 | 3 test(s), e.g. the launch dialog's Group row defaults to the focused sessio |
| E18 | 3 test(s), e.g. choosing New group…, naming it and launching creates the gro |
| E19 | 1 test(s), e.g. a group deleted while the dialog still shows it selected is  |
| E20 | 3 test(s), e.g. ⌥⌘1 and ⌥⌘2 count the cards as displayed in manual sort, ski |
| E21 | 1 test(s), e.g. ⌥⌘0 with the neediest session in a collapsed section expands |
| E22 | 3 test(s), e.g. ⌥⌘0 onto a grouped needs-input session while the filter is U |
| E23 | 2 test(s), e.g. Tiles renders the grid and the strip in the flat manual orde |
| E24 | 2 test(s), e.g. with the daemon down an open menu closes and every group con |
| E25 | 1 test(s), e.g. a group created, renamed, collapsed, given a member and dele |
| E26 | 3 test(s), e.g. ⌥⌘1 and ⌥⌘0 change nothing while the Delete group dialog is  |
| E27 | 5 test(s), e.g. at a header width of 1140px the Focus header's group control |
| I3 | 4 test(s), e.g. Stop… states the count, Stop N ends exactly the selection in |
| I4 | 2 test(s), e.g. ⌥⌘0 onto a grouped needs-input session while the filter is U |
| I5 | 3 test(s), e.g. ⌥⌘1 and ⌥⌘2 count the cards as displayed in manual sort, ski |
| I6 | 2 test(s), e.g. with no groups the rail is today's plus Select and ⋯, and Ra |
| I7 | 3 test(s), e.g. Tiles renders the grid and the strip in the flat manual orde |
| I8 | 2 test(s), e.g. a state change in a collapsed manual-sorted group changes it |
| REQ-1 | 11 test(s), e.g. New group… in the Focus header's menu names a group that the |
| REQ-2 | 5 test(s), e.g. double-clicking a group's name edits it in place and the new |
| REQ-3 | 4 test(s), e.g. clicking a header, its caret and ⋯ → Collapse each toggle th |
| REQ-4 | 4 test(s), e.g. deleting the last session of a group leaves the group with a |
| REQ-5 | 8 test(s), e.g. Delete group… with Move them to Ungrouped (the default) keep |
| REQ-6 | 2 test(s), e.g. ⋯ → Ungroup dissolves the group with no dialog and its sessi |
| REQ-7 | 1 test(s), e.g. ⋯ → Stop all… confirms with the count, stops every member, k |
| REQ-8 | 3 test(s), e.g. dragging a group header above another section, and the Ungro |
| REQ-9 | 3 test(s), e.g. dropping a card on a group header moves it to the end of tha |
| REQ-10 | 9 test(s), e.g. the Focus header shows the focused session's group between t |
| REQ-11 | 11 test(s), e.g. the launch dialog's Group row defaults to the focused sessio |
| REQ-12 | 12 test(s), e.g. in attention sort Select shows a checkbox per card and per h |
| REQ-13 | 8 test(s), e.g. Move to lists the groups, New group… and Ungrouped, and choo |
| REQ-14 | 2 test(s), e.g. Select → All → Remove… with groups present removes every ses |
| REQ-15 | 3 test(s), e.g. with no groups the rail is today's plus Select and ⋯, and Ra |
| REQ-16 | 6 test(s), e.g. a header shows the member count and one state item per state |
| REQ-17 | 3 test(s), e.g. with the filter on Groups ⌥⌘1 focuses the first grouped card |
| REQ-18 | 1 test(s), e.g. attention sort keeps every section in its place while cards  |
| REQ-19 | 4 test(s), e.g. ⌥⌘1 and ⌥⌘2 count the cards as displayed in manual sort, ski |
| REQ-20 | 2 test(s), e.g. deleting the last session of a group leaves the group with a |
| REQ-21 | 5 test(s), e.g. Tiles renders the grid and the strip in the flat manual orde |
| REQ-22 | 2 test(s), e.g. Stop… states the count, Stop N ends exactly the selection in |
| REQ-23 | 4 test(s), e.g. a session launched into an existing group lands at the end o |
| REQ-24 | 1 test(s), e.g. in manual sort a card in select mode has draggable false and |
| REQ-25 | 4 test(s), e.g. cards are not draggable in attention sort but a header still |
| REQ-27 | 1 test(s), e.g. a bulk Remove where one selected session is already gone rep |

## Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | switching to Tiles leaves select mode, the Tiles strip shows no header, section or checkbox, and coming back shows no checkbox | `getByRole("button", { name: "Tiles" })` matched 4 buttons (strict-mode violation): the view switch, the carets `Collapse Tiles A` and `Collapse Tiles B`, and the Focus header's `Tiles A` control | The fixture named its groups `Tiles A` and `Tiles B`, and a role name is a substring match by default | `{ name: "Tiles", exact: true }` on the click and on the `aria-pressed` read | REQ-12, I7, E16: the same click on the view switch and the same `aria-pressed="true"` assertion; nothing else in the test changed |
| 2 | dropping a header onto a card and a card onto the rail head or the filter row send no request and change no order | Flaky, red 3 of 16 runs: it compared the `sessions` array of `GET /api/state` before and after, and the daemon emits that array in Go map order | The protocol promises no order for `sessions` (docs/protocol.md, `sessions` snapshot key: "order unspecified; the client sorts"), so my comparison asserted an order nobody guarantees | Both sides are mapped to `[id, groupId, pinned, railPos]` and sorted by id before the compare | REQ-25, E11: every session's group, pin state and `railPos` must be unchanged, plus the groups list, the section order, the card order and zero mutating requests, all untouched. Soak x10: 440 passed |
| 3 | `web/e2e/helpers/groups.ts` comment | `make check-kb` reported `kb:lesson/select-rebuilt-` as resolving to no record | The citation was split across two comment lines | Joined to the full slug `kb:lesson/select-rebuilt-every-tick-passed-selectoption`, which exists in docs/lessons/ | A comment only, no assertion |
| 4 | GET /api/state returns exactly the empty-daemon snapshot object once authenticated (`web/e2e/shell.spec.ts`, pre-existing) | `toEqual` on the whole object failed: the daemon now returns `groups` and `ungrouped` | Sanctioned breakage. The approved Protocol Contract (docs/protocol.md, `kb:anchor/ws.snapshot`) adds `groups: []` and `ungrouped: { pos: 0, collapsed: false }` to the snapshot | Added exactly those two keys to the expected object, with a comment citing the contract | Every other expectation in the object is unchanged, and the exact-object match still rejects any other extra or missing key. The title already says "exactly" |

| 5 | the five E27 tests with the 12-character folder: the four `at a header width of {1140,724,600,500}px … the repo block stays present at its 8-character floor or wider (REQ-10, E27)` tests and the sweep `… the title floor and the repo block's 8-character floor hold at every step (REQ-10, E27)` | Red in attempt 1: the folder `muster-app /` was ellipsized by the layout's give-way order, so "the repo and branch read whole" never held | Not a spec defect. An authorised plan amendment: REQ-10 and E27 were amended to the floor rule on 2026-10-05 (user decision, `plans/groups/decisions/focus-header-floor-rule/decision.md`, commit a1a2ef3, kb:adr/focus-repo-block-keeps-floor-beside-group-control). The old criterion no longer exists | The repo-text check for these five is a new helper, `titleAndRepoFloorProblems`: the folder line is present and not `display: none` (nor its block), it is at least 8 characters wide measured against a clone of `.rf` set to `8ch` (1 px tolerance), and its text and the branch are still `muster-app /` and `main`. The title's 6rem floor check, the control present/absent assertions, `mainheadFitProblems` and every setup assertion are untouched. Tests retitled to say what they now assert. The helper `titleFloorAndReadoutProblems` and the five floor-fitting tests added in attempt 1 are unchanged | REQ-10 and E27 as amended. Proven red: with `.mainhead .meta .rf { max-width: 4ch !important }` appended to `web/src/style.css` and the build redone, all five failed (`5 failed`); the stylesheet was restored with `git checkout` and rebuilt, and `git status` showed only my spec file |

This is an authorised plan amendment, not a weakening: the amended criterion is the one in plan.md REQ-10 and E27. The assertion for the amended requirement is a measured floor, not a pattern match.

No assertion was deleted, skipped, or weakened.

## E2E Implementation Bugs

None. Attempt 1 routed one plan-level conflict (REQ-10 and E27 against the layout's give-way order). The developer resolved it by amending the plan to the floor rule (`plans/groups/decisions/focus-header-floor-rule/decision.md`), so the implementation matches the amended plan and no code change was made.

## Handoff

- **Extra spec file.** The plan's Affected Files names three spec files. `web/e2e/groups-focus.spec.ts` is a fourth. It holds the Focus-header control, the chords, default focus and Tiles (E20 to E23, E26, E27). It takes the per-test `daemon` fixture like the other three and matches the `web/e2e/groups*.spec.ts` glob the plan's doc upkeep already adds to the rail spec.
- **Plan gaps the specs could not pin (no wire or markup invented):**
  - The REQ-27 partial-batch phrase is not pinned. The test asserts `#action-error` is visible and non-empty, and hidden after a complete batch. Please pin the phrase in Testable UI Elements.
  - The Focus header's `New group…` surface (modal or the pending rail editor) is not pinned. The test asserts only that a `Group name` textbox takes focus, Enter creates the group, and the focused session joins it.
  - Popover copy at one session (`1 session`) and the bulk Remove sentence at n = 1 are not pinned. Popover tests use groups of two or more, and the singular Remove test asserts only title and button labels.
  - Dropping a header on a header is not specified. The tests drop on the target's upper half and expect the dragged section above it.
  - The group control's 640px rule is a container query, which measures the header's content box, 28px inside its border box. The sweep test asserts presence only at measured widths of 680 or more and absence at 600 or less.
  - `planning` is not driven, so the summary-order test covers needs input, failed, started, working, idle and ended.
- **Locators likely to need validate-mode repair, not plan defects:** the click target for REQ-3 (`.gsum .cnt`), the `.selected` ground read on the card element itself, the `draggable` attribute on headers, and the `.ingroup` computed border colour.
- **Harness files:** no change requested to `playwright.config.ts`, `fixtures.ts`, `gatelock.ts` or `e2e-lint.sh`.
- **Focus-survives-tick rule.** Menu openers (rail ⋯, header ⋯, Focus-header control) assert node identity and an open menu across a tick, not `document.activeElement`, because the plan does not say where focus goes when a menu opens.

### Validate (attempt 2)

- The five E27 tests with the 12-character folder now assert the amended criterion (see Repairs row 5). Nothing else changed. No harness-file change requested; no field needs an `/interface-probe`.

### Validate (attempt 1)

- **Plan defect to amend or decide**: REQ-10 and E27 say the repo and branch never truncate. The unchanged layout truncates a folder over the 8-character floor beside a long title at every width but 1140 on the base commit too. See the E2E Implementation Bugs section for the measurements.
- **Added, not substituted**: five new tests in `web/e2e/groups-focus.spec.ts` run the same four widths and the sweep with a folder that fits the floor (`muster`). They pass x10 and prove the group control, the 6rem title floor and the 8-character repo floor hold together. They do not replace the five red tests.
- **Harness files**: no change requested to `playwright.config.ts`, `fixtures.ts`, `gatelock.ts` or `e2e-lint.sh`.
- **Not mine, seen on the way**: `TestHandleShellTerminal_ScrollErrorIsLoggedNotFatal` (Go) was named by the orchestrator as out of scope and was not touched.
- **Collection and lint**: `npx playwright test --list` reports 707 tests in 49 files, `sh scripts/e2e-lint.sh` reports clean, `npx tsc --noEmit -p .` and `biome check e2e` are clean. `make check-kb` no longer reports the truncated citation in `web/e2e/helpers/groups.ts`.

## Test Run Output

Authoring:

```
npx playwright test --list                                         -> Total: 702 tests in 49 files
sh scripts/e2e-lint.sh                                             -> e2e-lint: clean
npx playwright test e2e/groups-focus.spec.ts -g "inert in Tiles"   -> 1 failed (new groups key absent today)
```

Validate (attempt 1), after `make web-build build`:

```
run 1, the four plan specs      -> 7 failed, 92 passed (the 7 the orchestrator listed, all reproduced)
run 2, four specs + shell.spec  -> 5 failed, 103 passed (E27 x5 only)
make e2e (full suite)           -> 5 failed, 702 passed (6.0m), the same five E27 tests
make e2e-soak x10               -> groups 440 passed, groups-select 200 passed, groups-launch 130 passed
groups-focus x10 (22 passing)   -> 220 passed
```

The failing assertion in each of the five, from the full run:

```
expect.poll(titleFloorAndReadoutProblems).toEqual([])
- Expected  - 1   + Received  + 3
+ "folder text is truncated"
```

Validate (attempt 2), after `make web-build build`:

```
four groups spec files          -> 104 passed (58.9s)
absence/floor proof (.rf capped at 4ch) -> 5 failed, restored
make e2e-soak SPEC=e2e/groups-focus.spec.ts N=10 -> 270 passed (2.7m)
make e2e (full suite)           -> 707 passed (5.9m)
npx playwright test --list      -> Total: 707 tests in 49 files
```

## Notes

Titles inside one test never contain one another, because `railCard` matches by substring. The one run above used `bin/musterd` and the embedded assets built from the current tree (`make web-build build`), which has none of the feature yet.

## Fix Attempt 1 (review cycle 1)

**Task**: coverage only. No review issue was tagged `[e2e-specs]`. I read `## Fix Attempt 3 (review cycle 1)` in web-implementation.md and `## Fix Attempt 1 (review cycle 1)` in daemon-implementation.md and asserted the user-facing behaviour they added. I rebuilt first (`make web-build build`), since wave-1 and wave-2 commits had landed.

### Tests added

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/groups.spec.ts | a rename's daemon answer closes only the field it committed: a second name field opened while the request is in flight keeps its typed text (REQ-2, edge case 12) | REQ-2 | The first rename's `PUT /api/groups/{id}` is applied by the daemon but its response is withheld. A second name field opened and typed into meanwhile keeps its value and focus across a render tick, the first rename's `groups` frame and the released answer, and commits on Enter | ran-green, soak x10 (groups.spec.ts 460 passed) |
| web/e2e/groups.spec.ts | a new group's daemon answer closes only the pending field it committed: a rename started while the create is in flight keeps its typed text (REQ-1, REQ-2, W11) | REQ-1, REQ-2, W11 | The same for the create path: `⌥⌘G`, Enter with `POST /api/groups` withheld, then a rename of another group. After release the rename field keeps its text and commits, and "Fresh" exists | ran-green, soak x10 |
| web/e2e/groups-select.spec.ts | with the daemon down in select mode every bar button and both kinds of checkbox are disabled, a card click changes nothing, and after a restart they work again (REQ-12, REQ-21, E24) | REQ-12, REQ-21, E24 | Enabled while connected, then with the daemon killed: Move to, Ungroup, Stop…, Remove…, All and Done, every card checkbox and both header checkboxes are disabled. A card click and forced clicks on the checkboxes leave the selection at "1 selected". After a restart they are enabled and a checkbox selects again | ran-green, soak x10 (groups-select.spec.ts 220 passed) |
| web/e2e/groups-select.spec.ts | Escape leaves select mode while the daemon is down, clearing the bar and every checkbox (REQ-12, E16, E24) | REQ-12, E16, E24 | Escape with the daemon down hides the bar, un-presses Select and removes every checkbox. After a restart nothing is selected | ran-green, soak x10 |
| web/e2e/groups-focus.spec.ts | with a header content box of 640px the Focus header's group control is present (REQ-10, E27) | REQ-10, E27 | `#mainhead` content box measured at exactly 640px (padding and border subtracted, read to 0.01px): the control is visible with computed `display: flex`, also a render tick later | ran-green, soak x10 (groups-focus.spec.ts 290 passed) |
| web/e2e/groups-focus.spec.ts | with a header content box of 639px the Focus header's group control is absent (REQ-10, E27) | REQ-10, E27 | The same session, group and height at exactly 639px: the control is hidden with computed `display: none` | ran-green, soak x10 |

### Fixture changes

Additive, in `web/e2e/helpers/groups.ts`:
- `holdResponse(page, method, path)` lets the daemon apply the first matching request and withholds only the HTTP response until `release()`. `answered` resolves once the daemon has answered. It is a route-level hold, so the daemon's own `groups` frame still reaches the page while the answer is withheld.
- `setMainheadContentWidth(page, target)` sizes the viewport until `#mainhead`'s content box, the container the `@container (width < 640px)` rule measures, is exactly `target`, or throws. `setMainheadWidth` tolerates 1px, which is the whole difference between 640 and 639. The existing E27 sweep is unchanged.

No payload builder was added or changed, so no wire shape is involved.

### Not covered, with the reason

- **Launch-held group no longer fails `PUT /api/groups/order`** (daemon fix): not added. The group is held only inside the daemon between creating the group and recording the launch's session. The launch frame-hold pattern in `groups-launch.spec.ts` withholds `groups` frames from the page, and a page route holds a request before it reaches the daemon. Neither holds that in-daemon window, so a test would be a race. The Go tests the daemon-tests wave added (commit 9472e4dd) cover it deterministically.
- **Mutation proof for the new tests**: I tried to break the product deliberately (the identity guard in `closeEditingIf` and the `< 640px` query) to watch the new tests go red, and the permission system denied editing product source. I did not work around it and the product tree is untouched (`git diff --stat -- web/src internal` empty). The evidence that stands instead: the web-impl log's repro with the guard removed (`B field count after A answered: 0`, value `gone`), against which both guard tests assert a positive `toHaveCount(1)` and the typed value. The boundary pair asserts opposite outcomes at 640 and 639 in the same setup, so a rule off by one in either direction fails one of them. The daemon-down tests assert enabled before the kill and disabled after.

### Repairs

None. No existing test was edited. `npx biome check --write` reformatted only the files I changed.

### Verdict

**Verdict**: pass

- `npx playwright test --list`: Total 713 tests in 49 files.
- Soaks x10, whole files: groups-focus 290 passed (2.9m), groups-select 220 passed (2.2m), groups 460 passed (4.1m).
- `make e2e`: `713 passed (5.0m)`, including the four plan spec files.

No assertion was deleted, skipped, or weakened.

### Handoff

None. No change to `playwright.config.ts`, `fixtures.ts`, `gatelock.ts` or `e2e-lint.sh` is needed, and no wire shape needs an `/interface-probe`.
