# Review: bugs-one-batch-1

**Plan**: bugs-one-batch-1
**Verdict**: needs-changes
**Cycle**: 2
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser approved, maintainability approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: bugs-one-batch-1

**Plan**: bugs-one-batch-1
**Part verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 64681 words (budget 30000)

This is a full review, not a delta one: cycle 1 had Majors. Scope: the whole branch (`main...HEAD`), with the fix wave `9718930d..HEAD` read line by line.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes. `Apply` arms the watch on `KindDeathHint` through `m.spawn` (`internal/session/apply.go:122-124`, the spawn at `:123`). Every pass goes through `checkOneLiveness(…, false)` (`liveness.go:168-195`) | Yes. D1 `TestApply_NonClearSessionEndEndsSessionPromptlyOnceThePaneDies` polls the persisted row and the last upsert inside the 1 s bound | pass |
| REQ-2 | Yes. `KindClearDeathHint` arms nothing. The ticker runs every 200 ms with a 3 s deadline. The loop returns on `ctx.Done()` (new; `Stop` cancels `runCtx`), on `m.stopped`, on an unknown target, or once the session reads dead | Yes. `…ClearSessionEndStartsNoPaneRecheck`, `…RecheckDoesNotPersistAfterStop`, `…EndsOnceTheSessionReadsDead`, `…ExpiresAtTheCapWithThePaneAlive` | pass (Note 2) |
| REQ-3 | Yes. `railmenu.ts` `openSelection`. `selectionMenuItems` now labels through `sessionsPhrase`, so one selected card reads `Actions for 1 session` (`railmenuitems.ts:92`) | Yes. E1 has three journeys: No group, Stop… count confirm, and the new one-session label at `rail-menu.spec.ts:476`. W1 now has a 1/2/3 label table | pass |
| REQ-4 | Yes. An unselected card, or no Select mode, goes to `openCard` | Yes. E1 (card C) and the existing rail-menu tests | pass |
| REQ-5 | Yes. `notes.ts` `close(true)` calls `surfaces.focusSelected` and falls back to the glyph | Yes. R1 covers all three close paths: Escape anchored and popped, the close button, and the second glyph click (new, `notes.spec.ts:619`, green in `28-R1.log`). The ended and Docs fallbacks are covered too | pass (cycle-1 Major 1 closed) |
| REQ-6 | Yes. `reader/memory.ts` `scroll` field, `features/readerscroll.ts`, and the restore in `reader.ts`, applied only on `showLoading` opens and in `refindAfterDiagrams` | Yes. R2: the pair leg now runs unconditionally. Also W2 and `readerscroll.test.ts` | pass |
| REQ-7 | Yes. No code change was needed; the E4 comment was rewritten | Yes. W3 | pass |
| REQ-8 | Yes. `shellkeys.ts` drops the carry on a reversal. The fix wave adds `rows: 2` at `new Terminal` (`pane.ts:128-132`, the option at `:132`), so xterm's alternate buffer holds no one-row range to swallow the first notch | Yes. W4, plus the new E2E `shell-scroll.spec.ts:250` (slider equals track at 1280×690, and one −100 gives `pane_in_mode 1`, `scroll_position 5`) | pass, but the `rows: 2` change regresses a background shell's size (Major 1) |
| REQ-9 | Yes. `actions.ts` `helloArrived` clears only when the shown message is `networkError.message` | Yes. E3 | pass |
| REQ-10 | Yes. `doc.ts` calls `initUpdateRestart(app)` and uses `popoutWsHandlers` | Yes. E5 (`03-E5.log`, 28 passed) and `wsapp.test.ts` | pass |
| DIAG | Checked `kb:diagram/web-components` for `pane.ts` and `railmenuitems.ts`: the fix wave adds no module, and the new `features → sessions/sections` import is an existing layer edge. Checked `kb:diagram/daemon-components` for `liveness.go`, `manager.go`, `apply.go` and `renderfix_scenarios_reader.go`: no import changed | — | pass |

## Build & Tests

