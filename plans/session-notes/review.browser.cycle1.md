# Browser review: Session notes

**Plan**: session-notes
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 13736 words (budget 30000)
**Rig**: `make web-build build` at 5b86280d (tree dirty only in `orchestration-state.json`), `bin/musterd` per test via `helpers/fixtures.ts` `daemon`: a fresh scratch data dir under `$TMPDIR/muster e2e-<owner>-…` (with a space), `-S <dataDir>/tmux.sock`, the E2E stub `claude`. Headless Chromium, throwaway `web/e2e/zz-rb-notes.spec.ts` run in the foreground with `--workers=1` (7 tests, all ran), then deleted. Teardown killed each daemon and ran `tmux -S … kill-server`.

Gates log `/var/folders/8t/36s1xtwj1xjfn1pg_jrwztjw0000gn/T/gates-session-notes-c1`: 0 failed lines, `21-e2e.log` 635 passed, `04-web-build.log` green. So the app I drove is the one that ships.

Hosts: **focus** (the header glyph, the anchored panel, the popped-out panel over the main slot, and the rail card), **tiles** (the tile header, the strip card, the hidden popped panel). **pop-out `/doc.html`**: N/A for every row, because notes have no `/doc.html` host. The "popped-out panel" is an in-page form of the Focus host and is measured as `popped`. States: **no data** (`note: null`), **data**, **daemon-down** (SIGTERM through `daemon.kill()`, the banner confirmed visible). Measurements are at 1440×900 unless a cell names another size. "Slot" means `section.main`, between `#mainhead`'s bottom (or the effort strip's) and the size note's top.

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-6 | focus | no data | glyph muted, placed right before the title | pass | `.ng` color rgb(166,171,188) = `--fg-dim`, opacity 0.55; glyph box 314–327 × 63.7–76.7, `h2.name` starts at x 339, both inside mainhead 300–1440 |
| REQ-6 | focus | data | glyph in the foreground | pass | after the first save: class `ng has`, color rgb(232,230,225) = `--fg`, opacity 1 |
| REQ-6 / INV-3 | focus | data (ended) | glyph stays foreground on an ended session | pass | after `/end`, endcap visible: `ng has`, color `--fg` |
| REQ-6 / edge 16 | focus | data | glyph keeps its width; action cluster stays in view at header widths 1280/900/640/360 | pass | windows 1580/1200/940/660 give header w 1280/900/640/360. The glyph is 13×13 at x 314 each time and the name starts at 339. `.acts` right edges 1566/1186/926/646 all ≤ mainhead right (1580/1200/940/660) |
| REQ-6 | focus | daemon-down | glyph keeps the last-known state | pass | banner `display:block`; glyph color `--fg` |
| REQ-7 | focus | no data | glyph click opens the anchored panel, which reads `Note · <title>` and shows the empty-note line | pass | `.npanel.anchored` display flex, opacity 1, box 314,80.7–714,152.5 under the glyph (glyph bottom 76.7) and inside the viewport; header `Note· rb-a`; `aria-expanded="true"`; only `Pop out note` has display block (Pop in and Close are `display:none` with `[hidden]`) |
| REQ-7 | focus | no data | Space and Enter on the keyboard-focused glyph open it; focus kept across a tick | pass | Shift+Tab from rename makes `.ng` the activeElement, still the same node after 1.2 s; Space opens the panel and focus moves to `DIV.bd`; Enter also opens it (malformed-note run) |
| REQ-7 | focus | data | Escape with focus inside closes; click-away closes; glyph state follows | pass | after Escape the panel node is gone and `aria-expanded=false`, focus on `.ng`; a pointer click on the terminal also closes it and focus goes to `xterm-helper-textarea` |
| REQ-8 | focus | no/data | Enter on the body or a click opens a focused textarea; focus kept across a tick; a click inside the panel returns to rendered | pass | after Enter the activeElement is the TEXTAREA, the same node after 1.3 s of typing; a click on the header label gives editor count 0, an `h2 "heading two"` rendered and the panel still open |
| REQ-8 | focus | data | native undo and redo | pass | Cmd+Z gives `first line\n\n#`, Cmd+Shift+Z gives `first line\n\n## heading two` |
| REQ-9 | focus | data | sent about 1 s after the last keystroke | pass | the `PUT …/note` request left 952 ms after the last key (request event timestamp); `/api/state` then read the typed text |
| REQ-9 / REQ-15 | focus | data | anchored panel closes on a focus switch, and the pending text is saved first | pass | after clicking another card the panel node is gone; d1's `/api/state` note holds the typed ` more` |
| REQ-10 / REQ-11 | focus | daemon-down | text kept, status `unsaved, musterd unreachable` in `--warn` | pass | editor value kept; `localStorage["muster.note-drafts"]` = `{"1":"…plus typed while down"}`; `.st` text matches, color rgb(232,207,90) = `--warn` |
| REQ-10 / REQ-11 | focus | daemon-down → up | the save lands with no action and the status clears | pass | after `daemon.restart()` the `/api/state` note matched in 1.9 s; `.st` text empty afterwards |
| REQ-11 | focus | data | nothing shows while a save is merely in flight | **[note]** not measured (no way to hold a request in flight without a stub). R8/W5 cover it |
| REQ-12 | focus (popped) | data | Pop out gives the popped form with Pop in and Close only | pass | `.npanel.popped` 1056,119.4–1416,419.4 (360×300); visible controls are `Pop in note` and `Close note`, both inside the panel box |
| REQ-12 / E9 | focus (popped) | data | after a terminal click the keys reach the pane and the panel stays | pass | activeElement inside the terminal; `tmux capture-pane` contains `rbtyped`; panel still display flex |
| REQ-12 | focus (popped) | data | the glyph does not close the popped panel | pass | after a glyph click: visible, class `npanel popped` |
| REQ-23 / INV-2 | focus (popped) | data | Escape from the terminal or the rail leaves the panel alone | pass | Escape after a terminal click leaves the panel open; Escape after clicking the rail density button leaves it visible and focus stays put |
| REQ-13 | focus (popped) | data | drag by the header; resize from corners and edges down to a minimum | pass | nw corner out → 1140×778.6 (fills the slot); se corner in → 260×150, both controls inside the panel; e and s edges out → 1140×778.6 |
| REQ-13 | focus (popped) | daemon-down | the minimum still shows the header controls | **FAIL** | at 260×150 with the status showing, `.ph` scrollWidth is 286 against clientWidth 258. Pinned at the slot's right edge (panel 1180–1440), Pop in sits at 1421–1441 and Close at 1447–1467, past the 1440 viewport: `elementFromPoint` at Close's centre is `null` and a pointer click leaves the panel open (Major 1) |
| REQ-14 / INV-5 | focus (popped) | data | inside the slot after drag past every edge | pass | dragged up-left: 300,95.4 (slot 300,95.4–1440,874); dragged down-right: 1080,574–1440,874 |
| REQ-14 / edge 17 | focus (popped) | data | inside the slot after a window resize, once settled | pass | settled 2.5 s after the resize: at 800×600, top 126.4 = slot top 126.4; at 640×500, 300,177.4–640,461 (340×283.6) = the slot exactly; back at 1440×900 the remembered rectangle 300,95.4 returns |
| REQ-14 / edge 17 | focus (popped) | data | no overlap of the Focus header while the resize settles | FAIL (Minor 1) | sampled every 100 ms over three rounds: on 1440→800 the panel stays at y 95 while the header bottom is at 126, for 107/429/845 ms; on 800→1440 it stays at y 126 for 313/944/631 ms before it re-clamps |
| REQ-14 | focus (popped) | data | header grows with no window resize (long title focused) | pass | focusing the long-title session moves the panel to top 126.4 = the header's new bottom |
| REQ-14 | focus (popped) | daemon-down | banner pushes the slot down | pass | banner shown: panel top 127.4 = slot top 127.4; banner gone: back to 95.4 |
| REQ-15 | focus (popped) | data | follows focus to another session | pass | header `Note· rb-b2`, body `second session note`, same rectangle 300,95.4 403×323 |
| REQ-15 / edge 9 | focus (popped) | data | Remove of the focused session shows the next one; the last Remove closes the panel | pass | after Remove the panel is popped with `Note· rb-f2` and `f2 survivor note`; the removed note is absent from `/api/state` and its draft key is null. After the last Remove the `.npanel` node is gone and `#main-empty` is display flex |
| REQ-16 | focus (popped) | data | reload keeps the form and rectangle; a new tab starts anchored | pass | reload brings back popped 300,95.4 403×323, the rectangle set before the window resizes. In a new tab of the same context no panel shows until the glyph is clicked, and it opens `npanel anchored` |
| REQ-17 | tiles | data | popped panel hidden in Tiles; Focus brings it back at the same rectangle | pass | in Tiles `.npanel` has `hidden`, computed `display:none`; back in Focus it is popped at 300,95.4 403×323 |
| REQ-18 / INV-3 | focus (rail card) | no data | no marker | pass | `.r2 .mk` has `hidden`, computed `display:none`, empty sr text |
| REQ-18 / INV-3 | focus (rail card) | data, ended | marker at the end of the repo line; repo text ellipsizes before it | pass | mk 277–288 ends at r2's right edge (288); `.rf` 14–269 with `text-overflow: ellipsis`; sr text `Has a note`; color rgb(178,182,195) = `--fg-muted`; still the same after `/end` |
| REQ-18 | tiles (tile header) | data | marker before the context readout | pass | rb-b1: mk 567–578, `.ctxinfo` starts at 587 (`ctx unknown`), both inside thead 2–718.5; rb-b2 is the same |
| REQ-18 | tiles (strip card) | data | marker at the end of the repo line | pass | the 5th session in the strip: mk 1418–1429 ends at r2's right edge (1429); `.rf` ends at 1410 |
| REQ-18 | tiles | daemon-down | markers keep the last-known note | pass | banner block; tile mk display flex |
| REQ-18 | focus (rail card) | daemon-down | marker kept | pass | mk display flex |
| REQ-19 | focus (rail card) | data | 350 ms hover opens a read-only tooltip that does not take the pointer | pass | none at 150 ms; at 850 ms a `role=tooltip` with display block, opacity 1, `pointer-events:none`, header `Note read-only`, box 277,181.8–577,423.7 inside the viewport; it closes when the pointer leaves (count 0). Exact delay not timed: [note] |
| REQ-19 | tiles (tile header, strip) | data | the same hover | pass | tile: tooltip 567,110.5–867,352.4; strip: flips above (784–853.8, marker top 858), inside the viewport |
| REQ-19 | focus / tiles | daemon-down | hover keeps the last-known note | pass | rail hover reads `known before outage`; tile hover renders the last-known note |
| REQ-20 | hover | data | cut after 12 lines with a fade | pass | `.nb.cut` max-height 213.94px against line-height 17.835px (12 lines); mask `linear-gradient(… 75%, transparent)`; scrollHeight 1403 |
| REQ-20 | focus (anchored) | data | height capped to the viewport; the body scrolls | pass | long note: panel 80.7–440.7 at both 900 and 640 window heights (inside the viewport); `.bd` scrollHeight 1403 against clientHeight 324, overflow auto; a wheel moves scrollTop 0→400 |
| REQ-20 | focus (popped) | data | body scrolls inside the chosen size | pass | `.bd` 1403 against 264, overflow auto; a wheel moves scrollTop 0→300 |
| REQ-21 | focus | data | a second window updates in place when not editing and keeps its own text while editing | pass | second context: body shows `from window one` with no reload; while editing it keeps `p2 local` through another upsert |
| REQ-22 | focus (anchored), hover | data | frontmatter and mermaid rendered | pass | `table.frontmatter` (title/status rows); one diagram `svg` in the panel and in the tooltip |
| REQ-22 / edge 15 | focus (anchored) | data | malformed input renders as the reader shows it; a click still edits | pass | `pre.frontmatter` raw block, mermaid source kept, `p.diagram-error "diagram not rendered: Parse error on line 2:"`; a click on the body gives a focused TEXTAREA |
| §6.7 | all | daemon-down | daemon-down surfaced prominently | pass | `#banner` display block, `musterd unreachable — hook output in open panes is Muster's absence, not session failure.` |
| §7.1 | focus (popped) / tiles | data | one live client per session | pass | `totalAttachedClients()` is 1 with one focused session and the popped panel, and 2 in Tiles with 2 tiles |
| §6 others, §7.2–7.5 | all | all | gauges, Done, cost, permission mode, geometry, scrollback, pane styling | N/A — this plan adds no gauge, state word, cost, mode, terminal geometry or xterm option; the panel floats over the slot and never resizes the pane | |

