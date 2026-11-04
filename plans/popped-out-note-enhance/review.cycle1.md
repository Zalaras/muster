# Review: popped-out-note-enhance

**Plan**: popped-out-note-enhance
**Verdict**: needs-changes
**Cycle**: 1
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser needs-changes, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Popped-out note enhancements

**Plan**: popped-out-note-enhance
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 31552 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 per-session pop-out, one panel | Yes: `notes.ts` `renderPhase`/`stillWanted`, `focusChanged` closes | R1, R8, E1, E2, E8, E11 | pass |
| REQ-2 own rectangle per session | Yes: `places` map, `effectiveRect` | R1, E1 | pass |
| REQ-3 per-tab memory, old key ignored | Yes: `muster.note-places` via `safeSessionStorage`; `muster.note-panel` never read | W1, W2, W3, E1, old-key E2E | pass |
| REQ-4 pop in / close / window keep rect, Remove forgets | Yes: `closeByUser`, `popIn`, `openInWindow`; `withoutPlace` on `sessionRemoved`, `withoutAbsent` on snapshot | R2, R3, W5, E2, E3, E4 | pass |
| REQ-5 drag/resize anywhere in the window, clamped, 260×150 floor, default 360×300 | Yes: viewport-bounded `clampRect`/`dragRect`/`resizeRect`, `defaultPlacement` | R4 (partial, correctness Major 1), R5, R6, W4; edge case 3 untested (correctness Major 2) | fail |
| REQ-6 anchored Close saves at once, returns focus | Yes: `closeByUser` → `close(true)` → `editor.release()` flush | R11, E2E "Close on the anchored panel…" (700 ms bound), keyboard test | pass |
| REQ-7 three controls per form, inside at 260px | Yes: DOM order Pop out, Pop in, Open in window, Close | R7, 260×150 test | pass |
| REQ-8 Open in window: popup, close panel, focus existing, blocked keeps panel | Yes: `noteswindows.ts` `openOrFocus`, early return in `openInWindow` | W6 (seam), E3, popped-out window test | pass |
| REQ-9 note window content, no controls, Escape only leaves edit, title, theme | Yes: `notespage.ts`, `note.ts`, `note.html` | R9, R12, E5 | pass |
| REQ-10 window stays on its session, two-way sync | Yes: fixed `sessionId`, `adoptIncoming` via shared editor | E5 | pass |
| REQ-11 `connecting…`, unsaved status, kept text re-sent | Yes: `statusFor`, `saver.resend` on snapshot | R13, E6 ×2 (correctness Minor 1) | pass |
| REQ-12 removed notice, drafts dropped, unknown/malformed id | Yes: `markRemoved`, `parseNoteQuery`, `noteWindowWsHandlers` wires `sessionRemoved` | R9, W7, E7 | pass |
| REQ-13 storage unavailable | Yes: every access through `safeSessionStorage()`/`safeLocalStorage()` | R8, E2E blocked-storage test | pass |
| REQ-14 hidden in Tiles, window live in Tiles | Yes: `showsFor` requires `view === "focus"` | R10 (existing test, `notes-tiles` prefs), E5 | pass |
| DIAG | `kb:diagram/web-components` (every changed web file maps to it): third entry `note.ts`, its four edges, `features/` 48 modules (counted 48), `render/` 45 (counted 45), sessionStorage use all true | — | pass (one mislabelled phrase, correctness Minor 2) |

## Build & Tests

