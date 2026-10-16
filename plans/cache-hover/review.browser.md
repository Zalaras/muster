# Browser review: cache-hover

**Plan**: cache-hover
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 8851 words (budget 30000)
**Rig**: `make web-build build` at 6ea1cf05; per-test scratch `bin/musterd` from `helpers/fixtures.ts` (space-bearing data dir `$TMPDIR/muster e2e-*`, private `-tmux-socket` inside it, stub `claude` at `$TMPDIR/muster e2e-stub-*/claude`); headless Chromium 1280×720; throwaway spec `web/e2e/zz-review-browser.spec.ts`, run alone with `--workers=1` under the gate lock, then deleted.

Gates (`gates-cache-hover-c2b`): 0 failed lines. `17-e2e` 913 passed, `18-E1` 18 passed, including the new daemon-down test. The app I drove is the one that will ship.

Scope of this cycle: the only source change since cycle 1 is `34494f4a`, which removes `cardTip.close()` from the `status` handlers in `features/rail.ts` and `features/tiles.ts`. I re-measured the whole matrix on the new binary, because removing a close path can leave a panel stranded. I added cells for the close paths the removed handler might have been covering: a keyboard view toggle, a daemon restart and reconnect, and a pointerdown on a strip card. Cycle 1's Major 2 (the flipped panel covering the title) was settled as option A and is not re-measured as a requirement.

## Matrix

