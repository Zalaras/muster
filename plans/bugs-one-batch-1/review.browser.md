# Browser review: bugs-one-batch-1

**Plan**: bugs-one-batch-1
**Verdict**: approved
**Cycle**: 4
**Pack**: kb: pack 14927 words (budget 30000)
**Rig**: `make web-build build` at 0680c32a (dirty only in `plans/`). Each test got a fresh `bin/musterd` from `helpers/fixtures.ts`, with a space-bearing data dir `$TMPDIR/muster e2e-*`, a private `-tmux-socket` inside it and the harness stub `claude`. I drove it with headless Chromium through a throwaway `web/e2e/zz-browser-review-c4.spec.ts`, run in the foreground under `bin/gatelock run --exclusive`. The spec is deleted.

Gates log (`gates-bugs-one-batch-1-c4`): 36 lines, 0 failed, 2 warn-only. `e2e` (33 scoped specs) and `web-build` are green, so the app I drove is the one that ships.

Scope. Since cycle 3 the only product change is fc3856c9. In `web/src/terminal/pane.ts`, `term.open()` is now deferred to `openIfLaidOut()`, which `refit()` calls. `geometry`, `focus()` and `canPasteNow()` now gate on `opened`. Every terminal goes through that path, so I re-drove these:
- cycle-3 Major 1 at both heights;
- the three clean shell paths;
- the background-size check;
- first attach, keyboard focus and typing for Claude and the shell, in Focus and in Tiles;
- a rail click on a session that has never been shown (`focus()` now no-ops until the terminal is open);
- daemon-down and restart in both views;
- a shell built inside a Tiles tile that is already laid out.