E2E tests: pass (663, full suite: the gate ran `make e2e-run SPECS=''`, no `NOTE e2e scope` line) · Daemon tests (race): pass (all packages ok) · Web tests: pass (3070 in 107 files) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues, biome clean) — all read from $GATES_LOG_DIR (`gates-c1`, 0 failed lines). Also green there: render-fixtures (106 scenarios up to date), render-lint, render-test (438 passed), contrast (54 pairs ×3 themes, 0 failures), features-inventory, versions, e2e-honest, kb check (662 records, 0 problems), e2e-lint, features-scope, comments, comment-ledger, size (0 hits), e2e-level (census only; `notes.spec.ts` not flagged).

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| W1 | `make web-build` | pass (04-web-build.log) |
| W2 | `make web-test` | pass (05-web-test.log, 3070 passed) |
| W3 | `make web-lint` | pass (09-web-lint.log) |
| R1 | `make render-test` | pass (08-render-test.log, 438 passed) |
| E1 | `make e2e` | pass (21-e2e.log, 663 passed) |
| C1 | `make check` | pass (22-C1.log) |
| C2 | `! grep -rn "muster.note-panel\"" web/src --include=*.ts --exclude=*.test.ts` | pass (23-C2.log empty, so grep matched nothing) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. Both proposed ADRs exist with `refs: plan:popped-out-note-enhance`. `notes-popout-per-session-anywhere-in-window` supersedes `notes-popout-hidden-in-tiles-geometry-per-tab`, and both ADRs describe what shipped. The logs carry no `deviation:` lines. The notes spec `web:` globs own `web/note.html` and `web/src/note.ts`. The `TODO.md` #112 tick waits for an approved `review.md`, as the orchestrate skill requires. Every Doc Delta "becomes true" line holds in the code. The web-impl `doc-delta:` line about the shared Close sentence is covered by the delta's first line ("Close, like the glyph, saves at once and returns focus"), and its CLAUDE.md half was resolved in Fix Attempt 1. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| V1 | no `any` in new web code | pass | `rg ': any\b\|as any\|<any>'` over `features/notes*.ts`, `note.ts`, `render/notespanel.ts`: no hits |
| V2 | `note.ts` only wires | pass | 22 lines: createApp, initTheme, initUpdateRestart, mountNotePage, tick, connection state, WsClient. It has no DOM lookup, listener or state and follows `doc.ts`'s order. `#note-host` is looked up in `notespage.ts` |
| V3 | Chrome popup without a tab strip; second press brings it to the front | pass (code read) | `window.open(url, "muster-note-<id>", "popup,width=520,height=460")` with no `noopener`, so the handle is kept. A second press calls `existing.focus()` while `!closed`. E3 proves no second page opens. Whether the window really comes to the front on screen cannot be measured headless and is left to review-browser |
| V4 | note window fills the window at 320×240 and 1200×900, body scrolls | pass (measured) | Scratch Chromium run of the built `note.html?session=3` with the `notes` fixture frames. At 320×240 the panel is `[0,0,320,240]`, `.bd` is 215px tall with scrollHeight 848 and `overflow-y: auto`, and the document is 320×240 (no page scroll). At 1200×900 the panel is `[0,0,1200,900]` with no document scroll. In both, 0 visible controls and title `Note · notes-long` |
| V5 | storage only through `safeSessionStorage()`/`safeLocalStorage()` | pass | `rg 'sessionStorage\|localStorage'` over the new and changed `src` files: no direct access. `notes.ts:57` and `notesedit.ts:33` use the accessors. The `note.html` hint script is the same guarded inline copy as `doc.html` |
| V6 | design-system § Note panel describes per-session pop-out, window bounds, three controls, note window | pass | `docs/design/design-system.md:333-346` (diff read) |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass: web-only change, no Claude Code format knowledge |
| 2 | Terminal-output state parsing | pass |
| 3 | Blocking hook handler | pass: no daemon change |
| 4 | Bare tmux / resize-pane | pass: none |
| 5 | Payload logging | pass |
| 6 | Empty-gauge dishonesty | pass: the note window reads `connecting…` before `hello`, never a blank "ok" |
| 7 | Session identity on `session_id` | pass: keyed on the Muster session id |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary | pass: E2E uses `launchNoted` with the stub |

## Issues

### Critical

None.

### Major

