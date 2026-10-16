# Browser review: cache-hover

**Plan**: cache-hover
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 8851 words (budget 30000)
**Rig**: `make web-build build` at 38a2a2f0; per-test scratch `bin/musterd` from `helpers/fixtures.ts` (space-bearing data dir `$TMPDIR/muster e2e-*`, private `-tmux-socket` inside it, stub `claude` at `$TMPDIR/muster e2e-stub-*/claude`); headless Chromium 1280×720 (600 and 540 high for the scroll and flip cells), throwaway spec `web/e2e/zz-review-browser.spec.ts`, deleted.

Gates: `17-e2e` is red, 8 failed of 909: shortcuts, shell-scroll, terminal, subagent-status ×2 and theme ×3, several at 13.5 m, so they hung. None is in `cache-warmth.spec.ts`, and `18-E1` is 14/14 green. The app I drove is the tree as it stands.

## Matrix

Hosts: **rail** (focus view), **strip** (the Tiles strip card). The rail is not laid out in the Tiles view (`#sessions` has 0 client rects, width 0), so rail × tiles is N/A. **pop-out**: N/A for every row, because `/doc.html` hosts no session card. States: **data** (warm/cooling/cold), **no data** (`cache unknown`, no `prompt_cache` posted yet), **down** (scratch daemon got SIGTERM via `daemon.kill()`).

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 | rail | data | opens POPOVER_DELAY_MS after mouseenter | pass | real clock, mouseenter→panel append: 354, 351, 352 ms |
| REQ-1 | strip | data | opens after the delay | pass | 301 ms under the fixed page clock, where in-page `performance.now` is faked. The rail under the same clock read 321/271/273, so this is the same order as the rail's real-clock 351 ms |
| REQ-1 | rail | data | role=tooltip, text `cache warm · cold in 60m` | pass | `.cardtip[role=tooltip]` under BODY, text matches |
| REQ-1 | rail | data (cold) | text `cache cold` | pass | after clock +3700 s |
| REQ-1 | rail | no data | text `cache unknown` | pass | idle session with no prompt_cache; a working card's `aria-description` also reads `cache unknown` |
| REQ-1 | strip | data | text | pass | `cache warm · cold in 40m` |
| REQ-1 | rail | data | visible (computed) | pass | opacity 1, display block, visibility visible, z-index 55 |
| REQ-1 | strip | data | visible (computed) | pass | same values |
| REQ-1 | rail | data | placed: below the timer, inside the viewport | pass | timer 224,264–261,278; tip 224,282–393,303 (gap 4); viewport 1280×720 |
| REQ-1 | strip | data | placed: inside the viewport | pass | timer 1205,638–1242,652; tip 1103,656–1272,677 (right-clamped, gap 4); strip 0,605–1280,720 |
| REQ-1 | rail | down | opens while down | FAIL | opened at t=4009 ms, then the reconnect attempts at 4107/5114/7123 ms each emit `status` and close it. 12 samples over 6 s with the pointer still on the timer: 0 tips (Major 1) |
| REQ-1 | strip | down | opens while down | FAIL (inferred) | same `app.on("status") → cardTip.close()` wiring in `features/tiles.ts`. The strip × down cell was not driven separately |
| Edge 1 | rail | data | leave before the delay → no panel | pass | leave to (1,1) after 150 ms: 0; leave to the card's `.name` (still on the card) after 150 ms: 0 at +700 ms |
| REQ-2 | rail | data | stays open as the card moves under a still pointer (same card) | pass | the card above grew, the timer moved +31.5 px, `elementFromPoint` was still inside the target card; tip count 1 at +100 ms and +1.5 s |
| REQ-2 | rail | data | repositions to the timer's current box | pass | after the move: timer bottom 310, tip top 314 (gap 4), settled after a 1.5 s render pass |
| REQ-2 | rail | data | counts down live | pass (E1) | committed spec E1 green (60m→10m). Not re-driven in the rail by this probe |
| REQ-2 | strip | data | counts down live | pass | open tip went from `40m` to `10m` after clock +30 min, with no re-hover |
| REQ-2 | rail | data | closes when the pointer leaves the card | pass | mouse to (1,1): 0 |
| REQ-2 | rail | data | closes on pointerdown | pass | mouse.down on the timer: 0 at +100 ms, still 0 after a 1.2 s render pass |
| REQ-2 | rail | data | a card move puts the pointer on another card → that tip closes | pass | removed the card above: the target timer went 260→145 and its tip closed. The pointer now sat on `rm-y`'s timer, whose own tip opened `cache warm · cold in 20m` at 278 (rm-y timer bottom 274 + 4) |
| Edge 2 | rail | data | hovered card removed → panel goes | pass | DELETE `/api/sessions/{id}` with the tip open: 0 at +100 ms and +1.3 s |
| Edge 3 | rail | data | rail scroll under a still pointer | pass | wheel 120 px (`#sessions` scrollTop 120): sc-2's tip closed on the boundary event and the pointer, now on sc-3's timer, opened sc-3's tip (`57m`) at timer bottom + 4 |
| REQ-2 | rail | data | one panel at a time | pass | hover a second card's timer directly: count 1, the new card's text |
| REQ-3 | rail | data | no `title`, `aria-description` = warmth, `aria-label="time in state"` | pass | `{title:null, desc:"cache warm · cold in 60m", label:"time in state"}` |
| REQ-3 | strip | data | no `title`, `aria-description` | pass | `{title:null, desc:"cache warm · cold in 40m"}` |
| REQ-4 | rail | data | group header timer keeps its native `title` | pass | `.gsum [data-cache]` title `2 of 2 warm · next cold in 40m`, no aria-description |
| REQ-4 | rail/strip | data | panel takes no click | pass | computed `pointer-events: none` in both hosts |
| Rev-verified | rail/strip | data | reads as one with the group popover | pass | computed font `ui-monospace…` 10.2px, bg rgb(23,26,36), border 1px solid rgb(106,114,134), z 55. These come from the `.pop, .cardtip` shared block; I did not open a `.pop` side by side (Note 2) |
| Rev-verified | rail | data | never covers the card's own title | pass (below) / FAIL (flip) | below the timer: tip 224,282–393,303 vs `.name` 14,241–59,259, no overlap. Flip with the timer near the viewport bottom (540 high) and a wrapping title: tip 224,485–393,506 overlaps `.name` 14,468–278,504, and `elementsFromPoint` under the tip is `.r1` (Major 2) |
| Rev-verified | strip | data | never covers the title | pass | tip 1103,656–1272,677 vs `.name` 14,615–44,633 |
| any | pop-out | any | — | N/A: `/doc.html` hosts no session card or timer | |
| any | rail | tiles view | — | N/A: the rail is not laid out in the Tiles view (0 client rects) | |
| §6 honesty | rail/strip | no data | unknown shown as the word, not an empty track | pass | `cache unknown` text; no cost, no "Done" |
| §6 honesty | rail | down | daemon-down surfaced | pass | `musterd unreachable` alert visible (pre-existing banner) |