E2E tests: pass (383, scoped to 33 files per the `NOTE e2e scope` line; `21-e2e.log`) · Daemon tests (race): pass (every package `ok`, `02-test.log`) · Web tests: pass (3032 in 106 files) · Render tests: pass (418) · Daemon build: pass · Web build: pass · Lint: pass (`0 issues.`; web-lint clean). All read from `$GATES_LOG_DIR`. The directory holds two invocations. The first invocation's E5 (`32-E5.log`) ends `make[1]: *** [e2e-run] Terminated: 15` after 9 green tests. The second invocation (`.stdout`, 01:36) reused every proven line and re-ran E5 to `28 passed` (`03-E5.log`). Its summary is `36 lines, 0 failed`. The `WARN size` (11 hits) and e2e-level census are review-maintainability's.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| build | `go build ./...` | pass (reused) |
| test | `make test-race` | pass (reused) |
| lint | `make lint` | pass |
| web-build | `make web-build` | pass |
| web-test | `make web-test` | pass (3032) |
| render-fixtures | `make check-render-fixtures` | pass (106 scenarios up to date; `driveReaderPair` changed no fixture) |
| render-lint | `make render-lint` | pass |
| render-test | `make render-test` | pass (418) |
| web-lint | `make web-lint` | pass |
| contrast | `make contrast` | pass (54 pairs × 3 themes, 0 failures) |
| features-inventory | `features_inventory` | pass |
| versions | `make check-versions` | pass |
| e2e-honest | `! rg -n 'test\.(skip\|fixme\|only)\(' web/e2e` | pass |
| kb-check | `make check-kb` | pass (639 records, 0 problems) |
| e2e-lint | `make e2e-lint` | pass |
| features | `go tool kb scope --plan bugs-one-batch-1 --touch` | pass |
| comments | `comment-checks.py --gates` | pass |
| comment-ledger | `go run ./tools/commentpass verify bugs-one-batch-1` | pass |
| size | `size-warn.sh --changed` | WARN (review-maintainability's) |
| e2e-level | `e2e-lint.sh --census` | WARN (census only) |
| e2e | `make e2e SPECS='…33 specs…'` | pass (383) |
| D1 | `go test -count=1 -run 'TestApply_NonClearSessionEnd\|TestApply_ClearSessionEnd\|TestCheckOneLiveness_StoppedGuard' ./internal/session/` | pass |
| D2 | `go test -count=1 ./internal/session/ ./internal/server/` | pass |
| W1 | `cd web && npx vitest run src/features/railmenuitems.test.ts` | pass (19) |
| W2 | `cd web && npx vitest run src/reader/memory.test.ts` | pass (78) |
| W3 | `cd web && npx vitest run src/render/focusview.test.ts` | pass (8) |
| W4 | `cd web && npx vitest run src/terminal/shellkeys.test.ts` | pass (26) |
| W5 | `make web-test` | pass (deduped to web-test) |
| R1 | `cd web && npm run -s render:lint && npx playwright test -c playwright.render.config.ts render/notes.spec.ts` | pass (22, the glyph-close test included) |
| R2 | `cd web && npm run -s render:lint && npx playwright test -c playwright.render.config.ts render/reader.spec.ts` | pass (44, the pair leg unguarded) |
| R3 | `make render-test` | pass (deduped to render-test) |
| E1 | `make e2e SPECS='e2e/rail-menu.spec.ts'` | pass (12) |
| E3 | `make e2e SPECS='e2e/effort-header.spec.ts'` | pass (30) |
| E5 | `make e2e SPECS='e2e/update.spec.ts'` | pass (28, `03-E5.log`; the first invocation's run was terminated, see Build & Tests) |
| L1 | `make lint` | pass (deduped) |
| L2 | `make web-lint` | pass (deduped) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass, with Minor 2. This is a sweep batch, so the `TODO.md` tick stays with the loop. There are no `deviation:` lines in either log, including the fix-wave sections. The superseding ADR is still `proposed`, with `refs: plan:bugs-one-batch-1` and `supersedes` set, and still describes what shipped. The fix waves add no `doc-delta:` line |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | The e1 re-check never writes `alive` from the payload, and the goroutine ends at the cap or when the pane is gone | pass | `watchPaneAfterSessionEnd` calls only `checkOneLiveness` → `markEnded`. It returns on `deadline.C`, `ctx.Done()`, `m.stopped`, a missing target, or `!sess.Alive` after a pass (`liveness.go:168-195`). It is now tracked on `m.wg` through `spawn`, and `Stop` cancels `runCtx` and waits on it |
| RV2 | `railmenu.ts` reads `groups.selecting()`/`selectedIds()` inside `open()`, not at init | pass | Unchanged by the fix wave; both are read per `open(request)` |
| RV3 | The stored scroll is applied only in the instance-build/remembered-open path, never on `storage` adoption, and is clamped to `scrollHeight − clientHeight` | pass | Unchanged by the fix wave. `scroll.opened` is called only under `opts.showLoading`. `handleStorage` reloads memory and renders. The clamp is the browser's own clamp on `scrollTop` assignment, re-applied after the diagram pass |
| RV4 | The E4 comment no longer claims a pre-sizenote first fit | pass | `web/e2e/terminal.spec.ts` E4 comment is unchanged since cycle 1 and still true |
| RV5 | `actions.ts` clears `#action-error` on reconnect only for a `network_error` | pass | `if (shownMessage === networkError.message)` |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass: the fix wave adds no Claude Code vocabulary. `apply.go` still switches on the neutral `claudecode.KindDeathHint` |
| 2 | No terminal-output state parsing | pass: `alive` comes from `PaneExists`. The re-check's capture is the existing snapshot display feed |
| 3 | Non-blocking hook handler | pass: the watch is spawned after `Apply` persists, and ingest is untouched. `spawn` holds `spawnMu` only for `wg.Add` |
| 4 | tmux via `-L muster`, no `resize-pane` | pass: no new tmux invocation. Sizing still goes through the existing resize frame → `pty.Setsize` then `resize-window` (`terminal.go:515-521`) |
| 5 | No payload logging | pass |
| 6 | Empty-gauge honesty | pass: no gauge path touched |
| 7 | Identity on tmux target | pass |
| 8 | No settings trespass | pass |
| 9 | No real `claude` outside canary/probes | pass |

## Delta (verification of every cycle-1 issue)

| Prior issue | Fix commit | Verified how |
|-------------|------------|--------------|
| cycle 1 code Major 1 `[render-tests]` "REQ-5's third close path has no test" | `303cbe34` | Read the diff. `notes.spec.ts:619` opens the anchored panel with the glyph, clicks it again, and polls `activeElementInsideTerminal(page, "notes-short")` to `true`. It ran green in `28-R1.log` and `08-render-test.log` |
| cycle 1 code Minor 1 `[web-impl]` "`Actions for 1 sessions`" | `82afb208` | `selectionMenuItems` builds the label with `sessionsPhrase(sessions.length)`. Nothing else in the label path changed |
| cycle 1 code Minor 2 `[web-tests]` "one-session label boundary untested" | `75b02318` | The `it.each` table has rows for 1, 2 and 3, each an exact `toBe`. The new E2E journey `rail-menu.spec.ts:476` also pins it in the browser |
| cycle 1 code Minor 3 `[render-tests]` "note tests titled REQ-8" | `303cbe34` | All six titles and the section comment now name REQ-5, and `render-tests.md` rows match |
| cycle 1 code Minor 4 `[render-tests]` "`test.skip(!pairFixtureExists…)` guard" | `303cbe34` | The guard and its `existsSync`/`resolve` imports are deleted, so the leg runs unconditionally |
| cycle 1 browser Major 1 `[web-impl]` "first wheel notch after a reversal swallowed in the Focus shell" | `82afb208` | `new Terminal({ rows: 2 })`. The web log gives before/after measurements (slider 529→552 of 552, and the first −100 now sends `scroll 5`), and the new E2E is green in the gate. **However**, this change regresses a never-mounted shell surface's size (Major 1 below) |
| cycle 1 browser Major 2 `[e2e-specs]` "no browser test drives REQ-8" | `b555f07f`, `a6585809` | `shell-scroll.spec.ts:250` runs at 1280×690. It polls slider == track (a non-null bar with track > 0), sends one −100 after a clamped flick, and polls `pane_in_mode 1` and `scroll_position 5`. Before the fix the slider was 529/552 and the first notch sent no frame, so the test would have been red. Green in `21-e2e.log:444` |
| cycle 1 maintainability Major 1 `[daemon-impl]` "`driveReaderDocsLargePair` copies `driveReaderDiagramsPair`" | `1b21a0ac`, `6eb46e94` | One `driveReaderPair(names, docs)` serves both scenario rows. The names are unchanged, and `check-render-fixtures` reports 106 up to date |
| cycle 1 maintainability Minor 1 `[web-impl]` "two owners of label → entry; no `design:` line" | `82afb208` | `menuEntry(label)` is the one home, and both builders spread it and add `disabled`. A `design:` line is in the web log's Fix Attempt 1 |
| cycle 1 maintainability Minor 2 `[daemon-impl]` "watch neither on `m.wg` nor ended by `m.cancel`" | `1b21a0ac` | `spawn` adds to `m.wg` under `spawnMu` and refuses once `stopped` is set. `Stop` sets `stopped` under the same mutex, cancels `runCtx` and waits. The watch `select` has `ctx.Done()`. `Start` uses the same helper. Race suite green |

## Issues

### Critical

None.

### Major

1. **[web-impl]** The REQ-8 fix wave's `rows: 2` (`web/src/terminal/pane.ts:132`) shrinks a background shell's tmux window to 80×5.

   **What happens.** With Docs selected and a shell running, `surfaces.ts` `desiredSurfaceEntries` keeps a shell `TerminalSurface` attached but never mounted. If that surface is built fresh, for example after a switch to another session's card and back, `refit(true)` on socket open runs `fitAddon.fit()`. On a detached element `fit()` proposes no dimensions and returns without resizing. `refit` then sends the construction geometry, which is now 80×2 (it was 80×24). The daemon clamps that to its 5-row minimum and resizes the window.

   **Measured** with a throwaway spec against this tree's build (`bin/gatelock run --exclusive`, deleted afterwards): `fitted=130x24 onDocs=130x24 afterSwitchBack=80x5 docsPressed=true`, then `afterShellSelected=130x24`. So for as long as the reader shows, a program in that shell (`less`, `vim`, `top`, a progress bar) is redrawn at 5 rows. Each return to the shell resizes it again.

   The 80-column width of this send predates the plan. The 5-row height is new in this cycle and comes from a shared-construction change reaching a surface the fix never measured (kb:lesson/shared-class-css-hid-resume-button). It is not a hard rule and is outside every requirement, so it is a Major.

   **A fix must make true:** a never-mounted shell surface's tmux window keeps its fitted height (`window_height` unchanged at 24 in the scenario above) across a session switch while Docs is selected, and the first-notch fix measured in cycle 1 still holds.
2. **[e2e-specs]** No test pins Major 1. The new `shell-scroll.spec.ts` journey mounts the shell before every assertion, and nothing reads the shell's tmux size while Docs is showing. **A fix must make true:** a journey in `web/e2e/shell.spec.ts` or `shell-scroll.spec.ts` that does this:
   - open the shell on A and select Docs;
   - click B's card, then A's;
   - assert `#{window_height}` on A's `muster-<id>-shell` target is unchanged.

   Against this tree it reads `5`, so the journey is red today.

### Minor

1. **[e2e-specs]** The last assertion of `shell-scroll.spec.ts:250`, `expect(bars?.slider).toBe(bars?.track)`, passes vacuously as `undefined === undefined` if the scrollbar is gone by then. The earlier poll guards `bars !== null && bars.track > 0`; this re-read does not. **A fix must make true:** the final check fails when `xtermScrollbarHeights` returns `null`.
2. **[orchestrator]** `doc-delta.md` § rail says the selection menu's label "names the count (`Actions for N sessions`)". Since `82afb208` a one-card selection reads `Actions for 1 session`. doc-reconcile promotes the delta verbatim, so this wording would state a plural the code no longer shows at one. **A fix must make true:** the delta says `Actions for 1 session` / `Actions for N sessions`, or just "names the count", without the template.

### Notes

1. **[note]** For review-maintainability's `rows: 2` reading: `TerminalSurface.geometry` now reports `{cols: 80, rows: 2}` for a terminal that has been built but not yet fitted (it was 80×24). I did not check whether any sizenote or tile-footer render reads geometry before the first fit. The plan's e6 measurement predates this change. This is review-browser's to observe if anyone wants it checked.
2. **[note]** The fix wave's `spawn`/`Stop` change has no committed test of its own. daemon-impl measured it with a scratch test that it then deleted: `Stop` returned in under 200 µs, no pane check ran after `Stop`, and `Apply` after `Stop` spawned nothing. The plan's REQ-2 property (no `alive=false` persisted after `Stop`) is still pinned by `TestApply_SessionEndRecheckDoesNotPersistAfterStop`. The new properties (no snapshot store after `Stop`, `Start` after `Stop` starts nothing) go beyond the plan. Cycle-1 code Note 1 is closed by this change.
3. **[note]** Browser cycle-1 Note 1 asked review-work to confirm the ADR's wording about Remove… on a mixed selection. `kb:adr/rail-card-menu-on-selected-card-acts-on-selection` says Stop… and Remove… "each applies to the sessions it fits, as the bar does". Remove is allowed on a live session (kb:adr/actions-remove-allowed-on-live-session), and `batchPlan` keeps every known id for Remove, so the menu removing the live ones after the count confirm is what the ADR says. No change.
4. **[note]** Cycle-1 code Note 6's untracked `web/e2e/zz-rb-menu.spec.ts` is gone (`git status` shows no untracked file under `web/`). My own scratch spec `web/e2e/zz-review-code.spec.ts` was deleted after the measurement.

## Browser review

# Browser review: bugs-one-batch-1

**Plan**: bugs-one-batch-1
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 14927 words (budget 30000)
**Rig**: `make web-build build` at 93cd164a (dirty only in plans/). A fresh `bin/musterd` per test came from `helpers/fixtures.ts`, each with a space-bearing data dir `$TMPDIR/muster e2e-38add35a-*`, a private `-tmux-socket` inside it and the harness stub `claude`. I drove it with headless Chromium through a throwaway `web/e2e/zz-browser-review-c2.spec.ts`, run in the foreground under `bin/gatelock run --exclusive`. The spec was deleted afterwards.

Gates log (`gates-bugs-one-batch-1-c2`): 36 lines, 0 failed. `e2e` (33 scoped specs) and `web-build` are green, so the app I drove is the one that ships.

Scope of this cycle. The delta `9718930d..HEAD` touches four areas:
- `web/src/terminal/pane.ts` (`rows: 2`), which affects every terminal.
- `web/src/features/railmenuitems.ts` (`menuEntry`, `sessionsPhrase`), which affects both card menus.
- `internal/session/{apply,liveness,manager}.go`: the SessionEnd watch now goes through `m.spawn`, which affects REQ-1/2.
- Tests.

I re-drove every cell those can reach. The REQ-5, REQ-6, REQ-9 and REQ-10 cells keep their cycle-1 results (`review.browser.cycle1.md`), because no file they depend on changed. There is one exception: REQ-5's "focus lands in the terminal" depends on the xterm textarea, so I re-checked that on the Claude terminal (focus row below).

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-8 (cycle-1 Major 1) | focus shell | data, 1280×690 (23 rows) | the first −100 after a +10000 flick reaches tmux | pass | slider 552 = track 552, `top:0px` before and after; frames sent `scroll -200`, then `scroll 5` for the **first** −100 and `scroll 5` for the second; tmux `pane_in_mode 0` after the flick, `1 5` after the first notch, `1 10` after the second |
| REQ-8 | focus shell | data, 650 after shrinking 899→777→690→601→720→650 with alt-screen content | the same after resizes | pass | slider = track at every height (768/648/552/456/576/528); after 60 more lines at 650: `-200`, `5`, `5`; tmux `1 5` after the first notch |
| REQ-8 | tiles shell | data, moved from Focus to a tile (84×10) | the same after the host move | pass | slider 240 = track 240; frames `-200`, `5`, `5`; tmux `1 5` after the first notch; `session_attached 1` |
| REQ-8 | tiles shell | data, a second session's shell opened fresh in a tile | the same | pass | slider 240 = 240; frames `-200`, `5`, `5`; tmux `1 5` then `1 10` |
| REQ-8 / §7 | focus Claude terminal | data at 690, 650, 899, 601 | xterm has no scroll range of its own | pass | slider = track at 552/528/768/456 (cycle-1 repro shape: was 529/552); a −300 wheel leaves first row `MUSTER-STUB-READY` and the slider at `top:0px` |
| REQ-8 / §7 | tiles Claude terminal | data | the same | pass | slider 240 = track 240 |
| REQ-8 | any | daemon-down | — | N/A — no shell socket while down | |
| `rows: 2` / REQ-7 | focus Claude + shell | data at 601, 650, 690, 720, 777, 899 | the fit and tmux agree; no terminal is a row short; the size note settles | pass | xterm rows equal tmux `window_height` at every height (19/22/23/24/27/32, 130 cols); `#sizenote` reads `130×N · one live client · geometry owned by this pane` with the same N |
| `rows: 2` | tiles | data | the tile geometry matches tmux | pass | 10 xterm rows, tmux `84x10` for both tile shells and the tile Claude terminal |
| `rows: 2` / REQ-5 | focus Claude | data | keyboard focus is kept across a render tick | pass | after clicking the terminal, `activeElement` is the same `textarea.xterm-helper-textarea[aria-label="Terminal input"]` 1.2 s later |
| `rows: 2` / §6 | tiles | daemon-down | daemon-down is surfaced | pass | `#banner` `musterd unreachable — …` `display:block`; each terminal overlay `disconnected — daemon down` `display:flex; visibility:visible; opacity:1`; after the restart the tile Claude terminal is back at slider 240 = 240, 10 rows |
| REQ-3 (cycle-1 code Minor) | focus rail | data | one selected card → `Actions for 1 session` | pass | `aria-label="Actions for 1 session"`, `display:block; visibility:visible; opacity:1`, box 149,181–339,309 inside 1280×690; items `Stop…, New group…, ✓No group` (no Pin); unchanged after a 1.2 s tick; `1 selected` kept after Escape |
| REQ-3 | focus rail | data | one ended selected card, by keyboard | pass | Shift+F10 → `Actions for 1 session`, `Remove…` focused, items `Remove…[danger], New group…, ✓No group`; Enter → dialog `Remove 1 session?` / `Remove 1` |
| REQ-3 | focus rail | data | mixed live + ended → plural label, Stop… and Remove… | pass | `Actions for 2 sessions`: `Stop…, Remove…[mi danger], New group…, ✓No group` |
| REQ-4 / `menuEntry` | focus rail | data | the single-card menu is unchanged after the refactor | pass | live: `Actions for br-m-a` with `Stop…[mi], New group…, ✓No group, Pin`; ended: `Remove…[mi danger], New group…, ✓No group, Pin`; Stop stays plain and only Remove carries `danger` |
| REQ-4 | focus rail | data | an unselected card keeps its own menu and the selection | pass | `Actions for br-m-b` with Pin; `1 selected` afterwards |
| REQ-4 | tiles strip | data | the strip card menu is unchanged | [note] not re-driven — see Note 1 | |
| REQ-3/4 | pop-out | any | — | N/A — `/doc.html` has no rail | |
| REQ-1 | focus rail | data | non-clear SessionEnd, then the pane dies → ended within 1 s, no terminal attached | pass | the hook is posted and the window killed 300 ms later; `/api/state` `alive:false` at 143 ms, card `.ended` at 147 ms (a third session was selected, so A had no attached terminal) |
| REQ-2 | focus rail | data | a clear SessionEnd starts no re-check | pass | `clear` + kill on an unattached session → `alive:false` at 2700 ms, the poll tick; not under 1 s |
| REQ-1/2 | any | daemon-down | — | N/A — a daemon-side check that cannot run while the daemon is down | |
| REQ-5, REQ-6, REQ-7 (NBSP), REQ-9, REQ-10 | all hosts in cycle 1 | all states in cycle 1 | as cycle 1 | pass (carried) | no file in the delta reaches them; the cycle-1 rows stand |

## Issues

### Critical

None.

### Major

None. Cycle-1 Major 1 is fixed in every host I measured: Focus shell, Focus shell after resizes, the Tiles shell (both moved and fresh) and both Claude terminals. Cycle-1 Major 2 is closed by the new `shell-scroll.spec.ts` journey. It runs at 1280×690, where the old build had a one-row range. It sends a single reversed −100 and polls `pane_in_mode 1` / `scroll_position 5`, and it checks slider = track. That journey would have been red on the cycle-1 build (my cycle-1 measurement at the same shape: `pane_in_mode 0` after the first notch, slider 529/552).

### Minor

None.

### Notes

1. **[note]** I did not re-drive the Tiles strip card's menu. With three sessions the Tiles view showed every session as a tile, and `#tiles-strip` computed `display:none` with no cards, so there was no strip card to right-click. The strip card shares `cardMenuItems` with the rail's single-card menu, which I measured unchanged above. Cycle 1 measured the strip menu itself as pass.
2. **[note]** In my first REQ-2 run the clear-SessionEnd session was the **selected** (attached) one, and it flipped at 55 ms. That came from the terminal pump's PTY-EOF nudge, not a re-check. Re-run with that session unattached, it flipped at 2700 ms, on the poll tick. I recorded the unattached result in the matrix.
3. **[note]** The implementer's residual (a shrink before tmux's first alt-screen entry) is not separately constructible from the browser. What I could measure was a shrink and regrow across six heights **after** alt-screen content existed. There, slider = track held throughout and the first reversed notch reached tmux.
4. **[note]** I found two scratch dirs, `$TMPDIR/muster e2e-38add35a-0sYars` and `…-jjqW6X`, both created at 01:34, before my first run. They hold no tmux socket. The cycle-1 `…-PL8IYo` is still there too. I left all three in place as not mine. My daemons were torn down by the fixture, the scratch spec is deleted, and `git status --porcelain` shows nothing of mine apart from this file.

## Maintainability review

# Maintainability review: bugs-one-batch-1

**Plan**: bugs-one-batch-1
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 30429 words (budget 30000)
**Scope**: 19 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (347+, 92-). This is a full review because cycle 1 had a Major. Only six of the 19 changed in `9718930d..HEAD`: `renderfix_scenarios_reader.go`, `apply.go`, `liveness.go`, `manager.go`, `railmenuitems.ts` and `pane.ts`, which is new to the scope. I re-read those six against their siblings. The other 13 are byte-identical to what cycle 1 reviewed, and their cycle-1 rows stand.

## Prior findings (cycle 1)

| Prior finding | Fix commit | Verified how |
|---|---|---|
| Major 1: `driveReaderDocsLargePair` copied `driveReaderDiagramsPair` | 1b21a0ac | Closed. One `driveReaderPair(names [2]string, docs func() []findDoc)` at `renderfix_scenarios_reader.go:114`, and both scenario rows (`:36`, `:40`) call it. `rg -n 'driveReader.*Pair' internal` finds only that function and those two rows. It returns the `func(context.Context, *renderRig) error` shape that `withPrefs` (`renderfix_scenarios.go:51`) takes and returns, so it composes the way the sibling combinator does. Gates `06-render-fixtures` is green, so the fixture names and the fixtures did not change. |
| Minor 1: two owners of the label → `{label, action, danger}` mapping, and no `design:` line | 82afb208 | Closed. `menuEntry(label)` (`railmenuitems.ts:49-51`) is the only home: `rg -n 'ACTION_BY_LABEL\[\|MENU_TEXT\[' web/src` gives `railmenuitems.ts:50` and the pre-existing `render/actionbutton.ts:19`, the select-bar button and not a menu entry. Both builders spread it and add their own `disabled`. The web Fix Attempt 1 has a `design:` line for `menuEntry` and `selectionMenuItems`. The label now uses the existing `sessionsPhrase` (`sessions/sections.ts:275`) instead of a third count phrase. |
| Minor 2: SessionEnd watch neither on `m.wg` nor ended by `m.cancel` | 1b21a0ac | Closed. `spawn` (`liveness.go:17-28`) runs `run(m.runCtx)` on `m.wg`, under `spawnMu`, and starts nothing once `stopped` is set. `Start` (`:13-15`) and the watch (`apply.go:123`) both go through it. `Stop` (`:30-38`) flips `stopped` under `spawnMu`, then cancels `runCtx`, then waits. The watch's `select` gained `case <-ctx.Done()` (`:175`), and each pass's `checkCtx` derives from `runCtx`. The write after `Stop` that cycle 1 described (watch passes the `stopped` check, `Stop` runs, `storeSnapshot` writes) is now closed: `Stop` cancels the pass's ctx and waits for it on `wg`. The `wg.Add`-racing-`Wait` reason cycle 1 named is handled by `spawnMu` rather than avoided. The `design:` line names every writer and guard (`stopped`, `spawnMu`, `runCtx`/`cancel`). |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/server/renderfix_scenarios_reader.go | renderfix_scenarios.go (`withPrefs`, `renderScenario`), same file's `driveReaderSession` / `driveReaderDiagrams` | yes (Fix Attempt 1: `driveReaderPair`) | funlen ×2 on the untouched `readerDocs`, `readerMermaidDocs` | pass (Major 1 closed) |
| internal/session/apply.go | liveness.go, manager.go | yes | none | pass |
| internal/session/liveness.go | manager.go (`stopped`, `wg`, `cancel`, `runCtx`, `spawnMu`), apply.go; server/bgloop.go (`bgLoop.start`/`stop`), server/ingest.go (`Start`/`Stop`) | yes (Fix Attempt 1: `spawn`, shared state named) | none | pass (Minor 2 closed); notes 1, 2 |
| internal/session/manager.go | liveness.go | yes | filelen 632 (622 on `main`, +10: two constants, three fields, two `NewManager` lines); reason holds | pass |
| web/src/api/http.ts | unchanged since cycle 1 | REQ-9 Decisions line | none | pass (cycle 1) |
| web/src/doc.ts | unchanged since cycle 1 | REQ-10 Decisions line | none | pass (cycle 1) |
| web/src/features/CLAUDE.md | unchanged since cycle 1 | — | — | pass (cycle 1) |
| web/src/features/actions.ts | unchanged since cycle 1 | REQ-9 Decisions line | none | pass (cycle 1) |
| web/src/features/groups.ts | unchanged since cycle 1 | yes | filelen 507 (507 on `main`, no net growth) | pass (cycle 1) |
| web/src/features/notes.ts | unchanged since cycle 1 | yes | none | pass (cycle 1) |
| web/src/features/railmenu.ts | unchanged since cycle 1; re-read `:30-40` as `menuEntry`'s consumer | yes | none | pass |
| web/src/features/railmenuitems.ts | railmenu.ts, sessions/card.ts (`ACTION_BY_LABEL`, `actionEnabled`), sessions/sections.ts (`sessionsPhrase`, its imports: no `features/` import, so no cycle), render/actionbutton.ts | yes (Fix Attempt 1) | none | pass (Minor 1 closed) |
| web/src/features/reader.ts | unchanged since cycle 1 | yes | filelen 707 (688 on `main`); reason holds | pass (cycle 1) |
| web/src/features/readerscroll.ts | unchanged since cycle 1 | yes | none | pass (cycle 1) |
| web/src/main.ts | unchanged since cycle 1 | — (one-line registration) | none | pass (cycle 1) |
| web/src/reader/memory.ts | unchanged since cycle 1 | yes | none | pass (cycle 1) |
| web/src/terminal/pane.ts | terminal/shellkeys.ts, terminal/drop.ts; `rg -n 'new Terminal\(' web/src` → `pane.ts:125` only | yes (Fix Attempt 1: "the xterm fix is an option, not a handler", alternatives named) | none | pass |
| web/src/terminal/shellkeys.ts | unchanged since cycle 1 | — | none | pass (cycle 1) |
| web/src/wsapp.ts | unchanged since cycle 1 | REQ-10 Decisions line | none | pass (cycle 1) |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** `Manager.spawn` (`internal/session/liveness.go:17-28`) and `bgLoop.start`/`stop` (`internal/server/bgloop.go:22-38`) are both start-on-a-cancellable-ctx-and-track-on-a-WaitGroup helpers. They are not a copy. `session` cannot import `server`. `spawn` runs many goroutines on one ctx and adds the `stopped`-under-`spawnMu` gate that `bgLoop` (one loop, "Call once") does not need. Its `design:` line says it generalises the session package's own former `Start`, the only `go func` there (`rg 'go func|m\.wg' internal/session` in the log). No change requested. If a third such helper appears, hoisting one into a leaf package like `internal/boundedwait` is the move.
2. **[note]** Shared state, re-checked for the new guard. `spawn` holds `spawnMu` across the `stopped` check and `wg.Add`. `Stop` holds it across `stopped.Store(true)` and releases it before `cancel` and `Wait`, so no `Add` can follow `Wait`'s start. `spawnMu` is a leaf lock: nothing else is taken while it is held, and `Apply` calls `spawn` at its end, outside `m.mu`. `runCtx` and `cancel` are written once, in `NewManager`. I found no interleaving. The gates' `test` line (`go test -race -count=1 ./...`, `02-test.log`) is green for `internal/session` (398 s) and `internal/server`. Cycle 1's Note 1 (each pass bounded by `endRemoveTmuxTimeout`, 5 s) stands as it was, by the implementer's choice. Cancelling `runCtx` now ends any pass at once, so `Stop` no longer depends on that bound.
3. **[note]** Size: every `funlen` hit in `01-size.log` names either a test already on `main` (`manager_test.go`, checked in cycle 1) or the untouched `readerDocs` / `readerMermaidDocs` data tables. All three file-length hits are on files that were over 500 lines on `main`.
4. **[note]** Component diagram: this cycle adds no new module or dependency edge. `features/railmenuitems.ts → sessions/sections.ts` is a call from `features/` into `sessions/`, the same direction as its existing `sessions/card.ts` import.