1. **[render-tests]** R4 is only partly asserted. The plan's R4 says the window is resized "to 800×600 and to 400×300" and that the panel stays "never smaller than 260×150 while the viewport allows". Both updated tests (`web/render/notes.spec.ts:300` and `:472`) resize only to 800×600 and 1440×900 and never assert the floor. So the shrink step of REQ-5 / edge case 2 ("moves in, then shrinks, never below 260×150") is never measured on screen. A fix must add the 400×300 step after the edge and corner resizes, and assert that the panel's box is inside the viewport and at least 260×150 there.
2. **[render-tests]** Edge case 3 and INV-2's "reload with a stored rectangle larger than the window, and focus switch to a session whose stored rectangle no longer fits" have no test. The plan maps edge case 3 to R5, but the R5 test (`web/render/notes-places.spec.ts:151`) only drags over the rail, masthead and header. `effectiveRect` (`web/src/features/notes.ts:86-90`) clamps on every show, so the code looks right; it is just never falsified. A fix needs a render test that pops out two sessions with one moved near the bottom-right of a 1440×900 window, then shrinks the viewport while the other is focused. It then focuses the moved session and reloads, and asserts after each step that the panel lies inside the viewport.

### Minor

1. **[e2e-specs]** The network-failure E6 test (`web/e2e/notes.spec.ts`, "text a note window could not save survives a reload… (E6, REQ-11, network failure)") ends on `noteOnWire(...) === "kept across the window's reload"` alone. Drafts live in shared `localStorage`, and the dashboard tab's snapshot handler re-sends every pending draft (`notes.ts:264-269`). That final poll therefore passes even if the window's own re-send on reconnect never happens. The sibling stopped-daemon E6 test pins the window's half with `windowStatus(win)` → `""`. Add the same assertion at the end of this test, so REQ-11's "re-sent … on reconnect" is shown for the window and not only for the dashboard.
2. **[orchestrator]** `docs/diagrams/web-components.md` (doc-upkeep commit `bffa0433`) describes the `features/` node's "three notes modules shared by the dashboard and the note window: notesedit, noteswindows, notespage". `notespage.ts` is imported only by `note.ts`; it is the note window's controller and is not shared. Reword that phrase to say `notesedit`/`noteswindows` are shared and `notespage` is the window's controller. The edges and counts are right.

### Notes

1. **[note]** The gate's E2E line ran the whole suite (`SPECS=''`, 663 tests), not a scoped list. That is more than the scope requires, and it is green.
2. **[note]** Plan defect, already handed off by e2e-specs: edge case 9 ("Open in window while musterd is down: the window opens and reads `connecting…`") cannot happen, because musterd serves `note.html`. `connecting…` before `hello` is covered by R13, and E6 opens the window before stopping musterd. Nothing in the Doc Delta claims the impossible half.
3. **[note]** Repairs row 1 is honest. Every `toBeNull()` check is kept, and the fetch shim rejects only `keepalive` PUTs with a `TypeError` (a connection-level failure, per kb:lesson/network-mode-covered-by-http-errors-only). It is lifted before the restart. No assertion was weakened.
4. **[note]** W6 is asserted at the seam (`noteswindows.test.ts`: blocked returns `false`), as the plan allowed. The "panel unchanged" half is the `return` at `notes.ts:194`, which I verified by reading it.
5. **[note]** The note window's `pagehide`/`visibilitychange` flush (`notesedit.ts:41-44`, `saver.flushAll`) sends every session's pending draft from the shared `localStorage`, not only its own session's. The text sent is the same text, so nothing is lost or reordered beyond last-write-wins. Recorded for review-maintainability's read of the shared `createNoteSaving`.
6. **[note]** The pack exceeds its budget (31552 of 30000 words); `kb` warned.

## Browser review

# Browser review: Popped-out note enhancements

**Plan**: popped-out-note-enhance
**Part verdict**: needs-changes
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

## Maintainability review

# Maintainability review: Popped-out note enhance

