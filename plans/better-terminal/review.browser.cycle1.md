# Browser review: better-terminal

**Plan**: better-terminal
**Verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 14710 words (budget 30000)
**Rig**: `make web-build build` at 93325462 (tree clean but for orchestration-state.json); `bin/musterd` via the committed `startScratchDaemon` helper per test: space-bearing data dir `$TMPDIR/muster e2e-20ec4dd4-*`, private `-tmux-socket` inside it (killed and deleted on teardown), the shared E2E stub `claude` (`$TMPDIR/muster e2e-stub-*`); headless Chromium through a throwaway `web/e2e/zz-rb-better-terminal.spec.ts`, run in the foreground and deleted; `git status --porcelain` shows nothing of mine.

Gates log read (not re-run): two red lines. `14-kb-check` (two render files owned by no feature) is fixed by 93325462. `21-e2e` failed one test, `terminals.spec.ts:434` (REQ-5/E8): the `shell 2` row read `idle` for 15 s after `sleep 600` was typed. See Note 1. I measured the shipped app at 93325462, which is the app the gate ran plus the docs-only commit.

## Matrix

Hosts: **focus** (1440x900), **tiles** at 3x2 (1280x720 and 1920x1080, bottom-right tile as the host under test, every tile carrying two terminals). **Pop-out** (`/doc.html`): N/A for every row. The pop-out hosts only the reader. It has no surface switch, and `doc.ts` deliberately does not subscribe to `onTerminals`.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-8 | focus | no terminals | order claude, shell, ▾, docs | pass | button x = 1205, 1266, 1321, 1340; group 1204,59-1388,81 |
| REQ-8 | tiles 1280 / 1920 | no terminals | same order in the tile footer | pass | x strictly increasing in the bottom-right tile at both sizes |
| REQ-8 | focus | no terminals | ▾ glyph shown, enabled | pass | opener text "▾", box 1321,60-1340,80, not disabled |
| REQ-9 | focus | none / 1 | no count with fewer than two | pass | `span.shellcount` elements = 0 (absent, not hidden); shell text "shell" |
| REQ-9 | focus | data(2) | count `2`, aria-hidden, inside the shell button | pass | count 1292,63-1309,78 inside shell 1229,59-1321,82; computed display block, opacity 1, mono 10.2px, bg rgb(28,32,41) (= --bg-hover) |
| REQ-9 | tiles 1280 / 1920 | data(2) | count in every footer | pass | all six tiles read `2`; after one closed, that tile's count element count = 0 and the other five still read 2 |
| REQ-10 | focus | no terminals | no `title` while shell not selected | pass | title=null |
| REQ-10 | focus | data | `title` names the terminal on screen | pass | `shell 1`, then `build` after the rename |
| REQ-10 | tiles 1280 / 1920 | data(2) | tile `title` names the shown terminal | pass | title=`shell 1` after the row switch |
| States: no terminals | focus | no terminals | panel shows header and only New terminal | pass | rows=0, header "TERMINALS", panel 1172,84-1432,150 |
| States: no terminals | tiles 1280 / 1920 | no terminals | same | pass | rows=0 |
| REQ-1 | focus | no terminals | New terminal via keyboard (Enter) spawns and shows shell 1 | pass | api `[{n:1,"shell 1",busy:false}]`, tmux `muster-1-shell`, shell pressed |
| REQ-1 | focus | data(1, busy) | New terminal shows shell 2 in the session dir; t1 keeps running | pass | tmux capture of t2 holds `pwd` output = session dir; view shows it; t1 `pane_current_command`=sleep; t1 output absent from view |
| REQ-1 | tiles 1280 / 1920 | data(1) | real keys typed in the tile shell reach tmux; New terminal from the tile | pass | t1 fg=sleep; title then `shell 2`, count 2 |
| REQ-2 | focus | data(2) | row shows that terminal with its own output intact | pass | after choosing `shell 1`: view has RB-ONE-MARK, lacks RB-TWO-MARK |
| REQ-2 | focus | data(2) | operable + keeps focus | pass | keys landed in tmux t1 (capture has RB-KEYS-1); `xterm-helper-textarea` still active after 1.2 s |
| REQ-2 | tiles 1280 / 1920 | data(2) | row switch in tile; surface contained; focus kept | pass | 1280: region 855,435-1278,690 inside tile 854,403-1279,719; textarea still active after 1.2 s |
| REQ-3 | focus | data(2) | claude then shell shows the last shown | pass | title `build` (last shown) after claude then shell |
| REQ-3 | focus | no terminals | shell with none running starts one | pass | tmux `muster-1-shell` created |
| REQ-3 | tiles | data | claude then shell in a tile | N/A | the same reducer as focus, so not re-driven; tile fallback measured under REQ-6 |
| REQ-4 | focus | data(2) | ✎ turns the name into a field, prefilled and selected | pass | selection 0-7 of "shell 2", maxlength 40, bg rgb(13,15,22) (--well) |
| REQ-4 | focus | data(2) | field keeps focus across a tick and a live flip of another row | pass | `INPUT.tfield` still active 1.2 s after shell 1 flipped busy to idle |
| REQ-4 | focus | data(2) | Esc cancels, panel stays open | pass | panel=1, api names unchanged, focus back on ✎ |
| REQ-4 | focus | data(2) | Enter saves; api agrees; whitespace restores `shell 2` | pass | api `["shell 1","build"]`, then `["shell 1","shell 2"]` |
| REQ-4 | focus | second window / reload | name shows in another window and survives reload | pass | page 2 rows `shell 1 idle / build idle`; after reload rows still list build |
| REQ-4 | tiles 1280 / 1920 | data(2) | tile rename field keeps focus across tick; save | pass | `INPUT.tfield` active after 1.2 s; row `srv` shown |
| REQ-19 | focus | data(2) | field stops at 40 | pass | 45 keys typed, value length 40 |
| REQ-5 | focus | data(2) | × on an idle terminal ends it at once | pass | open dialogs 0; tmux left only `muster-1-shell` |
| REQ-5 | focus | data(1 busy) | × on a busy terminal asks first, naming it | pass | dialog "Close shell 1? shell 1 is running a command. Closing it ends the command. Cancel / Close terminal", box 500,372-940,528, danger bg rgb(194,70,70) |
| REQ-5 | focus | data(1 busy) | Cancel keeps it; Close terminal ends it | pass | after Cancel fg=sleep; after Close terminal tmux list empty |
| REQ-5 | tiles 1280 / 1920 | data(2, busy) | confirm inside the viewport; confirm ends it | pass | 1280: dialog 420,282-860,438; tmux left only shell-2 |
| REQ-6 | focus | data | the shown terminal closed falls back to the lowest; the last falls back to claude | pass | title `shell 1` after closing `build`; claude pressed with the Claude region visible after the last closed |
| REQ-6 / Edge 5, 6 | focus | docs selected, 2 windows | `exit` drops the row from the open panel and the count in both windows in about 2 s; docs stays | pass | both counts 3 to 2 in 1809 ms; open panel rows 2; docs still pressed |
| REQ-6 / INV-1 | tiles 1280 / 1920 | data(2) | closing the shown busy terminal falls back to n=2; the other tiles are untouched | pass | title `srv`; other five counts 2,2,2,2,2 |
| REQ-6 | tiles 1280 / 1920 | data(1) | external kill of the last terminal returns to claude | pass | 814 ms / 797 ms; Claude region 855,435-1278,690 |
| REQ-7 | focus / tiles | data | Remove / reconcile / kill shutdown end every terminal | N/A here | daemon journey with no new visible surface beyond the existing prompt; reconcile observed under Edge 13; Remove and kill-shutdown count are E7/E11 (green in the gate) |
| REQ-11 | focus | data(2) | state words agree with the api | pass | `shell 1` running / `shell 2` idle; api busy true/false |
| REQ-11 / V3 | focus | data(2) | running row has a visible spinner; idle row has none | pass | spinner display block, opacity 1, `animation-name: shellact-spin`, 10x10, data-act busy; idle row spinner absent |
| REQ-11 | focus | data(2) | row on screen highlighted | pass | on bg rgb(28,32,41), off bg transparent, aria-current=true |
| REQ-11 | focus | data(2) | ✎ hidden until hover or keyboard focus-within; × visible | pass | ✎ opacity 0, hover 1, Tab-focus 1; × opacity 1 |
| REQ-11 | focus | data(2) | rows contained in the panel | pass | panel 1172,86-1432,216; rows 1173-1431 |
| REQ-11 | tiles 1280 / 1920 | data(2) | rows and states agree with the api | pass | `shell 1 running / shell 2 idle`, api agrees |
| REQ-12 / Edge 3 | focus | data(10) | close 3, then New gives `shell 3`; rows reorder live in n order | pass | data-n order 1..10, api `3:shell 3` |
| REQ-13 / INV-4 | focus | data(1) | shell segment indicator busy while a terminal is busy | pass | busy 878 ms after `sleep`; `span.shellact` display block, opacity 1, box 1262,65-1271,75 |
| REQ-13 | tiles 1280 / 1920 | data(2, 1 busy) | tile indicator busy | pass | data-act busy |
| REQ-14 / Edge 17 | focus | daemon-down (SIGTERM) | open panel closes; claude, shell, ▾ and docs disabled; ▾ click opens nothing | pass | panel 0; disabled true x4; second window ▾ disabled; banner "musterd unreachable — ..." at 0,46-1440,78 |
| REQ-14 | tiles 1280 / 1920 | daemon-down | open panel closes; all six ▾ disabled | pass | panel 0; disabled true x6 |
| States: daemon down | focus / tiles | daemon-down | count frozen at its last value | pass | focus count "2"; tile counts 2,2,2,2,2 |
| Edge 13 | focus | reconnect after restart | snapshot `terminals` is `{}`; count gone; terminals reaped | pass | tmux list empty for the session; claude pressed |
| REQ-15 | focus | no terminals | panel anchored below ▾, inside the viewport | pass | panel 1172,84-1432,150 under opener 1321,60-1340,80 |
| REQ-15 | tiles 1280 / 1920 | data(2) | panel from the bottom-right tile stays in the viewport | pass | 1280: panel 1012,562-1272,692, flipped above opener 1169,696; 1920: 1652,922-1912,1052 |
| REQ-15 | focus | no terminals | Esc closes and returns focus to ▾; outside click closes | pass | active `BUTTON.termsopen[Terminals]`; panel 0 after a click at 700,500 |
| REQ-15 | focus / tiles | data | ▾ keyboard-focused keeps focus across a 1.2 s tick; Enter opens with focus inside; the item keeps focus | pass | same element identity; focus lands on `+ New terminal` |
| REQ-16 / R2 | tiles 1280x720 3x2 | data(2 each, 1 busy) | footer shows no overflow with ▾ and count | pass | every footer scrollWidth = clientWidth 423/423, no descendant overflowing, 0 buttons outside, switch 212,377-366,397 inside tile 1,85-426,402 |
| REQ-16 / R2 | tiles 1920x1080 3x2 | same | same | pass | 637/637 on all six, 0 outside |
| REQ-17 | focus | data(2) | open panel flips running to idle to running live | pass | idle after 873 ms (C-c via tmux), running after 875 ms; panel stayed open |
| REQ-18 / Edge 19 | focus | data(10) | nine rows visible; the list scrolls; New terminal visible outside the scroll | pass | list 849,110-1431,398, scrollHeight/clientHeight 320/288, overflow-y auto, 9 fully visible rows; New 849,407-1431,439 inside the 900 px viewport |
| REQ-18 | focus | data(10) | wheel reaches row 10; panel stays open | pass | scrollTop 32; row 10 at 366-398 inside the list |
| REQ-18 | tiles | data(10) | ten terminals in a tile | N/A | the render test R3 covers the list; the tile panel geometry (flip, containment) is measured above with two rows |
| REQ-11 / REQ-19 | focus | data(10) | 40-character name ellipsized; × stays inside the panel | pass | text-overflow ellipsis; × 1401-1423 inside panel 848-1432 (the panel widens to 584 px for a 40-char name, see Note 2) |
| V3 | focus | data | panel tokens are the Menu tokens | pass | panel bg rgb(23,26,36) = --bg-raised; border rgb(52,58,74) = --line-control, 1px; header uppercase mono 10.2px |
| V2 | focus / tiles | data | matches the prototype renders | pass (by eye against the measurements) | the count pill, ▾ and the panel layout (name, state word, ×, + New terminal) agree with `switch-with-count.png` and `terminals-menu-close-up.png`; no pixel diff taken |
| §7 one live client per attach target | focus | data | switching terminals in one window holds a single socket per terminal | not measured | Note 3 |
| §6 honesty | all | all | unknown shown as a word, no Done state, no cost, daemon down prominent | pass | no new gauge or state; the daemon-down banner is the existing full-width alert; panels and switches disable |

