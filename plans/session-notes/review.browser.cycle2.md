# Browser review: Session notes

**Plan**: session-notes
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 15485 words (budget 30000)
**Rig**: `make web-build build` at d4382694 (clean tree), `bin/musterd` per test via `helpers/fixtures.ts` `daemon`: a fresh scratch data dir under `$TMPDIR/muster e2e-<owner>-…` (with a space), `-S <dataDir>/tmux.sock`, the E2E stub `claude`. Headless Chromium, throwaway `web/e2e/zz-rb-notes-c2.spec.ts` run in the foreground with `--workers=1` (5 tests, every one ran to the end over three runs), then deleted. Fixture teardown killed each daemon and ran `tmux -S … kill-server`.

Gates log `/var/folders/8t/36s1xtwj1xjfn1pg_jrwztjw0000gn/T/gates-session-notes-c2`: 0 failed lines. `21-e2e.log` shows 635 passed and `04-web-build.log` is green, so the app I drove is the one that ships.

Hosts: **focus** (the header glyph, the anchored panel, the popped-out panel over the main slot, and the rail card) and **tiles** (the tile header, the strip card, and the hidden popped panel). **pop-out `/doc.html`** is N/A for every row because notes have no `/doc.html` host. The popped-out panel is an in-page form of the Focus host, measured as `focus (popped)`. States: **no data** (`note: null`), **data**, and **daemon-down** (SIGTERM through `daemon.kill()`, with the banner confirmed `display:block`). Measurements are at 1440×900 unless a cell names another size. "Slot" means `section.main` from the bottom of `#mainhead` (or of the effort strip) to the top of the size note.

