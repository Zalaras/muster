# Review: popped-out-note-enhance

**Plan**: popped-out-note-enhance
**Verdict**: needs-changes
**Cycle**: 2
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code approved, browser needs-changes, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Popped-out note enhancements

**Plan**: popped-out-note-enhance
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 31732 words (budget 30000)

Full review: cycle 1 had a browser Critical, so this is not a delta cycle. The cycle 1 issues of all
three parts are re-checked against `git diff 7f3a2629..HEAD` in the Delta table below.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 per-session pop-out, one panel | Yes: `notes.ts` `renderPhase`/`stillWanted`; `focusChanged` closes | R1, R8, E1, E2, E8, E11 | pass |
| REQ-2 own rectangle per session | Yes: `places` map, `effectiveRect` | R1, E1 | pass |
| REQ-3 per-tab memory, old key ignored | Yes: `muster.note-places` via `safeSessionStorage`; `muster.note-panel` never read (C2) | W1, W2, W3, E1, old-key E2E | pass |
| REQ-4 pop in / close / window keep the rectangle, Remove forgets it | Yes: `closeByUser`, `popIn`, `openInWindow`; `withoutPlace` on `sessionRemoved`, `withoutAbsent` on snapshot | R2, R3, W5, E2, E3, E4 | pass |
| REQ-5 drag/resize anywhere in the window, clamped, 260×150 floor, 360×300 default | Yes: viewport-bounded `clampRect`/`dragRect`/`resizeRect`, `defaultPlacement`. The gesture is now guarded by `liveGesture` (`notes.ts:63,229-249`, cleared in `close`), and `wireGesture` abandons a stale gesture on the next pointerdown (`notespanel.ts:114-135`) | R4 now steps to 400×300 and asserts ≥260×150 (`render/notes.spec.ts:368-373`); edge case 3 has its own test (`notes-places.spec.ts:327`); cut-short drag (`:399`); menu over panel (`:365`); R5, R6, W4 | pass |
| REQ-6 anchored Close saves at once, returns focus | Yes: `closeByUser` → `close(true)` → `editor.release()` flush | R11, E2E Close (700 ms bound), keyboard test | pass |
| REQ-7 three controls per form, inside at 260px | Yes: DOM order Pop out, Pop in, Open in window, Close | R7 (now polled until the boxes settle), 260×150 test | pass |
| REQ-8 Open in window: popup, close panel, focus existing, blocked keeps panel | Yes: `noteswindows.ts` `openOrFocus`, early return in `openInWindow` | W6 (seam), E3, popped-out window test | pass |
| REQ-9 note window content, no controls, Escape only leaves edit, title, theme | Yes: `notespage.ts`, `note.ts`, `note.html` | R9, R12, E5 | pass |
| REQ-10 window stays on its session, two-way sync | Yes: fixed `sessionId`, `adoptIncoming` via the shared editor | E5 | pass |
| REQ-11 `connecting…`, unsaved status, kept text re-sent; amended: `musterd unreachable` while reconnecting | Yes: `notesview.ts` `windowStatus` (failed save > reconnecting > connecting); `saver.resend` on snapshot; `notessave.ts` `stillFailed` and the no-draft clear in `pump` | R13, new render test for the reconnecting status in `--warn` (`notes-window.spec.ts:69`), `windowStatus` table (`notesview.test.ts`), 3 new `notessave.test.ts` cases, E6 ×2 (stopped daemon now asserts `musterd unreachable` before typing), new mirror-ordering E2E (`notes.spec.ts:1249`) | pass |
| REQ-12 removed notice, drafts dropped, unknown/malformed id | Yes: `markRemoved`; `parseNoteQuery` → shared `reader/query.ts` `parseSessionParam`; `noteWindowWsHandlers` wires `sessionRemoved` | R9, W7, `query.test.ts`, E7 | pass |
| REQ-13 storage unavailable | Yes: every access through `safeSessionStorage()`/`safeLocalStorage()` | R8, E2E blocked-storage test | pass |
| REQ-14 hidden in Tiles, window live in Tiles | Yes: `showsFor` requires `view === "focus"` | R10 (existing test, `notes-tiles` prefs), E5 | pass |
| DIAG | `kb:diagram/web-components` (`kb for` names it for every changed web file, `reader/query.ts` included). Cycle 1's wording fix is in. `features/` 48 (counted 48), `render/` 45 unchanged. **`reader/` says "11 modules" but it now has 12**, because `query.ts` was added in cycle 1's fix wave | — | fail (correctness Major 1, `[orchestrator]`) |

