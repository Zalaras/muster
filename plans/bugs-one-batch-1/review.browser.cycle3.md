# Browser review: bugs-one-batch-1

**Plan**: bugs-one-batch-1
**Verdict**: needs-changes
**Cycle**: 3
**Pack**: kb: pack 14927 words (budget 30000)
**Rig**: `make web-build build` at ac7103d0 (dirty only in plans/). Each test got a fresh `bin/musterd` from `helpers/fixtures.ts`, with a space-bearing data dir `$TMPDIR/muster e2e-38add35a-*`, a private `-tmux-socket` inside it and the harness stub `claude`. I drove it with headless Chromium through a throwaway `web/e2e/zz-browser-review-c3.spec.ts`, run in the foreground under `bin/gatelock run --exclusive`. For one comparison run I built the pre-fix tree (04502c70) in a temporary detached worktree under `/tmp`. The spec and that worktree are both deleted.

Gates log (`gates-bugs-one-batch-1-c3b`): 36 lines, 0 failed, 2 warn-only. `e2e` (33 scoped specs) and `web-build` are green, so the app I drove is the one that ships.

Scope. The only product change since cycle 2 is 9c014e8e. In it, `TerminalSurface.refit()` (`web/src/terminal/pane.ts`) returns without fitting or sending a resize when `proposeDimensions()` proposes nothing. `refit()` is shared by every terminal, so I re-drove the following:
- the correctness reviewer's cycle-2 scenario;
- first attach and the resize round-trip for Claude and the shell, in Focus and in Tiles;
- daemon-down and restart;
- the cycle-1 wheel-reversal repro, once on a fresh Focus shell and once on the shell from the cycle-2 scenario.

