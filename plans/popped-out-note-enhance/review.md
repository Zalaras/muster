# Review: popped-out-note-enhance

**Plan**: popped-out-note-enhance
**Verdict**: approved
**Cycle**: 3
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code approved, browser approved, maintainability approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Popped-out note enhancements

**Plan**: popped-out-note-enhance
**Part verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 31961 words (budget 30000)

This is a full review, not a delta cycle. Cycle 2 left a browser Major open (settled by the
`banner-above-popped-panel` debate, consensus A), so the delta rule does not apply. Since
`review_commits[2]` (`f6627357`), the source diff is small: `setForm` in `features/notes.ts`, and
z-index 46 on `.banner` and `#connection-status` in `style.css`. Three render tests were added. On
the docs side there is a new ADR, the design-system sentence, the diagram count, the plan amendment
and the Testable UI row. I re-read all of it. Rows for files with no change since cycle 2 carry
cycle 2's evidence, re-checked where the new diff could affect them. Every cycle 2 issue, from all
three parts, is checked in the Delta table.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 per-session pop-out, one panel | Yes: `notes.ts` `renderPhase`/`stillWanted`; `focusChanged` closes (unchanged since cycle 2) | R1, R8, E1, E2, E8, E11 | pass |
| REQ-2 own rectangle per session | Yes: `places` map, `effectiveRect` | R1, E1 | pass |
| REQ-3 per-tab memory, old key ignored | Yes: `muster.note-places` via `safeSessionStorage`. `muster.note-panel` is never read (C2) | W1, W2, W3, E1, old-key E2E | pass |
| REQ-4 pop in / close / window keep the rectangle, Remove forgets it | Yes: `closeByUser`, `popIn`, `openInWindow`; `withoutPlace` on `sessionRemoved`, `withoutAbsent` on snapshot | R2, R3, W5, E2, E3, E4 | pass |
| REQ-5 drag/resize anywhere in the window, clamped, 260×150 floor, 360×300 default | Yes. New this cycle: `setForm` (`notes.ts:69-72`) is now the only writer of `form`; `rg 'form = '` finds only `:70`. It clears `liveGesture` on every move out of `popped`, so `update`/`end` (`:238,:247`) cannot write `popped: true` after Pop in, Close, Open in window, a focus change, Tiles or a removal | R4, R5, R6, W4; cycle 2 tests at `notes-places.spec.ts:327,365,399`; new drag-across-Pop-in test (`notes-places.spec.ts:508`); its pre-fix failure is recorded in `render-tests.md` | pass |
| REQ-5 *Amended* (cycle 2): banner and connection readout above a popped panel | Yes: `.banner` has `position: relative; z-index: 46` (`style.css:510-511`). `#connection-status` has `z-index: 46` (`:361`) on its existing `position: relative`. Order: panel 45 < banner/readout 46 < `.menu` 50 < `.pop`/`.cardtip` 55. The only `position: fixed` rules in `style.css` are `.menu`, `.pop`/`.cardtip` and `.npanel` | Two new render tests (`notes-places.spec.ts:469,489`) reach the real daemon-down state (hello, snapshot, socket drop) with a panel placed under each element. They assert the overlap first, then that the `elementFromPoint` hit is `#banner` / `#connection-status`. Both failed before the fix (`render-tests.md`) | pass |
| REQ-6 anchored Close saves at once, returns focus | Yes: `closeByUser` → `close(true)` → `editor.release()` flush | R11, E2E Close, keyboard test | pass |
| REQ-7 three controls per form, inside at 260px | Yes: Pop out, Pop in, Open in window, Close | R7, the 260×150 test | pass |
| REQ-8 Open in window: popup, closes the panel, focuses an existing window, a blocked popup keeps the panel | Yes: `noteswindows.ts` `openOrFocus`; early return in `openInWindow` | W6 (seam), E3, popped-out window test | pass |
| REQ-9 note window: content, no controls, Escape only leaves edit, title, theme | Yes: `notespage.ts`, `note.ts`, `note.html` (which has no banner or readout, so the z-index change does not reach it) | R9, R12, E5 | pass |
| REQ-10 window stays on its session, two-way sync | Yes: fixed `sessionId`, `adoptIncoming` | E5 | pass |
| REQ-11 `connecting…`, unsaved status, kept text re-sent; amended `musterd unreachable` while reconnecting | Yes: `notesview.ts` `windowStatus`; `saver.resend` on snapshot; `notessave.ts` `stillFailed` | R13, `notes-window.spec.ts:69`, `notesview.test.ts`, `notessave.test.ts`, E6 ×2, mirror-ordering E2E | pass |
| REQ-12 removed notice, drafts dropped, unknown/malformed id | Yes: `markRemoved`; `reader/query.ts` `parseSessionParam`; `noteWindowWsHandlers` wires `sessionRemoved` | R9, W7, `query.test.ts`, E7 | pass |
| REQ-13 storage unavailable | Yes: every access goes through `safeSessionStorage()`/`safeLocalStorage()` | R8, blocked-storage E2E | pass |
| REQ-14 hidden in Tiles, window live in Tiles | Yes: `showsFor` requires `view === "focus"` | R10, E5 | pass |
| DIAG | `kb:diagram/web-components`, the only diagram `kb for` names for `notes.ts` and `style.css`; the notes spec has no inline fence. `reader/` now reads "12 modules … the ?session= parse" (counted 12: find, freshness, frontmatter, markdown, memory, mermaid, notice, paths, query, slug, tree, zoom). `features/` 48 (counted 48) and `render/` 45 (counted 45) are unchanged. The `Rel(features, reader, "markdown, tree, query")` label covers the new use. The z-index change adds no module or edge | — | pass |