## Build & Tests

E2E tests: pass (664, full suite: the gate ran `make e2e-run SPECS=''` and there is no `NOTE e2e scope` line) · Daemon tests (race): pass (every package ok) · Web tests: pass (3101) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues, biome clean: 419 files). All read from `$GATES_LOG_DIR` (`gates-c2`, 0 failed lines). Also green there: render-fixtures (106 scenarios up to date), render-lint, render-test (442 passed), contrast (54 pairs ×3 themes, 0 failures), features-inventory, versions, e2e-honest, kb check (663 records, 0 problems), e2e-lint, features-scope (notes; Touches connection, reader, actions), comments, comment-ledger, e2e-level (census only). `19-size.log` has one `WARN` on `reader.ts` file length; that is review-maintainability's.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| W1 | `make web-build` | pass (04-web-build.log) |
| W2 | `make web-test` | pass (05-web-test.log, 3101 passed) |
| W3 | `make web-lint` | pass (09-web-lint.log) |
| R1 | `make render-test` | pass (08-render-test.log, 442 passed) |
| E1 | `make e2e` | pass (21-e2e.log, 664 passed) |
| C1 | `make check` | pass (22-C1.log) |
| C2 | `! grep -rn "muster.note-panel\"" web/src --include=*.ts --exclude=*.test.ts` | pass (23-C2.log is empty: grep matched nothing) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. All three proposed ADRs exist with `refs: plan:popped-out-note-enhance`. The new `notes-window-says-musterd-unreachable-while-reconnecting` describes what shipped (`windowStatus`, `--warn`, note still editable). There are no `deviation:` lines. Both `doc-delta:` lines are folded into `doc-delta.md`: "its Close control", and the reconnecting status. The optional design-system half of the second line is not folded in; see Note 3. The `TODO.md` #112 entry (line 195) stays open until an approved `review.md`. Every Doc Delta line, the folded ones included, holds in the code. "Draws below menus and hover popovers" holds: `.npanel` is 45, `.menu` 50, `.pop`/`.cardtip` 55, and nothing else is `position: fixed`. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| V1 | no `any` in new web code | pass | `rg ': any\b\|as any\|<any>'` over `features/notes*.ts`, `note.ts`, `render/notespanel.ts`, `reader/query.ts`, `connectionhealth.ts`: no hits |
| V2 | `note.ts` only wires | pass | Unchanged since cycle 1: 22 lines (createApp, initTheme, initUpdateRestart, mountNotePage, tick, connection state, WsClient). No DOM lookup, listener or state of its own |
| V3 | Chrome popup without a tab strip; a second press brings it to the front | pass (code read) | `window.open(url, "muster-note-<id>", "popup,width=520,height=460")` without `noopener`. A second press calls `existing.focus()` while `!closed`, and E3 proves no second page opens. Raising the window on screen cannot be seen headless; cycle 1's browser review measured the 520×460 popup |
| V4 | note window fills the window at 320×240 and 1200×900, body scrolls | pass (carried) | Measured in cycle 1. The only `style.css` change since then is `.npanel` `z-index` 55 → 45, which does not affect `.npanel.window` (`position: static`) |
| V5 | storage only through `safeSessionStorage()`/`safeLocalStorage()` | pass | `rg 'sessionStorage\|localStorage'` over the new and changed `src` files: no direct access |
| V6 | design-system § Note panel describes per-session pop-out, window bounds, three controls, note window | pass | `docs/design/design-system.md:325-346` |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass: web-only change (`git diff --stat main...HEAD -- internal cmd` is empty); no Claude Code format knowledge |
| 2 | Terminal-output state parsing | pass |
| 3 | Blocking hook handler | pass: no daemon change |
| 4 | Bare tmux / resize-pane | pass: none |
| 5 | Payload logging | pass |
| 6 | Empty-gauge dishonesty | pass: the note window shows `connecting…` before `hello` and `musterd unreachable` while reconnecting; it never shows a blank status for a socket that is down |
| 7 | Session identity on `session_id` | pass: keyed on the Muster session id |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary | pass: E2E uses `launchNoted` with the stub |

