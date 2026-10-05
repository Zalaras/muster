# Browser review: Rail groups

**Plan**: groups
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 39368 words (budget 20000)
**Rig**: `bin/musterd` built fresh by `make web-build build` at c9902fc4 (clean tree). Each test ran its own `ScratchDaemon` from `web/e2e/helpers/fixtures.ts`: a space-bearing data dir `$TMPDIR/muster e2e-XXXX`, a private socket `<data dir>/tmux.sock` removed with it, and the shared E2E stub `claude` at `$TMPDIR/muster e2e-stub-cd75a542396fd84f/claude`. Driven by headless Chromium through throwaway `web/e2e/zz-rb2-*.spec.ts` specs in the foreground, now deleted with their `test-results` folders. Afterwards no `musterd` or tmux process was left, and `git status --porcelain` showed nothing of mine.

Gates log read, not re-run (`gates-groups-c2`). Every line is green: `web-build` built, `e2e` reads `713 passed (5.0m)`, `dead-refs` reads `0 missing`. The app I drove is the one that ships.

This cycle re-drove the whole matrix, because the fix wave touched almost every surface: the menu and popover placement (`placeAnchored`), the option builder behind the launch and delete selects, select mode (moved to its own module), both group dialogs, the card drop zones, the session decoder and the daemon's batch and reorder paths. REQ-10 is measured against its amended text: the control hides below a 640 px content box, and above that the title may shorten beside it, never below its 6rem floor.

## Matrix

