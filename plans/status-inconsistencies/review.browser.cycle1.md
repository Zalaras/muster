# Browser review: Status Inconsistencies

**Plan**: status-inconsistencies
**Verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 29004 words (budget 20000)
**Rig**: `make web-build build` at 5c1732a (`bin/musterd` v0.19.1-34-g5c1732a); each test ran a fresh scratch daemon from `helpers/fixtures.ts` (data dir `$TMPDIR/muster e2e-*`, which has a space in it; a private `-S` tmux socket inside it, torn down with it; the shared E2E stub `claude`); headless Chromium 1280×900; throwaway spec `web/e2e/zz-review-browser.spec.ts`, deleted afterwards. Gates log c1: 0 failed lines (e2e 515 passed, web-build green), so the app driven here is the one that ships.

## Matrix

Hosts: **focus** = the Focus-view rail card; **strip** = the Tiles strip card (same template); **tile** = a live tile; **mainhead** = the Focus mainhead. No state colour means the computed `color` equals the resolved `--fg-muted` and matches none of `--teal/--amber/--rose/--violet/--idle`.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-6 | focus | no data | no line at count 0 | pass | `.bg-tasks` hidden=true, computed display `none`, box 0×0; `/api/state` backgroundTasks 0 |
| REQ-6 | focus | data | `1 background task` visible at rest, last line | pass | text and title `1 background task`; display block, opacity 1, visibility visible; last child of `.card-in`; box 14,197–288,213 inside card 0,85–299,224; previous visible row (`.activity.claude`) ends at 190, so no overlap; card-in scrollHeight 138 = clientHeight 138 |
| REQ-6 | focus | data | plural, counts only running entries | pass | a Stop with 2 running + 1 completed gives `2 background tasks`, API reports 2 |
| REQ-6 | focus | data | state and badge unchanged by the count | pass | badge `idle`, API state `idle`, attention null |
| REQ-6 | focus | data | line survives a new turn (`working`) | pass | badge `working`, line `2 background tasks` still inside the card (201–217 in 85–228) |
| REQ-6 | focus | data, compact / expanded / comfortable | contained in every density | pass | compact: bg 166–183 in card 85–191; expanded: 201–217 in 85–228; long-text expanded: 493–510 in 303–521; scrollHeight = clientHeight in each |
| REQ-6 / R2 | focus | data, Instrument / Dark / Light | mono, `--fs-xs`, `--fg-muted`, no state colour, no border | pass | Instrument rgb(178,182,195) = `--fg-muted`; Dark rgb(193,197,204) = `--fg-muted`; Light rgb(65,69,79) = `--fg-muted` (≠ `--idle` rgb(83,87,100)); font ui-monospace 11.25px; border 0; transparent background |
| REQ-6 | focus | data → Stop `[]` | line removed | pass | hidden=true, display `none`; badge `idle`; API 0 |
| REQ-6 / EC12 | focus | data, settled 6 s | line and idle hold across render ticks and a poll tick | pass | after 6 s: line `1 background task`, badge `idle`, API `idle` |
| REQ-6 | focus | daemon-down | card keeps its last-known line; banner shown | pass | after SIGTERM: `#banner` display block, opacity 1, box 0,46–1280,78, text "musterd unreachable — hook output in open panes is Muster's absence, not session failure."; bg line still `1 background task` inside the card |
| REQ-5 | focus | after restart | count persisted | pass | after restart: banner hidden, line `1 background task`, API backgroundTasks 1 |
| REQ-6 / INV-C / EC15 | focus | dead (pane killed with count 1) | line hidden on a dead card | pass | alive false, `.bg-tasks` hidden=true, display `none`; the ended card's acts-row shows Resume and Remove |
| REQ-6 / REQ-8 | focus | needs_input + count | line and attention note together | pass | note `needs your permission — 00:02` visible, bg line 583–600 below it, inside the card |
| REQ-6 | strip | no data | no line at count 0 | pass | before the Stop: strip card has no bg row (strip 116 px tall) |
| REQ-6 | strip | data | line visible and contained | pass | text `1 background task`, opacity 1, display block; box 14,873–1269,890 inside card 0,762–1280,900 inside `#tiles-strip` 0,760.6–1280,900 (viewport 900); scrollHeight 138 = clientHeight 138 |
| REQ-6 | strip | data, compact / expanded | contained | pass | compact: 876–893 in 795–900; expanded: 873–890 in 746–900 |
| REQ-6 | strip | daemon-down | last-known line kept; banner shown | pass | banner display block, same text; strip line `1 background task` in the same box |
| REQ-5 | strip | after restart | persisted | pass | strip line `1 background task` after restart |
| REQ-6 | tile | data | — | N/A — plan §UI Specifications puts the line on the card only; tile shows none (count 0 matches) | |
| REQ-6 | pop-out | any | — | N/A — `/doc.html` hosts no session card | |
| REQ-7 / INV-D | focus | no data, rest | no action button on a live card | pass | the only button in the card is Pin; `.acts-row` hidden=true, display `none`, 0 children, height 0; card-in padding below the last row is unchanged (10 px), so no empty gap |
| REQ-7 / INV-D | focus | data, hover | none on hover | pass | buttons [Pin (opacity 1)]; acts-row display `none` |
| REQ-7 / INV-D | focus | data, current | none while current | pass | aria-current `true`; buttons [Pin]; acts-row display `none` |
| REQ-7 | focus | data, keyboard | no hidden focusable stop left in the card | pass | focus on Pin, then Tab, lands on the mainhead `rename` button (outside the card); Pin keeps focus across 1.2 s |
| REQ-7 / INV-D | focus | daemon-down | none | pass | buttons [Pin]; acts-row display `none` |
| REQ-7 / INV-D | strip | data, rest and hover | none | pass | buttons [Pin]; acts-row hidden, display `none`, 0 children, at rest and on hover |
| REQ-7 | focus | ended, not current | Resume then Remove, revealed on hover or focus | pass | at rest the acts-row has opacity 0, display flex, labels [Resume, Remove]; on hover opacity 1; Tab from Pin gives Resume focus and opacity 1 |
| REQ-7 | focus | ended, current | Resume and Remove shown | pass | acts-row opacity 1, [Resume, Remove] |
| REQ-7 | mainhead | data | End present and working with a pointer | pass | End opacity 1, display block, box 1078,55–1123,80; click → "End session?" dialog → End session → card `ended`, API alive false, tmux pane gone |
| REQ-7 | tile | data | footer End unchanged and working | pass | `.tfoot` End opacity 1, box 591,398–628,417; click opens "End session?" (then cancelled) |
| REQ-1 | focus | idle | a prompt-less idle_prompt changes nothing | pass | 2.5 s later: badge `idle`, note display `none`, API idle, attention null |
| REQ-1 | focus | working | a prompt-less idle_prompt changes nothing | pass | 2.5 s later: badge `working`, note hidden, API working, attention null |
| REQ-2 | focus | needs_input (ExitPlanMode) | unmarked PostToolBatch → planning | pass | before: `needs input` with note `needs your permission`; after, settled 1.5 s: badge `planning`, note hidden, API planning, attention null |
| REQ-3 / INV-B | focus | needs_input (main wait) | subagent Pre/Post/PostToolBatch keep the wait | pass | 2.5 s later: badge `needs input`, note visible, API attention `permission`; a later main PostToolUse gives `working` with attention null |
| REQ-8 | focus | needs_input (subagent wait) | main Stop keeps needs_input and attention | pass | badge `needs input`, note visible, API attention kept, backgroundTasks 1; the owning subagent's PostToolUse then gives `working` |
| REQ-4 | focus | working | interrupt line → idle within 10 s | pass | idle 4.3 s after the append; settled: attention null, failure null; card `unread` (not attached) |
| REQ-4 | focus + mainhead | needs_input, focused | tool-use interrupt → idle | pass | idle after 3.3 s; note hidden, attention null; card `current`, not unread (attached) |
| REQ-4 | tile | working | interrupt → idle | pass | the tile `.sdot` goes from title `working` (teal) to title `idle` (idle grey) after 3.9 s; API idle |
| REQ-1..4, 8 | strip / pop-out | — | N/A — daemon state rows; the strip card is the same `stateBadge` template as the focus row above, and pop-out has no state | | |
| REQ-9 | — | — | N/A — static canary tier, not browser-observable (R3, orchestrator's version ritual) | | |
| REQ-1..4 | any | daemon-down | N/A — these transitions need a running daemon; the daemon-down banner and last-known card are measured above | | |
| §7.1 | tile/focus | data | one live client | N/A — this plan adds no terminal client or surface; the gate e2e (515 green) covers the rule | |

## Issues

### Critical
None.

### Major
None.

### Minor
None.

### Notes
1. **[note]** When a strip card gains the background line, the whole strip grows and the live tiles shrink. Measured at 5 sessions in 2×2: `#tiles-strip` went from 116 to 139 px and the first tile from 349 to 337 px; the tile footer geometry stayed 84×11 at this size. The note and activity rows already make the strip grow the same way, so this is the existing pattern, not a regression. No change requested.
2. **[note]** In Tiles, a session shown as a live tile has no background-task indicator. The line exists only on the card, and cards appear only in the strip there. This matches the plan, whose UI Specifications place the line on the card only. It is recorded because the developer may expect it on the tile header.
3. **[note]** The pop-out (`/doc.html`) is N/A for every row: it hosts no session card and no state.
