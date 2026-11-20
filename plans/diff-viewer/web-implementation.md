# Web Implementation: diff-viewer

**Plan**: diff-viewer
**Mode**: initial
**Pack**: kb: pack 38928 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/api/diff.ts` | created | Six endpoint clients and decoders per the contract (REQ-1..8, 26..28) |
| `web/src/features/diff.ts` | created | Controller: button, 5 s focused-only visible-only counts poll, per-session viewers, Escape, close (REQ-1,2,9,23,27) |
| `web/src/features/diffviewer.ts`, `diffviewerstate.ts` | created | One viewer per session: loading, scopes, views, staleness bar, Refresh, delegation (REQ-3,4,11,12,28) |
| `web/src/features/diffcomments.ts` | created | Selection, drag, draft box, save/edit/resolve/reopen/delete, cards, lists, jump (REQ-5,17..19) |
| `web/src/features/diffreviewui.ts` | created | Folds, flips, ticks with pending-set retry, Reset, change map, Review keys (REQ-14..16,20) |
| `web/src/features/diffmodel.ts`, `diffplace.ts`, `diffwords.ts`, `diffbutton.ts` | created | Pure: changes and tick keys, quote placement, word diff, button/bar text (REQ-6,7,13) |
| `web/src/render/diffchrome.ts`, `diffbody.ts`, `diffrows.ts`, `diffcomment.ts`, `diffside.ts` | created | DOM builders |
| `web/index.html`, `web/src/features/focus.ts`, `notes.ts`, `main.ts`, `render/surfaceseg.ts` | edited | `#sizerow` holds note and `#diff-button`; main slot mounts the viewer; no segment selected while open; segment closes it; ResizeObserver refits the terminal (REQ-2,9,10,22) |
| `web/src/style.css`, `web/scripts/contrast-pairs.json` | edited | Six diff tokens in all three themes, viewer CSS, contrast pairs (REQ-21) |

## Decisions

- Tiles (REQ-23) need no code: viewer state lives apart from the surface switch, so tiles keep reading the selected surface and render no button.
- Row visibility is CSS (`.sizerow:not(:has(> :not([hidden])))`), so the note's reserve-before-fit still works with no JS ordering.
- Hidden parts (folded file body, folded change, the non-shown after/before) are detached from the DOM, not `hidden`, so they never match locators; toolbar, tab, fold button, file tick box and Reset are built once and keep node identity.
- Choice: clicking a change's folded row reopens it without unticking; the tick button toggles the tick.
- REQ-16 and REQ-20 done. Comments list entries render only while the Comments tab is shown.
- design: `features/diff*.ts` take the `notes*.ts` shape (controller plus `<owner><concern>` parts; pure ones Vitest-able). `rg "pendingTileFocus|reconcileCards"` is unrelated; polling precedent is `usage.ts`/`restart` timers, none reusable for per-session polling.
- design: viewer per session id owned by `diff.ts`; render builders hold no state; `ViewerState` fields name their one writer.
- design: no size warnings kept on purpose (make size-warn showed none for these files).
- design-system.md updated afterwards at the coordinator's request: the six diff tokens and the size row (`docs(diff-viewer): design system — diff viewer tokens and the size row`).

## Handoff