Hosts are `focus` (rail, mainhead, launch dialog), `tiles` (grid, strip, launch dialog opened from Tiles) and `pop-out` (`/doc.html`).

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| all rows | pop-out | all | — | N/A — `/doc.html` hosts only the reader | `grep -c 'rail\|sessions\|mainhead' web/doc.html` → 0 |
| States | focus | no data yet (WS routed silent) | no header, no filter, no select bar before the first snapshot | pass | heads 0; `#rail-filter` display none; `#select-bar` display none |
| REQ-15 | focus | no data | Select and ⋯ sit inside the rail head | pass | Select 202,83–257,102 and ⋯ 263,83–287,102 inside railhead 0,46–299,112 |
| REQ-15 | focus | data, no groups | flat rail: no header, no filter, count as today | pass | heads 0; filter display none; count `3` |
| Views: rail ⋯ | focus | data, no groups | opened by Enter: New group… enabled, both collapse items disabled, hint `aria-hidden`, menu below its opener and inside the viewport | pass | menu 263,106–453,206 under opener 263,83–287,102; `aria-expanded=true` |
| Views: menu | focus | data | ArrowDown moves focus; Escape closes and returns focus to the opener | pass | focus on `New group…`; menus 0; active `rail-actions-button` |
| REQ-1 | focus | data, no groups | New group…: pending section above the first card, `Group name` focused, same node after a tick | pass | pending 0,112–299,146 above card 0,146–299,285; same node after 1300 ms |
| REQ-1/E2 | focus | data, no groups | Escape, empty Enter and blur each discard with no request | pass | fields 0 each time; heads 0; requests `[]` |
| REQ-1 | focus | data | ⌥⌘G opens the field focused; 45 typed characters keep 40 | pass | length 40 |
| REQ-1/E1/I6 | focus | data | Enter keeps the trimmed name; Ungrouped header and filter appear; count unchanged | pass | `   Review queue   ` → DOM and daemon `Review queue`; one `POST /api/groups`; filter display flex; count `3` |
| REQ-15 | focus | data | row 2 (filter, Select, ⋯) fits the 300 px rail head | pass | filter 12–178, Select 202–257, ⋯ 263–287 in head 0–299; row 2 scroll 275/275 |
| Views: sections | focus | data | a 40-character name ellipsizes; summary and ⋯ stay inside the header | pass | name 28–227 clipped; sum 233–263 and ⋯ 269–291 inside head 0–299 |
| Views: header ⋯ | focus | data | ⋯ opacity 0 at rest, 1 on hover and on keyboard focus | pass | `0`, `1`, `1` |
| REQ-2 | focus | data | double-click opens a prefilled, fully selected, focused field inside the header; same node after a tick | pass | `{"v":"Alpha","s":0,"e":5}`; field 28,123–168,138 in head 0,114–299,148 |
| E3/edge 12 | focus | data | Escape and a whitespace-only Enter restore the name with no request | pass | `Alpha` both; requests `[]` |
| REQ-2/E3 | focus | data | new name shows at once in header, daemon, Focus control, popover and launch Group options | pass | `Alpha two▾`; popover `Alpha two 2 sessions…`; options `No group, Alpha two, Beta, New group…` |
| REQ-2 (fix wave) | focus | data, rename `PUT` answered but its response held | a second name field opened meanwhile survives the answer, keeps focus and its typing | pass | after release: B fields 1, value `typing-in-b`, focused |
| REQ-1 (fix wave) | focus | data, create `POST` answered but its response held | a rename field opened meanwhile survives the answer, keeps focus and its typing | pass | after release: B fields 1, value `still-typing`, focused; Enter then committed it |
| Views: header ⋯ | focus | data | items and order; menu right-aligned under its ⋯, inside the viewport | pass | `Rename, Collapse, Select all (6), New group…, Stop all…, Ungroup, Delete group…`; menu 269,142–459,359 under ⋯ 269,124–291,138 |
| Views: header ⋯ | focus | data | Ungrouped menu omits Rename, Ungroup and Delete group… | pass | `Collapse, Select all (1), New group…, Stop all…` |
| Views: header ⋯ | focus | data | Rename chosen by keyboard leaves its field focused across a tick | pass | same node after 1300 ms |
| REQ-3 | focus | data | a click on the header's blank part collapses: body none, caret `Expand Alpha`, `aria-expanded=false`, `.collapsed`, daemon collapsed | pass | collapsed 12 ms after the click |
| REQ-3 | focus | data | the caret by keyboard toggles and keeps its node focused across a tick; ⋯ → Collapse collapses | pass | body none; same node |
| REQ-3 | focus | data | a single click on a renameable group's name does not fold | N/A — recorded deviation, kb:adr/rail-group-name-click-does-not-fold | not collapsed after 2 s |
| Views: rail ⋯ | focus | data | collapse items enabled; Collapse all flips every section, Ungrouped included | pass | daemon `[true,true,true]`; laid-out cards 0 |
| REQ-3/REQ-17/REQ-20 | focus | data, reload | section order and collapsed state survive; filter resets to All | pass | `["1","2","ungrouped"]` before and after; B body none; filter `All` |
| REQ-20/E6 | focus | data, daemon restarted | order, membership and collapsed state survive | pass | sections = oracle; A `[1,2]` = oracle; B body none |
| REQ-4/E4 | focus | data, empty group | count 0, no dots, drop line shown; Select all (0) and Stop all… disabled; Rename and Delete group… offered; popover `empty` | pass | line `empty — drop sessions here` display block 0,493–299,533 |
| REQ-16 | focus | data | count, then one item per state in attention order, each title `1 <word>`, matching the daemon | pass | `needs_input, failed, started, working, idle, ended`; daemon states agree |
| REQ-16 / §3 | focus | data | each dot is its state's token; ended is `--line-control` | pass | backgrounds equal `--amber`, `--rose`, `--fg-muted`, `--teal`, `--idle`, `--line-control` |
| REQ-16 | focus | data | six items fit the 300 px header | pass | sum 118–263, ⋯ 269–291, head 0–299 |
| REQ-16 | focus | data | popover absent at 150 ms, then below the header, inside the viewport, pointer-events none | pass | count 0 at 150 ms; tip 8,152–228,376 under head 114–148 |
| REQ-16/E9 | focus | data | popover names the group, `6 sessions`, each state word and each member | pass | `Six 6 sessions needs input 1 p-need … ended 1 p-end` |
| Views: popover | focus | data | removed on leave; caret focus shows it; Tab removes it | pass | 0 after leave; 0 after Tab |
| Views: popover, menu | focus | data, header near the viewport bottom (330 px tall) | popover and ⋯ menu stay inside the viewport | pass | head 158–192; tip 8,196–228,265; menu 269,186–459,322 |
| REQ-9/E5 | focus | data, manual, both ends on screen | card dropped on a header joins the end of that section (DOM = daemon) | pass | `[1,2,5]` both; invariant problems `[]` |
| REQ-9/E5 | focus | data, manual | card dropped on a pinned card of another section joins it there and takes its pin | pass | `[2,3,4]` both; a2 pinned |
| REQ-9 | focus | data, manual | card dropped on the Ungrouped header leaves its group | pass | Ungrouped `[6,1]` both |
| REQ-4/REQ-9 | focus | data, manual | card dropped on an empty group's drop line joins it | pass | `[6]` both |
| REQ-8/E10 | focus | data, manual | header dragged above another reorders the sections | pass | `["2","1","3","ungrouped"]` both |
| REQ-25/E10 | focus | data, attention | Ungrouped header drags; cards `draggable=false`, headers `true` | pass | `["ungrouped","2","1","3"]` both |
| REQ-8 | focus | data, reload | section order survives | pass | `["ungrouped","2","1","3"]` both |
| edge 16/E11 | focus | data, manual | header onto a card, card onto the rail head and onto the filter: nothing sent or changed | pass | requests `[]`; order unchanged; no drop class left |
| REQ-8/REQ-9 | focus | data, ends off screen | drag with the source below the fold | not measured — Note 2 | |
| REQ-7 | focus | data | Stop all… dialog copy, inside the viewport | pass | `Stop 2 sessions?`; body ends ` The group stays.`; `Cancel, Stop 2`; 420,282–860,438 |
| REQ-7/E14 | focus | data | members end and stay in the group; ended dot reads 2 | pass | `1:false, 2:false` in A; ended `2` |
| REQ-5 | focus | data | delete dialog: title, count body, three radios with Ungrouped checked, Target group, footer, no overflow | pass | `Delete group “Bb”?` / `…its 1 session.`; target `Aa, Cc, Dd`; 438/438 × 388/388 |
| REQ-5 | focus | data | a radio and Target group keep focus across a tick | pass | both true |
| REQ-5/E7 | focus | data | Move to another group (end of Aa), Move to Ungrouped, Stop and remove, each against the daemon | pass | A `[1,2,3]` = oracle; c1 groupId null; d1 row and tmux pane gone |
| Views: delete dialog | focus | data | an empty group shows the one line and hides the radios | pass | `The group is empty; nothing else changes.`; choices display none |
| Views: delete dialog | focus | data, one group | the other-group radio and Target group are not laid out | pass | target no box under a `[hidden]` ancestor; radios `Move them to Ungrouped`, `Stop and remove them` |
| REQ-6 | focus | data | Ungroup: no dialog; members keep relative order in Ungrouped | pass | `[1,2,3]` → Ungrouped `[6,1,2,4,3]`; dialogs 0 |
| REQ-15/I6 | focus | data | deleting the last group removes the Ungrouped header and the filter | pass | heads 0; filter display none |
| REQ-12 | focus | data (12 cards) | Select: a checkbox per card (12) and header (3), cards `draggable=false`, pin display none, `aria-pressed=true` | pass | as stated |
| REQ-12 | focus | data, overflow (640 px tall) | bar at the rail's foot inside rail and viewport; list scrolls above it; buttons inside the bar | pass | rail 0,46–300,640; bar 0,579–299,640; list 114–579, scroll 1764/465 auto |
| REQ-12 | focus | data, overflow | scrolled to the end, the last card sits above the bar | pass | last card bottom 579 = bar top 579 |
| Views: sections | focus | data, overflow | a section header sticks to the list top | pass | head y 114 = list y 114 at scrollTop 120 |
| REQ-12 | focus | data | at 0 selected: `Select sessions`; Move to, Ungroup, Stop…, Remove… disabled | pass | All and Done enabled |
| REQ-12/E13 | focus | data | card clicks toggle; `2 selected`; mainhead and current marker unchanged | pass | mainhead `s10-card`; current `[10]` |
| Views / §3 | focus | data | a selected card is a neutral `--fg` stripe on `--bg-hover` | pass | stripe and inset shadow rgb(232,230,225) = `--fg`; ground rgb(28,32,41) = `--bg-hover` |
| REQ-12 | focus | data | Space on a card checkbox toggles it and keeps its node across a tick | pass | `3 selected`; same node |
| REQ-12/E13 | focus | data | a header checkbox selects its members | pass | 3 → 5 selected |
| REQ-12 | focus | data, compact / comfortable / expanded | checkbox inside the card, clear of the title; compact height and title line unchanged | pass | compact 102.5 → 102.5; title y unchanged (Note 4) |
| REQ-12 | focus | data, select off | header checkboxes left in the DOM are not laid out | pass | `hidden`, display none, 0 rects |
| REQ-13 | focus | data | Move to opens above its button, inside the viewport, clear of the bar's buttons; items as planned | pass | menu 88,438–278,584; opener 88,588; `Move to` header, `Grp A, Grp B, New group…, Ungrouped` |
| REQ-13/E14 | focus | data | Move to Grp A puts the selection at its end; selection kept; tick then on Grp A | pass | `[1,2,3,6,7]` both; `✓Grp A` |
| REQ-13 | focus | data | New group… modal titled from the count, field focused across a tick; Create makes the group with the selection | pass | `New group from 2 sessions`; members `[6,7]` = DOM |
| REQ-13 | focus | data | Stop… and Remove… copy with one ended session selected | pass | `Stop 2 sessions?` / `Remove 3 sessions?`, `2 of them are alive…`, `Remove 3` |
| REQ-12 | focus | data | Escape with the Move to menu or a bulk dialog open closes only that, keeping the selection | pass | bar flex; `2 selected` / `3 selected` |
| REQ-27/edge 8 | focus | data, a selected session removed behind the open dialog | the daemon skips it and the fixed phrase shows; a later complete batch clears it | pass | one `POST /api/sessions/remove`; `Not every session was handled — some were skipped or failed.` display block; then display none |
| REQ-14/E15 | focus | data → no data | Select → All → Remove 4 with a group present: `No sessions yet`, mainhead hidden, mode off | pass | daemon sessions 0 (layout: Note 3) |
| REQ-12/E12 | focus | data, attention, no groups | select mode works; Move to offers `New group…, ✓Ungrouped`; Ungroup disabled; New group… makes the group | pass | group `[1]` |
| REQ-12/E16 | focus | data | Escape, Done and switching to Tiles each leave the mode; re-entry starts at 0; cards draggable again | pass | `Select sessions`; Tiles group chrome 0 |
| REQ-11 | focus | data | Group row under Title inside the dialog, defaulting to the focused session's group; name field hidden | pass | select 381,478–561,508 under Title 439–467; field display none |
| REQ-11 | focus | data | keyboard typeahead picks New group…; the field appears beside it; select and field keep node and focus across a tick | pass | field 569,479–983,507; both same node |
| REQ-11 | focus | data, Resume tab | the same row shows inside the dialog, keeping the choice | pass | select 381,496–561,526 |
| REQ-11/E18 | focus | data | a refused launch with New group… creates neither; the name is kept | pass | groups `Alpha, Bravo`; sessions 3; field `Hotfix` |
| REQ-11/E18 | focus | data | the retry creates group and session; the card is its only member, focused | pass | Hotfix `[4]`; control `Hotfix▾`; `aria-current=true` |
| REQ-11 | focus | data | a launch into an existing group lands at its end | pass | `[1,2,5]` both |
| edge 28/E19 | focus | data, real frames | the chosen group deleted while the dialog is open | observed — Note 5 | select falls to `No group` 15 ms after the delete |
| REQ-26/edge 21 | focus | data, `groups` frame withheld | a card naming an unknown group renders in Ungrouped with no error; the next frame corrects it | pass | Ungrouped `[3,2]`, errors `[]`; then Bravo `[2]` |
| REQ-11/edge 27 | tiles | data | a dialog opened from Tiles defaults to the focused session's group, inside the dialog | pass | `Bravo` |
| REQ-19/E20 | focus | data, A collapsed | ⌥⌘1 focuses the first displayed card | pass | `c-b1`; displayed `[3,4,5]` |
| REQ-17 | focus | data, filter Groups | count `n of m`; the filter button keeps focus across a tick when pressed by Enter | pass | `3 of 5` (Note 6) |
| REQ-19/E20 | focus | data, filter Groups | ⌥⌘1 focuses the first grouped displayed card | pass | `c-b1` |
| REQ-19/I4/E21/E22 | focus | data, filter Ungrouped, A collapsed | ⌥⌘0 onto a2: section expands, filter flips to All, card current | pass | card 287–430 inside list 114–720 |
| I4/E22 | focus | data, filter Groups | an ungrouped launch flips the filter to All, shows the plain total and focuses the new card | pass | filter `All`; count `4` = daemon 4; mainhead `q-new` (scroll: Note 7) |
| REQ-10 | focus | data | control between the name and the repo readout, with its title and `aria-hidden` caret | pass | name 314–404, control 416–469, meta 481–682 |
| REQ-10 | focus | data | click opens Move to below the control, inside the viewport: header, groups with tick, New group…, No group | pass | menu 416,83–606,229 |
| REQ-10 | focus | data | Escape returns focus to the control | pass | active `ingroup` |
| REQ-10 | focus | data | arrows move focus; Enter on Bravo moves the session to Bravo's end; focus returns and holds across a tick | pass | B DOM `[2,1]` = oracle; label `Bravo▾` |
| REQ-10 | focus | data | ungrouped reads `no group`; New group… opens the naming modal and the session joins the new group | pass | `New group from 1 session`; Charlie `[3]`; `Charlie▾` |
| REQ-10/E27 (amended) | focus | data, 29-char title, 6-char folder | 8 px sweep 1240→480: control shown iff content box ≥ 640; title ≥ 6rem; folder at its 8ch floor; no overlap; fit clean | pass | fails `[]`; last shown at content 644, first hidden at 636; title shortened beside the control at 800 (163 px), which the amendment allows |
| REQ-10/E27 (amended) | focus | data, 66-char title, 6-char folder | same sweep | pass | fails `[]`; title 163–510 px while shown, floor 90 px |
| REQ-10/E27 (amended) | focus | data, 29-char title, 10-char folder | same sweep; folder at or above its floor, never hidden | pass | fails `[]`; folder 54–81 px against a 54 px floor |
| REQ-10 (fix wave) | focus | data | the boundary is strict: content box 641 and 640 shown, 639 hidden | pass | `641:flex, 640:flex, 639:none` in all three setups |
| REQ-10 | tiles | data | — | N/A — the plan gives Tiles no group control | |
| I7/E23 | tiles | data, A collapsed, filter set, select mode on | grid and strip carry no header, section, checkbox or group control | pass | group chrome 0 |
| I7/E23 | tiles | data | the strip follows the flat order | pass | strip `[5]`, the flat order `[4,5,1,2,3]` minus the four grid tiles |
| REQ-12/E16 | tiles | data | switching to Tiles left select mode | pass | back in Focus `aria-pressed=false` |
| REQ-1/W11 | tiles | data | ⌥⌘G is inert; no pending section back in Focus | pass | pending 0; groups 2 |
| rail rows (REQ-1–9, 12–19) | tiles | all | — | N/A — the rail is hidden in Tiles; the I7 rows cover what Tiles shows | |
| States | focus | daemon-down | banner shown, inside the viewport | pass | 1280×32 at 0,46 |
| States/E24 | focus | daemon-down, select mode on | the open header menu closes; every card and header checkbox, every bar button (All and Done included), Select, rail ⋯, carets, header ⋯ and the Focus control disabled; headers not draggable | pass | menus 0; all `disabled`; draggable `false`×2 (cycle 1 Minor 1 fixed) |
| States (fix wave) | focus | daemon-down | forced clicks on a card, a card checkbox and a header ⋯ change nothing | pass | still `1 selected`; menus 0; focused session unchanged |
| States (fix wave) | focus | daemon-down | Escape still leaves select mode | pass | `aria-pressed=false`; bar display none |
| States | focus | daemon-down | header click and name double-click do nothing; ⌥⌘G opens nothing; the Focus control opens nothing | pass | body block; fields 0; menus 0 |
| States/E24 | focus | reconnect | sections render once each; controls enabled again | pass | `["1","ungrouped"]`; cards 3 |
| States/E24 | focus | daemon down, then back, select mode on | select mode and its selection survive; controls enabled | pass | `1 selected`; bar enabled per selection; checkboxes enabled |
| REQ-5/E24 | focus | daemon-down | the delete-group dialog closes on the status change; on reconnect the sections render once | pass | `open:false`, display none; `["1","ungrouped"]` |
| States | tiles | daemon-down | — | N/A — Tiles has no group control | |
| edge 7/E25 | focus (second window) | data | create, rename, collapse and delete reach the other window without reload | pass | p2 heads follow; filter display none after the delete |
| window state | focus (second window) | data | a filter in one window leaves the other on All | pass | p2 `All` |
| E26/edge 17 | focus | data, delete dialog open | ⌥⌘1, ⌥⌘0 and ⌥⌘G change nothing | pass | focused unchanged; pending 0; dialog open |
| §7.1 | focus | data, focused section collapsed | one live client and the pane are kept | pass | attached clients 1 → 1; xterm display block |
| §6 | focus | all | no gauge, Done state, cost or unlabelled stale display among the plan's surfaces | pass | summaries count known states; ended is neutral; the bar's `Done` is a mode exit |
| daemon fix wave | focus | data, a `newGroup` launch in flight | a section reorder succeeds while a launch holds its group | not measured — Note 8 | |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** While a rename's `PUT` response is held, the name field stays open on the old header after the daemon's `groups` frame has arrived. It closes when the response lands. In real use this lasts one round trip, and the identity guard keeps a second field safe through it.
2. **[note]** A drag whose source starts below the fold was not measured. When Playwright scrolls the rail between `mouse.down` and the first move, Chromium picks the card now under the original point. In a 720 px viewport this moved `d-b1` instead of `d-u1`, and a header drag moved the wrong section. With both ends on screen in a 1400 px viewport, every drag landed as intended and DOM matched the daemon. A real pointer cannot scroll between press and drag start, so I read this as the instrument. Cycle 1's Note 2 hit the same limit.
3. **[note]** Removing every session while groups exist leaves each group's empty line and `no ungrouped sessions`, with a separate `No sessions yet` below the last section. E15 asks for that line and it is present. No change requested.
4. **[note]** In select mode the card title moves right by 21 px at every density (compact x 14 → 35), and its line and the card's height do not change. This matches the mockup's `.card .chk.left` (static, 8 px right margin). The plan's Web note says the checkbox sits "in the stripe column's gutter". That statement is review-work's to weigh.
5. **[note]** In edge case 28 with real frames, the launch select drops the deleted group and shows `No group` within 15 ms. A launch then goes ungrouped without an error. The `unknown group` refusal shows only inside that window, which `groups-launch.spec.ts` holds open by withholding frames. This matches the plan's "re-populates from the next render".
6. **[note]** `n of m` counts members of collapsed sections that the filter keeps (`3 of 5` with one card laid out). This is unchanged from cycle 1 and matches the spec's wording.
7. **[note]** The rail never scrolls a newly focused card into view. After the I4 filter flip, the launched card sat at 736–875, below the list's 720 bottom, with `scrollTop` 0. The same happens with no groups (card 666–805) and for ⌥⌘5 onto an off-screen card. No `scrollIntoView` exists in `web/src`, so this predates the plan. E22's "visible" holds in the sense the plan means: the card is in a shown section and is current. A backlog entry may be worth it.
8. **[note]** The daemon fix "a held launch group no longer blocks reorder" has no browser instrument. The group is held only while a `newGroup` launch is inside the daemon, which the stub `claude` and tmux finish in milliseconds. A response hold delays only the answer, after the hold has ended. The unit test the fix names is review-work's to read.
9. **[note]** Pre-existing, not this plan: with zero sessions `#rail-count` reads `""`, not `0`. A single click on a renameable group's name does not fold it; this is the recorded deviation kb:adr/rail-group-name-click-does-not-fold. The Ungrouped name still folds.
