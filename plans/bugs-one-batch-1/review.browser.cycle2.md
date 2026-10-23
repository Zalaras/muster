# Browser review: bugs-one-batch-1

**Plan**: bugs-one-batch-1
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 14927 words (budget 30000)
**Rig**: `make web-build build` at 93cd164a (dirty only in plans/). A fresh `bin/musterd` per test came from `helpers/fixtures.ts`, each with a space-bearing data dir `$TMPDIR/muster e2e-38add35a-*`, a private `-tmux-socket` inside it and the harness stub `claude`. I drove it with headless Chromium through a throwaway `web/e2e/zz-browser-review-c2.spec.ts`, run in the foreground under `bin/gatelock run --exclusive`. The spec was deleted afterwards.

Gates log (`gates-bugs-one-batch-1-c2`): 36 lines, 0 failed. `e2e` (33 scoped specs) and `web-build` are green, so the app I drove is the one that ships.

Scope of this cycle. The delta `9718930d..HEAD` touches four areas:
- `web/src/terminal/pane.ts` (`rows: 2`), which affects every terminal.
- `web/src/features/railmenuitems.ts` (`menuEntry`, `sessionsPhrase`), which affects both card menus.
- `internal/session/{apply,liveness,manager}.go`: the SessionEnd watch now goes through `m.spawn`, which affects REQ-1/2.
- Tests.

I re-drove every cell those can reach. The REQ-5, REQ-6, REQ-9 and REQ-10 cells keep their cycle-1 results (`review.browser.cycle1.md`), because no file they depend on changed. There is one exception: REQ-5's "focus lands in the terminal" depends on the xterm textarea, so I re-checked that on the Claude terminal (focus row below).

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-8 (cycle-1 Major 1) | focus shell | data, 1280×690 (23 rows) | the first −100 after a +10000 flick reaches tmux | pass | slider 552 = track 552, `top:0px` before and after; frames sent `scroll -200`, then `scroll 5` for the **first** −100 and `scroll 5` for the second; tmux `pane_in_mode 0` after the flick, `1 5` after the first notch, `1 10` after the second |
| REQ-8 | focus shell | data, 650 after shrinking 899→777→690→601→720→650 with alt-screen content | the same after resizes | pass | slider = track at every height (768/648/552/456/576/528); after 60 more lines at 650: `-200`, `5`, `5`; tmux `1 5` after the first notch |
| REQ-8 | tiles shell | data, moved from Focus to a tile (84×10) | the same after the host move | pass | slider 240 = track 240; frames `-200`, `5`, `5`; tmux `1 5` after the first notch; `session_attached 1` |
| REQ-8 | tiles shell | data, a second session's shell opened fresh in a tile | the same | pass | slider 240 = 240; frames `-200`, `5`, `5`; tmux `1 5` then `1 10` |
| REQ-8 / §7 | focus Claude terminal | data at 690, 650, 899, 601 | xterm has no scroll range of its own | pass | slider = track at 552/528/768/456 (cycle-1 repro shape: was 529/552); a −300 wheel leaves first row `MUSTER-STUB-READY` and the slider at `top:0px` |
| REQ-8 / §7 | tiles Claude terminal | data | the same | pass | slider 240 = track 240 |
| REQ-8 | any | daemon-down | — | N/A — no shell socket while down | |
| `rows: 2` / REQ-7 | focus Claude + shell | data at 601, 650, 690, 720, 777, 899 | the fit and tmux agree; no terminal is a row short; the size note settles | pass | xterm rows equal tmux `window_height` at every height (19/22/23/24/27/32, 130 cols); `#sizenote` reads `130×N · one live client · geometry owned by this pane` with the same N |
| `rows: 2` | tiles | data | the tile geometry matches tmux | pass | 10 xterm rows, tmux `84x10` for both tile shells and the tile Claude terminal |
| `rows: 2` / REQ-5 | focus Claude | data | keyboard focus is kept across a render tick | pass | after clicking the terminal, `activeElement` is the same `textarea.xterm-helper-textarea[aria-label="Terminal input"]` 1.2 s later |
| `rows: 2` / §6 | tiles | daemon-down | daemon-down is surfaced | pass | `#banner` `musterd unreachable — …` `display:block`; each terminal overlay `disconnected — daemon down` `display:flex; visibility:visible; opacity:1`; after the restart the tile Claude terminal is back at slider 240 = 240, 10 rows |
| REQ-3 (cycle-1 code Minor) | focus rail | data | one selected card → `Actions for 1 session` | pass | `aria-label="Actions for 1 session"`, `display:block; visibility:visible; opacity:1`, box 149,181–339,309 inside 1280×690; items `Stop…, New group…, ✓No group` (no Pin); unchanged after a 1.2 s tick; `1 selected` kept after Escape |
| REQ-3 | focus rail | data | one ended selected card, by keyboard | pass | Shift+F10 → `Actions for 1 session`, `Remove…` focused, items `Remove…[danger], New group…, ✓No group`; Enter → dialog `Remove 1 session?` / `Remove 1` |
| REQ-3 | focus rail | data | mixed live + ended → plural label, Stop… and Remove… | pass | `Actions for 2 sessions`: `Stop…, Remove…[mi danger], New group…, ✓No group` |
| REQ-4 / `menuEntry` | focus rail | data | the single-card menu is unchanged after the refactor | pass | live: `Actions for br-m-a` with `Stop…[mi], New group…, ✓No group, Pin`; ended: `Remove…[mi danger], New group…, ✓No group, Pin`; Stop stays plain and only Remove carries `danger` |
| REQ-4 | focus rail | data | an unselected card keeps its own menu and the selection | pass | `Actions for br-m-b` with Pin; `1 selected` afterwards |
| REQ-4 | tiles strip | data | the strip card menu is unchanged | [note] not re-driven — see Note 1 | |
| REQ-3/4 | pop-out | any | — | N/A — `/doc.html` has no rail | |
| REQ-1 | focus rail | data | non-clear SessionEnd, then the pane dies → ended within 1 s, no terminal attached | pass | the hook is posted and the window killed 300 ms later; `/api/state` `alive:false` at 143 ms, card `.ended` at 147 ms (a third session was selected, so A had no attached terminal) |
| REQ-2 | focus rail | data | a clear SessionEnd starts no re-check | pass | `clear` + kill on an unattached session → `alive:false` at 2700 ms, the poll tick; not under 1 s |
| REQ-1/2 | any | daemon-down | — | N/A — a daemon-side check that cannot run while the daemon is down | |
| REQ-5, REQ-6, REQ-7 (NBSP), REQ-9, REQ-10 | all hosts in cycle 1 | all states in cycle 1 | as cycle 1 | pass (carried) | no file in the delta reaches them; the cycle-1 rows stand |

