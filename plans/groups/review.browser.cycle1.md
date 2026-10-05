# Browser review: Rail groups

**Plan**: groups
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 39368 words (budget 20000)
**Rig**: `bin/musterd` built fresh by `make web-build build` at 25e6780 (tree dirty only in `plans/groups/orchestration-state.json`). Each test ran its own `ScratchDaemon` from `web/e2e/helpers/fixtures.ts`: a space-bearing data dir `$TMPDIR/muster e2e-XXXX`, a private socket `<data dir>/tmux.sock` removed with it, and the shared E2E stub `claude` at `$TMPDIR/muster e2e-stub-cd75a542396fd84f/claude`. Driven by headless Chromium through throwaway `web/e2e/zz-rb-*.ts` specs, now deleted. Afterwards no `musterd` or scratch tmux process was left and `git status --porcelain` showed nothing of mine.

Gates log read, not re-run (`gates-groups-c1`). `web-build` and `e2e` are green (`707 passed`), so the app I drove is the one that ships. The one red line is `dead-refs` (`.claude/worktrees`), which this review does not touch. See Note 1 for the `test-race` log.

## Matrix

Hosts are `focus` (rail, mainhead, launch dialog), `tiles` (grid, strip, launch dialog opened from Tiles) and `pop-out` (`/doc.html`).

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| all rows | pop-out | all | — | N/A — `/doc.html` hosts only the reader | `grep -c 'id="sessions"\|id="mainhead"\|launch-dialog' web/doc.html` → 0 |
| States | focus | no data yet (WS mocked silent) | no header, no filter, no select bar, no gauge before the first snapshot | pass | heads 0; `#rail-filter` display none; `#select-bar` display none; gauges 0 |
| REQ-15 | focus | no data (0 sessions) | row 2 holds Select and ⋯ only, inside the rail head | pass | Select 202,83–257,102 and ⋯ 263,83–287,102 inside railhead 0,46–299,112; filter display none |
| REQ-15 | focus | no data | select bar hidden | pass | `#select-bar` computed display none |
| Views: rail ⋯ | focus | no data | New group… enabled, Collapse/Expand all disabled, menu inside viewport, opened by Enter | pass | items `New group…⌥⌘G`, `Collapse all groups(disabled)`, `Expand all groups(disabled)`; hint `aria-hidden` |
| Views: menu | focus | no data | keyboard: focus enters the menu, ArrowDown moves, Escape closes and returns focus to the opener | pass | active `#rail-actions-button` after Escape |
| REQ-15 | focus | data, no groups | flat rail: no header, cards as today | pass | heads 0, cards 3, filter display none |
| REQ-1 | focus | data, no groups | rail ⋯ → New group…: pending section above the loose cards, `Group name` focused | pass | pending 0,112–299,146 above first card 0,146–299,284 |
| REQ-1 | focus | data, no groups | pending field keeps node and focus across a tick (1.3 s) | pass | same INPUT node active after 1300 ms |
| REQ-1/E2 | focus | data, no groups | Escape, empty Enter and blur each discard with no request | pass | heads 0, filter display none, requests `[]` each time |
| REQ-1 | focus | data, no groups | ⌥⌘G opens the pending field focused | pass | active INPUT[Group name] |
| REQ-1/E1/I6 | focus | data | Enter keeps the trimmed name; the Ungrouped header and Filter appear; count unchanged | pass | typed `   Review queue   ` → DOM and daemon `Review queue`; one `POST /api/groups`; count 3 |
| REQ-1 | focus | data | a name over 40 characters cannot be entered | pass | 45 typed, field holds 40 |
| REQ-15 | focus | data | row 2 (filter, Select, ⋯) fits the 300 px rail head | pass | filter 12–178, Select 202–257, ⋯ 263–287 inside head 0–299; row2 scroll 275/275 |
| Views: sections | focus | data | a 40-character name ellipsizes; summary and ⋯ stay inside the header | pass | name 28–72 clipped; sum and kebab inside head 0–299 |
| Views: header ⋯ | focus | data | ⋯ opacity 0 at rest, 1 on hover and on keyboard focus | pass | rest 0, hover 1, focus 1 |
| REQ-2 | focus | data | double-click opens a prefilled, fully selected, focused field inside the header | pass | `{"v":"Alpha","s":0,"e":5,"active":true}`; field 28,123–168,138 in head 0,114–299,148 |
| REQ-2 | focus | data | rename field keeps node and focus across a tick | pass | same node after 1300 ms |
| REQ-2/E3 | focus | data | new name shows at once in header, Focus header, popover and launch Group options | pass | daemon `Alpha two`; mainhead `Alpha two▾`; popover `Alpha two 2 sessions…`; options `No group, Alpha two, Beta, New group…` |
| E3/edge 12 | focus | data | Escape and a whitespace-only Enter restore the name with no request | pass | requests `[]` |
| Views: header ⋯ | focus | data | items and order match the plan; menu inside viewport | pass | `Rename, Collapse, Select all (2), New group…, Stop all…, Ungroup, Delete group…` |
| Views: header ⋯ | focus | data | Rename chosen by keyboard leaves focus in the field across a tick | pass | same INPUT node after 1300 ms |
| Views: header ⋯ | focus | data | the Ungrouped menu omits Rename, Ungroup and Delete group… | pass | `Collapse, Select all (1), New group…, Stop all…` |
| REQ-3 | focus | data | header click collapses: body display none, caret `Expand <name>`, `aria-expanded=false`, daemon collapsed | pass | body display none; caret `Expand Alpha two`; daemon `collapsed:true` |
| REQ-3 | focus | data | caret by keyboard expands and keeps its node focused across a tick | pass | same BUTTON.disc after 1300 ms |
| REQ-3 | focus | data | ⋯ → Collapse collapses | pass | body display none |
| Views: rail ⋯ | focus | data | Collapse all and Expand all flip every section, Ungrouped included (settled) | pass | daemon all collapsed; laid-out cards `[]` |
| REQ-3/REQ-20/E6 | focus | data, reload | collapsed state, section order and membership survive reload | pass | sections `["1","2","ungrouped"]` before and after; B collapsed |
| REQ-17 | focus | data, reload | filter resets to All | pass | pressed `All` after reload |
| REQ-20/E6 | focus | data, daemon restarted | names, order, collapsed state and membership survive a restart | pass | sections unchanged; A name `Alpha two`; members `[1,2]` |
| REQ-16 | focus | data | summary count, then one item per state in attention order, matching the daemon | pass | `needs_input, failed, started, working, idle, ended`, each `1` with title `1 <word>`; daemon states agree |
| REQ-16 / §3 | focus | data | each dot is its own state token; ended is neutral `--line-control` | pass | computed backgrounds equal `--amber`, `--rose`, `--fg-muted`, `--teal`, `--idle`, `--line-control` |
| REQ-16 | focus | data | six summary items fit the 300 px header with no overlap | pass | sum 118–263, kebab 269–291, head 0–299 |
| REQ-16 | focus | data | popover after about ⅓ s, below the header, inside viewport, pointer-events none | pass | none at 150 ms; visible at about 386 ms; tip 8,152–228,376 under head 114–148 |
| REQ-16/E9 | focus | data | popover names the group, `6 sessions`, each state word and each member under it | pass | `STATES 6 sessions NEEDS INPUT 1 a3-need … ENDED 1 a3-end` |
| Views: popover | focus | data | removed on leave; caret focus shows it; Tab (blur) removes it | pass | 0 tooltips after leave and after Tab |
| Views: popover | focus | data, header near viewport bottom | popover and header ⋯ menu stay inside the viewport | pass | at 560 px tall: tip 8,443–228,527; menu flipped to 275–411 |
| REQ-16/I8/E8 | focus | data, collapsed, manual | a needs-input change in a collapsed group updates the summary and moves no section | pass | needs_input 1→2; sections and header y unchanged |
| REQ-16/I8/E8 | focus | data, collapsed, attention | same in attention sort | pass | needs_input 2→3; sections and header y unchanged |
| REQ-4/E4 | focus | data, empty group | count 0, no dots, drop line shown, menu offers Rename and Delete group…; Select all (0) and Stop all… disabled | pass | line `empty — drop sessions here` display block 299×40 |
| States | focus | data, empty group | popover says `empty`; empty Ungrouped says `no ungrouped sessions` | pass | `SOON EMPTY 0 sessions empty` |
| REQ-9/E5 | focus | data, manual | card dropped on a header joins the end of that section (DOM = daemon) | pass | DOM `[1,2,5]` = daemon; invariant problems `[]` |
| REQ-9/E5 | focus | data, manual | card dropped on a pinned card of another section joins it at the drop and takes its pin | pass | DOM `[2,3,4]` = daemon; a2 pinned true |
| REQ-9 | focus | data, manual | card dropped on the Ungrouped header leaves its group | pass | Ungrouped DOM `[1]` |
| REQ-8/E10 | focus | data, manual | header dragged above another reorders the sections (DOM = daemon) | pass | `["2","1","ungrouped"]` both |
| REQ-25/E10 | focus | data, attention | Ungrouped header drags in attention; cards `draggable=false`, headers `true` | pass | sections `["ungrouped","2","1"]` |
| REQ-8 | focus | data, reload | section order survives reload | pass | `["ungrouped","2","1"]` |
| edge 16/E11 | focus | data, manual | header onto a card and card onto the rail head or filter send nothing and change nothing | pass | requests `[]`; state unchanged; no drop-target class left |
| REQ-8/REQ-9 | focus | data, overflowing rail (720 px) | drags with both ends on screen in a scrolled list | pass | card onto header B and header B onto header A both applied |
| REQ-8/REQ-9 | focus | data, overflowing rail | drag onto a header scrolled out of view | not measured — Note 2 | |
| REQ-7 | focus | data | Stop all… dialog: `Stop 2 sessions?`, body ending ` The group stays.`, confirm `Stop 2`, inside viewport | pass | dialog 420,282–860,438 |
| REQ-7/E14 | focus | data | members end and stay in the group; ended dot reads 2 | pass | daemon `1:false, 2:false`, groupId kept |
| REQ-5 | focus | data | delete dialog: title, count body, three radios with Ungrouped checked, Target group, footer; no overflow | pass | `Delete group “Bb”?` / `…its 1 session.`; scroll 438/438 × 388/388 |
| REQ-5 | focus | data | delete dialog and Target group keep focus across a tick; target lists other groups only | pass | options `["Aa"]` |
| REQ-5/E7 | focus | data | Move to Ungrouped / Move to another group (end of target) / Stop and remove, each against the daemon | pass | b1 null; A DOM `[1,2,4]`; d1 row and tmux session gone |
| Views: delete dialog | focus | data | Target group absent with no other group; empty group shows the one line and hides radios | pass | `.choices` display none |
| REQ-6 | focus | data | Ungroup: no dialog; members keep relative order | pass | `[1,2,4]` before and after |
| REQ-15/I6 | focus | data | deleting the last group removes the Ungrouped header and the filter | pass | heads 0; filter display none |
| REQ-12 | focus | data (12 cards) | Select: a checkbox per card (12) and header (3), all cards `draggable=false`, pin display none, `aria-pressed=true` | pass | as stated |
| REQ-12 | focus | data, overflow (640 px tall) | bar at the rail's foot inside rail and viewport; list scrolls above it | pass | rail 0,46–300,640; bar 0,579–299,640; list 114–579, scroll 1745/465, overflow-y auto |
| REQ-12 | focus | data, overflow | scrolled to the end, the last card sits above the bar | pass | last card bottom 579 = bar top 579 |
| Views: sections | focus | data, overflow | a section header sticks to the list top while its body scrolls | pass | head y 114 = list y 114 at scrollTop 120 |
| REQ-12 | focus | data | at 0 selected: `Select sessions`, Move to/Ungroup/Stop…/Remove… disabled, all buttons inside the bar | pass | as stated |
| REQ-12/E13 | focus | data | card clicks toggle, `2 selected`, mainhead and current marker unchanged | pass | mainhead `b3-s10`; current 10 → 10 |
| Views / §3 | focus | data | a selected card is a neutral `--fg` stripe on `--bg-hover`, not a state colour | pass | stripe rgb(232,230,225) = `--fg`; ground = `--bg-hover` |
| REQ-12 | focus | data | Space on a card checkbox toggles it and keeps its node across a tick | pass | `3 selected`; same node after 1300 ms |
| REQ-12 | focus | data, comfortable / compact / expanded | checkbox inside the card, clear of the title; compact card height and title line unchanged | pass | compact height 102.5 → 102.5; title y unchanged |
| REQ-12/E13 | focus | data | a header checkbox selects all its members | pass | 2 → 5 selected |
| REQ-13 | focus | data | Move to opens inside the viewport, flipped above the bar; header and items as the plan says | pass | menu 88,438–278,584 clear of bar content; `Grp A, Grp B, New group…, Ungrouped` |
| REQ-13/E14 | focus | data | Move to Grp A puts the selection at the end of Grp A (DOM = daemon) | pass | `[1..8]` both |
| REQ-13 | focus | data | New group… modal is titled from the count and its field keeps focus; Create makes the group (settled) | pass | `New group from 5 sessions`; 5 members |
| REQ-13/E14 | focus | data | Stop… and Remove… copy (`5 of them are alive…`, `Remove 5`) | pass | as stated |
| REQ-12/E16 | focus | data | Escape and Done each leave the mode; re-entry starts at 0; cards draggable again | pass | checkboxes 0; draggable 12 |
| REQ-12 | focus | data | Escape with the Move to menu or a bulk dialog open closes only that and keeps the selection | pass | bar shown; `2 selected` |
| REQ-12/E12 | focus | data, attention | select mode and Move to work in attention sort | pass | Alpha DOM `[1,2,3,4]` |
| REQ-14/E15 | focus | data → no data | Select → All → Remove 12 with groups present: `No sessions yet`, mainhead hidden, mode off | pass | daemon sessions 0 (layout: Note 3) |
| REQ-14 (#27) | focus | data, no groups | Select → All → Remove… with no groups empties the rail; Ungroup disabled | pass | Move to `New group…, ✓Ungrouped`; heads 0 |
| REQ-27 | focus | data | a partial batch shows the fixed phrase in a shown action-error line; a later complete batch clears it | pass | `Not every session was handled — some were skipped or failed.`; then display none |
| REQ-26/edge 21 | focus | data, `groups` frame withheld | a card whose groupId is unknown renders in Ungrouped with no error; the next frame corrects it | pass | Ungrouped `[2,1]`, errors `[]`, then section `[1]` |
| REQ-11 | focus | data | Group row under Title, inside the dialog, defaulting to the focused session's group | pass | select 381,478–561,508 below Title 439–467 |
| REQ-11 | focus | data | name field display none until New group…; keyboard typeahead picks it; select and field keep focus across a tick | pass | field 569–983 beside the select |
| REQ-11 | focus | data, Resume tab | the same row is shown and inside the dialog, keeping the same choice | pass | select 381,496–561,526 in dialog 129–591 |
| REQ-11/E18 | focus | data | refused launch with New group…: no group, no session; name kept | pass | groups `["Alpha"]`, sessions 2 |
| REQ-11/E18 | focus | data | New group… launch creates group and session together; the new card is its only member and focused | pass | DOM `[3]`; control `Hotfix▾` |
| REQ-11 | focus | data | a launch into an existing group lands at its end (DOM = daemon) | pass | `[1,2,4]` |
| edge 28/E19 | focus | data, real frames | the chosen group deleted while the dialog is open | observed — Note 4 | select falls to `No group` within a tick |
| REQ-11/edge 27 | tiles | data | a dialog opened from Tiles defaults to the focused session's group | pass | `Bravo`; row inside the dialog |
| REQ-19/E20 | focus | data, A collapsed | ⌥⌘1 focuses the first displayed card | pass | `c2-b1`; displayed `[3,4,5]` |
| REQ-17 | focus | data, filter Groups | count reads `n of m` against the daemon; the filter button keeps focus across a tick | pass | `3 of 5` (counting rule: Note 5) |
| REQ-19/E20 | focus | data, filter Groups | ⌥⌘1 focuses the first grouped displayed card | pass | `c2-b1` |
| REQ-19/I4/E21/E22 | focus | data, filter Ungrouped, A collapsed | ⌥⌘0 onto a2: section expands, filter flips to All, card current and in view | pass | card 287–430 inside list 114–720 |
| I4/E22 | focus | data, filter Groups | an ungrouped launch flips the filter to All, shows the plain total and focuses the shown card | pass | count 6 = daemon 6 |
| I4 | focus | data | the user's own filter hides the focused session | observed — Note 6 | |
| REQ-10 | focus | data | the control opens Move to below itself, inside the viewport: groups (tick), New group…, No group | pass | control 416,62–469,79; menu 416,83–606,229 |
| REQ-10 | focus | data | arrows move focus; choosing Bravo by keyboard moves the session to Bravo's end; focus returns to the control and holds across a tick | pass | B DOM `[2,1]` |
| REQ-10 | focus | data | No group reads `no group` | pass | `no group▾` |
| REQ-10/E27 (amended) | focus | data, long title, 6-char folder | 4 px sweep 1240→480: control shown iff content box > 640; title ≥ 6rem; folder at or above 8ch, whole; no overlap; fit clean | pass | 1140 shown, title 503; 724 shown, 293; 600 hidden, 276; 500 hidden, 176; folder 54/54 throughout; hides at header 668 (content 640) |
| REQ-10/E27 (amended) | focus | data, long title, 10-char folder | same sweep, folder at its 8ch floor or wider, never hidden | pass | folder 54–55 against a 54 floor at every step; same edge |
| REQ-10/E27 (amended) | focus | data, 29-char title | same sweep | pass | title ≥ 123 px > 96 px floor throughout |
| REQ-10 | focus | data, 29-char title | "it hides before the title shortens" | FAIL (Major 1) | title shortened at header 760–864 with the control shown |
| REQ-10 | tiles | data | — | N/A — the plan gives tiles no group control | `.tiles-view .ingroup` count 0 |
| I7/E23 | tiles | data, collapsed + filter + select mode | grid and strip carry no header, section or checkbox | pass | group chrome 0 |
| I7/E23 | tiles | data (9 sessions, A collapsed) | strip is the flat manual order | pass | strip `[6,8,9,5,7]` = flat |
| REQ-12/E16 | tiles | data | switching to Tiles left select mode; back in Focus, no checkbox | pass | `aria-pressed=false`; checkboxes 0 |
| REQ-1/W11 | tiles | data | ⌥⌘G is inert in Tiles, with no pending section back in Focus | pass | pending 0 |
| rail rows (REQ-1–9, 12–19) | tiles | all | — | N/A — the rail is hidden in Tiles (`#view-focus` display none); I7 rows above cover what Tiles shows | |
| States | focus | daemon-down | banner shown and inside the viewport | pass | 1280×32 at 0,46 |
| States/E24 | focus | daemon-down | an open menu closes; rail ⋯, Select, caret, header ⋯ (both), Focus header control, Move to/Ungroup/Stop…/Remove…, header checkbox disabled | pass | menus 0 |
| States | focus | daemon-down | every selection control disabled | FAIL (Minor 1) | card checkbox, All and Done enabled |
| States | focus | daemon-down | header click and name double-click do nothing; headers not draggable; ⌥⌘G opens nothing | pass | collapsed false; field 0; draggable `false`×3 |
| States/E24 | focus | reconnect | sections render once each in daemon order; controls enabled; select mode intact | pass | `["1","2","ungrouped"]`; cards 3 |
| States | tiles | daemon-down | — | N/A — Tiles has no group control | |
| REQ-5/E24 | focus | daemon-down | the delete-group dialog closes on status change; on reconnect the sections render once | pass | dialog `open:false`, display none 800 ms after the banner; 2 headers after restart |
| edge 7/E25 | focus (second window) | data | create, rename, collapse and delete appear in the other window without reload | pass | p2 headers follow; filter display none after the last delete |
| window state | focus (second window) | data | a filter in one window leaves the other on All | pass | p2 `All` |
| E26/edge 17 | focus | data, delete dialog open | ⌥⌘1, ⌥⌘0, ⌥⌘G change nothing | pass | focused unchanged; pending 0; dialog open |
| §7.1 | focus | data, focused section collapsed | collapse keeps exactly one live client and the pane | pass | attached clients 1 → 1; xterm shown |
| §6 | focus | all | no gauge, Done state, cost, or unlabelled stale display among the plan's surfaces | pass | summaries are counts of known states; ended is neutral; the bar's `Done` is a mode exit (Note 7) |

## Issues

### Critical

None.

### Major

1. **[orchestrator:decision]** The REQ-10 clause "it hides before the title shortens", which the amendment keeps, does not hold under the 640 px container rule the plan's Views section and kb:adr/focus-group-control-hides-below-640px-container-width mandate. The test used a 29-character title (228 px whole) and a 6-character folder. Between header widths 760 and 864 px the title is ellipsized, down to 123 px, while the control is shown. With the control hidden by an injected style the title reads whole at those widths. With longer titles the title is ellipsized beside the control from 1160 px down. The two halves of the plan contradict each other, so settling them is a choice, not a fix.
   - **Option A: keep the 640 px rule and amend REQ-10.** The control hides only below a 640 px content box, and above that the title may shorten beside it. This costs nothing in code. The measured cost is a 29-character title clipped to 123–227 px across 760–864 px.
   - **Option B: make the hide title-aware.** The control also hides whenever showing it would ellipsize the title, so the title never shortens while the control is shown. This needs a measure in the mainhead render, not a pure container query. The cost is that a long title (66 characters) hides the control at every header width up to about 1160 px.

### Minor

1. **[web-impl]** While the daemon is down, part of the selection stays live. The card checkboxes and the bar's All and Done stay enabled, while the header checkbox and the other bar buttons are disabled. Measured with select mode on and the banner shown: `cardChk:false`, `All disabled false`, `Done disabled false`, `headChk:true`. The plan's daemon-down list says "bar buttons" are disabled "exactly as the action buttons are". A fix must leave every bar button and both checkbox kinds disabled while disconnected. Escape still leaves the mode.

### Notes

1. **[note]** In the gates directory, `02-test.log` (19:36) records `make test-race` failing at `TestHandleTerminal_SecondSocketSupersedesTheFirst`. `01-test.log` (19:51) is green, and the orchestrator reports one red line (`dead-refs`). This belongs to review-work.
2. **[note]** A drag onto a header scrolled out of view was not measured. Playwright scrolls the target into view mid-drag, and the drop then never lands (b1 kept its group). With both ends on screen in the same overflowing 720 px rail, the drags apply. A native drag would rely on Chromium's edge autoscroll, which this instrument cannot reproduce. Card drag in an overflowing rail predates this plan.
3. **[note]** Removing every session while groups exist leaves each group's empty line and `no ungrouped sessions`. A separate `No sessions yet` sits below the last section (header bottom 370, line at 410–457). E15 asks for that line and it is present. The rail reads two "empty" statements, one under the other. No change requested.
4. **[note]** In edge case 28 with real frames, the select drops the deleted group and shows `No group` within a render tick, so a launch then goes ungrouped without an error. The `unknown group` refusal appears only inside that sub-second window, which `groups-launch.spec.ts` holds open by withholding frames. This matches the plan's "re-populates from the next render".
5. **[note]** `n of m` counts members of collapsed sections that the filter keeps. With A collapsed and filter Groups the count read `3 of 5` while one card was laid out. This matches the spec's "while the filter hides cards". The plan's Web notes say the count comes from `visibleCards`, which skips collapsed sections. That is a statement for review-work.
6. **[note]** A filter the developer picks can hide the focused session (filter Ungrouped while a grouped session is focused). Focus keeps showing it, with one live client and no visible current card in the rail. I4 lists only launch, ⌥⌘0 and default focus as sources, so this is not a violation.
7. **[note]** The selection bar's `Done` is the plan's mode-exit label, not a session state, so design-system §6.5 is not engaged. The planning-state summary dot was not driven, because it needs a plan-mode hook sequence. The other six states were measured against their tokens. xterm `scrollback` is not observable without a page hook. The plan touches no terminal code, and one live client held across collapse and filter.
8. **[note]** Pre-existing, not this plan: with zero sessions `#rail-count` reads `""`, not `0`. Double-clicking the Ungrouped name collapses it, because both clicks read the same state, which follows the recorded single-click-folds deviation.