**Plan**: popped-out-note-enhance
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 11484 words (budget 30000)
**Scope**: 13 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (web only; no daemon file touched, so there is no `daemon-implementation.md`). `web/note.html` and `web/vite.config.ts` are outside that pathspec; I read them too (a third entry, the same shape as `doc.html` and its config line).

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| web/src/app.ts | wsapp.ts, features/actions.ts | yes (`applyRemoved`) | none | pass, see Note 2 |
| web/src/wsapp.ts | doc.ts, note.ts, app.ts | covered by `applyRemoved` line | none | pass |
| web/src/note.ts | doc.ts, main.ts (via the composition-root rules) | yes (`notespage.ts` line) | none | pass |
| web/src/features/actions.ts | app.ts, wsapp.ts | yes (`applyRemoved`) | none | pass |
| web/src/features/CLAUDE.md | (doc) | Fix Attempt 1 | n/a | pass |
| web/src/features/notes.ts | notesedit.ts, notespage.ts, notespanelstate.ts, notesgeometry.ts, notesdrafts.ts, notessave.ts, main's notes.ts | yes (split, derived popped state, places owner) | none | Major 1 |
| web/src/features/notesedit.ts | notes.ts (main and branch), notesdrafts.ts, notessave.ts, notesview.ts | yes | none | pass |
| web/src/features/notespage.ts | reader.ts `mountStandaloneReader`, notes.ts, reader/notice.ts, connectionhealth.ts | yes | none | Minor 1, Minor 2 |
| web/src/features/noteswindows.ts | reader.ts `parseStandaloneQuery`, notesdrafts.ts, notessave.ts | yes (W6 seam) | none | Major 2 |
| web/src/features/notespanelstate.ts | notesdrafts.ts, storage.ts users | yes (places owner) | none | pass |
| web/src/features/notesgeometry.ts | notes.ts | not separately stated; `defaultPlacement` builds on `defaultRect`, nothing duplicated | none | pass |
| web/src/render/notespanel.ts | render/reader.ts, render/notes.ts, render/anchored.ts | yes (`NotePanelHandlers` split) | none | Minor 3, Note 1 |
| web/src/style.css | the existing `.npanel` block | Decisions bullets (hidden companions, info status) | n/a | pass, Note 3 |

`$GATES_LOG_DIR/19-size.log`: `size-warn: 0 hits`. No funlen, dupl or file-length warning on any touched file. `notes.ts` went from about 370 lines on main to 304 here.

## Issues

### Critical

None.

### Major

1. **[web-impl]** A drag cut short by a close keeps writing to `places` and can move another session's rectangle. `web/src/features/notes.ts:225-243` (`beginGesture`) and `web/src/render/notespanel.ts:110-134` (`wireGesture`).
   - **The state.** `places` is the per-session places memory. Its declared writers are `remember` and the gesture's `update` (Decisions, `NotePanelHandlers` split line). The gesture closes over the `id` and `base` it started with.
   - **How the gesture ends today.** It ends only on `pointerup`/`pointercancel` delivered to the captured surface. The surface is `refs.head` or an `.rz` handle, and those are built once and reused across every open.
   - **The interleaving.** These steps follow from the code and the Pointer Events implicit-release rule. I did not run them in a browser.
     1. Session A's popped panel is being dragged.
     2. A focus change to B arrives mid-drag (a keyboard chord), or `sessionRemoved` for A arrives. Either way `notes.ts:255-257` or the render phase calls `close(false)`, which runs `refs.root.remove()` (`:178`).
     3. Removing the root releases pointer capture implicitly. The following `pointerup` goes to the document, not the detached surface, so `finish` never runs and the `move` listener stays bound.
     4. B's panel opens popped and B is dragged on the same surface. Both listeners fire. The stale one runs `places = withPlace(places, A, { popped: true, rect: A's base + B's deltas })`, and B's `end` persists that.
   - **What the branch changed.** On main a focus change did not detach the root, because the popped panel stayed open and swapped content. The rect was also not keyed per session, so this path could not reach another session's record.
   - **What a fix must make true.** A gesture stops writing once its panel closes or its surface loses capture. A gesture never writes a place for any session but the one shown. If the guard is a name, it sits where `places` is declared.

