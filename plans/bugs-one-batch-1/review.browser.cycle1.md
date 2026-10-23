# Browser review: bugs-one-batch-1

**Plan**: bugs-one-batch-1
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 14927 words (budget 30000)
**Rig**: `make web-build build` at e3c55e37 (dirty only in plans/), a fresh `bin/musterd` per test through `helpers/fixtures.ts`: a space-bearing data dir `$TMPDIR/muster e2e-38add35a-*`, a private `-tmux-socket <dataDir>/tmux.sock`, the harness stub `claude`. Headless Chromium 1280×720 driving a throwaway `web/e2e/zz-browser-review.spec.ts`, run in the foreground under the gate lock; spec deleted afterwards.

Gates log (`gates-bugs-one-batch-1-c1`): 0 failed lines; `21-e2e` 381 passed; `04-web-build` green. The app I drove is the one that ships.

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 | focus rail | data | non-clear SessionEnd, then pane dies → ended within 1 s, no terminal attached | pass | the hook is posted, 300 ms later the window is killed; `/api/state` `alive:false` at 140 ms, rail card `.ended` at 142 ms (B selected, so A had no attached terminal) |
| REQ-2 | focus rail | data | clear SessionEnd starts no re-check | pass | `clear` + kill → `alive:false` at 3158 ms, the poll tick (no-hook control: 648 ms, which is just where the poll happened to land) |
| REQ-2 / EC-2 | focus rail | data | straggler non-clear SessionEnd on a live pane changes nothing | pass | B stays `alive:true` after 4 s; card class `card s-start current` |
| REQ-1 | tiles | data | card flips | N/A (not measured) — same `sessionUpsert` path as the rail; see Note 4 | |
| REQ-1/2 | any | daemon-down | — | N/A — a daemon-side check that cannot run while the daemon is down | |
| REQ-3 | focus rail | data | selected card → selection menu, count label | pass | `aria-label="Actions for 2 sessions"`; computed `display:block; visibility:visible; opacity:1`; menu box 149,426–339,608 inside the 1280×720 viewport |
| REQ-3 | focus rail | data | mixed live + ended → Stop… and Remove… both shown, no Resume or Pin | pass | items `Stop…, Remove…, grp, New group…, ✓No group`; menu still open after a 1.2 s tick |
| REQ-3 | focus rail | data | Remove… → count confirm, one batch | pass (Note 1) | dialog `Remove 2 sessions?` "1 of them are alive and will be stopped first…"; `POST /api/sessions/remove` alone; both gone from `/api/state` |
| REQ-3 | focus rail | data | Move to (keys) moves the whole selection | pass | Shift+F10 on the focused selected card opens `Actions for 2 sessions` with `Stop…` focused; ArrowDown to `grp`, Enter → both ids' `groupId` = 1 in `/api/state`; still `2 selected` |
| REQ-3 | focus rail | data | Stop… → count confirm | pass | `Stop 2 sessions?` dialog count 1 |
| REQ-3 | focus rail | data | Select mode and the selection survive | pass | `2 selected` after Move; Select stays `aria-pressed=true` after Remove (the bar reads `Select sessions` because both were removed) |
| REQ-4 | focus rail | data | unselected card → single-card menu, selection unchanged | pass | `Actions for r3-c`: `Stop…, ✓grp, New group…, No group, Pin`; `2 selected` afterwards |
| REQ-4 | tiles strip | data | strip card menu unchanged | pass | Select mode is cleared on entering Tiles (`groupsselect.ts` prefs listener); strip card of a previously selected session opens `Actions for r4-e` with Pin |
| REQ-3 / EC-3 | focus rail | daemon-down | selection menu items disabled, nothing sent | pass (Note 2) | all four items `aria-disabled=true`; a forced click sent no request |
| REQ-3 | focus rail | daemon-down → back | selection and menu return | pass | `2 selected`, `aria-pressed=true` after restart; menu `Actions for 2 sessions`, items enabled |
| REQ-3/4 | pop-out | any | — | N/A — `/doc.html` has no rail | |
| REQ-5 | focus | data | Escape in the anchored panel → Claude terminal | pass | activeElement `TEXTAREA[Terminal input]` in `Terminal: r5-a`, same after 1.2 s; typed `hello1⏎` → `stub-echo:hello1` in the pane |
| REQ-5 | focus | data | second glyph click → terminal | pass | activeElement in the terminal, same after 1.2 s |
| REQ-5 | focus | data | Escape in the popped panel → terminal | pass | popped panel box 896,150–1256,450; activeElement in the terminal, same after 1.2 s |
| REQ-5 | focus | data | popped close button (pointer) → terminal | pass | activeElement in the terminal; typed `hello2⏎` echoed |
| REQ-5 | focus | data | Escape from the editor | pass | the first Escape leaves edit mode, the second closes; focus in the terminal |
| REQ-5 / EC-5 | focus | data | Shell selected → shell terminal | pass | Escape and popped close both land in the shell's xterm textarea; typed `echo shellok-$((40+2))` printed `shellok-42` in `Shell: r5-a` |
| REQ-5 | focus | data | Docs selected → glyph, never body | pass | activeElement `BUTTON[Note]`, same after 1.2 s |
| REQ-5 | focus | data (ended) | ended session → glyph | pass | activeElement `BUTTON[Note]`, same after 1.2 s |
| REQ-5 | focus | data | Escape with focus outside the panel does nothing | pass | focus on the glyph, Escape → panel still visible |
| REQ-5 | focus | daemon-down | close returns focus | pass | Escape → focus in the terminal |
| REQ-5 | tiles / pop-out | any | — | N/A — the note panel lives only in the Focus header (`#mainhead .ng`) | |
| REQ-6 | focus | data | reachable: the body scrolls | pass | body `scrollHeight 2511 > clientHeight 593`, `overflow-y:auto`; a real wheel of +700 → `scrollTop 700` |
| REQ-6 | focus | data | Claude → Docs keeps the position | pass | 700 → 700 after a 1.2 s settle |
| REQ-6 | focus | data | Shell → Docs keeps the position | pass | 700 → 700 |
| REQ-6 | focus | data | session B and back keeps the position | pass | 700 → 700 |
| REQ-6 | focus | data | page reload keeps the position | pass | 700 after reload; `muster.reader.<id>` holds `"scroll":{"…/0-outline.md":700}` |
| REQ-6 | focus | data | a `storage` event never scrolls a reader already showing | pass | a second tab opened at 700 and was wheeled to 1600; the first tab stayed at 700 |
| REQ-6 / EC-6 | focus | data | clamp to a shorter document | pass | stored 1500, file cut to 12 sections while on Claude; rebuild → 465 = `scrollHeight − clientHeight` (trace 0 → 465, settled) |
| REQ-6 | tiles | data | a tile's docs surface keeps the position | pass | tile body 1734/224, `overflow-y:auto`; wheel → 500; Claude → Docs → 500 |
| REQ-6 | tiles → focus | data | the same session moved hosts | pass | 500 in the tile → 500 in Focus |
| REQ-6 | pop-out | data | the pop-out opens at the remembered position and keeps its own across reload | pass | opened from the real `pop out ↗` link at 1600 (the remembered value); wheel → 1820; the dashboard's later rebuild opens at 1820. A separate pop-out reload kept 400 → 400 |
| REQ-6 | focus | daemon-down | — | N/A — the mainhead's surface segments are disabled while down (a click timed out), so a reader cannot be rebuilt then | |
| REQ-7 | focus | data | the size note holds its row; the terminal is not a row short | pass | `#sizenote` `130×23 · one live client…`, `display:flex; visibility:visible`; box 300,694–1280,720 sits under the terminal's 300,126–1280,694 inside main 300,46–1280,720; tmux `130x23`; xterm renders 23 rows |
| REQ-7 | focus | first frame | the NBSP reserving placeholder | N/A — a transient the next refit replaces (kb:adr/process-transient-displays-not-oracles); the unit guard W3 covers it | |
| REQ-7 | tiles / pop-out | any | — | N/A — the size note is Focus-only | |
| REQ-8 | focus shell | data | a reversed wheel after a clamped flick scrolls at once | **FAIL** (Major 1) | flick +10000 → frame `lines:-200`; the first −100 sends no frame, tmux `pane_in_mode 0`; the second −100 → `lines:5`, `scroll_position 5` |
| REQ-8 | focus shell | data | the carry is dropped on reversal | pass | after the swallowed notch every −100 is `lines:5` (5, 10, 15), not the old −200/−90 tail; up-flick then +100 drives tmux from 200 back down |
| REQ-8 / EC-8 | focus shell | data | same-direction carry past the clamp | pass | up-flick → 200, then −100 → 380 (the carried pixels still apply) |
| REQ-8 | tiles shell | data | reversal after a flick | pass | flick +10000 then −100 → `pane_in_mode 1`, `scroll_position 5` |
| REQ-8 | any | daemon-down | — | N/A — no shell socket while down | |
| REQ-9 | focus | data → reconnect | `Could not reach musterd.` clears on reconnect | pass | a transport-aborted Stop shows the line (`display:block`, box 0,59–1280,91); after `daemon.restart()` it is `hidden`, `display:none`, 15 ms after the banner hid |
| REQ-9 / EC-9 | focus | data → reconnect | a refusal survives the reconnect | pass | a 500 `boom refusal` is still `display:block` 1.5 s after the restart |
| REQ-9 | tiles | data → reconnect | the same, with the error raised from a tile's Stop | pass | `Could not reach musterd.` visible in Tiles, `display:none` after the reconnect |
| REQ-9 | pop-out | any | — | N/A — `/doc.html` has no `#action-error` | |
| REQ-10 | pop-out | data | an ordinary real daemon restart does not reload | pass | 0 `load` events, marker kept; while down the status line read `musterd unreachable — showing last render` (`display:block`) and the body stayed |
| REQ-10 | pop-out | restart record | the restart record → reload on the first reconnect, same document | pass | synthetic `update` broadcast (no reload yet), then a **real** `daemon.kill()` + `restart()` → 1 `load`, marker gone, `?session=1&path=…README.md` kept, body `body-marker` again, status line `display:none` |
| REQ-10 | focus / tiles | — | the dashboard is unchanged | N/A — not re-driven; covered by update.spec E5/E6 in the green `21-e2e` | |

