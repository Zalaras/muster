# Review: bugs-one-batch-1

**Plan**: bugs-one-batch-1
**Verdict**: needs-changes
**Cycle**: 1
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser needs-changes, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: bugs-one-batch-1

**Plan**: bugs-one-batch-1
**Part verdict**: needs-changes
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

## Browser review

# Browser review: bugs-one-batch-1

**Plan**: bugs-one-batch-1
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 14927 words (budget 30000)
**Rig**: `make web-build build` at e3c55e37 (dirty only in plans/), a fresh `bin/musterd` per test through `helpers/fixtures.ts`: a space-bearing data dir `$TMPDIR/muster e2e-38add35a-*`, a private `-tmux-socket <dataDir>/tmux.sock`, the harness stub `claude`. Headless Chromium 1280×720 driving a throwaway `web/e2e/zz-browser-review.spec.ts`, run in the foreground under the gate lock; spec deleted afterwards.

Gates log (`gates-bugs-one-batch-1-c1`): 0 failed lines; `21-e2e` 381 passed; `04-web-build` green. The app I drove is the one that ships.

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 | focus rail | data | non-clear SessionEnd, then pane dies → ended within 1 s, no terminal attached | pass | the hook is posted, 300 ms later the window is killed; `/api/state` `alive:false` at 140 ms, rail card `.ended` at 142 ms (B selected, so A had no attached terminal) |
| REQ-2 | focus rail | data | clear SessionEnd starts no re-check | pass | `clear` + kill → `alive:false` at 3158 ms, the poll tick (no-hook control: 648 ms, which is just where the poll happened to land) |
| REQ-2 / EC-2 | focus rail | data | straggler non-clear SessionEnd on a live pane changes nothing | pass | B stays `alive:true` after 4 s; card class `card s-start current` |
| REQ-1 | tiles | data | card flips | N/A (not measured) — same `sessionUpsert` path as the rail; see Note 4 | |
| REQ-1/2 | any | daemon-down | — | N/A — a daemon-side check that cannot run while the daemon is down | |
| REQ-3 | focus rail | data | selected card → selection menu, count label | pass | `aria-label="Actions for 2 sessions"`; computed `display:block; visibility:visible; opacity:1`; menu box 149,426–339,608 inside the 1280×720 viewport |
| REQ-3 | focus rail | data | mixed live + ended → Stop… and Remove… both shown, no Resume or Pin | pass | items `Stop…, Remove…, grp, New group…, ✓No group`; menu still open after a 1.2 s tick |
| REQ-3 | focus rail | data | Remove… → count confirm, one batch | pass (Note 1) | dialog `Remove 2 sessions?` "1 of them are alive and will be stopped first…"; `POST /api/sessions/remove` alone; both gone from `/api/state` |
| REQ-3 | focus rail | data | Move to (keys) moves the whole selection | pass | Shift+F10 on the focused selected card opens `Actions for 2 sessions` with `Stop…` focused; ArrowDown to `grp`, Enter → both ids' `groupId` = 1 in `/api/state`; still `2 selected` |
| REQ-3 | focus rail | data | Stop… → count confirm | pass | `Stop 2 sessions?` dialog count 1 |
| REQ-3 | focus rail | data | Select mode and the selection survive | pass | `2 selected` after Move; Select stays `aria-pressed=true` after Remove (the bar reads `Select sessions` because both were removed) |
| REQ-4 | focus rail | data | unselected card → single-card menu, selection unchanged | pass | `Actions for r3-c`: `Stop…, ✓grp, New group…, No group, Pin`; `2 selected` afterwards |
| REQ-4 | tiles strip | data | strip card menu unchanged | pass | Select mode is cleared on entering Tiles (`groupsselect.ts` prefs listener); strip card of a previously selected session opens `Actions for r4-e` with Pin |
| REQ-3 / EC-3 | focus rail | daemon-down | selection menu items disabled, nothing sent | pass (Note 2) | all four items `aria-disabled=true`; a forced click sent no request |
| REQ-3 | focus rail | daemon-down → back | selection and menu return | pass | `2 selected`, `aria-pressed=true` after restart; menu `Actions for 2 sessions`, items enabled |
| REQ-3/4 | pop-out | any | — | N/A — `/doc.html` has no rail | |
| REQ-5 | focus | data | Escape in the anchored panel → Claude terminal | pass | activeElement `TEXTAREA[Terminal input]` in `Terminal: r5-a`, same after 1.2 s; typed `hello1⏎` → `stub-echo:hello1` in the pane |
| REQ-5 | focus | data | second glyph click → terminal | pass | activeElement in the terminal, same after 1.2 s |
| REQ-5 | focus | data | Escape in the popped panel → terminal | pass | popped panel box 896,150–1256,450; activeElement in the terminal, same after 1.2 s |
| REQ-5 | focus | data | popped close button (pointer) → terminal | pass | activeElement in the terminal; typed `hello2⏎` echoed |
| REQ-5 | focus | data | Escape from the editor | pass | the first Escape leaves edit mode, the second closes; focus in the terminal |
| REQ-5 / EC-5 | focus | data | Shell selected → shell terminal | pass | Escape and popped close both land in the shell's xterm textarea; typed `echo shellok-$((40+2))` printed `shellok-42` in `Shell: r5-a` |
| REQ-5 | focus | data | Docs selected → glyph, never body | pass | activeElement `BUTTON[Note]`, same after 1.2 s |
| REQ-5 | focus | data (ended) | ended session → glyph | pass | activeElement `BUTTON[Note]`, same after 1.2 s |
| REQ-5 | focus | data | Escape with focus outside the panel does nothing | pass | focus on the glyph, Escape → panel still visible |
| REQ-5 | focus | daemon-down | close returns focus | pass | Escape → focus in the terminal |
| REQ-5 | tiles / pop-out | any | — | N/A — the note panel lives only in the Focus header (`#mainhead .ng`) | |
| REQ-6 | focus | data | reachable: the body scrolls | pass | body `scrollHeight 2511 > clientHeight 593`, `overflow-y:auto`; a real wheel of +700 → `scrollTop 700` |
| REQ-6 | focus | data | Claude → Docs keeps the position | pass | 700 → 700 after a 1.2 s settle |
| REQ-6 | focus | data | Shell → Docs keeps the position | pass | 700 → 700 |
| REQ-6 | focus | data | session B and back keeps the position | pass | 700 → 700 |
| REQ-6 | focus | data | page reload keeps the position | pass | 700 after reload; `muster.reader.<id>` holds `"scroll":{"…/0-outline.md":700}` |
| REQ-6 | focus | data | a `storage` event never scrolls a reader already showing | pass | a second tab opened at 700 and was wheeled to 1600; the first tab stayed at 700 |
| REQ-6 / EC-6 | focus | data | clamp to a shorter document | pass | stored 1500, file cut to 12 sections while on Claude; rebuild → 465 = `scrollHeight − clientHeight` (trace 0 → 465, settled) |
| REQ-6 | tiles | data | a tile's docs surface keeps the position | pass | tile body 1734/224, `overflow-y:auto`; wheel → 500; Claude → Docs → 500 |
| REQ-6 | tiles → focus | data | the same session moved hosts | pass | 500 in the tile → 500 in Focus |
| REQ-6 | pop-out | data | the pop-out opens at the remembered position and keeps its own across reload | pass | opened from the real `pop out ↗` link at 1600 (the remembered value); wheel → 1820; the dashboard's later rebuild opens at 1820. A separate pop-out reload kept 400 → 400 |
| REQ-6 | focus | daemon-down | — | N/A — the mainhead's surface segments are disabled while down (a click timed out), so a reader cannot be rebuilt then | |
| REQ-7 | focus | data | the size note holds its row; the terminal is not a row short | pass | `#sizenote` `130×23 · one live client…`, `display:flex; visibility:visible`; box 300,694–1280,720 sits under the terminal's 300,126–1280,694 inside main 300,46–1280,720; tmux `130x23`; xterm renders 23 rows |
| REQ-7 | focus | first frame | the NBSP reserving placeholder | N/A — a transient the next refit replaces (kb:adr/process-transient-displays-not-oracles); the unit guard W3 covers it | |
| REQ-7 | tiles / pop-out | any | — | N/A — the size note is Focus-only | |
| REQ-8 | focus shell | data | a reversed wheel after a clamped flick scrolls at once | **FAIL** (Major 1) | flick +10000 → frame `lines:-200`; the first −100 sends no frame, tmux `pane_in_mode 0`; the second −100 → `lines:5`, `scroll_position 5` |
| REQ-8 | focus shell | data | the carry is dropped on reversal | pass | after the swallowed notch every −100 is `lines:5` (5, 10, 15), not the old −200/−90 tail; up-flick then +100 drives tmux from 200 back down |
| REQ-8 / EC-8 | focus shell | data | same-direction carry past the clamp | pass | up-flick → 200, then −100 → 380 (the carried pixels still apply) |
| REQ-8 | tiles shell | data | reversal after a flick | pass | flick +10000 then −100 → `pane_in_mode 1`, `scroll_position 5` |
| REQ-8 | any | daemon-down | — | N/A — no shell socket while down | |
| REQ-9 | focus | data → reconnect | `Could not reach musterd.` clears on reconnect | pass | a transport-aborted Stop shows the line (`display:block`, box 0,59–1280,91); after `daemon.restart()` it is `hidden`, `display:none`, 15 ms after the banner hid |
| REQ-9 / EC-9 | focus | data → reconnect | a refusal survives the reconnect | pass | a 500 `boom refusal` is still `display:block` 1.5 s after the restart |
| REQ-9 | tiles | data → reconnect | the same, with the error raised from a tile's Stop | pass | `Could not reach musterd.` visible in Tiles, `display:none` after the reconnect |
| REQ-9 | pop-out | any | — | N/A — `/doc.html` has no `#action-error` | |
| REQ-10 | pop-out | data | an ordinary real daemon restart does not reload | pass | 0 `load` events, marker kept; while down the status line read `musterd unreachable — showing last render` (`display:block`) and the body stayed |
| REQ-10 | pop-out | restart record | the restart record → reload on the first reconnect, same document | pass | synthetic `update` broadcast (no reload yet), then a **real** `daemon.kill()` + `restart()` → 1 `load`, marker gone, `?session=1&path=…README.md` kept, body `body-marker` again, status line `display:none` |
| REQ-10 | focus / tiles | — | the dashboard is unchanged | N/A — not re-driven; covered by update.spec E5/E6 in the green `21-e2e` | |