No other cell from cycles 1–3 can be reached by this change, so those cells stand (`review.browser.cycle{1,2,3}.md`).

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-8 (cycle-3 Major 1) | focus shell, A → Docs → B → A → Shell | data, 1280×690, no new output | xterm holds no scroll range on the reselect | pass | Straight after the reselect, the slider is 552 and the track is 552, at 23 rows. Size note `130×23` = tmux `130x23` = 23 rows. Cycle 3 measured 48/20 on this path |
| REQ-8 (cycle-3 Major 1) | same | data, 690 | the flick and the first reversed notch reach tmux | pass | frames `[-200]` after the +10000 flick, `pane_in_mode 0`; `[-200, 5]` after the first −100, tmux `1` / `scroll_position 5`; the second notch gives `1 10` |
| REQ-8 (cycle-3 Major 1) | same | data, 1280×720 | the same | pass | slider 576 = track 576 at 24 rows, `130×24` = tmux; flick `[-200]`, mode 0; first notch `[-200, 5]`, `1` / `5`; second notch `1 10` |
| REQ-8 (cycle-2 Major 1) | focus shell, A → Docs → B → A | data, 690 / 720 | the background shell keeps its fitted tmux size | pass | tmux `130x23` (or `130x24` at 720) when fitted, during Docs, on B, and back on A with Docs shown after a 1.5 s hold. `/ws/shell/` resize frames while unmounted: `[]`. After the reselect there is exactly one: `130x23` or `130x24` |
| REQ-8 | focus shell, fresh | data, 690 | no scroll range; the first reversed notch reaches tmux | pass | slider 552 = 552; flick `[-200]`, mode 0; notch `[-200, 5]`, `1` / `5` |
| REQ-8 | focus shell, Docs → Shell on the same session | data, 690 | the same | pass | `130×23` = tmux = 23 rows; slider 552 = 552; flick `[-200]`, mode 0; notch `[-200, 5]`, `1` / `5` |
| REQ-8 | focus shell, A → B → A with Shell selected | data, 690 | the same | pass | `130×23` = tmux = 23 rows; slider 552 = 552; flick `[-200]`, mode 0; notch `[-200, 5]`, `1` / `5` |
| `refit`/open | focus Claude, first attach | data, 1280×899 | size note = tmux = xterm rows; placed in the slot | pass | `130×32` = tmux `130x32` = 32 rows; slider 768 = track 768. The terminal box `300,95–1280,873` equals the `#main-terminal-slot` box |
| `focus()`/open | focus Claude | data | a click focuses it, focus survives a tick, typing echoes | pass | `activeElement` is `TEXTAREA.xterm-helper-textarea` inside `Terminal: c4f-a`, still there 1.2 s later; real keys `hello-c4` + Enter → `stub-echo:hello-c4` |
| `refit`/open | focus shell, first attach | data, 899 | size note = tmux = xterm rows; focus; typing | pass | `130×32` = tmux = 32 rows, slider 768 = 768; after a click and 1.2 s, focus is inside `Shell: c4f-a`; `echo c4-shell-$((40+2))` → `c4-shell-42` |
| `focus()`/open (kb:adr/focus-rail-click-focuses-terminal) | focus, rail click on a session never shown before | data | the newly built terminal receives keyboard focus | pass | 1.2 s after clicking B's card, `activeElement` is `xterm-helper-textarea` inside `Terminal: c4f-b`; `130×32` = tmux = 32 rows |
| `focus()`/open (kb:adr/launch-opens-launched-session) | focus + tiles, launch | data | the launched terminal gets focus with no click | pass (committed spec) | `launch-opens-session.spec.ts`, 5/5 green on this build (outside the gate scope). It asserts `activeElement` and typed-key routing on a newly built terminal in Focus, in a Tiles free slot and in a full Tiles grid |
| `canPasteNow`/open | focus + tiles | data | file drop / text drop still paste | pass (committed spec) | `drop.spec.ts`, 8/8 green on this build (outside the gate scope): escaped path pasted and echoed after Enter, a text drop, a drop on a closed socket gives the not-connected notice, a Tiles drop lands only in its own tile |
| §6 / `refit` | focus Claude | daemon-down → restart | daemon-down shown prominently; overlay; refit after the restart | pass | `#banner` `display:block`, `musterd unreachable — hook output in open panes is Muster's absence, not session failure.`; overlay `display:flex`, opacity 1, `disconnected — daemon down`. After the restart, the banner and overlay are both `display:none`. Resized to 690 and settled 1.5 s: `130×23` = tmux = 23 rows; typing echoes `stub-echo:after-restart` |
| `refit`/open | tiles Claude ×2, first attach | data, 899 | footer `.geo` = tmux = xterm rows; inside the tile | pass | both `84×14` = tmux `84x14` = 14 rows; slider 336 = 336; terminal y 117–462 inside tile y 85–491 |
| `focus()`/open | tiles Claude B | data | a click focuses it across a tick; typing echoes | pass | focus is inside `Terminal: c4t-b` after 1.2 s; `stub-echo:tile-b-hi` |
| `refit`/open | tiles shell built in a tile that is already laid out (A's footer → shell) | data, 899 | open on first render; geo = tmux = rows; no scroll range; focus; wheel | pass | Straight after the switch: opened, 14 rows, slider 336 = 336. `84×14` = tmux = 14 rows, inside the tile. Focus stays inside `Shell: c4t-a` across 1.2 s. The first −100 on 60 lines of output → tmux `1 5` |
| `refit` | tiles shell A + Claude B | data, resized → 690 (settled 1.5 s) | both refit; inside the tile | pass | both `84×10` = tmux `84x10` = 10 rows, slider 240 = 240; terminal y 117–358 inside tile y 85–387 |
| §6 / `refit` | tiles | daemon-down → restart | banner; overlay on each tile; refit after the restart | pass | `#banner` `display:block`; `disconnected` overlay on Claude B's tile and on shell A's tile. After the restart the banner is `display:none`. Resized to 1000: B `84×16` = tmux = 16 rows, slider 384 = 384, inside the tile. A's tile still hosts `Shell: c4t-a` |
| any | pop-out | any | — | N/A — `/doc.html` hosts no terminal | |
| REQ-8 path | tiles | data | Docs + switch path | N/A — Tiles has no Docs surface (cycle-3 Note 3) | |

## Issues

### Critical

None.

### Major

None. Cycle-3 Major 1 is fixed: on its exact path the slider fills its track at both heights, and the flick and the first reversed notch both reach tmux.

### Minor

None.

### Notes

1. **[note]** Method. My first pass read the Tiles 690 cell and the Focus resize-after-restart cell straight after `setViewportSize`. Both polls passed early, on the stale pre-resize geometry, where footer, tmux and rows all still agreed (`84×14` in a 241 px region). Re-measured after a 1.5 s settle, both refit correctly (`84×10`, `130×23`). The values in the matrix are the settled ones (kb:adr/process-transient-displays-not-oracles). This is not a product defect.
2. **[note]** `drop.spec.ts` and `launch-opens-session.spec.ts` are outside this cycle's gate scope. I ran them on my build as extra evidence for the `canPasteNow()` and `focus()` gating that fc3856c9 changed. Their rows are marked "committed spec", not measured by me. Final Validation's full sweep will cover them again.
3. **[note]** Housekeeping:
   - The throwaway spec and `web/test-results/` are deleted.
   - No `musterd` process is running (`pgrep` shows none). The fixtures tore down each scratch tmux server.
   - `git worktree list` shows only the primary checkout and this worktree.
   - `git status --porcelain` shows nothing of mine apart from this file. The other two reviewers' part files and the orchestrator's state file are theirs.
