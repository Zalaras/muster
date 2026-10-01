# Browser review: Status Inconsistencies

**Plan**: status-inconsistencies
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 29006 words (budget 20000)
**Rig**: `make web-build build` at 90f6149 (`bin/musterd v0.19.1-42-g90f6149-dirty`; only `plans/` files were dirty). Every test ran its own scratch daemon from `helpers/fixtures.ts`: data dir `$TMPDIR/muster e2e-*` (the path has a space in it), a private `-S` tmux socket inside that dir, torn down with it, and the shared E2E stub `claude`. Headless Chromium at the config viewport, 1280×720. Throwaway spec `web/e2e/zz-review-browser.spec.ts` (4 tests, all green), deleted afterwards; `git status --porcelain` shows nothing of mine. Gates log c2b: 0 failed lines (e2e 515 passed, web-build green), so the app driven here is the one that ships.

Since cycle 1, `web/src` changed by one comment line (`web/src/protocol/session.ts`). The daemon changes are `applyTurnClosed` / `applyTurnInterrupted` pulled out of `applyInput`, plus the `InterruptChecker` type. So every daemon transition row (REQ-1..4, REQ-8) and every background-line row was driven again on this build.

## Matrix

Hosts: **focus** = the Focus-view rail card; **strip** = the Tiles strip card (same template); **tile** = a live tile; **mainhead** = the Focus mainhead. "No state colour" means the computed `color` equals the resolved `--fg-muted`.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-6 | focus | no data | no line at count 0 | pass | `.bg-tasks` hidden=true, display `none`, box 0×0; API backgroundTasks 0 |
| REQ-6 | focus | data | `1 background task` visible at rest, last line | pass | text and title `1 background task`; display block, opacity 1, visibility visible; last visible child; box 14,197–288,213 inside card 0,85–299,224; card-in scrollHeight 138 = clientHeight 138 |
| REQ-6 | focus | data | plural, counts only running entries | pass | Stop with 2 running and 1 `completed` shows `2 background tasks`; API 2 |
| REQ-6 | focus | data | state and badge unchanged by the count | pass | badge `idle`, API `idle`, attention null |
| REQ-6 | focus | data, new turn | line kept while `working` | pass | badge `working`, line `2 background tasks` at 201–217, inside card 85–228 |
| REQ-6 | focus | data, compact / expanded / comfortable | contained in each density | pass | compact 166–183 in 85–191 (105 = 105); expanded 201–217 in 85–228 (142 = 142); comfortable same as expanded |
| REQ-6 / R2 | focus | data, Instrument / Dark / Light | `--fg-muted`, mono `--fs-xs`, no border | pass | Instrument rgb(178,182,195) = resolved `--fg-muted`; Dark rgb(193,197,204) = `--fg-muted`; Light rgb(65,69,79) = `--fg-muted`; ui-monospace 11.25px; border 0; transparent background |
| REQ-6 / EC12 | focus | data, settled 6 s | line and idle hold across render and poll ticks | pass | after 6 s: `1 background task`, badge `idle`, API `idle` |
| REQ-6 | focus | data → Stop `[]` | line removed | pass | hidden=true, display `none`, box 0×0; API 0 |
| REQ-6 | focus | daemon-down | last-known line kept; banner prominent | pass | after SIGTERM: `#banner` display block, opacity 1, box 0,46–1280,78, text "musterd unreachable — hook output in open panes is Muster's absence, not session failure."; line `1 background task` at 229–245, inside card 117–256 |
| REQ-5 | focus | after restart | count persisted | pass | banner hidden; line `1 background task`; API 1 |
| REQ-6 / INV-C / EC15 | focus | dead, count 1 | line hidden on an ended card | pass | alive false; `.bg-tasks` hidden=true, display `none` |
| REQ-6 / REQ-8 | focus | needs_input + count | line and attention note together | pass | note `needs your permission — 00:04` at 559–576, line at 583–600 below it, line is the last child |
| REQ-6 | strip | no data | no line | pass | `.bg-tasks` display `none`; strip 622–720 |
| REQ-6 | strip | data | line visible and contained | pass | display block, opacity 1; box 14,693–1269,710 inside card 0,582–1280,720 inside `#tiles-strip` 581–720 (viewport 720); 138 = 138 |
| REQ-6 | strip | daemon-down | last-known line kept | pass | banner visible; strip line same text and box |
| REQ-5 | strip | after restart | persisted | pass | strip line `1 background task` |
| REQ-6 | tile | data | — | N/A — plan §UI Specifications puts the line on the card only; tile `.bg-tasks` count 0 | |
| REQ-6 / REQ-7 | pop-out | any | — | N/A — `/doc.html` hosts no session card and no state | |
| REQ-7 / INV-D | focus | data, rest / hover / current | no action button on a live card | pass | buttons [Pin] only in all three; `.acts-row` hidden=true, display `none`, 0 children, height 0; aria-current `true` when current |
| REQ-7 | focus | data, keyboard | no hidden focusable stop in the card | pass | Pin keeps focus for 1.2 s; Tab moves to the mainhead rename button (`rb-bg`), outside the card |
| REQ-7 / INV-D | focus | daemon-down | no action button | pass | buttons [Pin]; acts-row display `none` |
| REQ-7 / INV-D | strip | data, rest and hover | no action button | pass | buttons [Pin]; acts-row hidden, display `none`, 0 children |
| REQ-7 | focus | ended, not current | Resume then Remove, shown on hover or focus | pass | at rest acts-row display flex, opacity 0, labels [Resume, Remove]; after hover, opacity 1; Tab from Pin focuses Resume and the row goes to opacity 1 |
| REQ-7 | focus | ended, current | Resume and Remove shown | pass | after mainhead End: class `ended current`, acts-row opacity 1, [Resume, Remove] |
| REQ-7 | mainhead | data | End present and works with a pointer | pass | End opacity 1, display block, box 1078,55–1123,80; click opens "End session?"; End session gives API alive false and the tmux pane is gone |
| REQ-7 | tile | data | footer End unchanged | pass | `.tfoot` End opacity 1, box 591,308–628,327; click opens the End dialog (cancelled with Escape) |
| REQ-1 | focus | idle | prompt-less idle_prompt changes nothing | pass | 2.5 s later: badge `idle`, note display `none`, API idle, attention null, failure null |
| REQ-1 | focus | working | prompt-less idle_prompt changes nothing | pass | 2.5 s later: badge `working`, note hidden, API working, attention null |
| REQ-2 | focus | needs_input (ExitPlanMode) | unmarked PostToolBatch → planning | pass | before: `needs input`, note `needs your permission`; settled 1.5 s later: badge `planning`, note hidden, API planning, attention null |
| REQ-3 / INV-B | focus | needs_input (main wait) | subagent Pre/Post/PostToolBatch keep the wait | pass | 2.5 s later: badge `needs input`, note visible, API attention `permission`; then main PostToolUse gives `working`, attention null |
| REQ-3 / INV-B | focus | needs_input (subagent wait) | main and second-subagent PostToolUse keep the wait | pass | badge `needs input`, note visible, API attention `permission` |
| REQ-8 | focus | needs_input (subagent wait) | main Stop keeps needs_input and attention | pass | badge `needs input`, note visible, API attention kept, backgroundTasks 1; the owning subagent's PostToolUse then gives `working`, attention null |
| REQ-4 | focus | working, not current | interrupt line → idle within 10 s | pass | idle 3.3 s after the append; settled: attention null, failure null; card `s-idle unread` |
| REQ-4 | focus + mainhead | needs_input, current | tool-use interrupt → idle | pass | idle after 3.3 s; note hidden, attention null; card `s-idle current`, not unread |
| REQ-4 / EC7 | focus | working on p2 | interrupt for older p1 ignored; p2's line → idle | pass | after 6 s hold: `working`, API working; after the p2 line: `idle` |
| REQ-4 | strip | working | interrupt → idle | pass | the session landed in the strip (6th session), and the strip badge went `working` → `idle` within 10 s |
| REQ-4 | tile | working | interrupt → idle | [note] not re-measured this cycle; see Note 1 | |
| REQ-1..3, 8 | strip / pop-out | — | N/A — the strip card is the same `stateBadge` template measured on focus; pop-out has no state | | |
| REQ-9 | — | — | N/A — static canary tier, not browser-observable (R3) | | |
| REQ-1..4 | any | daemon-down | N/A — these transitions need a running daemon; daemon-down banner and last-known card are measured above | | |
| §7.1 | tile/focus | data | one live client | N/A — the plan adds no terminal client or surface; gate e2e (515 green) covers the rule | |

## Issues

### Critical
None.

### Major
None.

### Minor
None.

### Notes
1. **[note]** REQ-4 on a live tile's `.sdot` was not re-measured. My tile-host session was the sixth, so it was demoted to the strip, and I measured the interrupt there instead (strip badge went `working` → `idle`). Cycle 1 measured the tile dot going `working` → `idle` in 3.9 s. Since then `web/src` changed by one comment, and the interrupt path is the same daemon broadcast that the focus and strip rows observed on this build. No change requested.
2. **[note]** As in cycle 1: when a strip card gains the background line, the strip grows (581 vs 622 top at 720 px) and the live tiles shrink. This is the existing pattern for note and activity rows. No change requested.
3. **[note]** As in cycle 1: a session shown as a live tile has no background-task indicator, because the plan puts the line on the card only.
