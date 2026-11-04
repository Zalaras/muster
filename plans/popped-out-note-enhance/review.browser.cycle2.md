# Browser review: Popped-out note enhancements

**Plan**: popped-out-note-enhance
**Verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 9297 words (budget 30000)
**Rig**: `make e2e SPECS=e2e/zz-rbc2.spec.ts` (gate lock, `make web-build build`) at 1138e233 (`v0.27.3-37-g1138e233-e2e`). Scratch daemons came from `web/e2e/helpers/fixtures.ts`: a space-bearing temp data dir, a per-daemon `tmux.sock` inside it, and the stub `claude` 2.0.0-e2e-stub. Headless Chromium at 1280×720, with the note window at 320×240. The throwaway spec was deleted afterwards. Gates log c2: 0 failed lines (e2e 664 passed, render 442 passed, web 3101 passed).

## Matrix

Hosts: **focus** (the dashboard's Focus view), **tiles** (the dashboard's Tiles view), and **window** (`note.html?session=<id>`). The docs pop-out (`/doc.html`) hosts no note, so it is N/A for every row. Boxes are x,y–right,bottom in CSS px.

**Cycle 2** marks the cells I re-measured on this build. **c1** marks a result carried from `review.browser.cycle1.md`. The c1 cells rest on code the cycle-1 fix diff (`2d146035..1138e233`) does not change: that diff touches only z-index, `windowStatus`, the gesture guard, `saver.failed` and the session-param parse.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| States → Daemon down (amended) | window | daemon-down (idle) | the status reads `musterd unreachable` in `--warn` while reconnecting | **pass (cycle 2)** | with no edit pending, the status read `musterd unreachable` 22 ms after the kill. Computed color is rgb(232,207,90), which equals the resolved `--warn` in the `instrument` theme. `display:block`, `visibility:visible`, `opacity:1`; `title="musterd unreachable"` |
| States → Daemon down | window | daemon-down | status contained in the header at 320 px | pass (cycle 2) | status 184,7–310,18 inside header 0,0–320,25, with no horizontal overflow |
| States → Daemon down | window | daemon-down | last known note still readable | pass (cycle 2) | rendered note starts `last known note of W`. Body scroll 995/215 with `overflow-y: auto` |
| States → Daemon down | window | daemon-down | still editable, and focus survives a tick | pass (cycle 2) | a real click on the rendered note focused `Note text`, still focused after 1.2 s; typing gave `unsaved, musterd unreachable` |
| REQ-11 | window | daemon-down → restart | kept text reaches the daemon with no further input; the status clears | pass (cycle 2) | `/api/state` note `typed while down in c2` after the restart; status `""` |
| REQ-11 | window | no data | `connecting…`, not `--warn` | pass (c1); spec | `windowStatus` keeps the connecting branch (`kind: info`). The R13/unit `windowStatus` precedence tests are green in gates c2 |
| §6.7 | focus | daemon-down | banner shown, popped panel unchanged | pass (cycle 2) | `#banner` 0,46–1280,78 `display:block`; panel 0,0–360,300 before and during the outage; panel status `""` |
| §6.7 | focus | daemon-down, panel dragged over the banner | daemon-down surfaced prominently | **FAIL** | panel at 0,0–360,300 covers the banner words `musterd unreachable — hook output in open` (x 16–313, `elementFromPoint` → `.npanel`). Only `panes is Muster's absence, not session failure.` stays visible. The masthead `reconnecting…` at 1250,16 is not covered at this placement (Major 1) |
| REQ-5 | focus | data | the panel does not cover controls that open above it | **pass (cycle 2)** | panel 5,200–365,500 (z 45) under the card menu 150,122–340,349 (z 50). `elementFromPoint` at the centre of every item (Mark as unread 141, Stop… 177, Remove… 204, Pin 240, New group… 295, No group 331) hits the item, not the panel. A real click on Pin at y 240 (inside the panel's box) set `pinned: true` on `/api/state` |
| REQ-5 | focus | data | still drags over the rail | pass (cycle 2) | panel 5,200–365,500; `elementFromPoint` at the header (105,212) is inside `.npanel` |
| REQ-5 | focus | data | still drags over the masthead | pass (cycle 2) | panel 400,0–760,300; the hit at (580,20) is inside `.npanel` |
| REQ-5 | focus | data | first pop-out is 360×300, inset 24 px from the slot's top right | pass (cycle 2) | panel 896,119–1256,419 against main 300,46–1280,720 below the mainhead (same as c1) |
| REQ-5 | focus | data | drag/resize clamps, 260×150 floor, window-shrink behaviour, stored rect clamped on reload | pass (c1) | c1 measurements; clamping code unchanged. A cut-short gesture is now guarded (`liveGesture`), and render tests for it are green in gates c2 (Note 2) |
| REQ-1 | focus | data / no data | only a focused, popped session shows a panel; none before the snapshot | pass (c1) | |
| REQ-1 | tiles | data | no in-page panel | pass (c1) | |
| REQ-2 | focus | data | each session keeps its own rectangle across focus switches | pass (c1) | |
| REQ-3 | focus | data | rectangles survive a reload; old key ignored | pass (c1); spec | |
| REQ-4 | focus | data | Pop in / Close / Escape take only that session out; Remove forgets | pass (c1); spec | |
| REQ-6 | focus | data / ended | Close returns focus to the terminal or the glyph; saves at once | pass (c1); spec | |
| REQ-7 | focus | data / unsaved | three controls per form, inside the panel at 260 px and 252 px | pass (c1) | |
| REQ-7 | window | data | the window shows none of the controls | pass (c1) | the cycle-2 header text `Note· rbc2-wmusterd unreachable⧉⧠↗×` still carries the glyph nodes. c1 measured all four `.ph .ctl` as `display:none`, and no CSS for them changed |
| REQ-8 | focus | data | Open in window opens a popup, closes the panel, opens no second window, and keeps the panel if blocked | pass (c1); re-driven in cycle 2 | `openNoteWindow` gave a popup; the panel count was 0 afterwards |
| REQ-8 | window | data | no tab strip in Chrome | N/A in headless | see c1 Note 4 |
| REQ-9 | window | data | header and title, fills the window, body scrolls, one-click edit, Escape, ~1 s save, theme follow | pass (c1); partly re-driven | title `Note · rbc2-w`; body 995/215 `auto` at 320×240 |
| REQ-10 | window / tiles | data | the window stays on its session and live in Tiles | pass (c1) | |
| REQ-11 | focus | data (unsaved) | the panel's unsaved status clears once another host acknowledges the shared draft | pass (spec) | new e2e tests (`notes.spec.ts` "…re-sends and acknowledges the shared draft first") are green in gates c2; not driven by me |
| REQ-12 | window | removed / malformed / unknown id | shows the removed notice | pass (c1) | the parse moved to `parseSessionParam` with the same regex; unit tests are green in gates c2 |
| REQ-13 | focus | storage blocked | works with no page error | pass (spec) | as in c1 |
| REQ-14 | tiles→focus | data | Tiles hides the panel; Focus brings it back at its rectangle | pass (c1) | |
| §7 | focus | data | one live client, scrollback 0, no pane styling | pass (c1) | no surface change in the fix diff |
| all | pop-out (`/doc.html`) | — | — | N/A: the docs pop-out does not host a note panel | |

## Issues

### Critical
(none) — cycle-1 Critical 1 (the note window was silent while the daemon was down) is fixed. Measured: `musterd unreachable` in `--warn` with no edit pending, and the note stays readable and editable.

### Major
1. **[web-impl] [orchestrator:decision]** A popped panel dragged to the top of the window covers the daemon-down banner's message (design-system §6.7, "daemon-down surfaced prominently"). `.npanel` is `position: fixed; z-index: 45` and `#banner` is `z-index: auto`. Measured with the panel at 0,0–360,300: the words `musterd unreachable — hook output in open` lie under the panel. Only the tail `panes is Muster's absence, not session failure.` shows, and the tail does not say musterd is down. The masthead `reconnecting…` readout (1250,16) is still visible at this placement, but a panel placed at the top right would cover it too. Before this plan the panel was clamped below the mainhead (slot top 95) and could not reach the banner (46–78). REQ-5 now lets it reach both. This is the same class as cycle-1 Major 1 (menus), which the z-index 45 fix resolved for `.menu` (50) and `.cardtip` (55) but not for the banner.
   - **Option A — banner above the panel:** give `#banner` (and, for consistency, the masthead's connection readout) a z-index above 45. The outage message then always shows over a panel the developer has placed there.
   - **Option B — accept:** the developer placed the panel, can move it in one drag, and the banner's right side plus the masthead readout (unless it is also covered) still show the outage. Record this in design-system §6.7 or the plan's Edge Cases as an accepted placement.

### Minor
(none)

### Notes
1. **[note]** Cycle-1 Major 1 is fixed. Every card-menu item is hit-testable over a popped panel, and a real pointer click on Pin inside the panel's box pinned the session (`/api/state` `pinned: true`). The panel still draws over the rail and the masthead.
2. **[note]** I did not drive the cut-short gesture guard (`liveGesture` / `abandon`) or the shared-draft unsaved-status clearing in my own rig. Both rest on the render and e2e tests added this cycle, which are green in gates c2 (render 442, e2e 664).
3. **[note]** I did not re-drive these c1 rows on this build: clamps, the 260×150 floor, window shrink, storage-blocked and old key. The fix diff does not touch their code paths. Their c1 evidence stands.
4. **[note]** `plans/popped-out-note-enhance/review.code.md` and `review.maintainability.md` were untracked in the worktree when I finished. They are the other reviewers' parts, and I left them alone. `git status --porcelain` shows nothing of mine.