## Issues

### Critical

None.

### Major

1. **[web-impl]** In the Focus shell surface, the first wheel notch after a direction reversal still does nothing, so e7's "reversing direction should scroll the other way straight away" is not true in the browser. The accumulator fix (REQ-8) works: measured frames show the carry dropped. But xterm's own scrollable element eats the event before Muster's wheel handler runs. A stopPropagation/preventDefault spy shows the first −100 is consumed by `xterm-scrollable-element`'s `_onMouseWheel`, with no `scroll` frame sent and tmux left out of copy-mode. The shell xterm has a one-row scroll range despite `scrollback: 0`: its vertical slider is 529 px of a 552 px track, and `top` moves 23 px ↔ 0 px. The Claude terminal's slider is 552 of 552. That first notch also visibly moves xterm's own viewport (top row `hist-line-379` → `hist-line-360`) while tmux stays at the live bottom. This is the §7 property "tmux owns scrollback, never xterm", though the option itself is 0, hence Major rather than Critical. The same swallow happens on the very first wheel-up over a fresh shell. The Tiles shell did not show it in my run. It is not introduced by this diff (`pane.ts` and the xterm setup are untouched), but it is what is left of the entry's symptom. A fix must make the first −100 after a +10000 flick in the Focus shell send `{"type":"scroll","lines":5}`, and leave the shell xterm with no scroll range (slider height = track height). — `web/src/terminal/pane.ts`
2. **[e2e-specs]** No committed test drives REQ-8 through the browser, so none could have failed for Major 1. W4 pins `accumulateWheelDelta` alone, and `shell-scroll.spec.ts` uses single wheels of 300 px or more from a fresh pane, which an xterm that eats one event per gesture still passes. A journey that flicks, reverses once and asserts tmux `pane_in_mode 1` after that **single** reversed event would have been red.

