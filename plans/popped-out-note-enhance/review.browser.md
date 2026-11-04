# Browser review: Popped-out note enhancements

**Plan**: popped-out-note-enhance
**Verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 9297 words (budget 30000)
**Rig**: `make web-build build` at a543e114 (`v0.27.3-44-ga543e114`), then `npx playwright test e2e/zz-rbc3.spec.ts` under the gate lock (it waited for the sibling worktree's shared hold; I did not touch that worktree's daemon or sockets). The scratch daemons came from `web/e2e/helpers/fixtures.ts`: a space-bearing temp data dir, a per-daemon `tmux.sock` inside it, and the stub `claude` 2.0.0-e2e-stub. Headless Chromium at 1280×720. I deleted the throwaway spec afterwards. Gates log c3b: 0 failed lines.

## Matrix

Hosts: **focus** (the dashboard's Focus view), **tiles** (the dashboard's Tiles view), and **window** (`note.html?session=<id>`). The docs pop-out (`/doc.html`) hosts no note. Boxes are x,y–right,bottom in CSS px.

**c3** marks cells I re-measured on this build. **c2** and **c1** mark results carried from the earlier parts. The cycle-2 fix diff (`1138e233..a543e114`) touches only these: `#banner` gets `position: relative; z-index: 46`, `#connection-status` gets `z-index: 46`, and `setForm` ends `liveGesture` whenever the form leaves popped. No cell carried from c2 rests on code that diff changes.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| §6.7 / REQ-5 *Amended* | focus | daemon-down, panel at top-left 0,0–360,300 | banner words draw above the panel | **pass (c3)** | `#banner` 0,46–1280,78: `display:block`, `visibility:visible`, `opacity:1`, `position:relative`, `z-index:46`. `elementFromPoint` at the centre of all 14 words hits `#banner`, including `musterd` (44,62) and `unreachable` (125,62), which the panel covered in c2 |
| §6.7 / REQ-5 *Amended* | focus | daemon-down, panel at top-right 920,0–1280,300 | the masthead connection readout draws above the panel | **pass (c3)** | readout 1250,16–1264,30 lies inside the panel's box. The hit at its centre is `#connection-status`, with `data-health=down`, title `musterd unreachable — reconnecting…`, dot rgb(238,106,50), `z-index:46`. All 14 banner words still hit the banner |
| §6.7 | focus | daemon-down, panel tops 12/30/45/60/76 | banner words stay above the panel at every placement | pass (c3) | `bannerWordsHitBanner: true` at each of the five tops |
| Decision dissent (accepted cost) | focus | daemon-down, panel tops 12–76 | the header is partly under the banner, and the panel is still recoverable | pass (c3), within the accepted cost | header cover (sampled points): top 12 → 45/765, top 30 → 450/765, top 45 → 720/765, top 60 → 360/765, top 76 → 0/765. Pop in, Open in window and Close are not hit-testable at tops 30 and 45, and are hit-testable at 12, 60 and 76 (Note 1). Keyboard recovery works: a real click on the body (201,111–559,375) focused `Note text`, which was still focused after 1.2 s. The first Escape left edit mode (focus on `Rendered note`). The second Escape closed the panel (count 0) |
| Decision dissent | focus | daemon-down → restart | the header returns with the first `hello` | pass (c3) | after the restart `#banner` is `display:none` (box 0,0,0,0, the `[hidden]` rule holds). The reopened panel's header is 0/850 covered, and every visible control is hit-testable |
| REQ-5 | focus | data (connected) | the banner is hidden, and the panel still drags over the masthead | pass (c3) | `#banner` `display:none`. Panel 400,0–760,300; the hit at (580,20) is inside `.npanel` |
| REQ-5 | focus | data (connected), panel over the readout | the readout dot draws above the panel | pass (c3) | panel 920,0–1280,300; the hit at the readout's centre is `#connection-status` (`ok`, `Connected to musterd`). This is a 14×14 dot, and it is what the decision intends |
| REQ-5 | focus | data | the panel does not cover controls that open above it (card menu z 50 > banner 46 > panel 45) | pass (c2) | c2 measured every menu item hit-testable over the panel, with a real Pin click. The fix diff adds z 46 below the menu's 50 |
| REQ-5 | focus | data | a drag in progress across Pop in leaves nothing popped and the rectangle unchanged | pass (spec) | render test `notes-places.spec.ts` "a drag in progress across Pop in…" is green in gates c3b. Not driven by me |
| REQ-5 | focus | data | first pop-out is 360×300, inset 24 px; clamps; 260×150 floor; window shrink; stored rect clamped | pass (c2/c1) | clamping code unchanged |
| States → Daemon down (amended) | window | daemon-down | `musterd unreachable` in `--warn`; readable; editable; focus kept; contained at 320 px | pass (c2) | `windowStatus` is not in the fix diff |
| REQ-11 | window | daemon-down → restart | kept text reaches the daemon with no input; the status clears | pass (c2) | |
| REQ-11 | window | no data | `connecting…`, not `--warn` | pass (c1) | |
| REQ-11 | focus | data (unsaved) | the unsaved status clears when another host acknowledges | pass (spec) | e2e green in gates |
| REQ-1 | focus / tiles | data / no data | only a focused, popped session shows a panel; none in Tiles | pass (c1) | |
| REQ-2 / REQ-3 | focus | data | per-session rectangles survive focus switches and reloads; the old key is ignored | pass (c1) | |
| REQ-4 | focus | data | Pop in / Close / Escape take only that session out | pass (c1); c3 consistent | after Escape closed the popped panel in the band test, the glyph opened the anchored form |
| REQ-6 | focus | data / ended | Close returns focus and saves at once | pass (c1) | |
| REQ-7 | focus / window | data | three controls per form, inside at 260 px; none in the window | pass (c1) | |
| REQ-8 | focus | data | Open in window: one popup, the panel closes, the panel is kept if blocked | pass (c1/c2) | |
| REQ-8 | window | data | no tab strip in Chrome | N/A — cannot be observed headless (c1 Note 4) | |
| REQ-9 / REQ-10 / REQ-12 | window | data / removed | header, fill, scroll, edit, save, theme; stays on its session; removed notice | pass (c1) | |
| REQ-13 | focus | storage blocked | no page error | pass (spec) | |
| REQ-14 | tiles→focus | data | Tiles hides the panel; Focus restores it | pass (c1) | |
| §6.7 banner | tiles | daemon-down | banner above a popped panel | N/A — Tiles shows no in-page panel (REQ-1) | |
| §6.7 banner | window | daemon-down | banner above a panel | N/A — the window has no banner; its status carries the outage (c2 pass) | |
| §7 | focus | data | one live client, scrollback 0, no pane styling | pass (c1) | no surface change |
| all | pop-out (`/doc.html`) | — | — | N/A: the docs pop-out does not host a note panel | |

## Issues

### Critical
(none)

### Major
(none). Cycle-2 Major 1 is resolved as the decision directs. With the panel at 0,0, every banner word is the hit target, and so is the readout with the panel covering it.

### Minor
(none)

### Notes
1. **[note]** The measured cost of the decision is wider than the dissent's "wholly only in a ≈2px band". The header is never wholly covered: at top 45, 45 of 765 sample points stay grabbable, so it can still be dragged. But all three header controls (Pop in, Open in window, Close) are covered for panel tops of roughly 30–55 px, because the banner covers their centres, not only a 2px band. Escape from inside the panel still closes it (measured), so this stays within the accepted cost. I record it so the ADR's wording can be checked against it. No change requested.
2. **[note]** The cut-short-gesture change (`setForm`) was not driven in my rig. It rests on the new render test, which is green in gates c3b.
3. **[note]** `plans/popped-out-note-enhance/review.code.md` and `review.maintainability.md` are untracked in the worktree. They are the other reviewers' parts, and I left them alone. `git status --porcelain` shows nothing of mine apart from this file.