Hosts: **rail** (focus view) and **strip** (the Tiles strip card). **pop-out**: N/A for every row, because `/doc.html` hosts no session card. **rail × tiles view**: N/A, because the rail is not laid out in Tiles (`#sessions` has 0 client rects). States: **data** (warm/cooling/cold), **no data** (`cache unknown`, no `prompt_cache` posted yet), **down** (the scratch daemon is stopped with SIGTERM through `daemon.kill()`).

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 | rail | data | opens POPOVER_DELAY_MS after the pointer enters | pass | pointer move to panel present (10 ms poll): 347, 338, 279 ms |
| REQ-1 | strip | data | opens after the delay | pass | 358, 349 ms |
| REQ-1 | rail | data | role=tooltip, under BODY, text `cache warm · cold in 60m` | pass | `{role:"tooltip", parent:"BODY", text:"cache warm · cold in 60m"}` |
| REQ-1 | rail | data (cold) | text `cache cold` | pass | page clock +3700 s, open panel reads `cache cold` |
| REQ-1 | rail | no data | text `cache unknown` | pass | panel `cache unknown`; timer `aria-description` `cache unknown` |
| REQ-1 | strip | data | text | pass | `cache warm · cold in 40m` |
| REQ-1 | rail | data | visible (computed) | pass | opacity 1, display block, visibility visible |
| REQ-1 | strip | data | visible (computed) | pass | same values |
| REQ-1 | rail | data | placed below the timer, inside the host and the viewport | pass | timer 224,145–261,159; panel 224,163–393,184 (4 px gap); `#sessions` 0,112–299,720; it does not reach `.name` 14,121–44,139 |
| REQ-1 | strip | data | placed inside the viewport | pass | timer 1205,638–1242,652; panel 1103,656–1272,677 (right-clamped, 4 px gap); strip 0,605–1280,720; it does not reach `.name` 14,615–53,633 |
| REQ-1 | rail | down | opens while down | pass | opened 283 ms after the pointer entered, with the `musterd unreachable` alert showing |
| REQ-1 | strip | down | opens while down | pass | opened at 307 ms (this cell was inferred in cycle 1; it is now driven) |
| REQ-2 | rail | down | an open panel survives the transition into down | pass | opened, then `daemon.kill()`: 58 samples over 6 s, min 1, max 1 |
| REQ-2 | rail | down | a panel opened while down stays open across reconnect attempts | pass | 86 samples over 9 s, min 1, max 1 (cycle 1: 0 of 12) |
| REQ-2 | strip | down | survives the transition, and stays open across reconnect attempts | pass | 48 samples over 5 s and 86 over 9 s, all count 1 |
| REQ-2 | rail | down | counts down live | pass | clock +50 min while down: `cache warm · cold in 10m` |
| REQ-2 | strip | down | counts down live | pass | clock +30 min while down: `cache warm · cold in 10m` |
| REQ-2 | rail | down | closes when the pointer leaves the card | pass | mouse to (1,1): 0 after 1.2 s |
| REQ-2 | rail | down→data | settled after the daemon restarts and the dashboard reconnects | pass | alert gone; 1.5 s later the panel is still open on the same timer: timer 224,145–261,159, panel top 163, text `10m`, so it is neither stranded nor stale |
| REQ-2 | rail | data | counts down live | pass | clock +50 min with no re-hover: `60m` → `10m` |
| REQ-2 | rail | data | stays open as the card slides under a still pointer, and moves with it | pass | a long prompt on the card above moved the timer from 296 to 332 (bottom 346). Panel still 1, top 350 (gap 4), checked after a 1.5 s render pass |
| REQ-2 | rail | data | closes on pointerdown | pass | 0 after a 1.2 s render pass |
| REQ-2 | strip | down | closes on pointerdown | pass | 0 while the button is down and 0 at +50 ms. The click then promotes the card into the grid, and the tile it displaces (`rbs-4`) drops into the strip under the still pointer. That card's own panel opens at +400 ms because the pointer is on its timer, which is a fresh `mouseenter` and not the closed panel coming back (Note 1) |
| REQ-2 | rail | data | closes when the pointer leaves the card | pass | 0 |
| REQ-2 | strip | data | closes when the pointer leaves the card | pass | 0 |
| REQ-2 | rail | data | closes when the hovered card is removed (Edge 2) | pass | DELETE `/api/sessions/{id}` with the panel open: 0 at +1.3 s |
| REQ-2 | rail | data | one panel at a time | pass | hovering a second card's timer: count 1, that card's text `20m`, at its timer |
| REQ-2 | rail | data | closes when a keyboard view toggle hides the host (⌘\ to Tiles) | pass | panel 1 before; `#sessions` 0 rects and panel 0 at +1.5 s |
| REQ-2 | strip | data | closes when a keyboard view toggle hides the host (⌘\ to focus) | pass | strip 1→0 rects; panel 0 at +100 ms and at +1.6 s |
| Edge 1 | rail | data | the pointer leaves the timer before the delay → no panel | pass (E1) | committed test green in `18-E1`; cycle 1 measured it by hand, and no code on this path changed |
| Edge 3 | rail | data | rail scroll under a still pointer | pass (cycle 1) | measured in cycle 1; the scroll path (boundary events plus `refresh`) is untouched by `34494f4a`. Not re-driven (Note 2) |
| REQ-3 | rail | data | no `title`; `aria-description` holds the warmth text; `aria-label="time in state"` | pass | `{title:null, desc:"cache warm · cold in 60m", label:"time in state"}` |
| REQ-3 | strip | data | no `title`; `aria-description` holds the warmth text | pass | `{title:null, desc:"cache warm · cold in 40m"}` |
| REQ-4 | rail | data | the group header timer keeps its native `title` | pass | `.gsum [data-cache]` `{title:"2 of 2 warm · next cold in 20m", desc:null}` |
| REQ-4 | rail/strip | data/down | the panel takes no click | pass | computed `pointer-events: none` in every opened panel |
| Rev-verified | rail/strip | data | opens below the timer, clear of the title | pass | see the placement rows. The flip case was accepted in cycle 1 (option A) and is not re-raised |
| §6 honesty | rail/strip | no data | unknown is shown as the word, not as an empty track | pass | `cache unknown`; no cost or spend figure, no "Done" |
| §6 honesty | rail | down | daemon-down is surfaced prominently | pass | `role=alert` "musterd unreachable — …": display block, opacity 1, box 0,46–1280,78 (full width) |
| any | pop-out | any | — | N/A: `/doc.html` hosts no session card or timer | |
| any | rail | tiles view | — | N/A: the rail is not laid out in Tiles (0 client rects) | |

## Issues

### Critical

None.

### Major

None. Cycle 1 Major 1 is fixed: measured in the rail and in the strip, both for a panel opened before the drop and for one opened during it.

### Minor

None.

### Notes

1. **[note]** In the strip, a click promotes the card, and the tile it displaces slides into the strip under the pointer. When the pointer rests on the incoming card's timer, that card's panel opens 350 ms later. This is the same rule as cycle 1's "a card move puts the pointer on another card". It is the plan's behaviour, and no change is requested.
2. **[note]** I did not re-drive Edge 3 (rail scroll) or Edge 1 by hand this cycle. Neither path is touched by the only source change (`34494f4a`). Edge 1 is covered by a committed test that is green in `18-E1`, and cycle 1 measured both cells.
3. **[note]** In the first strip run, ⌘\ did not toggle the view after a click had promoted a card into a tile. The keypress most likely went to the tile's terminal. That is outside this plan, and a toggle with focus on the toolbar measured correctly (the two ⌘\ rows above).
4. **[note]** A scratch `musterd` from 16:33 is still alive (pid 10053, parent launchd, data dir `$TMPDIR/muster e2e-iyFYMT`). It predates this cycle and cycle 1 already reported it. My own run left none: every daemon was torn down by its fixture.
