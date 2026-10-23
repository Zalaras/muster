# Correctness review: bugs-one-batch-1

**Plan**: bugs-one-batch-1
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 64681 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes: `Apply` arms `watchPaneAfterSessionEnd` on `KindDeathHint` (`internal/session/apply.go:122`); every pass goes through `checkOneLiveness(…, false)` (`liveness.go:163-188`) | Yes: D1 `TestApply_NonClearSessionEndEndsSessionPromptlyOnceThePaneDies` (persisted row and last upsert polled inside the 1 s bound) | pass |
| REQ-2 | Yes: `KindClearDeathHint` arms nothing; 200 ms ticker, 3 s deadline; the loop returns on `m.stopped`, unknown target or a dead reading | Yes: `TestApply_ClearSessionEndStartsNoPaneRecheck`, `…DoesNotPersistAfterStop`, `…EndsOnceTheSessionReadsDead`, `…ExpiresAtTheCapWithThePaneAlive` | pass |
| REQ-3 | Yes: `railmenu.ts` `openSelection` (`dispatchMany(…, "selection")`, many-session Move to); `selectionMenuItems` | Yes: E1 (two journeys: No group, Stop… count confirm), W1 (live/ended/mixed, disabled states) | pass, but see Minor 1 (`Actions for 1 sessions`) |
| REQ-4 | Yes: an unselected card or no Select mode goes to `openCard`, the old path | Yes: E1 (card C's menu, selection unchanged); existing rail-menu tests for outside Select mode and the strip card | pass |
| REQ-5 | Yes: `notes.ts` `close(true)` calls `surfaces.focusSelected`, and falls back to the glyph when `activeElement` is `body` or null | Partly: R1 covers Escape (anchored), Escape (popped), the popped close button, and the ended and Docs fallbacks. The second glyph click has no test | fail (Major 1) |
| REQ-6 | Yes: `reader/memory.ts` `scroll` field plus `withScroll`/`withScrollPruned`, tolerant parse; `features/readerscroll.ts`; `reader.ts` restores only on `showLoading` opens, and again in `refindAfterDiagrams` | Yes: R2 (Claude→Docs, reload, session A→B→A, wheel, top/nav click), W2, `readerscroll.test.ts` | pass |
| REQ-7 | Yes: no code change needed; the E4 comment was rewritten | Yes: W3 NBSP guard | pass |
| REQ-8 | Yes: `shellkeys.ts` drops the carry when the wheel direction reverses | Yes: W4 (`+10000,−100 → 5`; `−5000,+100 → −5`); the pinned same-direction carry test still passes | pass |
| REQ-9 | Yes: `actions.ts` remembers the shown message; `helloArrived` clears it only when it equals `networkError.message` | Yes: E3 (E13 extended; new test where a refusal survives the restart) | pass |
| REQ-10 | Yes: `doc.ts` calls `initUpdateRestart(app)` before the socket and registers `popoutWsHandlers`; `updateWsHandlers` is shared with the dashboard | Yes: E5 pop-out test (an ordinary reconnect does not reload; a restart record does, and `session=`/`path=` survive); `wsapp.test.ts` relays | pass |
| DIAG | `kb:diagram/web-components` was updated (45 modules counted against `web/src/features/*.ts`, 6 sub-controllers, `doc → features … update`). `kb:diagram/daemon-components` needs no change because no import changed | — | pass |

## Build & Tests

E2E tests: pass (381, scoped to 33 files, `NOTE e2e scope` in `21-e2e.log`) · Daemon tests (race): pass (every package `ok`) · Web tests: pass (3030 in 106 files) · Render tests: pass (417) · Daemon build: pass · Web build: pass · Lint: pass (`0 issues.`; web-lint clean). All read from `$GATES_LOG_DIR` (0 failed lines). `WARN size` (11 hits) and the e2e-level census belong to review-maintainability.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| build | `make build` | pass |
| test | `go test -race -count=1 ./...` | pass |
| lint | `make lint` | pass |
| web-build | `make web-build` | pass |
| web-test | `make web-test` | pass (3030) |
| render-fixtures | `make check-render-fixtures` | pass (106 scenarios up to date) |
| render-lint | `npm run -s render:lint` | pass |
| render-test | `make render-test` | pass (417) |
| web-lint | `make web-lint` | pass |
| contrast | `make contrast` | pass (54 pairs × 3 themes, 0 failures) |
| features-inventory | features inventory | pass |
| versions | `go run ./tools/versions check` | pass |
| e2e-honest | e2e honesty | pass |
| kb-check | `go tool kb check` | pass (0 problems) |
| e2e-lint | `npm run -s e2e:lint` | pass |
| features | features-scope | pass |
| comments | comment-checks | pass |
| comment-ledger | comment ledger verify | pass (2 blocks, both kept) |
| size | size-warn | WARN (review-maintainability's) |
| e2e-level | e2e level census | WARN (census only) |
| e2e | `make e2e SPECS='…33 specs…'` | pass (381) |
| D1 | `go test -count=1 -run 'TestApply_NonClearSessionEnd\|TestApply_ClearSessionEnd\|TestCheckOneLiveness_StoppedGuard' ./internal/session/` | pass |
| D2 | `go test -count=1 ./internal/session/ ./internal/server/` | pass |
| W1 | `cd web && npx vitest run src/features/railmenuitems.test.ts` | pass (17) |
| W2 | `cd web && npx vitest run src/reader/memory.test.ts` | pass (78) |
| W3 | `cd web && npx vitest run src/render/focusview.test.ts` | pass (8) |
| W4 | `cd web && npx vitest run src/terminal/shellkeys.test.ts` | pass (26) |
| W5 | `make web-test` | pass (deduped to web-test) |
| R1 | `cd web && npm run -s render:lint && npx playwright test -c playwright.render.config.ts render/notes.spec.ts` | pass (21) |
| R2 | `cd web && npm run -s render:lint && npx playwright test -c playwright.render.config.ts render/reader.spec.ts` | pass (44, pair leg ran) |
| R3 | `make render-test` | pass (deduped to render-test) |
| E1 | `make e2e SPECS='e2e/rail-menu.spec.ts'` | pass (11) |
| E3 | `make e2e SPECS='e2e/effort-header.spec.ts'` | pass (30) |
| E5 | `make e2e SPECS='e2e/update.spec.ts'` | pass (28) |
| L1 | `make lint` | pass (deduped to lint) |
| L2 | `make web-lint` | pass (deduped to web-lint) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. This is a sweep batch, so the `TODO.md` tick stays with the loop. There are no `deviation:` lines. The superseding ADR `rail-card-menu-on-selected-card-acts-on-selection` is `proposed` with `refs: plan:bugs-one-batch-1` and `supersedes` set, and it describes what shipped. Both `doc-delta:` lines in the web log are reflected: the glob landed in `2223999c`, and the reader item is in `doc-delta.md`. I checked every Doc Delta assertion against the code and found each true; one caveat is in Note 4 |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | The e1 re-check never writes `alive` from the payload, and the goroutine ends at the cap or when the pane is gone | pass | `watchPaneAfterSessionEnd` only calls `checkOneLiveness` → `markEnded`. It returns on the `deadline` timer, `m.stopped`, a missing target, or `!sess.Alive` after a pass (`liveness.go:163-188`). The cap and dead-reading exits are pinned by two daemon tests |
| RV2 | `railmenu.ts` reads `groups.selecting()`/`selectedIds()` inside `open()`, not at init | pass | `railmenu.ts` `open(request)` calls both on each invocation; nothing is captured at init |
| RV3 | The stored scroll is applied only in the instance-build/remembered-open path, never on `storage` adoption, and is clamped to `scrollHeight − clientHeight` | pass | `scroll.opened` is called only under `opts.showLoading` (`reader.ts:335`). `handleStorage` only reloads memory and renders. The clamp is the browser's own: `scrollTop` assignment clamps to the scroll range, and the value is re-applied after the diagram pass |
| RV4 | The E4 comment no longer claims a pre-sizenote first fit | pass | `web/e2e/terminal.spec.ts:211-218` now says the NBSP reserves the row before the first fit and that the per-poll re-parse is for load |
| RV5 | `actions.ts` clears `#action-error` on reconnect only for a `network_error` | pass | `helloArrived` handler: `if (shownMessage === networkError.message)`. It compares the shared body's message rather than threading the code, which the plan's Affected Files allows ("or compares against the shared network-error body") |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass: `apply.go` switches on the neutral `claudecode.KindDeathHint`; the diff adds no hook/status-line field names |
| 2 | No terminal-output state parsing | pass: the re-check's `capture-pane` is the existing snapshot display feed, and `alive` comes from `PaneExists` |
| 3 | Non-blocking hook handler | pass: the watch runs on its own goroutine after `Apply` persists; ingest is unchanged |
| 4 | tmux via `-L muster`, no `resize-pane` | pass: no new tmux invocation (goes through the existing `PaneChecker`/`PaneSnapshotter`) |
| 5 | No payload logging | pass |
| 6 | Empty-gauge honesty | pass: no gauge path touched |
| 7 | Identity on tmux target | pass: the watch keys on the Muster id and reads `TmuxTarget` |
| 8 | No settings trespass | pass |
| 9 | No real `claude` outside canary/probes | pass |

## Issues

### Critical

None.

### Major

1. **[render-tests]** REQ-5's third close path has no test. REQ-5 names "a second click on the note glyph" beside Escape and the close button. The glyph handler is a separate branch: `notes.ts` `glyph.addEventListener("click", …)` → `form === "anchored"` → `closeByUser()`. It is also where the bug was reproduced ("a second glyph click", Findings e4). R1 covers only Escape (anchored and popped) and the popped close button. A fix must make true: a render test on `notes`/`notes-short` opens the anchored panel with the glyph, clicks the glyph again, and polls `activeElementInsideTerminal(page, "notes-short")` to `true`.

### Minor

1. **[web-impl]** With a one-card selection the selection menu is labelled `Actions for 1 sessions`. `railmenuitems.ts` `selectionMenuItems` builds `` `Actions for ${sessions.length} sessions` ``, but the batch copy beside it uses `sessionsPhrase(n)` (`web/src/sessions/sections.ts:275`), so the confirm for the same selection reads `Stop 1 session?`. A fix must make true: the label reads `Actions for 1 session` at one and `Actions for N sessions` above one.
2. **[web-tests]** W1 pins the label only at 2 and 3 (`railmenuitems.test.ts` "names the count in the label"), so the one-session boundary in Minor 1 is untested (kb:lesson/threshold-tested-only-far-from-its-boundary). A fix must make true: a row asserting the label for a one-session selection.
3. **[render-tests]** The five new note tests in `web/render/notes.spec.ts` (lines 603-681) are titled `(R1, REQ-8)`, and `render-tests.md` repeats `REQ-8`. In this plan REQ-8 is the wheel-carry requirement, and the note focus requirement is REQ-5. A fix must make true: those titles (and the log rows) name REQ-5.
4. **[render-tests]** `web/render/reader.spec.ts:1338-1349` still has the authoring-time guard `test.skip(!pairFixtureExists, "needs-scenario: …")`. The `reader-docs-large-pair` fixture is now generated and checked by `check-render-fixtures`. If the guard stays, renaming or removing the scenario would silently skip the session-switch leg of REQ-6 instead of failing it. A fix must make true: the leg runs unconditionally, so a missing fixture fails.

### Notes

1. **[note]** The plan left it to the implementer to track the re-check goroutine "on `m.wg` or cancel it by the manager's context". daemon-impl chose neither and logged that as `design:`. The watch runs on `context.WithoutCancel(ctx)` and relies on the `m.stopped` check at each tick, as `Nudge` does. As a result, a pass already in flight when `Stop` runs can still capture and store a pane snapshot after `Stop`. `alive` stays guarded. Cancelling via the manager's context (which `Stop` already cancels) would not have made `Stop` wait.
2. **[note]** On a live pane the re-check's ~15 passes each run a `capture-pane` snapshot through `checkOneLiveness`. The plan prescribes that path, so this is how REQ-2's "does nothing while the pane still exists" is met. Nothing is broadcast, and the store is written only when the text changes.
3. **[note]** REQ-3's Remove… leg from the selection menu has no E2E journey (only Stop… and No group). It runs the same `many` handler line as Stop… and the bar's `dispatchMany("remove", …)`, and W1 covers when it shows.
4. **[note]** For doc-reconcile: `docs/features/reader/spec.md:69-71` says reader memory is shared "live — a change in one window shows in the other without a switch or reload". Once the reading position joins that memory sentence, the position is the exception: by design a `storage` event never scrolls a reader already showing (REQ-6). `doc-delta.md` states the exception, so the promoted sentence needs to keep it.
5. **[note]** `web-implementation.md` records a one-off `update.spec.ts:986` failure (`clock.pauseAt: Cannot fast-forward to the past`) that passed on rerun. It was green in this cycle's gate run.
6. **[note]** `web/e2e/zz-rb-menu.spec.ts` is untracked in the worktree and is not part of this plan's diff. It looks like a review-browser scratch spec, so it should not ride the review commit.