No other cell from cycles 1–2 can be reached by `pane.ts`, so those cells stand (`review.browser.cycle2.md`, `review.browser.cycle1.md`).

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-8 (code cycle-2 Major 1) | focus shell, A → Docs → B → A | data, 1280×690 | the background shell keeps its fitted tmux size | pass | tmux `130x23` when fitted, after Docs, while on B, and back on A with Docs still selected (after a 1.5 s hold). No `/ws/shell/` resize frame was sent between the fit and the reselect (`frames since fit []`) |
| REQ-8 (code cycle-2 Major 1) | focus shell, same path | data, 1280×720 | the same | pass | `130x24` throughout, no resize frame sent while unmounted |
| REQ-8 | focus shell, reselected after the path above | data, 690 / 720 | still fitted: tmux = size note = xterm rows | pass | `130×23 · one live client · geometry owned by this pane`, tmux `130x23`, 23 rows (and the same at 24 for 720); typing `echo c3-back-ok` round-trips |
| REQ-8 / §7 | focus shell, reselected after Docs → B → A | data, 690, no new output | xterm holds no scroll range; the first reversed notch after a flick reaches tmux | **FAIL** | scrollbar track **48 px**, slider **20 px** (it should be 552/552). On hover it reads `visible scrollbar vertical`, opacity 1. A +10000 flick sent **no** frame. The first −100 sent **no** frame (`pane_in_mode 0`). Only the second −100 sent `scroll 5` (`1 5`). Same result on the pre-fix 04502c70 build (Major 1) |
| REQ-8 / §7 | focus shell, Docs → Shell on the same session (no switch) | data, 690 | the same | pass | slider 552 = track 552; the first −100 → `scroll 5`, `1 5`; flick then −100 → `-200`, `5` |
| REQ-8 / §7 | focus shell, A → B → A with the shell selected | data, 690 | the same | pass | the socket closes and reopens; slider 552 = 552; flick `-200`, then each notch `5`: `1 5`, `1 10`, `1 15`, `1 20` |
| REQ-8 (cycle-1 Major 1) | focus shell, fresh | data, 690 (23 rows) | the first −100 after a +10000 flick reaches tmux | pass | slider 552 = track 552 before and after; frames `scroll -200`, `scroll 5`, `scroll 5`; tmux `0` after the flick, `1 5` after the first notch, `1 10` after the second |
| `refit` / REQ-7 | focus Claude | data, first attach at 899 | tmux = size note = xterm rows | pass | `130×32`, tmux `130x32`, 32 rows |
| `refit` / REQ-7 | focus Claude | data, resized 899 → 690 → 601 → 777 | the same after each resize | pass | 23/19/27 rows; tmux and size note agree each time; slider = track (552/456/648) |
| `refit` | focus Claude, A while B is focused | data | the background Claude terminal keeps its size | pass | A `130x27` before and while B was focused; B first attach `130×27` = tmux; A back `130x27` |
| `refit` | focus Claude, A → Docs → B → A → Claude | data, 690 | refits; no scroll range | pass | `130×23` = tmux = 23 rows; slider 552 = 552; a −300 wheel leaves the first row `MUSTER-STUB-READY`, slider `top:0px` |
| REQ-5 / `refit` | focus Claude | data | keeps keyboard focus across a tick | pass | after a click, `activeElement` is `textarea.xterm-helper-textarea[aria-label="Terminal input"]`, and it is still that element 1.2 s later |
| `refit` / REQ-7 | focus shell | data, first attach at 777, resized → 899 → 690 → 601 | tmux = size note = xterm rows | pass | 27/32/23/19 rows, tmux agrees each time, slider = track (768/552/456); Claude reselected at 601 → `130×19` = tmux |
| `refit` / §6 | focus Claude | daemon-down → restart | daemon-down is surfaced; the terminal refits after the restart | pass | `#banner` `display:block`, `musterd unreachable — hook output in open panes is Muster's absence, not session failure.`; after the restart the banner is `display:none` and Claude is `130×19` = tmux = 19 rows |
| `refit` / REQ-7 | tiles Claude ×2 | data, first attach at 899 | footer `.geo` = tmux = xterm rows; placed inside the tile | pass | both `84×14` = tmux `84x14`, 14 rows; terminal box y 117–462 inside tile y 85–491; slider 336 = track 336 |
| `refit` | tiles shell (A's tile switched to shell) | data, first attach | the same | pass | `84×14` = tmux, 14 rows, slider 336 = 336 |
| `refit` | tiles shell A + Claude B | data, resized → 690 → 1000 | the same after each resize | pass | `84×10` at 690 and `84×16` at 1000, both tiles agree with tmux each time; terminal boxes stay inside their tiles |
| `refit` | tiles, A switched back to Claude; then moved to Focus | data, 1000 | refits in the new host | pass | tile `84×16` = tmux; A's unmounted shell stays `84x16`; in Focus A is `130×36` = tmux = 36 rows |
| `refit` | pop-out | any | — | N/A — `/doc.html` hosts no terminal | |
| any | tiles | daemon-down | — | [note] not re-driven this cycle; the cycle-2 tiles daemon-down cell stands (see Note 2) | |

## Issues

### Critical

None.

### Major

1. **[web-impl]** The cycle-1 wheel-reversal defect comes back on a shell rebuilt while unmounted. The path is the cycle-2 scenario: open the shell on A, select Docs, click B's card, click A's card, select Shell. Until new output arrives, xterm's own vertical scrollbar stays sized for 2 rows (track 48 px, slider 20 px, visible on hover), and xterm consumes the wheel:
   - a +10000 flick sends no `scroll` frame;
   - the first reversed −100 sends none either (`pane_in_mode 0`);
   - only the second notch reaches tmux.

   It clears once the shell prints output or the viewport is resized (720 → slider 576 = track 576). The fresh-shell path, the Docs → Shell path without a switch and the A → B → A path with the shell selected are all clean. On the switch path, the rebuilt socket's first `resize` frame is sent only on remount, after the terminal's DA replies. 9c014e8e did not cause this: the pre-fix 04502c70 build measured the same 48/20 bar and the same eaten flick and notch. Cycle 2 never drove this path. The shell is in `web/src/terminal/pane.ts` (the surface built or opened into an unmounted host). A fix must make this true: when a terminal first becomes laid out, xterm's scrollbar slider equals its track (no scroll range of its own) before any new output, so the first wheel event after the reselect reaches tmux.

### Minor

None.

### Notes

1. **[e2e-specs]** The new `shell-scroll.spec.ts` test ("a background shell keeps its fitted tmux window size … across a switch to another session and back") stops at the tmux size while Docs is still selected. It never reselects Shell, reads the scrollbar or wheels, so it could not have failed for Major 1. The existing REQ-8 reversal journey runs only on a freshly opened shell. A journey that covers Major 1 reselects Shell after the switch and then runs that test's slider = track and first-reversed-notch assertions.
2. **[note]** I did not re-drive Tiles daemon-down this cycle. The Focus daemon-down/restart cell covers `refit()` after a reconnect. The cycle-2 Tiles daemon-down cell (banner, overlays, refit after restart) stands.
3. **[note]** Tiles has no Docs surface, so Major 1's path (unmount via Docs plus a session switch) has no Tiles equivalent. In Tiles, an unmounted shell (A switched back to Claude) kept its `84x16`.
4. **[note]** Housekeeping:
   - The three scratch dirs I noted in cycle 2 (`muster e2e-38add35a-0sYars`, `…-jjqW6X`, `…-PL8IYo`) and the harness's `muster e2e-stub-*` dir are still in `$TMPDIR`. They are not mine and I left them.
   - I deleted `web/test-results/`, which is Playwright's gitignored output dir.
   - No `musterd` process is left running. The temporary `/tmp` worktree is removed (`git worktree list` no longer shows it).
   - `git status --porcelain` shows nothing of mine apart from this file.
