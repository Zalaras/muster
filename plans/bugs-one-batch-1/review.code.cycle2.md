# Correctness review: bugs-one-batch-1

**Plan**: bugs-one-batch-1
**Verdict**: needs-changes
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