### Minor

None.

### Notes

1. **[note]** In a mixed live + ended selection, the selection menu's `Remove…` removes the live sessions too. The confirm says so ("1 of them are alive and will be stopped first"). This is `batchPlan`'s rule ("Remove keeps every known id") and matches the selection bar. REQ-3's "each applies to the sessions it fits" reads that way. But the single-card menu never offers Remove… on a live card, so this is the one menu path that removes a live session. No change requested; the ADR's wording is review-work's to confirm.
2. **[note]** With the daemon down, an open card menu (single or selection) closes by itself within 3 s, because each reconnect attempt's `status` closes it (`railmenu.ts` `app.on("status", …)`). This is unchanged from before this plan. A user who then presses Escape leaves Select mode, since the menu is no longer there to take the key. Observed, no change requested.
3. **[note]** If a pop-out's `?path=` spells the document's path differently from the dashboard's listing (for example `/private/var/…` vs `/var/…`), the pop-out writes that spelling as `openPath` and its own scroll entry into the shared `muster.reader.<id>`. The dashboard then opens that path at 0 and prunes the entry. The real `pop out ↗` link always uses the listing's spelling, so a user never hits this. I hit it only by building the URL by hand from a `realpath`.
4. **[note]** Not measured: REQ-1 in the Tiles host (rail card and `/api/state` measured, and Tiles reads the same upsert), and REQ-10's dashboard-unchanged cells (green in the gate's `update.spec.ts`). I did not count one-live-client (`session_attached`) across my host switches, because this plan touches no attach path.
5. **[note]** A scratch dir `$TMPDIR/muster e2e-38add35a-PL8IYo` (created 00:04, before this review's first run; its socket has no server running) was already on disk. I left it in place as not mine. Every daemon of mine was torn down by the fixture, and `git status --porcelain` shows nothing of mine.