## Delta (delta re-review only)

This is not a delta cycle. Every cycle 1 issue was checked anyway:

| Prior issue | Fix commit | Verified how |
|-------------|------------|--------------|
| cycle 1 correctness Major 1 `[render-tests]` R4 never steps to 400×300 or asserts the floor | `060357f4` | `render/notes.spec.ts:368-373`: 400×300, inside the viewport, width ≥ 259.25, height ≥ 149.25 |
| cycle 1 correctness Major 2 `[render-tests]` edge case 3 untested | `060357f4` | `notes-places.spec.ts:327`: pops out two sessions and moves one to the corner at 1440×900, shrinks to 700×500 while the other session is focused, focuses the moved one, then reloads; checks it lies inside the window after each step |
| cycle 1 correctness Minor 1 `[e2e-specs]` network-failure E6 does not pin the window's half | `feaf27fa` | `windowStatus(win)` → `""` added at `notes.spec.ts:1246`. Since `79810d6a` that assertion alone no longer isolates the window's own re-send (Note 1); the new mirror test does |
| cycle 1 correctness Minor 2 `[orchestrator]` diagram calls `notespage` shared | `83e361da` | the phrase now reads "three notes modules beside notes.ts … notespage (the note window's controller)" |
| cycle 1 browser Critical 1 `[web-impl]` note window silent on daemon-down | `3f3d05bf` (+ plan amendment, ADR `83e361da`) | `windowStatus` returns `musterd unreachable`/`warn` for `reconnecting`. Pinned by the render test `notes-window.spec.ts:69` (text plus `--warn` colour, note still shown and editable) and by the stopped-daemon E6 at `notes.spec.ts:1171` |
| cycle 1 browser Major 1 `[web-impl]` card menu under the popped panel | `3f3d05bf` | `.npanel` z-index 45 < `.menu` 50 < `.pop`/`.cardtip` 55. Render test `notes-places.spec.ts:365` checks that every menu item is the hit target at its centre while the menu overlaps the panel |
| cycle 1 maintainability Major 1 `[web-impl]` stale gesture writes another session's place | `3f3d05bf` | `liveGesture` identity guard on `update`/`end`, cleared in `close()`, declared beside `places`. `wireGesture` abandons the previous gesture. Render test `notes-places.spec.ts:399` |
| cycle 1 maintainability Major 2 `[web-impl]` duplicate `?session=` parse | `3f3d05bf` | `reader/query.ts` `parseSessionParam`, called by `parseStandaloneQuery` and `parseNoteQuery`. `query.test.ts` runs both over one case table |
| cycle 1 maintainability Minor 1 inline `"warn" \| "info"` | `3f3d05bf` | `WindowStatus.kind: StatusKind` |
| cycle 1 maintainability Minor 2 third `connecting…` literal | `3f3d05bf` | `CONNECTING_WORD` exported from `connectionhealth.ts`; `notespage.ts`'s literal is gone |
| cycle 1 maintainability Minor 3 removed-notice text in the render module | `3f3d05bf` | `REMOVED_NOTICE_TEXT` moved to `notesview.ts`; `showRemovedNotice(refs, text)` |

## Issues

### Critical

None.

### Major

1. **[orchestrator]** The `kb:diagram/web-components` fence is stale for `reader/`. It reads `Component(reader, "reader/", "11 modules", …)`. Cycle 1's fix wave added `web/src/reader/query.ts`, so the directory now has 12 non-test modules: find, freshness, frontmatter, markdown, memory, mermaid, notice, paths, query, slug, tree, zoom. On `main` it had 11. `go tool kb for web/src/reader/query.ts` names this diagram. The `Rel(features, reader, "markdown, tree")` label also leaves out the new use (the shared session-query parse, used by `noteswindows`). A fix must make the count 12 and, if the edge label is meant to list every use, add the query parse. Doc upkeep, so it does not block approval.