The cycle-1 findings were re-measured first (rows marked **re-check**).

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-13 / browser c1 Major 1 **re-check** | focus (popped) | daemon-down | at the minimum size, with the status showing and the panel pinned to the slot's right edge, both controls lie inside the panel and work with the pointer | pass | panel 1180–1440 × 158.4–308.4 (260×150), slot 300–1440. `.ph` scrollWidth 258 = clientWidth 258. Pop in 1383–1403 and Close 1409–1429 are inside the panel. `elementFromPoint` at each centre returns `Pop in note` and `Close note`. `.st` shows 143 of its 182 px with an ellipsis, `title="unsaved, musterd unreachable"`, colour rgb(232,207,90) = `--warn`. A pointer click on Close closes the panel (dialog count 0) |
| REQ-13 | focus (popped) | data | the same at the minimum with no status, then with a long title | pass | pinned right 1180–1440: sw 258 = cw 258, controls at 1383–1403 and 1409–1429 and both hit-test to themselves. After focusing the 54-character-title session, `.who` 1227.7–1371 ellipsizes and the controls do not move |
| REQ-14 / edge 17 / browser c1 Minor 1 **re-check** | focus (popped) | data | the panel follows the slot in the same frame on a window resize | pass | Jumps 1440×900→800×600→1440×900, three rounds, sampled every animation frame: the only out-of-slot reading is the first rAF after each shrink (at 19–22 ms, read before the ResizeObserver runs in that frame). A stepped drag resize, 1440→700→1440 in 40 px steps, gives 19 of 80 rAF reads out of slot and **0 of 80 post-paint reads** (a MessageChannel task after each frame). Cycle 1 measured 107–945 ms of overlap |
| REQ-6 | focus | no data | glyph muted, placed right before the title | pass | `.ng` colour rgb(166,171,188) = `--fg-dim`, opacity 0.55, display flex; box 314–327 × 63.7–76.7; `h2.name` starts at x 339; both inside mainhead 300–1440 |
| REQ-6 | focus | data | glyph in the foreground | pass | after the first save: class `ng has`, rgb(232,230,225) = `--fg`, opacity 1. With the glyph now written only by `features/notes.ts`, the class follows a save, an ended session and a clear |
| REQ-6 / INV-3 | focus | data (ended) | glyph and marker stay on an ended session | pass | after `/end` with the endcap visible: `ng has`, `--fg`; rail `.mk` display flex, `Has a note` count 1 |
| REQ-6 / edge 6 | focus | data → no data | a whitespace-only save mutes the glyph and hides the marker | pass | `/api/state` note `null`; class `ng`, colour `--fg-dim`; `.r2 .mk` has `[hidden]` and computes `display:none`; the empty-note line shows |
| REQ-6 / edge 16 | focus | data | glyph keeps its width and the action cluster stays in view at header widths 1280, 900, 640 and 360 | pass | windows 1580, 1200, 940 and 660: the glyph is 13×13 at x 314 and the name starts at 339 every time. `.acts` right edges are 1566, 1186, 926 and 646, each ≤ the mainhead's right edge |
| REQ-6 | focus | daemon-down | glyph keeps the last-known state | pass | banner `display:block`; glyph class `ng has` |
| REQ-7 | focus | no data | the keyboard-focused glyph keeps focus across a tick, and Space opens the panel | pass | `activeElement` is `.ng` and the same node after 1.2 s; Space opens the panel and focus moves to `.bd` |
| REQ-7 | focus | no data | anchored panel under the glyph, reading `Note · <title>`, with the empty-note line | pass | `.npanel.anchored` display flex, opacity 1, box 314–714 × 80.7–152.5, below the glyph (bottom 76.7) and inside the viewport. Header `Note· rb-a`. `aria-expanded="true"`. Only `Pop out note` computes `display:block`; Pop in, Close and the 8 `.rz` handles compute `display:none`. The textarea is absent |
| REQ-7 | focus | data | Escape inside closes; click-away closes | pass | Escape on `.bd`: no `.npanel` node, `aria-expanded="false"`, focus back on `.ng`. A pointer click on the terminal also closes it, and focus goes to `xterm-helper-textarea` |
| REQ-8 | focus | no data / data | Enter on the body gives a focused textarea that keeps focus across a tick; a click inside the panel goes back to rendered | pass | after Enter the `activeElement` is the TEXTAREA, the same node after 1.3 s. A click on the header label gives editor count 0, an `h2 "heading two"` rendered, and the panel still open |
| REQ-8 | focus | data | native undo and redo | pass | Cmd+Z gives `first line\n\n#`, Cmd+Shift+Z gives `first line\n\n## heading two` |
| REQ-9 | focus | data | text sent about 1 s after the last keystroke | pass | the `PUT …/note` left 1004 ms after the last key; `/api/state` then read `first line\n\n## heading two` |
| REQ-9 / REQ-15 / INV-4 | focus (popped) | data | focus follows to another session | pass | after clicking the second card: header `· rb-p2-…`, body `second session note`, still popped and inside the slot (1180–1440 × 126.4–276.4; the slot top moved to 126.4 for the wrapped header) |
| REQ-9 | focus | daemon-down | closing the panel with pending text flushes it, and it lands after the restart | pass | typed ` again` while down, Escape, then a pointer Close; after `daemon.restart()` `/api/state` note = `typed while down more again` |
| REQ-10 / REQ-11 | focus (popped) | daemon-down | text kept per session, unsaved status in `--warn` | pass | editor value kept; `localStorage` holds only `muster.note-draft.1` = `"typed while down"`; `.st` text matches the status, colour `--warn` (rgb 232,207,90; `--amber` is rgb 242,163,60) |
| REQ-10 / REQ-11 | focus | daemon-down → up | the save lands with no action and the status clears | pass | after `daemon.restart()` `/api/state` note = `typed while down`; `.st` text empty; `muster.note-draft.1` removed (null); banner `display:none` |
| REQ-11 | focus | data | nothing shows while a save is merely in flight | **[note]** not measured | Note 1 |
| REQ-12 | focus (popped) | data | Pop out gives the popped form with only Pop in and Close | pass | `.npanel.popped` 1056–1416 × 119.4–419.4 (360×300, inset 24 from the slot's top right); Pop out `display:none`, Pop in and Close `block`; all 8 `.rz` `block`; header cursor `grab` |
| REQ-12 / E9 | focus (popped) | data | after a terminal click, keys reach the pane and the panel stays | pass | focus is inside the terminal; the pane's stub echoes `stub-echo:rbtyped`; the panel still has class `npanel popped`, display flex |
| REQ-12 | focus (popped) | data | the glyph does not close the popped panel | pass | after a glyph click: `npanel popped`, display flex, focus moved into the panel |
| REQ-23 / INV-2 | focus (popped) | data | Escape from the terminal or the rail leaves the panel alone | pass | Escape with the terminal focused: panel unchanged after 1.2 s and focus still in the terminal. Escape after a rail click: display flex |
| REQ-13 | focus (popped) | data | drag by the header; resize from every edge and corner, out and down to the minimum | pass | nw, n, w, ne, sw, e, s and se dragged out each give 300–1440 × 95.4–874, which is the slot. se and nw dragged in each give 260×150 |
| REQ-14 / INV-5 | focus (popped) | data | inside the slot after a drag past every edge | pass | up-left: 300,95.4 (slot 300,95.4–1440,874); down-right: 1080,574–1440,874 |
| REQ-14 / edge 17 | focus (popped) | data | inside the slot after a window resize, then back to the remembered rectangle | pass | at 640×500: 380–640 × 177.4–327.4 inside slot 300–640 × 177.4–461. Back at 1440×900: 1180,95.4 (the rectangle before the resizes) |
| REQ-14 | focus (popped) | data | a taller header with no window resize | pass | focusing the long-title session moves the panel top to 126.4, the new slot top |
| REQ-14 | focus (popped) | daemon-down | the banner pushes the slot down | pass | banner shown: panel top 158.4 = slot top 158.4 |
| REQ-15 / edge 9 | focus (popped) | data | Remove of the focused session shows the next one; the last Remove closes the panel | pass | after Remove: popped, `· rb-p2-…`, body `second session note`; the removed note is absent from `/api/state`; its `muster.note-draft.<id>` key is null. After the last Remove: no `.npanel` node, `#main-empty` display flex |
| REQ-16 | focus (popped) | data | reload keeps the form and rectangle; a new tab starts anchored | pass | reload brings it back popped at 680–940 × 295.4–445.4, the rectangle set before the reload. A new tab in the same context shows no panel until the glyph is clicked, then `npanel anchored` |
| REQ-17 | tiles | data | popped panel hidden in Tiles; back in Focus at the same rectangle | pass | in Tiles `.npanel` has `[hidden]` and computes `display:none`. Back in Focus it is popped at 680–940 × 295.4–445.4, the same as before |
| REQ-18 / INV-3 | focus (rail card) | no data | no marker | pass | `.r2 .mk` computes `display:none` |
| REQ-18 / INV-3 | focus (rail card) | data | marker at the end of the repo line; the repo text ellipsizes before it | pass | `.mk` 277–288 ends at `.r2`'s right edge (288); `.rf` 14–269 with `text-overflow: ellipsis`; `Has a note` count 1; colour rgb(178,182,195) = `--fg-muted` |
| REQ-18 | tiles (tile header) | no data / data | marker before the context readout only on the noted tiles | pass | rb-t1: `.mk` 567–578, `.ctxinfo` starts at 587; rb-t2: 1286–1297, then 1306. rb-t3 and rb-t4 (no note): `.mk` display none |
| REQ-18 | tiles (strip card) | data | marker at the end of the repo line | pass | strip cards 5 and 6: `.mk` 698–709 and 1418–1429, each ending at `.r2`'s right edge; `.rf` ends at 690 and 1410 |
| REQ-18 | tiles / focus | daemon-down | markers keep the last-known note | pass | tile markers `flex, flex, none, none`; rail `.mk` display flex |
| REQ-19 | focus (rail card) | data | 350 ms hover opens a read-only tooltip that never takes the pointer | pass | no tooltip at 200 ms; at 600 ms one `role=tooltip`: display block, opacity 1, `pointer-events:none`, header `Note read-only`, box 277–577 × 181.8–423.7 inside the viewport. Count 0 after the pointer leaves |
| REQ-19 | tiles (tile header, strip) | data | the same hover | pass | tile: tooltip 567–867 × 110.5–352.4. Strip: flips above, 784–853.8 over the marker's top of 858, inside the viewport |
| REQ-19 | focus / tiles | daemon-down | hover keeps the last-known note | pass | rail hover reads `Note read-only known before outage` while the editor holds the unsaved draft. Tile hover renders the long note's frontmatter and heading (re-measured after the banner moved the marker down 32 px) |
| REQ-20 | hover | data | cut after 12 lines with a fade | pass | `.nb.cut` max-height 213.938px = 12 × line-height 17.835px; mask `linear-gradient(… 75%, transparent)`; scrollHeight 2179, clientHeight 214 |
| REQ-20 / edge 14 | focus (anchored) | data | height capped to the viewport, and the body scrolls | pass | long note: panel 80.7–440.7 at window heights 900 and 640, inside the viewport both times; `.bd` scrollHeight 2179, clientHeight 324, overflow-y auto; a wheel moves scrollTop 0→400→800 |
| REQ-20 | focus (popped) | data | the body scrolls inside the chosen size | pass | `.bd` scrollHeight 2179, clientHeight 264, overflow-y auto; a wheel moves scrollTop to 300 |
| REQ-21 / edge 12 | focus | data | a second window updates in place when not editing, and keeps its own text while editing; its next save wins | pass | second context: body `from window one` with no reload. While it is editing, an API write `third write` leaves its editor at `p2 local`. Its next keystroke stores `p2 local!` |
| REQ-22 | focus (anchored), hover | data | frontmatter and mermaid rendered | pass | `table.frontmatter` count 1 and one diagram `svg`, in the panel and in the tooltip |
| REQ-22 / edge 15 | focus (anchored) | data | malformed input renders as the reader shows it, and a click still edits | pass | `title: [unclosed` renders as a frontmatter row; the broken fence keeps its source and shows `p.diagram-error "diagram not rendered: Parse error on line 3:"`. A click on the body gives a focused TEXTAREA. Enter on the keyboard-focused glyph opened the panel |
| §6.7 | all | daemon-down | daemon-down surfaced prominently | pass | `#banner` display block: `musterd unreachable — hook output in open panes is Muster's absence, not session failure.` |
| §7.1 | focus (popped) / tiles | data | one live client per session | pass | `totalAttachedClients()` is 1 in Focus with the popped panel; 2 in Tiles with 2 sessions; 4 in Tiles with 4 tiles and 2 strip cards |
| §6 others, §7.2–7.5 | all | all | gauges, Done, cost, permission mode, geometry, scrollback, pane styling | N/A — this plan adds no gauge, state word, cost, mode, terminal geometry or xterm option; the panel floats over the slot and never resizes the pane | |

## Issues

### Critical
None.

### Major
None.

### Minor
None.

### Notes
1. **[note]** REQ-11's "nothing shows while a save is merely in flight" was not measured in the running app. A request cannot be held open without a network stub. W5 and R8 own it.
2. **[note]** The cycle-1 correctness Note 2 flicker was not reproduced on localhost. I typed, waited for the debounced `PUT` to leave, typed more and pressed Escape at once. A MutationObserver on the body recorded only the final `AAAABBBB`, and the wire matched. The earlier upsert lands inside the typing window on localhost, so a slower link could still show it. No change requested.
3. **[note]** At the 260 px minimum with the status showing, the `· <title>` label gives way to 0 px and the status is cut with an ellipsis (its full text is in `title`). This is the fix's intended give-way order (web-implementation.md, Fix Attempt 1), and both controls stay reachable. No change requested.
4. **[note]** REQ-19's 350 ms delay was bracketed (no tooltip at 200 ms, a tooltip at 600 ms), not timed exactly.
5. **[note]** V3 (mockup match) is a visual comparison against `mockups/*.html`, and I did not diff it.
