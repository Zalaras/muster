# Browser review: Popped-out note enhancements

**Plan**: popped-out-note-enhance
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 9297 words (budget 30000)
**Rig**: `make web-build build` at 2d146035 (`bin/musterd` v0.27.3-25-g2d146035), scratch daemons from `web/e2e/helpers/fixtures.ts` (space-bearing temp data dir, per-daemon `tmux.sock` inside it, stub `claude` 2.0.0-e2e-stub), headless Chromium 1280×720, a throwaway spec run under the gate lock and deleted afterwards. Gates log c1: 0 failed lines (e2e 663 passed, render 438 passed).

## Matrix

Hosts: **focus** (dashboard Focus view), **tiles** (dashboard Tiles view), **window** (`note.html?session=<id>`, the note window). The docs pop-out (`/doc.html`) does not host a note, so it is N/A for every row. Boxes are x,y–right,bottom in CSS px.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 | focus | data | a session that is not popped out shows no panel | pass | after A was popped out, focusing B and then C gave a `dialog "Note"` count of 0 each time |
| REQ-1 | focus | data | the focused popped session's panel shows its own note | pass | focusing A showed `· rb-a … note of A`; focusing B showed `· rb-b … note of B` |
| REQ-1 | focus | no data | no in-page panel before the snapshot | pass | the panel is only built from the render phase for a focused session; none at load (count 0 before any focus) |
| REQ-1 | tiles | data | no in-page panel in Tiles | pass | Tiles with A popped out gave a panel count of 0 |
| REQ-2 | focus | data | each popped session keeps its own rectangle | pass | A 400,200–660,350 and B 746,369–1106,669, both identical after focus switches A→B→A→C→B, after the 1.1 s tick |
| REQ-3 | focus | data | rectangles remembered across a reload | pass | B 2,369–362,669 before the reload and 2,369–362,669 after it |
| REQ-3 | focus | data | the old `muster.note-panel` value is ignored | pass (spec) | not driven by me; e2e `notes.spec.ts:928` and W2 green in the gates log |
| REQ-4 | focus | data | Pop in, Close and Escape take only A out | pass | Escape inside A's popped panel gave count 0, and B stayed popped at its rectangle (REQ-2 row) |
| REQ-4 | focus | data | Remove forgets the removed session's place | pass (spec) | e2e E2 (`notes.spec.ts:959`) green; not driven separately |
| REQ-5 | focus | data | first pop-out is 360×300, inset 24 px from the slot's top right | pass | slot (main below mainhead) 300,95–1280,720; panel 896,119–1256,419 (1280−24=1256, 95+24=119) |
| REQ-5 | focus | data | drags over the rail and the masthead | pass | over the rail: panel 5,319–365,619 with the rail at 0,46–300,720, and `elementFromPoint` at the header centre is inside `.npanel`; over the masthead: panel 305,0–665,300 with the masthead at 0,0–1280,46, and the hit is inside the panel |
| REQ-5 | focus | data | a drag past each edge clamps | pass | left/top → 0,0; right → 920..1280; bottom → 420..720 (viewport 1280×720) |
| REQ-5 | focus | data | a resize clamps at the edges and at 260×150 | pass | SE corner −2000,−2000 → 260×150; NW past the edge → 0,0–1180,570; SE past the edge → 0,0–1280,720 |
| REQ-5 | focus | data | a window shrink moves the panel in first | pass | 260×150 at 1020,570–1280,720, then a 900×500 viewport → 640,350–900,500 (moved, same size) |
| REQ-5 | focus | data | a window shrink then shrinks the panel, never below 260×150 | pass | 1280×720 panel, viewport 800×600 → 0,0–800,600; viewport 400×300 → 0,0–400,300 |
| REQ-5 | focus | data | a reload with a stored rectangle larger than the window clamps it in | pass | viewport 500×360 after the reload: A at 240,200–500,350 |
| REQ-5 | focus | data | the panel does not cover controls that open above it | **FAIL** | the card menu at 149,160–339,387 (z-index 50) is under the popped panel at 2,250–362,550 (z-index 55): `elementFromPoint` on Pin, New group… and No group lands on the panel (Major 1) |
| REQ-6 | focus | data | anchored Close (pressed with Enter after a 1.2 s tick) closes the panel and returns focus to the terminal | pass | the focused element before Enter was `Close note`, the panel count after was 0, and `activeElementInsideTerminal` was true |
| REQ-6 | focus | data (ended) | Close on an ended session returns focus to the glyph | pass | card class `card s-start ended current`; activeElement `BUTTON aria-label="Note"` |
| REQ-6 | focus | data | Close saves at once | pass (spec) | e2e `notes.spec.ts:1292` polls the wire within 700 ms, green |
| REQ-7 | focus | data | anchored header controls: Pop out, Open, Close inside the panel | pass | panel 314,81–714,159; controls at 631/657/683–703, y 89–109; Pop in absent |
| REQ-7 | focus | data | popped header controls: Pop in, Open, Close inside the panel | pass | panel 896–1256; Pop in at 1173–1193, Open at 1199–1219, Close at 1225–1245 (y 127–147); Pop out absent |
| REQ-7 | focus | data (unsaved) | popped panel at 260 px with the unsaved status showing | pass | panel 996,150–1256,450; controls 1173–1193, 1199–1219, 1225–1245, all inside |
| REQ-7 | focus | data (unsaved) | anchored panel at a 268 px viewport (252 px panel) | pass | panel 8,72–260,150; controls at 177/203/229–249, all inside (see Note 2 for a transient) |
| REQ-7 | window | data | the window shows none of the four controls | pass | all four `.ph .ctl` have computed `display: none` at 320×240 and 1200×900 |
| REQ-8 | focus | data | opens `note.html?session=<id>` as a popup and closes the panel | pass | `window.open("/note.html?session=1","muster-note-1","popup,width=520,height=460")`; popup viewport 520×460; dashboard panel count 0 |
| REQ-8 | focus | data | a second press opens no second window | pass | 2 pages before and 2 after, `window.open` called once more by the opener seam (opens 1), dashboard panel closed |
| REQ-8 | focus | data | a blocked popup leaves the panel open and loses nothing | pass | with `window.open` returning null: panel count 1, panel text `note of A kept`, wire `note of A kept`, focus on `Open note in window` |
| REQ-8 | window | data | no tab strip in Chrome | N/A in headless | `popup` feature passed (row above); V3 needs headed Chrome, see Note 4 |
| REQ-9 | window | data | header `Note · <title>`, document title | pass | header textContent `Note· rb3-a` (label + title spans), `document.title` `Note · rb3-a` |
| REQ-9 | window | data | fills the window, body scrolls (V4) | pass | 320×240: host and panel 0,0–320,240, body 0,25–320,240, scroll 1694/215 `overflow-y: auto`, document 240/240; 1200×900: 0,0–1200,900, body 1694/875 `auto`, document 900/900 |
| REQ-9 | window | data | one click edits; focus survives a tick; Escape leaves editing and the window stays open | pass | editor focused; a tagged activeElement was still the same node after 1.5 s; Escape → editor count 0, `isClosed` false |
| REQ-9 | window | data | saves within about a second | pass | wire read `typed in the window` 1.5 s after typing, without leaving edit |
| REQ-9 | window | data | follows the dashboard's theme | pass | the dashboard set to Light: window `data-theme` went instrument→light and body rgb(18,20,28)→rgb(243,242,238), live with no reload |
| REQ-10 | window | data | stays on its session while the dashboard focuses B and Tiles; edits from elsewhere show in place | pass | in Tiles, an API PUT `saved elsewhere` appeared in the window; header still `Note· rb3-a` |
| REQ-10 | tiles | data | the open window stays live in Tiles | pass | same measurement |
| REQ-11 | window | no data | `connecting…` before the first hello, not `--warn` | pass | WebSocket held: status `connecting…`, color rgb(166,171,188) (not `--warn` #e8cf5a), no `●`, title `Note` |
| REQ-11 | window | daemon-down (editing) | the unsaved status in `--warn` | pass | `unsaved, musterd unreachable`, color rgb(97,83,0) = light `--warn` #615300, hover `title` carries the text |
| REQ-11 | window | daemon-down → restart | kept text reaches the daemon with no further input | pass | wire `saved elsewhere plus down` after the restart; status back to empty |
| §6.7 | window | daemon-down (idle) | daemon-down is surfaced | **FAIL** | 3 s after the daemon was killed: status `""`, body showing the last known note, no notice anywhere in the window (Critical 1) |
| §6.7 | focus | daemon-down | banner shown, popped panel unchanged | pass | `#banner` 0,46–1280,78 `display:block` `musterd unreachable — …`; panel stayed at 5,219–365,519 |
| REQ-12 | window | data → removed | Remove shows the notice and stops editing | pass | status texts `["", "This session has been removed."]`, editor 0, rendered group 0 |
| REQ-12 | window | no data | a malformed or missing query shows the notice at once | pass | `?session=abc` and no query both show `This session has been removed.` |
| REQ-12 | window | data | an unknown id shows the notice once the snapshot arrives | pass | `?session=9999` → notice, title `Note` |
| REQ-13 | focus | storage blocked | pop-out, placing, Close and Open in window work with no page error | pass (spec) | not driven by me; e2e `notes.spec.ts:1352` and render R8 green in the gates log (Note 3) |
| REQ-14 | tiles→focus | data | Tiles hides the panel; Focus brings it back at its rectangle | pass | placed at 5,219–365,519; Tiles count 0; back in Focus at 5,219–365,519 |
| INV-4 | focus | data | Escape outside the panel (terminal focused, panel over the rail) changes nothing | pass | 5,219–365,519 before and after the 1.1 s tick; terminal still focused |
| E-case 19 | tiles | data | no in-page panel while the window stays live | pass | REQ-10 and REQ-14 rows |
| §7 | focus | data | one live client, scrollback, pane styling | pass | the panel is a sibling of `.main`, never inside the terminal slot; sizenote `one live client · geometry owned by this pane` (no change to surfaces in this plan) |
| all | pop-out (`/doc.html`) | — | — | N/A: the docs pop-out does not host a note panel; the note window is its own host, measured above | |

## Issues

### Critical
1. **[web-impl]** The note window does not surface daemon-down (design-system §6.7, and §6.8 for the stale note it keeps showing). With musterd killed and no edit pending, the window's status stays empty and the body keeps showing the last known note, with nothing in the window saying musterd is unreachable. Its only signal is the unsaved status, which appears only after the developer types. The docs pop-out, the precedent the plan follows, shows a daemon-down notice that "wins over whatever notice was showing" (`web/src/features/reader.ts` render → `deriveNotice`). `web/src/features/notespage.ts` `statusFor` maps only `connecting` and a failed save. A fix must make the window show it cannot reach musterd (for example `musterd unreachable` in `--warn` in the header status) while `frame.connection` is `reconnecting`, keeping the note readable and editable. The plan's States line "Daemon down: … The note window keeps showing the last known note, editable" sanctions the silence, so the orchestrator should amend that sentence too.

### Major
1. **[web-impl]** A popped panel placed over the rail covers the card menu that opens above it. `.menu` is `z-index: 50` and `.npanel` is `z-index: 55` (`web/src/style.css` ~4302 vs 4776). Measured: the card menu at 149,160–339,387 against the panel at 2,250–362,550. `elementFromPoint` at the centres of Pin (y 264), New group… (319) and No group (355) returns the panel, so those items cannot be clicked. Only Mark as unread, Stop… and Remove… sit above the panel's top edge and stay reachable. Screenshot: `/private/tmp/claude-501/-Users-damian-Documents-code-Projects-muster/0942183e-f816-4218-aeac-e6184ff908ab/scratchpad/rb5-menu.png`. Before this plan the panel was clamped into the main slot, so the two could not overlap. Now that REQ-5 places the panel over the rail and the masthead, every transient popover opened from those areas (card menu, rail ⋯ menu, other `.menu` users) must draw above the floating panel. **[e2e-specs]/render**: R5 checks only the panel's own header hit, so no spec could fail on this.

### Minor
(none)

### Notes
1. **[note]** After a window shrink and regrow the panel returns to its stored size. Clamping is display-only: a 1280×720 panel clamped to 400×300 grew back to 1280×720. I read this as intended (the stored rectangle is kept), not a defect.
2. **[note]** On one run, the anchored panel at a 268 px viewport read 314,81–566,159, off the viewport, 500 ms after `setViewportSize`. The other run read 8,72–260,150. Anchored placement follows the render tick, not `resize`. This is unchanged by this plan, and the settled state (pass row) is correct.
3. **[note]** I did not drive the storage-blocked cells (REQ-13) or the old-key cell (REQ-3) in my own rig. They rest on green e2e (`notes.spec.ts:928`, `:1352`) and render R8 in the gates log.
4. **[note]** V3 (no tab strip, front-raising in headed Chrome) cannot be observed headless. Measured: the opener passes `popup,width=520,height=460`, the popup opens at a 520×460 viewport, and a second press adds no page.
5. **[note]** After Remove, the window keeps `Note · <title>` as its document title. web-implementation.md records this decision, and the plan does not forbid it.
6. **[note]** `docs/diagrams/web-components.md` showed as modified in the worktree during this review (mtime 16:59, after my build at 16:53). I did not make that change and left it untouched.
