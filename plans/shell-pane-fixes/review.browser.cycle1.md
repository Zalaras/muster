# Browser review: shell-pane-fixes

**Plan**: shell-pane-fixes
**Verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 6674 words (budget 30000)
**Rig**: `make web-build build` at 0960ef00 (`bin/musterd` v0.22.2-19-g0960ef00); one scratch daemon per test through the committed `web/e2e/helpers/daemon.ts` (fresh temp data dir with a space in its path, private `-S` tmux socket inside it, shared E2E stub `claude`), headless Chromium 1280×900 driving a throwaway spec (4 tests, 4 passed, 8.8 min including the gate-lock wait), spec deleted, `git status --porcelain` shows nothing of mine. Gates log c1: 0 failed lines; `web-build`, `e2e` (963 passed), E1, E2 green.

## Matrix

Hosts: Focus mainhead (`.mainhead .surfseg` shell button), Tiles footer (`.tfoot .surfseg` shell button), pop-out `/doc.html`. States: no data (idle shell), data (busy, then done), daemon-down (scratch daemon `SIGTERM`ed via `daemon.kill()`). The independent oracle for "busy" is tmux's `#{pane_current_command}`; for the wheel it is tmux's `#{scroll_position}` plus the `scroll` frames read off the WebSocket.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-2 | focus | no data | no indicator on an idle shell | pass | `span.shellact` count 0 in mainhead shell button after the shell opened, before any command |
| REQ-2 | tiles | no data | no indicator on an idle shell | pass | count 0 in the tile's shell button |
| REQ-2 | focus | data (busy), reduce | no animation | pass | `animation-name: none`, `animation-duration: 0s`, `el.getAnimations().length` 0, `transform` `none` at t0 and at t0+1.2 s; tmux oracle `pane_current_command` = `sleep` |
| REQ-2 | focus | data (busy), reduce | busy shape still shown, visible | pass | 9×9 px, `border-radius: 50%`, top border `rgba(0,0,0,0)` with right border `rgb(166,171,188)` (the open circle); `opacity 1`, `display block`, `visibility visible`; `data-act` still `busy` after 1.2 s |
| REQ-2 | focus | data (busy), reduce | placed inside its host | pass | indicator box 1015.8,65.7–1024.8,74.7 inside shell button 1004.8,60.2–1074.4,80.2 |
| REQ-2 | focus | data (busy), reduce | keeps keyboard focus across a render tick | pass | `document.activeElement` (`xterm-helper-textarea`) is the same node after 1.2 s |
| REQ-2 | tiles | data (busy), reduce | no animation | pass | `animation-name: none`, 0 animations, `transform` `none` at t0 and t0+1.2 s; oracle `pane_current_command` = `sleep` |
| REQ-2 | tiles | data (busy), reduce | busy shape still shown, visible, placed | pass | 7×7 px circle with transparent top border; opacity 1 / block / visible; box 499.1,383.5–506.1,390.5 inside button 493.1,381–544.2,393 inside `.tfoot` y 372.5–400.5 |
| REQ-2 | focus | data (done), reduce | tick once done, still | pass | `data-act=done`, 9×5 px, `transform` matrix(0.707,-0.707,…) (rotate −45°) unchanged across 1.2 s, `animation-name: none`; box inside button |
| REQ-2 | tiles | data (done), reduce | tick once done, still | pass | 7×4 px, same rotate −45° matrix, unchanged across 1.2 s; box 498.8,382.6–506.5,390.4 inside button |
| REQ-2 / EC-1 | focus | data (busy), no preference | spin unchanged | pass | `animation-name: shellact-spin`, `0.7s`, 1 running animation; four `transform` samples 170 ms apart all differ (rotation advancing) |
| REQ-2 / EC-1 | tiles | data (busy), no preference | spin unchanged | pass | `shellact-spin` 0.7 s, four distinct rotation matrices 170 ms apart |
| REQ-2 | tiles | data (busy), preference flipped live | rule applies without reload | pass | after `emulateMedia({reducedMotion:"reduce"})` on a spinning tile, `animation-name` reads `none` 300 ms later |
| REQ-2 | tiles | daemon-down, reduce | indicator still, daemon-down surfaced | pass | `role=alert` banner "musterd unreachable — …" full-width 0,46–1280,78, visible; indicator still `busy`, `animation-name: none`, transform `none` over 1.2 s (see Note 2) |
| REQ-2 | focus | daemon-down, reduce | indicator still, daemon-down surfaced | pass | banner visible; after switching to Focus while down the mainhead shows no indicator (count 0), so nothing animates (see Note 2) |
| REQ-2 | pop-out | any | — | N/A — `/doc.html` is the reader page; it has no surface segment (`surfseg`/`shellact` absent from `web/doc.html` and `web/src/doc.ts`) | |
| REQ-1 | focus | data | slow wheel (60 × `deltaY −4`, one per frame) scrolls the same lines as today | pass | 12 `scroll` frames of `lines: 1`; tmux `scroll_position` = 12 (240 px / 20 px per line) |
| REQ-1 / EC-2 | focus | data | sum beyond the 200-line clamp carries the remainder | pass | one `deltaY −5000` event sends `lines: 200` (`scroll_position` 212); the next `deltaY −1` sends `lines: 50` (`scroll_position` 262) |
| REQ-1 | focus | data | keeps keyboard focus after wheeling | pass | `document.activeElement` (`xterm-helper-textarea`) identical after 1.2 s |
| REQ-1 | tiles | data | wheel over the tile's shell surface scrolls via the same step | pass | shell region 2,117–638.5,372.5 inside tile 1,85–639.5,401.5; frames and `scroll_position` agree (10 lines, see Note 1 for why 10, not 12) |
| REQ-1 | tiles | daemon-down | wheel with the socket closed | pass | 30 wheel events after `SIGTERM`: 0 frames sent, 0 `pageerror`s |
| REQ-1 | focus | daemon-down | wheel with the socket closed | N/A — the same `TerminalSurface` and the same `socket.readyState` guard as the tiles cell above; measured there | |
| REQ-1 | focus/tiles | no data | wheel on an empty shell | N/A — REQ-1 changes only where the arithmetic lives; the clamp/no-history case is the existing `shell-scroll.spec.ts` E9, green in gate line E2 | |
| REQ-1 | pop-out | any | — | N/A — no shell surface on `/doc.html` | |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** Behaviour preserved, and worth a backlog look: the remainder past the 200-line clamp
   carries without limit (plan edge case 2, "as today"). Measured: three `deltaY +20000` wheel
   events to return to the bottom sent 3 × `lines: −200` and banked about 2,400 more lines of
   scroll-down. The next 60 wheel-up events (`−4` each) over the tile's shell first sent 11 ×
   `−200` and one `−198` (scrolling down at the live bottom, which does nothing), and only then
   10 × `+1`. So a hard downward flick quietly swallows the user's next wheel-ups. The old
   `pane.ts` arithmetic does the same thing, so it is not a regression from this plan. Proposing
   it as a backlog item is the orchestrator's call.
2. **[note]** Daemon-down, outside this plan's change: with the daemon `SIGTERM`ed, the tile footer
   keeps showing `busy` (frozen state, no age shown), while the Focus mainhead, after a view
   switch, shows no indicator. The full-width `role=alert` "musterd unreachable" banner covers
   the whole dashboard's staleness, and this plan only changes whether the spinner animates. I
   am recording it for the orchestrator, not filing it as a §6 violation of this plan.
3. **[note]** The first run hit the 4-minute gate-lock wait (the lock was held by the
   `muster-launch-dialog-fixes` worktree). I reran it with `MUSTER_GATELOCK_WAIT=15m`, so nothing
   was measured against a contended rig.