2. **[web-impl]** A second copy of the `?session=` id parse. `web/src/features/noteswindows.ts:22-25` vs `web/src/features/reader.ts:80-83`. Cites `docs/conventions.md` § Design "Reuse before add … What it finds is reused or generalised, never copied, whatever Decisions says". The `notespage.ts` `design:` line pastes the grep that found `parseStandaloneQuery`.
   ```
   reader.ts:82-83      const rawSession = params.get("session");
                        const sessionId = rawSession !== null && /^\d+$/.test(rawSession) ? Number(rawSession) : null;
   noteswindows.ts:23-24 const raw = new URLSearchParams(search).get("session");
                        return raw !== null && /^\d+$/.test(raw) ? Number(raw) : null;
   ```
   The two pop-out pages share one rule: what counts as a valid session id in the URL. **A fix must make true:** that rule has one owner that both `parseStandaloneQuery` and `parseNoteQuery` call. If the two ever drift, one page would accept `?session=` values the other rejects.

### Minor

1. **[web-impl]** `notespage.ts:41` spells out `"warn" | "info"` inline. `render/notespanel.ts:43` exports the same union as `StatusKind`, and `NotePanelView.statusKind` is typed with it. Cites § Design "One owner per concept". **A fix must make true:** `statusFor` returns the exported type, so adding a third kind is a change in one place.
2. **[web-impl]** `notespage.ts:9` adds a third literal `"connecting…"`. The other two are `features/connectionhealth.ts:11` (the masthead word) and `reader/notice.ts:29`, whose comment calls it "the masthead's own word". Cites § Design "One owner per concept". The duplicate between the reader and the masthead predates this branch; this branch adds the third copy. **A fix must make true:** the note window takes the word from an existing owner rather than its own constant. Folding the reader's copy in as well is optional.
3. **[web-impl]** The removed-notice text lives in the render module. Its sibling keeps the text in a pure module. `render/notespanel.ts:52,221-228` defines `REMOVED_NOTICE_TEXT` and builds the notice. `render/reader.ts:37-41` `renderUnknownSessionNotice` builds the same kind of notice (a `role="status"` node from `replaceChildren`) but imports `UNKNOWN_SESSION_TEXT` from the pure `reader/notice.ts:10`. That follows `web/src/render/CLAUDE.md`: "Every displayed string comes from a pure view-model". `REMOVED_NOTICE_TEXT` is exported, but `rg -n REMOVED_NOTICE_TEXT web` finds no importer. The `design:` lines give no reason for the divergence. **A fix must make true:** the note's removed-notice string sits where its siblings' notice strings sit (a pure notes module beside `notesview.ts`), and the builder takes it from there. Otherwise, a `design:` line says why it differs.

### Notes

1. **[note]** In the note window, `buildNotePanel(handlers)` still builds the pop-out, pop-in, open-in-window and close buttons, then `renderNotePanel` hides them for `form: "window"` (`render/notespanel.ts:212-215`). Two places now decide that the window has no controls: whether `controls` is passed, and the form. They agree today. This is not a defect, only something to know when adding a fifth control.
2. **[note]** `applyRemoved` is the first free function in `app.ts` besides `createApp`. The store-write, emit and render effects of every other WS message live inline in `wsapp.ts`. `actions.ts` also needs this effect, which is the stated reason for the placement (Decisions, `applyRemoved` line). It is defensible on the seam. A later reader looking for "what happens on sessionRemoved" now finds it in `app.ts`, not `wsapp.ts`.
3. **[note]** Decisions says `.npanel[hidden]` is "kept though nothing toggles it now". A rule with no writer is dead CSS. The contrast gate owns `style.css`, so this is only an observation.
4. **[note]** For review-work: the `web-components` diagram on this branch already shows `note.ts` and the three shared notes modules. The `features/` count and module list there are theirs to check (DIAG).
5. **[note]** The dashboard and the note window each build their own `DraftStore` over the same `localStorage` keys. Each keeps an in-memory `typed` map that the other page cannot see. Drafts are stored one key per session (`notesdrafts.ts:13-15,42-45`), so neither page can clobber the other's whole map. I found no interleaving on the drafts that loses text. Whether both pages re-sending one draft on `snapshot` is wanted behaviour is review-work's question.