## Issues

### Critical

None.

### Major

1. **[web-impl]** In the Focus shell surface, the first wheel notch after a direction reversal still does nothing, so e7's "reversing direction should scroll the other way straight away" is not true in the browser. The accumulator fix (REQ-8) works: measured frames show the carry dropped. But xterm's own scrollable element eats the event before Muster's wheel handler runs. A stopPropagation/preventDefault spy shows the first −100 is consumed by `xterm-scrollable-element`'s `_onMouseWheel`, with no `scroll` frame sent and tmux left out of copy-mode. The shell xterm has a one-row scroll range despite `scrollback: 0`: its vertical slider is 529 px of a 552 px track, and `top` moves 23 px ↔ 0 px. The Claude terminal's slider is 552 of 552. That first notch also visibly moves xterm's own viewport (top row `hist-line-379` → `hist-line-360`) while tmux stays at the live bottom. This is the §7 property "tmux owns scrollback, never xterm", though the option itself is 0, hence Major rather than Critical. The same swallow happens on the very first wheel-up over a fresh shell. The Tiles shell did not show it in my run. It is not introduced by this diff (`pane.ts` and the xterm setup are untouched), but it is what is left of the entry's symptom. A fix must make the first −100 after a +10000 flick in the Focus shell send `{"type":"scroll","lines":5}`, and leave the shell xterm with no scroll range (slider height = track height). — `web/src/terminal/pane.ts`
2. **[e2e-specs]** No committed test drives REQ-8 through the browser, so none could have failed for Major 1. W4 pins `accumulateWheelDelta` alone, and `shell-scroll.spec.ts` uses single wheels of 300 px or more from a fresh pane, which an xterm that eats one event per gesture still passes. A journey that flicks, reverses once and asserts tmux `pane_in_mode 1` after that **single** reversed event would have been red.