**Build status**: `npx tsc --noEmit`, `npm run build`, lint, contrast and vitest (3267) exit 0. `make check-kb` listed unowned-file problems only (registration is the orchestrator's).
**E2E smoke**: `npx playwright test e2e/diff.spec.ts e2e/diff-review.spec.ts` — 4 failed, 35 passed.
Spec locator/expectation defects for validate mode (all four failures):
- diff.spec.ts E5 (docs) and E6: `getByRole('region', {name:'Diff'})` also matches the docs reader region `Reader: diff-e5-docs` (substring match on the title).
- diff.spec.ts:646 (REQ-27): assumes an API launch focuses the new session; it does not, so B's button never shows first.
- diff-review.spec.ts:545 (INV-5): final `openDiff` on B clicks `View diff ›` but B's viewer was left open earlier (per-session viewer), so the button reads `Close diff ×`.
Existing tests: none broken. Render tests that locate `#sizenote` as the row should use `#sizerow` (not run here).

## Fix Attempt 1 (pre-review fix, render-tests)

**Failures addressed**: REQ-9 size-row height with `💬 n` (31 px vs 26 px); the harness diff recording not served.
**Changes made**:
- `web/src/style.css`: `.diffbtn { line-height: 13px }`. The emoji's fallback font grew the button's line box to 18 px; a fixed line-height stops it. Only consumer: `#diff-button` (`rg diffbtn web/src`). After rebuild `make render-test`: 543 passed (both named tests green).
- `web/render/helpers/harness.ts`: `RenderFixture.diff` (`DiffRecording[]`) parsed from the fixture; the three diff GETs (summary, review, `diff?scope=`) are served from it.
**Decisions**:
- deviation: the harness does not answer the three review writes 204; `openDiff`'s `writes: "fail"` tests rely on the harness's 404 for them. → ADR: kb:adr/process-render-harness-diff-writes-default-404
**Handoff**: render-tests can drop the three GET routes from `openDiff` in `web/render/helpers/diff.ts` (and its `Recording` type, reusing `DiffRecording`/`fixture.diff`); the 204 write route and the `failReads` override stay there.

## Fix Attempt 2 (review cycle 1)

**Failures addressed**: Browser Critical 1, Majors 1-2; Maintainability Majors 2-3, Minors 3-7.
**Changes made**:
- Critical 1: `buildBody` classes the root `dv-files dv-view-<view>` so the dashboard's global `.split` no longer matches. Only consumer of the old class: none (`rg 'dv-files(\.| )' web` found no CSS or spec). Measured (render harness, `diff` fixture, 1280x720, Split): `.dv-srow` 700x18, columns `350px 350px`, file sections all at left 300 (was 129 px rows, 64 px columns).
- Major 1: `.dv-map` has no gap, scrolls (`overflow-y: auto`, scrollbar hidden) and `.dv-mark` has `min-height: 0` with a 1 px bottom border as separator. Measured with a 200-change file, Review, 1280x720: 200 marks, 0 outside the map box, mark height 2.77, last mark top 687.2 of box 131-694, scrollHeight = clientHeight = 563.
- Major 2: `applyTicks` clears a key from `reopened` on every tick or untick, so "reopened" lasts until the next tick. Measured (Review, `diff` fixture): `j j x` gave `3 / 5 changes reviewed` with `.dv-folded` 2; `x` again `2 / 5`, folded 1; `x` again `3 / 5`, folded 2 (was: progress moved, folded stayed 0).
- Maint Major 2: `writeText` deleted; the four diff modules import `setText` from `../dom`.
- Maint Major 3: new `render/diffshape.ts` owns `Entry`, `Change`, `FileModel`, `Seg`; `render/` imports nothing from `features/` (`rg 'from "\.\./features/' web/src/render/diff*.ts` is empty). `entryLine` removed: `Entry.line` is computed in `flatten`; `Entry.sign`, `Change.counts`, `FileModel.path`/`counts` are computed in `features/diffmodel.ts` and read by the builders. `buildFilesRow` takes a `FileModel`; `buildFileTick` a path.
- Minor 3: one `button()` in `render/diffrows.ts`; `diffchrome`'s `toggle()` adds `aria-pressed` for the segment and tab buttons only (Save/Cancel/Reset/Refresh no longer carry a bogus `aria-pressed="false"`).
- Minor 4: `features/diffbutton.ts` owns `MINUS` and `signedCounts` (`countsText`, `summaryLine`, models use it); `features/diffplace.ts` owns `lineLabel` and `commentHeading` (`headingFor` deleted).
- Minor 6: tick posts are ordered through `ViewerState.flushing` (a promise chain; each post reads the pending sets when it runs). Comment writes go through `tracked()` and `upsert()` by id (no duplicate when a load already holds the comment; Resolve patches the current object, not a discarded one); `load()` keeps `s.comments` when a comment write was in flight at or started during its review read. Writer notes in `diffviewerstate.ts` updated.
**Decisions**:
- design: `render/diffshape.ts` is the render-owned view-model (the `render/reader.ts` pattern: builders take computed values; `features/` imports from `render/`, never the reverse). Precedent grep: `rg 'from "\.\./features/' web/src/render` returned only the diff builders before this fix.
- design: `FocusDeps.diff { viewerRoot, mounted, close }`: focus does not know the viewer's DOM; it asks `features/diff.ts` for the one root to mount in the main slot (`mountSlotRoot`, the slot-mount path the reader and terminal use) and tells it when mounted/closed by a segment click, so the segment, slot and viewer have one owner each. The `ResizeObserver` on `#main-terminal-slot` refits the selected surface: the slot's height changes when `#sizerow` gains or loses the diff button or the viewer closes, with no render pass in between, and `render` only refit on a pass (`focus.ts` renderView). Matched: `terminal/pane.ts` `refit()`, already how the terminal refits on window resize; no existing slot observer to reuse (`rg ResizeObserver web/src` showed only the terminal's own).
- design: viewer controls keep `.dv-btn`/`.dv-seg-btn`/`.dv-tab` (not `.btn`/`.seg-btn`): the accepted prototype's look is a rounded, inherited-font control in the viewer's own toolbar, while `.btn`/`.seg-btn` are square mono `--fs-xs` controls for rail and masthead; reusing them would change the accepted look, and the amber `.btn.key` would break "amber only means Needs-Input" for Save/Refresh.
- Tradeoff: when a comment write overlaps a Refresh, that Refresh keeps the local comment list (other windows' new comments appear on the next read).
- doc-delta: none.

**Handoff (fix)**:
- New file for the feature glob: `web/src/render/diffshape.ts`.
- Sanctioned breakage: `web/src/features/diffmodel.test.ts` (imports `entryLine`, removed; the test reads `entry.line`; model literal shapes gained `line`, `sign`, `counts`, `path`). `npx tsc --noEmit` and `npm run build` fail on that file only, so `make web-build build` cannot run; I built with `vite build` + `make build` for the runs below.
- Other suites: vitest 3359 pass, 1 fail (that file); `render/diff.spec.ts` 42 passed; `e2e/diff.spec.ts` + `e2e/diff-review.spec.ts` 39 passed (the 1.4 min run covers both).
- Wave-2 tests to add: Split row height/width, 200-change map within its box, and `j j x` folding.

## Fix Attempt (review cycle 3) — merge of main

**Failures addressed**: the two web conflicts of `git merge --no-ff --no-commit main` (for correctness Critical `renderRig.repoTick:branch lacks main's retry`): `web/src/features/focus.ts`, `web/src/style.css`. main brought `fc7599f4` (Terminals menu: ▾ opener in `.surfseg`, `shell` count, `features/terminalspanel.ts`) and `bca51d54` (docs only).
**Changes made**:
- `web/src/features/focus.ts`: import keeps both sides (`clearSurfaceSegmentSelection` + main's `NO_TERMINALS_VIEW`/`SurfaceTerminalsView`). `buildSurfaceSegment` takes main's two callbacks; the `onSelect` callback keeps this branch's `deps.diff.close(id)` before `select`. Added `app.on("surfaceSwitched", (id) => deps.diff.close(id))`. Main's `terminalsView` argument to `renderMainhead` kept; to stay under the complexity ceiling (merged `renderFrame` scored 17), the header half moved into `renderHead(frame, session)`, which returns the surface state. `mountViewer`, the viewer branch in `renderFrame` and the slot `ResizeObserver` unchanged.
- `web/src/style.css`: append/append conflict at the end of the file; both blocks kept (diff viewer section, then main's Terminals section); the diff block's last rule got its closing `}` back. `diff <(git show main:web/src/style.css)` and `diff <(git show HEAD:…)` against the result drop no line from either side except main's `.sizenote` rule, which this branch had already renamed to `.sizerow` (auto-merged, main never touched it).
- Paths where the two features touch, each closed:
  1. claude/shell/docs segment click while the viewer is open: `deps.diff.close` in `onSelect` (needed because `surfaces.select` returns early for the already-selected kind and so emits nothing).
  2. Terminals menu pick (`onSwitch` → `surfaces.showTerminal` → `showAndSelect`) and New terminal (`newTerminal` → `showAndSelect` after the POST): both emit `surfaceSwitched`, so the new listener closes the viewer. Without it the viewer kept the main slot (it wins in `renderFrame`) and the chosen terminal stayed hidden.
  3. Opening the ▾ menu alone, renaming or closing a terminal: emit nothing and leave the viewer open (opening a menu is not choosing a surface).
  4. Segment selection while open: `mountViewer` clears `aria-pressed` on claude/shell/docs each pass; main's `updateSurfaceSegment` sets it first in `renderMainhead`, so the clear still wins. The ▾ opener has no `aria-pressed`, so nothing to clear.
  5. Refit: the slot observer calls `surfaces.get(id, selected)`, which resolves the shown terminal on main, so it refits the terminal actually displayed.
**Decisions**:
- design: one "a surface was chosen" signal closes the viewer. `surfaceSwitched` already exists for this (`rg -n surfaceSwitched web/src`: emitted only in `features/surfaces.ts` `select` and `showAndSelect`, read by `reader.ts` and `surfaces.ts` focus); listening to it covers the Terminals menu without the panel knowing about the diff. The explicit close in `onSelect` stays for a click on the already-selected segment, which emits nothing. A tile's segment or Terminals pick also emits it; for a session whose viewer is open (Focus-only), `close` is a no-op unless it is open, then it closes it, which is right: the user chose a surface.
- design: `renderHead` split only for the complexity ceiling (Biome 17 > 15 after the merge), same reason as the existing `mountReader`/`mountTerminalSurface` splits.
- Not measured in a browser: path 2 (menu pick closes the viewer) is from the code path only; no spec covers it yet (Handoff).
- doc-delta: `docs/features/surfaces/spec.md` / the diff-viewer staged delta: "picking or creating a terminal from the Terminals menu closes the diff viewer, like a segment click; opening the menu does not".

**Checks on the merged tree** (from `web/` unless noted):
- `npx tsc --noEmit -p .` → exit 0. `npx vite build` → exit 0. `npm run -s lint` → `Checked 482 files … No fixes applied.` exit 0. `make contrast` → 61 pairs, 0 failures in each theme. `npx vitest run` → `Test Files 121 passed (121)`, `Tests 3475 passed (3475)`.
- `make web-build build` (root) → built, `go build … -o bin/musterd` exit 0.
- `make render-test` → `1 failed … 557 passed (4.1m)`; the failure is `render/diff.spec.ts:148 › viewer › no surface segment looks selected while the viewer is open (R5, REQ-10)`: `expect(locator('.mainhead .surfseg').getByRole('button')).toHaveCount(3)` — main's ▾ `Terminals` button makes it 4.
- `MUSTER_GATELOCK_WAIT=45m npx playwright test e2e/diff.spec.ts e2e/diff-review.spec.ts e2e/terminals.spec.ts e2e/shell.spec.ts e2e/shell-activity.spec.ts` → `75 passed (4.1m)` (fc7599f4 added `terminals.spec.ts` and changed `shell.spec.ts`, `shell-activity.spec.ts`).

**Handoff (fix)**:
- Broken by the merge: `web/render/diff.spec.ts:148` (render-tests). The surface group now has four buttons (`claude`, `shell`, `Terminals`, `docs`); the count should be 4, or the loop should locate the three `[data-surf]` segments. The `new Set(colours).size === 1` check then also covers the ▾ button (no `aria-pressed`; expected to match the unselected ground, not measured).
- Tests to add (web-tests/render-tests or e2e): with the viewer open, (a) picking terminal 2 from the Terminals menu closes the viewer and shows terminal 2, sizerow back; (b) New terminal closes it once the terminal starts; (c) opening the ▾ menu and pressing Escape leaves the viewer open with no segment pressed; (d) renaming or closing a terminal from the menu leaves the viewer open; (e) the `shell` count badge stays shown while the viewer is open.
- Render fixtures: the `diff*` fixtures were generated before the merge; `make check-render-fixtures` decides whether they need regenerating for main's `terminalsRev`/terminals snapshot fields (not run here).

## Fix Attempt (review cycle 3) — maintainability Minors 3 and 4

**Failures addressed**: Maintainability Minor 3 (`applyReview` reverts a tick made while a load is in flight), Minor 4 (eight diff buttons bypass the `button` builder).

**Changes made**:
- Minor 3, every writer of `s.ticks` enumerated: (1) `applyTicks` in `diffreviewui.ts` — the only local writer; `toggleChangeTick`, `tickFile`, `resetTicks`, `shiftX` and `x` all go through it; it now bumps `s.tickWrites`. (2) `applyReview` in `diffviewer.ts`, the load's read — now skips replacing `s.ticks` when `s.tickWrites` moved since the load began. `load` snapshots `tickWrites` **before** `await flushPending`, so a tick made while the flush is waiting also counts (the comment snapshot stays after the flush, as before). No other writer: `rg -n 's\.ticks =|ticks\.(add|delete)' web/src` → only `diffreviewui.ts` (`applyTicks`) and `diffviewer.ts` (`applyReview`). `diffviewerstate.ts` annotations updated: `ticks` — "diffviewer.ts on a read no tick write overlapped"; new `tickWrites` — writer `diffreviewui.ts`.
- Minor 4: the eight sites (diffbody fold, change tick, folded row; diffcomment resolved row; diffrows plus; diffside jump, comment entry, map mark) now call `button(text, className)`; the empty-text ones pass `""`. `rg -n 'el\("button"|\.type = "button"' web/src/render/diff* web/src/features/diff*` → only the builder itself (`diffrows.ts:4–5`). Blast radius: each site's class and attributes are unchanged; consumers are the same refs; the 39 plan E2E specs and 48/49 diff render tests pass (the one failure is the known R5 below).

**Reviewer's repro re-run (Minor 3)**: a scratch Playwright spec (deleted after) opened Review on `tickRepo`, held `GET …/diff?scope=` with `page.route`, clicked toolbar Refresh, waited for the `…/diff/review` response, clicked the first change's tick, waited for the `POST …/diff/ticks` response, then released the diff read.
- With the guard: `after load: 1 / 3 changes reviewed daemon ticks: 1` — `1 passed (6.6s)`.
- Guard disabled (`if (false && …)`), rebuilt: `after load: 0 / 3 changes reviewed daemon ticks: 1` — `Expected: "1 / 3 changes reviewed" Received: "0 / 3 changes reviewed"`, `1 failed`. Guard restored and rebuilt.

**Decisions**:
- design: `tickWrites` is a plain counter, the tick twin of `commentWrites.started`; precedent `rg -n 'commentWrites' web/src/features` (`diffcomments.ts` writer, `applyReview` guard). When any tick moved during a load, the local `s.ticks` is kept whole rather than merged key by key: the developer is the only tick writer, so the local set already holds every tick the daemon has; the next load with no overlapping tick reads the daemon's set again.

**Checks**: `npx tsc --noEmit` exit 0; `npm run build` exit 0; `npm run -s lint` → `Checked 482 files … No fixes applied.`; `make size-warn` → nothing on the touched files; `make check-kb` → `kb: all checks pass`; `npx vitest run src/features` → `Tests 806 passed (806)`; `make web-build build` exit 0; `npx playwright test e2e/diff.spec.ts e2e/diff-review.spec.ts` → `39 passed (1.4m)`; `npm run render-test -- render/diff.spec.ts` → `1 failed … 48 passed (20.4s)`, the failure being R5 below.

**Handoff (fix)**: no test file broken by this fix. Still open from the merge (render-tests): `web/render/diff.spec.ts:148` (R5) expects 3 `.surfseg` buttons, now 4 with main's `Terminals` button. Test to add (web-tests or e2e): a tick made after a Refresh's review read was answered but before its diff read lands stays ticked once the load finishes (the repro above).

## Fix Attempt (review cycle 3) — browser Minor 1

**Failures addressed**: browser Minor 1. With the viewer open, × on a Terminals row leaves the panel open with focus on `BODY`. The viewer's document-level Escape then closed the viewer, and the menu stayed open.

**Paths that showed it**: one. Any open anchored popover (`render/popover.ts` appends its panel as `body > .menu`: the Terminals panel and every `render/menu.ts` menu) whose panel no longer holds focus. While focus is inside, the panel's own keydown handler stops propagation, so the viewer never sees the key. The guard `dialog[open]` covers the close-confirmation `<dialog>`. Blast radius of the selector: `rg -n '"menu"|\.menu\b' web/src` plus `rg -n 'document\.body\.append' web/src` show that only `popover.ts` appends a `.menu` to `body` (`menu.ts:78`, `render/terminalspanel.ts:87`). `cardtip`, `hovertip` and `notes` append nodes without that class. `index.html` has no `.menu`.

**Changes made**: `web/src/features/diff.ts`. The viewer's Escape handler first looks for an open popover panel (`body > .menu`). If it finds one, it hands the Escape to that panel, whose own handler closes the panel and returns focus to its opener, and it leaves the viewer open. Main's panel code is unchanged.

**Decisions**:
- design: a dismiss-first rule in the viewer's own handler, next to its existing `dialog[open]` guard, as the orchestrator asked. Only standing aside (returning early) would have kept the viewer, but the first Escape would then do nothing at all. The review asks that Escape dismiss the menu wherever focus is. Handing the key to the panel reuses `popover.ts`'s close-and-restore-focus path rather than reaching into `terminalspanel.ts`. Precedent: `rg -n 'dispatchEvent\(new KeyboardEvent' web/src` finds none outside tests.

**Repro re-run** (the reviewer's sequence, as a throwaway Playwright spec deleted after the run: shell, New terminal, open the viewer, ▾, × on `shell 2`):
```
after ×        {"active":"BODY","menu":true,"viewer":"5 files +4 −5 · Close diff ×"}
after Escape 1 {"active":"BUTTON","menu":false,"viewer":"5 files +4 −5 · Close diff ×"}
after Escape 2 {"active":"BUTTON","menu":false,"viewer":"5 files +4 −5 · View diff ›"}
```
The first Escape closes the menu, keeps the viewer and focuses ▾. The second closes the viewer.

**Checks**: `npx tsc --noEmit` exit 0; `npm run build` exit 0; `npm run -s lint` → `Checked 482 files … No fixes applied.`; `npx vitest run src/features/diff.test.ts` → `4 passed`; `make size-warn` → nothing on `diff.ts`; `make web-build build` exit 0; `make render-test` → `564 passed (2.8m)`; `npx playwright test e2e/diff.spec.ts e2e/diff-review.spec.ts e2e/terminals.spec.ts` → `67 passed (1.6m)`.

**Handoff (fix)**: no test file broken. Test to add (e2e): the repro above, with Escape after × on a row closing the menu before the viewer.