## Build & Tests

E2E tests: pass (664, full suite. The NOTE line in the gates summary says scope `all`: `web/vite.config.ts` is harness-wide) · Daemon tests (race): pass (every package ok, `gates-c3b/01-test.log`) · Web tests: pass (3101) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues; biome checked 419 files).

The race line comes from `gates-c3b`, which had 0 failed lines. Every other line comes from
`gates-c3`, run on the same tree at HEAD `a543e114` (the e2e log's `VERSION='v0.27.3-44-ga543e114-e2e'`).
In `gates-c3`, `make test-race` hit the 10-minute timeout in `internal/server`
(`TestWSHub_CloseAllDoesNotBlockBroadcastOnASlowPeer`) and `internal/session` under machine load.
The branch changes no Go file (`git diff --stat main...HEAD -- internal cmd` is empty), the non-race
`go test` inside C1 passed both packages, and the `gates-c3b` re-run passed. So this is load, not a
regression (Note 3).

Also green: render-fixtures (106 scenarios up to date), render-lint, render-test (445 passed),
contrast (54 pairs × 3 themes, 0 failures), features-inventory, versions, e2e-honest, kb check (664
records, 0 problems), e2e-lint, features-scope (Features notes; Touches connection, reader, actions),
comments, comment-ledger, and e2e-level (census only). The size `WARN` on `reader.ts` (707 lines, as
on `main`) belongs to review-maintainability.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| W1 | `make web-build` | pass (`gates-c3/04-web-build.log`; only the chunk-size advisory) |
| W2 | `make web-test` | pass (`05-web-test.log`, 108 files, 3101 tests) |
| W3 | `make web-lint` | pass (`09-web-lint.log`) |
| R1 | `make render-test` | pass (`08-render-test.log`, 445 passed) |
| E1 | `make e2e` | pass (`21-e2e.log`, 664 passed) |
| C1 | `make check` | pass (`22-C1.log`: lint, `go test`, web-lint, web-test, contrast, e2e-lint, render-lint, versions, render fixtures, kb check) |
| C2 | `! grep -rn "muster.note-panel\"" web/src --include=*.ts --exclude=*.test.ts` | pass (`23-C2.log` is empty) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. All four proposed ADRs exist for notes with `refs: plan:popped-out-note-enhance`. The new `notes-banner-above-popped-panel` describes what shipped: the z-order it states (dialogs, popovers 55, menus 50, banner/readout 46, panel 45) matches `style.css`. `notes-popout-per-session-anywhere-in-window` supersedes `notes-popout-hidden-in-tiles-geometry-per-tab`. The implementation logs have no `deviation:` lines. Both `doc-delta:` lines are folded into `doc-delta.md`, and its new banner/readout clause holds in the code. Every other delta line still holds (no code under them changed). The #112 `TODO.md` entry (line 195) stays open until Completion, as it should. One cosmetic citation slip is Minor 1 |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| V1 | no `any` in new web code | pass | `rg ': any\b\|as any\|<any>'` over `features/notes*.ts`, `note.ts`, `render/notespanel.ts`, `reader/query.ts`, `connectionhealth.ts` finds nothing |
| V2 | `note.ts` only wires | pass | 22 lines, unchanged: createApp, initTheme, initUpdateRestart, mountNotePage, tick, connection state, WsClient. No DOM lookup, listener or state of its own |
| V3 | Chrome popup without a tab strip; a second press brings it to the front | pass (code read) | `window.open(url, "muster-note-<id>", "popup,width=520,height=460")` without `noopener`, and `existing.focus()` while `!closed`; E3 shows no second page opens. A window raised on screen cannot be seen headless |
| V4 | note window fills the window at 320×240 and 1200×900, body scrolls | pass (carried) | Measured in cycle 1. Since then `style.css` changed only the z-index on `.npanel`, `.banner` and `#connection-status`. `note.html` has neither of the latter two, and `.npanel.window` is `position: static` |
| V5 | storage only through `safeSessionStorage()`/`safeLocalStorage()` | pass | No direct `sessionStorage`/`localStorage` in the new or changed `src` files |
| V6 | design-system § Note panel describes the per-session pop-out, window bounds, three controls and the note window | pass | `docs/design/design-system.md:325-349`. It now also states the `musterd unreachable` window status and the z-order against menus, popovers, banner and readout, which settles cycle 2's correctness Note 3 |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass: web-only change (`git diff --stat main...HEAD -- internal cmd` is empty) with no Claude Code format knowledge |
| 2 | Terminal-output state parsing | pass |
| 3 | Blocking hook handler | pass: no daemon change |
| 4 | Bare tmux / resize-pane | pass: none |
| 5 | Payload logging | pass |
| 6 | Empty-gauge dishonesty | pass: the window shows `connecting…` before `hello` and `musterd unreachable` while reconnecting. The banner can no longer be hidden under a placed panel |
| 7 | Session identity on `session_id` | pass: keyed on the Muster session id |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary | pass: E2E uses the stub through `launchNoted`. The render tests run no daemon |

Design tokens: the new CSS adds only z-index and position literals, with no colour, font or spacing.
`.banner[hidden]` still has its `display: none` companion, and `position: relative` does not change
`display`.

## Delta (delta re-review only)

This is not a delta cycle. Every cycle 2 issue was checked anyway against `git diff f6627357..HEAD`:

| Prior issue | Fix commit | Verified how |
|-------------|------------|--------------|
| cycle 2 correctness Major 1 `[orchestrator]` diagram `reader/` says 11 modules | `8b70c12c` | Now "12 modules", counted 12. The edge label adds `query` |
| cycle 2 correctness Minor 1 `[orchestrator]` Testable UI status row lacks `musterd unreachable` | `8b70c12c` | The row lists `` (empty), `connecting…`, `musterd unreachable` or `unsaved, musterd unreachable`, window-only for the middle two, citing the amendment |
| cycle 2 browser Major 1 `[web-impl] [orchestrator:decision]` popped panel covers the daemon-down banner | `2e43049d` (decision, ADR, plan amendment), `2a55004f` (CSS), `87a451a6` (tests) | Option A landed as `decision.md` says. Banner and readout are at z 46 over the panel's 45. The decision's dissent asked for a render test pinning the order, and two were added, both red before the fix |
| cycle 2 maintainability Minor 1 `[web-impl]` `liveGesture` outlives `popIn` | `2a55004f`, `87a451a6` | `setForm` clears the gesture on every form other than `popped`, and all four former assignments go through it. A render test drags across Pop in by keyboard and checks that no popped panel shows on return and that the rectangle is unchanged. It was red before the fix (`render-tests.md`) |

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[orchestrator]** `docs/design/design-system.md:345-349`, § Note panel. The cycle 2 insertion put
   the two new sentences between `This session has been removed.` and the citation that belonged to
   it. The paragraph now ends `…readable over any placement (kb:adr/notes-banner-above-popped-panel).`
   with a separate line `(kb:adr/notes-own-window-is-a-third-page).` after it. That stray line reads
   as a second citation for the z-order sentence. A fix moves `(kb:adr/notes-own-window-is-a-third-page)`
   back to the note-window sentences it supports, or drops it, so that each citation follows its own
   claim. Doc upkeep, so it does not block approval.

### Notes

1. **[note]** The two new banner/readout render tests, like the precedent at
   `notes-window.spec.ts:76`, route `/ws` to send hello and the snapshot and then close. Each hello
   resets `WsClient.attempt` (`ws.ts:137`), so the socket cycles about every 500 ms. The banner is
   hidden for the instant between each hello and the close that follows it. An `elementFromPoint`
   sample that lands in that instant would hit the panel. The window is tiny, and both tests were
   green in the gate run (445/445). If either test ever flakes, this is where to look.
2. **[note]** Cycle 2's correctness Notes 1 and 2 still hold unchanged: the window's own re-send
   rests on the mirror-ordering E2E, and `stillFailed` means "until any host's save of the shared
   draft succeeds". The cycle 3 diff does not touch `notessave.ts` or the E2E specs.
3. **[note]** `gates-c3`'s `make test-race` timed out in `internal/server` and `internal/session`
   at 10 minutes under machine load from a sibling worktree. The branch changes no Go file, the
   non-race `go test` in C1 passed both packages, and `gates-c3b` re-ran the race line green.
4. **[note]** `web-tests.md` still records cycle 1's count (3070); the gate ran 3101.
   `render-tests.md` now records the cycle 2 wave (445). Only the log is stale.
5. **[note]** The banner z-order touches the connection feature's banner element (connection is a
   **Touches** feature). The behaviour belongs to notes, since the panel is what moved over it. The
   delta line sits under notes, and no sentence of the connection spec changes, so no promotion to
   Features is owed.