### Minor

None.

### Notes

1. **[note]** In a mixed live + ended selection, the selection menu's `Remove…` removes the live sessions too. The confirm says so ("1 of them are alive and will be stopped first"). This is `batchPlan`'s rule ("Remove keeps every known id") and matches the selection bar. REQ-3's "each applies to the sessions it fits" reads that way. But the single-card menu never offers Remove… on a live card, so this is the one menu path that removes a live session. No change requested; the ADR's wording is review-work's to confirm.
2. **[note]** With the daemon down, an open card menu (single or selection) closes by itself within 3 s, because each reconnect attempt's `status` closes it (`railmenu.ts` `app.on("status", …)`). This is unchanged from before this plan. A user who then presses Escape leaves Select mode, since the menu is no longer there to take the key. Observed, no change requested.
3. **[note]** If a pop-out's `?path=` spells the document's path differently from the dashboard's listing (for example `/private/var/…` vs `/var/…`), the pop-out writes that spelling as `openPath` and its own scroll entry into the shared `muster.reader.<id>`. The dashboard then opens that path at 0 and prunes the entry. The real `pop out ↗` link always uses the listing's spelling, so a user never hits this. I hit it only by building the URL by hand from a `realpath`.
4. **[note]** Not measured: REQ-1 in the Tiles host (rail card and `/api/state` measured, and Tiles reads the same upsert), and REQ-10's dashboard-unchanged cells (green in the gate's `update.spec.ts`). I did not count one-live-client (`session_attached`) across my host switches, because this plan touches no attach path.
5. **[note]** A scratch dir `$TMPDIR/muster e2e-38add35a-PL8IYo` (created 00:04, before this review's first run; its socket has no server running) was already on disk. I left it in place as not mine. Every daemon of mine was torn down by the fixture, and `git status --porcelain` shows nothing of mine.

## Maintainability review

# Maintainability review: bugs-one-batch-1

**Plan**: bugs-one-batch-1
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 30429 words (budget 30000)
**Scope**: 18 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (313+, 71-)

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/server/renderfix_scenarios_reader.go | its own `driveReaderDiagramsPair` / `driveReaderSession` (same file), `withPrefs` scenarios | yes ("mirrors driveReaderDiagramsPair") | funlen ×2 (`readerDocs`, `readerMermaidDocs`): functions this branch did not touch | Major 1 |
| internal/session/apply.go | liveness.go, manager.go, machine.go (`KindDeathHint` case) | yes | none | Minor 2 (the `go` statement it adds) |
| internal/session/liveness.go | manager.go (`stopped`, `wg`, `cancel`), apply.go; server/terminal.go (PTY-EOF `Nudge` spawn), server/bgloop.go (`runTicked`) | yes ×4 | none | Minor 2; note 1 |
| internal/session/manager.go | liveness.go | yes (constants kept beside `defaultPollInterval`) | filelen 627 (was already over before this; +5 lines); reason holds | pass |
| web/src/api/http.ts | features/actions.ts, terminal/drop.ts (code-based branching) | REQ-9 Decisions line | none | pass |
| web/src/doc.ts | main.ts, wsapp.ts, features/updaterestart.ts | REQ-10 Decisions line | none | pass |
| web/src/features/CLAUDE.md | (doc, prose half only; trailer generated) | — | — | pass |
| web/src/features/actions.ts | api/http.ts, features/updaterestart.ts (only other `helloArrived` listener) | REQ-9 Decisions line | none | pass; note 3 |
| web/src/features/groups.ts | groupsselect.ts, railmenu.ts | yes (handle widened, not duplicated) | filelen 507→508; reason holds | pass |
| web/src/features/notes.ts | rail.ts:37, launch.ts:774, surfaces.ts:60 (`focusSelected`) | yes (precedent grep) | none | pass |
| web/src/features/railmenu.ts | railmenuitems.ts, groupsselect.ts, render/selectbar.ts, sessions/sections.ts | yes | none | pass; note 4 |
| web/src/features/railmenuitems.ts | railmenu.ts, sessions/card.ts, sessions/sections.ts | no line for `SelectionMenuItems` / `selectionMenuItems` | none | Minor 1 |
| web/src/features/reader.ts | readerfind.ts, readerscroll.ts, reader/memory.ts | yes | filelen 688→707; reason holds (logic is in readerscroll.ts) | pass |
| web/src/features/readerscroll.ts | readerfind.ts (shape it copies) | yes | none | pass |
| web/src/main.ts | doc.ts | — (one-line registration change) | none | pass |
| web/src/reader/memory.ts | protocol/decode.ts | yes (pure half beside the other `with*` transitions) | none | pass |
| web/src/terminal/shellkeys.ts | terminal/pane.ts:188 (sole caller) | — (body change to an existing pure function) | none | pass |
| web/src/wsapp.ts | doc.ts, main.ts, ws.ts | REQ-10 Decisions line | none | pass; note 5 |

## Issues

### Critical

None.

### Major

1. **[daemon-impl]** `driveReaderDocsLargePair` is a copy of `driveReaderDiagramsPair`. The two bodies are the same seven lines and differ only in the two session names and the docs function — `internal/server/renderfix_scenarios_reader.go:109-116` against `:125-132`:
   ```
   func driveReaderDocsLargePair(ctx context.Context, r *renderRig) error {
   	for _, name := range []string{"reader-large-a", "reader-large-b"} {
   		if _, err := driveReaderSession(ctx, r, name, name, readerLargeDocs()); err != nil {
   ...
   func driveReaderDiagramsPair(ctx context.Context, r *renderRig) error {
   	for _, name := range []string{"reader-a", "reader-b"} {
   		if _, err := driveReaderSession(ctx, r, name, name, readerMermaidDocs()); err != nil {
   ```
   The `design:` line says it "mirrors" the sibling. Conventions § Design, "Reuse before add", says a found helper "is reused or generalised, never copied, whatever Decisions says". A fix must leave one two-session driver, parameterised by the session names and the docs, that both scenario rows use. The fixture names and the recorded fixtures must not change.

### Minor

1. **[web-impl]** `selectionMenuItems` rebuilds `cardMenuItems`'s entry closure. Both map a `CardAction` to `{label: MENU_TEXT[label], action: ACTION_BY_LABEL[label], danger: label === "Remove", …}`: `web/src/features/railmenuitems.ts:53-58` and `:81-86`. The only difference is the `disabled` rule. So "which action is dangerous, and what text and action a label maps to" now has two owners in one file (conventions § Design, "One owner per concept"). The next field or label change has to be made twice. A fix must give the label → `{label, action, danger}` mapping one home, which both builders use and each adds its own `disabled` to. Separately, the new exported type and function have no `design:` line in `web-implementation.md` (the railmenu line covers only `openCard`/`openSelection`/`actionEntries`). Add a line that says where the selection rule lives and why.

2. **[daemon-impl]** `watchPaneAfterSessionEnd` (`internal/session/liveness.go:163-188`, started at `internal/session/apply.go:122-124`) is the first goroutine `Manager` starts that is neither on `m.wg` nor ended by `m.cancel`. Its sibling `Start`/`pollLoop` (`liveness.go:13-21`, `:103-110`) is on both. The loop takes a `ctx` that can never be done (`context.WithoutCancel`), and its `select` has no `ctx.Done()` case. Conventions § Go: "The daemon must shut down gracefully — nothing ignores ctx."

   The Decisions reason, "Stop must not block on a 3 s loop", does not hold as written. A loop that selected on a context `Stop` cancels would return at its next `select`, and its tmux call would fail at once on the cancelled `checkCtx`. Either way `Stop` would never wait out the 3 s cap.

   Here is what `stopped` alone leaves open. The watch passes `stopped.Load()` at `liveness.go:174`. Then `Stop` runs and shutdown proceeds. The watch then reaches `checkOneLiveness` with a live pane, and `captureAndStoreSnapshot` → `storeSnapshot` writes to the store after `Stop`. The `stopped` check at `:209` guards only the `markEnded` branch.

   A fix must make one of these true:
   - the watch ends when `Stop` runs, on a context `Stop` cancels, and `Stop` accounts for it the way it does for the poll loop; or
   - `## Decisions` states a reason that holds for keeping it detached. A real reason exists: `wg.Add` racing `Stop`'s `Wait` for an `Apply` that arrives during shutdown.

### Notes

1. **[note]** The watch bounds each check with `endRemoveTmuxTimeout` (`liveness.go:181`). That constant is named, and declared (`manager.go:74`), for End/Remove/Repair's tmux calls under the per-session lock. It is 5 s, longer than the watch's own 3 s cap (`sessionEndRecheckFor`), so one wedged check can outlive the cap. The sibling callers, `Nudge` and `pollLoop`, pass their ctx through unbounded. No change requested. Whoever next tunes End/Remove's timeout should know it also moves this loop.
2. **[note]** Size: every `funlen` hit in `internal/session/manager_test.go` names a test that already exists on `main` (checked with `git grep` on `main` for each of the six names), so none is this branch's. Both `funlen` hits in `renderfix_scenarios_reader.go` are on the untouched data tables `readerDocs` and `readerMermaidDocs`. The three file-length hits on touched files (`manager.go`, `groups.ts`, `reader.ts`) were all over 500 lines before this branch, and the Decisions reasons hold.
3. **[note]** `actions.ts:105-107` clears the action line on `helloArrived` by comparing the shown text with `networkError.message`, not the wire `code` the error carries (`terminal/drop.ts:99` branches on `code`). The REQ-9 Decisions line gives the reason: no `showError` signature changes. One constant has one owner (`api/http.ts:43`), so this is not a duplicate.
4. **[note]** For **review-work**: the selection menu offers Remove only when some selected session is dead (`railmenuitems.ts`, `sessions.some((s) => !s.alive)`). The selection bar enables Remove for any selection (`render/selectbar.ts:37`, `els.remove.disabled = !acts`). The "Stop has something to do iff any selected is alive" rule now has two homes: `sessions/sections.ts:353`'s `anyAlive` and the menu's `some`. Whether the two surfaces should agree is a requirement question, not a shape one. Also, `railmenu.ts:85-88`'s `many` callback silently drops any action other than `end`/`remove` because `CardMenuAction.action` is typed wider than what `selectionMenuItems` produces. It is harmless today.
5. **[note]** `wsapp.ts`: `updateWsHandlers` now also carries `onHelloArrived`, which `actions.ts` consumes as well as `updaterestart.ts`, so the name is narrower than its use. `dashboardWsHandlers` spreads `coreWsHandlers` and `updateWsHandlers` itself (`:82-83`) rather than spreading `popoutWsHandlers`. No change requested.
6. **[note]** Component diagram: the only new module is `web/src/features/readerscroll.ts`, and commit `2223999c` already counts it in `kb:diagram/web-components`. No new Go package or dependency edge.
7. **[note]** Shared state: the watch, the poll loop and `Nudge` can call `checkOneLiveness` for the same id at once. `markEnded` is idempotent under `m.mu` (`liveness.go:228-239`), and `storeSnapshot` takes `m.mu` plus the write ticket. The gates' `test` line is `go test -race -count=1 ./...` and it is green. I found no interleaving on unguarded memory. On the web side, `readerscroll.ts`'s `restoring`/`latest`/`timer` and `actions.ts`'s `shownMessage` each have a single writer.