## Issues

### Critical
None.

### Major
1. **[web-impl]** With the unsaved status showing, the popped-out panel at its minimum width (260px) pushes its header controls past its own right edge. Measured: `.npanel .ph` scrollWidth 286 against clientWidth 258, and the `· <title>` label shrinks to 0 width. With the panel pinned to the slot's right edge, Close sits at x 1447–1467 and Pop in at 1421–1441, against a 1440 viewport. `elementFromPoint` at Close's centre returns `null`, and a pointer click leaves the panel open. The case is ordinary: the panel's default place is the slot's top right, and the status appears whenever musterd is down. REQ-13 says the minimum still shows the header controls. Files: `web/src/style.css` (`.npanel .ph`, `.st`) and `features/notesgeometry.ts` (the minimum). A fix must make true: at the minimum size, with the status text showing, both visible controls lie inside the panel box, and so inside the slot.

### Minor
1. **[web-impl]** After a window resize, the popped panel waits for the next render tick before it re-clamps. Until then it overlaps the Focus header, or sits off its remembered place. Sampled every 100 ms over three rounds: on 1440×900→800×600 the panel stayed at y 95 while the header's bottom was at 126, for 107, 429 and 845 ms; on the way back it stayed at y 126 for 313, 944 and 631 ms. The settled state is correct. During a live window drag the panel sits over the header for most of the drag. A fix must make true: the panel's rectangle follows the slot in the same frame the slot's box changes (on resize, or whenever the header's height changes), not on the next tick.
2. **[render-tests]** R7 (and E12) could not have failed for Major 1. R7 drives the popped panel to its minimum only with the status empty, and R8 checks the status colour only in a panel at its default width. A test must make true: at 260×150, pinned to the slot's right edge with `unsaved, musterd unreachable` shown, the Pop in and Close boxes lie inside the panel box.

### Notes
1. **[note]** REQ-11's "nothing shows while a save is merely in flight" was not measured in the running app, because a request cannot be held open without a network stub. W5 and R8 own it.
2. **[note]** REQ-19's 350 ms delay was bracketed (no tooltip at 150 ms, tooltip at 850 ms), not timed exactly.
3. **[note]** At a 360px window (header 60px wide, under the rail's fixed 300px) the title wraps below the glyph and `.acts` spills to x 582. That is outside REQ-6/R2's range (header width ≥ 360) and older than this plan.
4. **[note]** In daemon-down, the rail hover shows the daemon's last-known note while the panel's editor holds the unsaved draft. This matches the plan's States ("markers and hovers keep the last-known note"). No change requested.
5. **[note]** V3 (mockup match) is a visual comparison against the mockups, and I did not diff it against `mockups/*.html`.