6. **[note]** The pack is over its budget (31961 of 30000 words); `kb` warned.

## Browser review

# Browser review: Popped-out note enhancements

**Plan**: popped-out-note-enhance
**Part verdict**: approved
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

## Maintainability review

# Maintainability review: Popped-out note enhance

**Plan**: popped-out-note-enhance
**Part verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 11487 words (budget 30000)
**Scope**: 18 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (web only). The spawn prompt did not call this a delta cycle, so it is a full one. Since `review_commits[2]` (`f6627357..HEAD`), only two files changed: `web/src/features/notes.ts` (+9/−5) and `web/src/style.css` (+3). I re-read both in full context. The other 16 files have not changed since cycle 2, so their cycle-2 rows carry forward.

## Prior cycle

| Cycle-2 issue | Fix commit | Verified how | Result |
|---|---|---|---|
| Minor 1: `liveGesture` ends on `close()` but not on `popIn()` | 2a55004f | `notes.ts:69-72` adds `setForm(next)`, which clears `liveGesture` whenever `next !== "popped"`. `rg -n "form =" web/src/features/notes.ts` finds only the assignment inside `setForm` (`:70`). Every other transition goes through it: `open` `:170`, `close` `:185`, `popOut` `:208`, `popIn` `:218`. `close()`'s own clear is gone, so the clear has one owner. `open("popped", …)` is reached only from `form === "closed"` (`renderPhase` `:299-300`), so it never inherits a live gesture. A gesture that is still running across pop-in now fails `liveGesture !== gesture` (`:238`, `:247`) and cannot write `popped: true` or call `layoutPopped`. The Fix Attempt `design:` line (web-implementation.md:120-125) lists every path out of `popped` and how each one ends the gesture. | fixed |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| web/src/app.ts | (cycle 1) | yes (`applyRemoved`) | none | pass, unchanged since cycle 2 |
| web/src/wsapp.ts | (cycle 1) | covered by `applyRemoved` | none | pass, unchanged since cycle 2 |
| web/src/note.ts | (cycle 1) | yes | none | pass, unchanged since cycle 2 |
| web/src/features/actions.ts | (cycle 1) | yes | none | pass, unchanged since cycle 2 |
| web/src/features/CLAUDE.md | (doc) | Fix Attempt 1 | n/a | pass, unchanged since cycle 2 |
| web/src/features/connectionhealth.ts | (cycle 2) | Fix Attempt 2 | none | pass, unchanged since cycle 2 |
| web/src/features/notes.ts | render/notespanel.ts (`wireGesture`), notespanelstate.ts | yes (Fix Attempt, `setForm` is the single writer of `form`) | none (315 lines) | pass |
| web/src/features/notesedit.ts | (cycle 1) | yes | none | pass, unchanged since cycle 2 |
| web/src/features/notesgeometry.ts | (cycle 1) | n/a | none | pass, unchanged since cycle 2 |
| web/src/features/notespage.ts | (cycle 2) | yes | none | pass, unchanged since cycle 2 |
| web/src/features/notespanelstate.ts | (cycle 1) | yes | none | pass, unchanged since cycle 2 |
| web/src/features/notessave.ts | (cycle 2) | yes | none | pass, unchanged since cycle 2 (cycle-2 Note 1 stands) |
| web/src/features/notesview.ts | (cycle 2) | yes | none | pass, unchanged since cycle 2 (cycle-2 Note 2 stands) |
| web/src/features/noteswindows.ts | (cycle 2) | yes | none | pass, unchanged since cycle 2 |
| web/src/features/reader.ts | (cycle 2) | yes (`query.ts` line) | filelen 707, also 707 on main | Note 2 |
| web/src/reader/query.ts | (cycle 2) | yes | none | pass, unchanged since cycle 2 |
| web/src/render/notespanel.ts | (cycle 2) | yes | none | pass, unchanged since cycle 2 |
| web/src/style.css | `.menu` (`:4303-4305`), `.pop`/`.cardtip` (`:4382`), `.npanel` (`:4777-4779`), `.banner.neutral` | Fix Attempt (z-order, kb:adr/notes-banner-above-popped-panel) | n/a | pass, Note 1 |