## Issues

### Critical

### Major

### Minor

### Notes
1. **[note]** For `review-work`, who owns the gate: the red `21-e2e` line (`terminals.spec.ts:434`, E8, `shell 2` read `idle` for 15 s after `sleep 600`) did not reproduce as a product defect in any host. Every busy flip I drove was seen in 873-878 ms, in focus and in tiles, with tmux and `/api/state` agreeing. My own probe hit a setup race. Keys typed into a terminal created a moment earlier sat as an echoed line (`capture-pane` showed only `pwd; echo RB-TWO-MARK`, with no output and no prompt) until the shell finished starting. The spec types `sleep 600` through `typeInShell` right after `startWithTerminals` has created terminal 2, and it never waits for the shell to be ready. This looks like the flake. The fix is to wait for the new terminal's prompt, or for `tmuxForegroundCommand` to report sleep, before asserting `running`.
2. **[note]** With a 40-character terminal name the panel grows to 584 px wide (848-1432 at 1440). Rows, × and New terminal stay inside it and inside the viewport, and the name is still `text-overflow: ellipsis`, so the ellipsis only engages once the panel reaches its maximum width. No change requested.
3. **[note]** §7 one-live-client-per-terminal (E10) and the Remove / kill-shutdown count (E7, E11) were not measured in my rig. They are daemon journeys that the gate's E2E run passed. Socket-level counting was outside what my matrix drove.
4. **[note]** My tiles runs hit the 300 s test timeout after their last cell was recorded, in fixture teardown, after `daemon.kill()` had already stopped the daemon. All cells were written first. No scratch daemon, tmux socket or data dir was left behind (`pgrep` empty, zero `muster e2e-20ec4dd4-*` dirs).