## Issues

### Critical

None.

### Major

None. Cycle-1 Major 1 is fixed in every host I measured: Focus shell, Focus shell after resizes, the Tiles shell (both moved and fresh) and both Claude terminals. Cycle-1 Major 2 is closed by the new `shell-scroll.spec.ts` journey. It runs at 1280×690, where the old build had a one-row range. It sends a single reversed −100 and polls `pane_in_mode 1` / `scroll_position 5`, and it checks slider = track. That journey would have been red on the cycle-1 build (my cycle-1 measurement at the same shape: `pane_in_mode 0` after the first notch, slider 529/552).

### Minor

None.

### Notes

1. **[note]** I did not re-drive the Tiles strip card's menu. With three sessions the Tiles view showed every session as a tile, and `#tiles-strip` computed `display:none` with no cards, so there was no strip card to right-click. The strip card shares `cardMenuItems` with the rail's single-card menu, which I measured unchanged above. Cycle 1 measured the strip menu itself as pass.
2. **[note]** In my first REQ-2 run the clear-SessionEnd session was the **selected** (attached) one, and it flipped at 55 ms. That came from the terminal pump's PTY-EOF nudge, not a re-check. Re-run with that session unattached, it flipped at 2700 ms, on the poll tick. I recorded the unattached result in the matrix.
3. **[note]** The implementer's residual (a shrink before tmux's first alt-screen entry) is not separately constructible from the browser. What I could measure was a shrink and regrow across six heights **after** alt-screen content existed. There, slider = track held throughout and the first reversed notch reached tmux.
4. **[note]** I found two scratch dirs, `$TMPDIR/muster e2e-38add35a-0sYars` and `…-jjqW6X`, both created at 01:34, before my first run. They hold no tmux socket. The cycle-1 `…-PL8IYo` is still there too. I left all three in place as not mine. My daemons were torn down by the fixture, the scratch spec is deleted, and `git status --porcelain` shows nothing of mine apart from this file.