`$GATES_LOG_DIR/02-size.log`: `WARN web/src/features/reader.ts:1: file is 707 lines (threshold 500) (filelen)`, `size-warn: 1 hits`. `01-test.log` ran `go test -race -count=1 ./...` and every package passed. No Go file is touched. The only new shared state is `form`/`liveGesture`. Both live in the single-threaded render and event path, and `setForm` is now the one writer of `form` and the clear of `liveGesture`.

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** The stacking order now has four levels: popped panel 45, banner and readout 46, `.menu` 50, `.pop`/`.cardtip` 55. They are bare literals at `style.css:361`, `:511`, `:4305`, `:4382` and `:4779`, and no comment beside any of them names the order. The order itself is written down only in kb:adr/notes-banner-above-popped-panel. That ADR has `files: []`, so `go tool kb for web/src/style.css` does not list it (checked). Someone who changes `.npanel` or `.menu` later will not see that the banner must stay between them. There is no convention on z-index (`rg -i 'z-index|stacking' docs/conventions.md` finds nothing), so nothing is requested. The ADR's `files` list is kb truth, which is review-work's.
2. **[note]** `features/reader.ts` triggers filelen at 707 lines, the same as on `main`. The branch only swaps in `parseSessionParam` there, with no net change in lines. The warning predates this branch (same reading as cycle-2 Note 4).
3. **[note]** Cycle-2 Notes 1 (`stillFailed` is a read that also writes), 2 (`unsavedStatus` and `windowStatus` repeat one rule) and 5 (`query.ts` sits in `reader/`) still apply as written. No code they refer to has changed.