## Issues

### Critical

None.

### Major

1. **[web-impl]** In the daemon-down state the card tip cannot be kept open. `connection.ts` emits `status` on every failed reconnect attempt (backoff 500 ms → 8 s), and `features/rail.ts` / `features/tiles.ts` call `cardTip.close()` on each one. That closes an open tip, and also cancels a pending open, so it opens only if a 350 ms window happens to fit between two attempts. Measured: opened at 4009 ms, closed by the 4107 ms attempt; 0 tips over 6 s with the pointer on the timer. The timer's warmth keeps counting while the daemon is down (REQ-28 of the cache-warmth plan), and the warmth text is computed in the client, so the hover is meant to work in this state. A fix must make this true: a tip opened while the daemon is down stays open, counting down, across reconnect attempts while the pointer stays on the card. Either close only on the transition out of `connected`, or drop the `status` close for this client-computed panel. The group popover has the same wiring, which is pre-existing and outside this plan.
2. **[web-impl]** The plan's Reviewer-Verified criterion "never covers the card's own title" fails when `placeAnchored` flips the panel above the timer, near the viewport bottom. Measured at 540 px high with a title that wraps to two lines: tip 224,485–393,506 against `.name` 14,468–278,504. The overlap is 54×19 px of the title row, and `elementsFromPoint` under the tip is `.r1`. `web-implementation.md` names the flip case as a known gap. A fix must make this true: in every placement, the panel's box does not intersect the card's `.name` box.

### Minor

None.

### Notes

1. **[note]** The gate run's `17-e2e` is red with 8 failures, all outside `cache-warmth.spec.ts`, several hung at 13.5 m. An orphaned scratch daemon from that run is still alive: pid 10053, parent launchd, data dir `$TMPDIR/muster e2e-iyFYMT` created 16:33, before this review's build at 16:50. I left it running because it is not this review's. The review-work part owns the gate reading.
2. **[note]** "Reads as one with the group popover" was measured from the `.cardtip` computed style only. That style comes from the shared `.pop, .cardtip` rule. I did not open a `.pop` beside it for a pixel comparison, and I did not check the light theme (the contrast gate shows 50 pairs and 0 failures in every theme).
3. **[note]** The card timer has no `tabindex`, so keyboard users get the warmth only as `aria-description` and no panel. The plan asks for nothing more. The panel stays open on Escape (strip, measured: count 1 after Escape), and the plan does not list Escape as a close signal.
4. **[note]** The probe did not drive the strip × down cell (Major 1 is inferred there from identical wiring). It also did not measure the rail × data countdown in its own run; committed E1 covers it and is green.
5. **[note]** The committed hover test's `toBeVisible({ timeout: 1000 })` polls at Playwright's 0/100/250/500 ms steps. It bounds the open delay at "under 1 s", not at 350 ms, which matches the plan's Proof wording. Neither browser Major is in that spec's reach: it does not test daemon-down or the flip placement. No change requested.