### Minor

1. **[orchestrator]** The plan's Testable UI Elements row "Panel / window status" lists `` (empty), `connecting…` or `unsaved, musterd unreachable``. The cycle 1 States amendment added a fourth status for the window, `musterd unreachable`. Specs and code assert it (`notes-window.spec.ts:86`, `notes.spec.ts:1171`, `notesview.test.ts`), but the table that names the asserted strings does not. A fix adds `musterd unreachable` (window only, while reconnecting) to that row, matching the States amendment.

### Notes

1. **[note]** Since `79810d6a`, `failed(id)` is true only while some host still keeps a draft (`stillFailed`). So the network-failure E6's last assertion, `windowStatus(win)` → `""` (`notes.spec.ts:1246`), would pass even if the window never re-sent, because the dashboard's re-send drops the shared draft. The window's own re-send is still pinned by the new mirror test (`notes.spec.ts:1249`). There, only the window's route is lifted, and the dashboard panel's status can clear only once some host has acknowledged and dropped the shared key. The page being unloaded cannot do that, so it must be the reloaded window's snapshot re-send. That is the same `app.on("snapshot")` handler a reconnect runs. Coverage of REQ-11's window half holds; it now rests on that test.
2. **[note]** `stillFailed` changes REQ-11's "until a save succeeds" from "until this host's save succeeds" to "until any host's save of the shared draft succeeds". A host that still holds its own typed text stays `unsaved` (unit-tested). This matches kb:adr/notes-unsaved-text-kept-in-browser-until-acknowledged and needs no doc delta.
3. **[note]** `docs/design/design-system.md` § Note panel lists the note window's `connecting…` status but not the amended `musterd unreachable` (`--warn`) status. It also does not say that the popped panel draws below menus and popovers. Neither sentence there is false. web-impl's second `doc-delta:` line marked the design-system half as optional, and doc-reconcile does not touch `docs/design/`.
4. **[note]** For review-maintainability: `notesview.ts` (notes) now imports `CONNECTING_WORD` from `connectionhealth.ts` (connection's pure helper), and `noteswindows.ts` (notes) imports `reader/query.ts`. The hand-written part of `web/src/reader/CLAUDE.md` neither lists `query.ts` nor names notes as a user. web-impl says it left the file alone because of its word budget.
5. **[note]** `render-tests.md` and `web-tests.md` record nothing of the cycle 1 fix wave (`060357f4`, `950cdab5`, `958555bd`). Their counts, 438 and 3070, are cycle 1's. The tests themselves are in the gate run and green (442 render, 3101 web). Only the logs are stale.
6. **[note]** During an update restart, the note window will briefly read `musterd unreachable` in `--warn`, where the dashboard's banner reads updating, until `initUpdateRestart` reloads it. `windowStatus` sees only `ConnectionStatus`, not the restart override. The plan does not cover this, and it lasts only seconds.
7. **[note]** The gate's E2E line ran the whole suite (`SPECS=''`, 664 tests), not a scoped list. That is more than the scope requires, and it is green. The flake test-specs.md recorded in its first soak, "typing without leaving edit mode… within two seconds", was not repaired, so there is no soak for me to run. The second soak was 370/370.
8. **[note]** The pack exceeds its budget (31732 of 30000 words); `kb` warned.

## Browser review

# Browser review: Popped-out note enhancements

**Plan**: popped-out-note-enhance
**Part verdict**: needs-changes
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

## Maintainability review

# Maintainability review: Popped-out note enhance

**Plan**: popped-out-note-enhance
**Part verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 11483 words (budget 30000)
**Scope**: 18 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (web only). This is a full cycle, not a delta, because cycle 1 had Majors. I re-read every file the fix waves touched since `review_commits[1]` (`7f3a2629..HEAD`: connectionhealth.ts, notes.ts, notespage.ts, notessave.ts, notesview.ts, noteswindows.ts, reader.ts, reader/query.ts, render/notespanel.ts, style.css). The other eight files have no change since 7f3a2629, so their cycle-1 rows carry forward as written.

## Prior cycle

| Cycle-1 issue | Fix commit | Verified how | Result |
|---|---|---|---|
| Major 1: a stale gesture writes `places` | 3f3d05bf | `notes.ts:63` declares `liveGesture` beside `places`. `update`/`end` (`:234,:243`) return unless `liveGesture === gesture`. `close()` clears it (`:176`). `beginGesture` returns a no-op unless popped (`:229`). `wireGesture` ends the surface's previous gesture on a new pointerdown (`notespanel.ts:114-135`). After a close, a stale gesture no longer writes, and the id it would write is always the one that began. | fixed for close; one path out of `popped` is not covered (Minor 1) |
| Major 2: duplicate `?session=` parse | 3f3d05bf | `rg -n 'get\("session' web/src --glob '!*.test.ts'` → only `web/src/reader/query.ts:2`. `reader.ts:83` and `noteswindows.ts:25` both call `parseSessionParam`. | fixed |
| Minor 1: inline `"warn" \| "info"` | 3f3d05bf | `notesview.ts:17-20` `WindowStatus.kind: StatusKind` comes from `render/notespanel.ts:43`. A pure feature module importing a render type has precedent (`connectionhealth.ts:2`, `updateview.ts:8`). | fixed |
| Minor 2: third `"connecting…"` literal | 3f3d05bf | `connectionhealth.ts:4` exports `CONNECTING_WORD`, which `notesview.ts:3,25` uses. The reader's own copy stays (that was optional). | fixed |
| Minor 3: removed-notice text in render | 3f3d05bf | `REMOVED_NOTICE_TEXT` moved to `notesview.ts:7`. `showRemovedNotice(refs, text)` takes it as an argument (`notespanel.ts:225`). The `design:` line states why this differs from `render/reader.ts` importing `reader/notice.ts`: render must not import `features/`. | fixed |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| web/src/app.ts | (cycle 1) | yes (`applyRemoved`) | none | pass, unchanged since cycle 1 |
| web/src/wsapp.ts | (cycle 1) | covered by `applyRemoved` | none | pass, unchanged since cycle 1 |
| web/src/note.ts | (cycle 1) | yes | none | pass, unchanged since cycle 1 |
| web/src/features/actions.ts | (cycle 1) | yes | none | pass, unchanged since cycle 1 |
| web/src/features/CLAUDE.md | (doc) | Fix Attempt 1 | n/a | pass, unchanged since cycle 1 |
| web/src/features/connectionhealth.ts | notesview.ts, reader/notice.ts | Fix Attempt 2 (`CONNECTING_WORD`) | none | pass, Note 3 |
| web/src/features/notes.ts | notesedit.ts, notespanelstate.ts, render/notespanel.ts | yes (guard identity, declared beside `places`) | none | Minor 1 |
| web/src/features/notesedit.ts | (cycle 1) | yes | none | pass, unchanged since cycle 1 |
| web/src/features/notesgeometry.ts | (cycle 1) | n/a | none | pass, unchanged since cycle 1 |
| web/src/features/notespage.ts | reader.ts `mountStandaloneReader`, notes.ts | yes | none | pass |
| web/src/features/notespanelstate.ts | (cycle 1) | yes | none | pass, unchanged since cycle 1 |
| web/src/features/notessave.ts | notesdrafts.ts, notesedit.ts, notes.ts/notespage.ts (`failed` callers) | yes (Fix Attempt 3, `stillFailed`) | none | pass, Note 1 |
| web/src/features/notesview.ts | connectionhealth.ts, reader/notice.ts, updateview.ts | yes (Fix Attempt 2) | none | pass, Note 2 |
| web/src/features/noteswindows.ts | reader.ts, reader/query.ts | yes (W6 seam) | none | pass |
| web/src/features/reader.ts | reader/query.ts, noteswindows.ts | yes (`query.ts` line) | filelen 707, no reason given | Note 4 |
| web/src/reader/query.ts | reader/slug.ts (the exemplar), reader/notice.ts, sessions/paths.ts | yes (`query.ts` in `reader/`) | none | pass, Note 5 |
| web/src/render/notespanel.ts | render/reader.ts, render/notes.ts | yes | none | pass |
| web/src/style.css | `.menu`, `.pop`, `.cardtip` z-index rules | Fix Attempt 2 (z-index survey) | n/a | pass |

`$GATES_LOG_DIR/19-size.log`: `WARN web/src/features/reader.ts:1: file is 707 lines (threshold 500) (filelen)`, `size-warn: 1 hits`. The `02-test.log` gate ran `go test -race`. No Go file is touched.

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[web-impl]** `liveGesture` ends on `close()` but not on `popIn()`. Pop-in is the other way out of the popped form, so a drag that is still running across a pop-in writes `popped: true` back into `places`. See `web/src/features/notes.ts:211-220` (`popIn`) against `:173-176` (`close`) and `:233-246` (the guard). This is § Design "Shared state names its writers and its guard": the guard covers only some of the paths that end the state it protects.
   - **The interleaving.** I followed it in the code. I did not run it in a browser.
     1. Pop out with the button. `popOut()` moves focus to `refs.popIn` (`:208`).
     2. Press the header to drag. The pointerdown calls `preventDefault` (`notespanel.ts:116`), so focus stays on Pop in, and the head has pointer capture.
     3. Press Enter while the pointer is still down. The button's click runs `popIn()`: `form = "anchored"`, then `remember(withPlace(places, id, { popped: false }))`. `liveGesture` is still this gesture, and the root is not detached, so capture holds.
     4. The next `pointermove` runs `update`. It writes `places = withPlace(places, id, { popped: true, rect })` and calls `layoutPopped(id)` on an anchored panel. `pointerup` runs `end`, which saves those places.
   - **The result.** The session the developer just popped in is stored as popped. The next render or focus return opens it popped again (`renderPhase` `:295`).
   - **What a fix must make true.** Every path that leaves `form === "popped"` ends the live gesture, so a gesture never writes `popped: true` or lays out the panel once the panel is no longer popped.

### Notes

1. **[note]** `notessave.ts:78-83` `stillFailed` is a read that also writes: it deletes from `failedIds` without `onChange`. `failedIds` now has two writers, `setFailed` and the `failed` query that both render passes call (`notes.ts:137`, `notespage.ts:41`), and the result depends on whether a render read the flag in between. I looked for an interleaving where that shows a wrong status and found none. A host can only hold a failed id with no typed text by having re-sent another host's stored draft. If it types before any render prunes the flag, the status reads `unsaved` for the new text after an unreachable send, which is true. The Fix Attempt 3 `design:` line names the sharing. This is something to know, not a defect.
2. **[note]** `notesview.ts` holds two status derivations for one panel: `unsavedStatus` (dashboard, `:13`) and `windowStatus` (window, `:22`). Both start with the same rule, `failed → UNSAVED_TEXT`. The string has one owner. The one-line rule is written twice, and a third status that both hosts need would have to be added in both functions.
3. **[note]** For review-work (DIAG): `notesview.ts` (notes) now imports `connectionhealth.ts` (connection). The `web-components` diagram's `features/` node says "18 DOM-free helpers each owned by one controller", and `connectionhealth.ts` is now shared by two. Separately, `reader/` gains `query.ts`, and the diagram's `reader/` node still reads "11 modules" and does not mention the session-id parse. `web/src/reader/CLAUDE.md`'s **Owns** does not list `query.ts` either (Fix Attempt 2 left it out on the word budget). Doc truth is review-work's.
4. **[note]** `features/reader.ts` hits filelen at 707 lines, and Decisions gives no reason. It was also 707 lines on `main` (`git show main:web/src/features/reader.ts | wc -l`). The branch's only edit there is the net-zero swap to `parseSessionParam` that cycle-1 Major 2 asked for. The warning predates this branch, so no reason is owed here.
5. **[note]** The `design:` line says `parseSessionParam` lives in `reader/` because a root-level module would be unowned. `sessions/` was not weighed. Its CLAUDE.md claims "A session's identity is its Muster id" and it already shares `paths.ts` downward with `reader/`. A newcomer looking for the note window's URL parse finds it in the reader's pure directory. The reason given holds, so this is placement taste only.
