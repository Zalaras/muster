# E2E Test Specs: bugs-one-batch-1

**Plan**: bugs-one-batch-1
**Mode**: fix (attempt 4, review cycle 3)
**Pack**: kb: pack 55135 words (budget 30000) — over budget, read anyway
**Verdict**: pass
**Tests created**: 5 new/rewritten (rail-menu 2, effort-header 1 extended + 1 new, update 1) plus the E4 comment correction
**Live run**: shell-scroll.spec.ts 10/10 passing; soak 100 passed (N=10)

## Tests

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/rail-menu.spec.ts | right-clicking a selected card in Select mode applies the menu's action to the whole selection, and an unselected card keeps its own single-card menu (REQ-3, REQ-4, #97) | REQ-3, REQ-4 (rewrites the REQ-7 test) | Unselected C: single-card menu, selection stays (green today). Selected A: menu named `Actions for 2 sessions`, no Pin, `No group` moves A and B, select mode, both checkboxes stay | ran-red-at-authoring — `Expected "Actions for 2 sessions"  Received "Actions for menu-e18-a"`; `Received: 1` polling B's groupId toBeNull |
| web/e2e/rail-menu.spec.ts | Stop… from a selected card in Select mode opens the count confirm and ends every selected session in one batch, leaving the unselected card alive and Select mode on (REQ-3, REQ-4, #97) | REQ-3, REQ-4 | `Stop 2 sessions?` confirm, one `POST /api/sessions/end`, A and B ended, C alive, "2 selected" stays | ran-red-at-authoring — dialog `Stop 2 sessions?` not found (single-card `Stop session?` opens today) |
| web/e2e/effort-header.spec.ts | with the daemon killed the header keeps its effort … works once the daemon is back (REQ-8, E13) | REQ-8, REQ-9 | Pins `Could not reach musterd.`; `#action-error` hidden after the banner hides and before the second Dismiss | ran-red-at-authoring — `#action-error` Expected: hidden, Received: visible ("Could not reach musterd.") |
| web/e2e/effort-header.spec.ts | a daemon refusal shown in the action-error line survives the daemon going away and coming back (REQ-9) | REQ-9 | Routed 500 `boom` stays in the line across kill + restart and a 1 s hold | ran-green-at-authoring (intentional guard; passes today because nothing clears the line — it pins the "refusal survives" half of REQ-9 against an over-eager clear) |
| web/e2e/update.spec.ts | an open pop-out reader holding a restart record reloads on its first reconnect, keeping its document, while an ordinary reconnect before the record does not reload it (REQ-10, edge case 10) | REQ-10 | Ordinary reconnect: no load, marker survives (green today). Record + close: `load` expected; afterwards status line hidden, document reopened, URL keeps `session=` and `path=` | ran-red-at-authoring — `page.waitForEvent: Timeout 10000ms exceeded while waiting for event "load"` |
| web/e2e/terminal.spec.ts | the tmux oracle's window geometry matches the terminal's own fitted size (E4) | REQ-7 | Comment only; assertions untouched | ran-green-at-authoring — `20 passed (14.2s)` for the file |

## Deleted Tests

None. The REQ-7 test at the old line 424 ("right-clicking a card in Select mode opens the same single-session menu…") is rewritten in place to the reversed behaviour; its unselected-card assertions (menu items, selection stays, checkbox unchecked) are kept.

## Fixture Changes

No changes needed. The pop-out test uses a scratch directory with one README.md and the pop-out URL `/doc.html?session=<id>&path=<absolute realpath>` (path is absolute per `features/reader.ts`), with the routed-/ws technique of the mismatched-protocol test; the synthetic `update` broadcast is that test's shape.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-3, REQ-4 | both rail-menu tests above |
| REQ-7 (comment) | terminal E4 comment |
| REQ-9 | E13 (extended), refusal-survives test |
| REQ-10 | pop-out restart test |

## Handoff

- The gate command `make e2e` runs `web-build`, whose `tsc --noEmit` currently fails on the web-tests agent's red unit tests (`railmenuitems.test.ts`, `memory.test.ts`), so I built with `cd web && npx vite build` then `make build` and ran `bin/gatelock run --exclusive -- make e2e-run SPECS=…`. Once web-impl lands the code `make e2e` works again.
- The pop-out test's final-leg assertions (status line hidden, document reopened) are untested today because the test is red before them; the first run after implementation must confirm them.

## Test Run Output

```
rail-menu.spec.ts:  9 passed, 2 failed (the two new tests, assertions above)
effort-header + update + terminal: 76 passed, 2 failed (E13 #action-error hidden; pop-out waitForEvent load)
pop-out after final edit: 1 failed, TimeoutError waitForEvent "load" 10000ms
terminal.spec.ts: 20 passed
```

## Notes

Soak not run (authoring mode).

## Fix Attempt 1 (review cycle 1)

Issue: browser Major 2 `[e2e-specs]` (no committed test drove REQ-8 through the browser). Both implementation logs' cycle-1 Fix Attempt sections read: the daemon change is internal to Stop (unit-pinned); web-impl's user-facing additions are the `rows: 2` xterm fix (Major 1) and the one-session selection label `Actions for 1 session`.

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/shell-scroll.spec.ts | after a flick that clamps, the very first reversed wheel notch scrolls the shell at once, and xterm itself holds no scroll range (REQ-8) | REQ-8 | At 1280x690 (fit lands on 23 rows) Focus shell: xterm's `.scrollbar.vertical .slider` height equals its track; wheel +10000 leaves `pane_in_mode` 0; one wheel -100 gives tmux `pane_in_mode` 1 and `scroll_position` 5; slider still equals track | ran-green: `20 passed (16.2s)` with rail-menu; soak `80 passed (1.3m)` (N=10) |
| web/e2e/rail-menu.spec.ts | right-clicking the one selected card names its menu for one session, not 'sessions' (REQ-3) | REQ-3 | One checked card: menu name `Actions for 1 session`; after a second check `Actions for 2 sessions` | ran-green; soak `120 passed (1.2m)` (N=10) |

**Red against the defect (by the review's pre-fix measurement, not re-broken)**: before the fix the Focus shell's slider was 529 of a 552 px track at this viewport, so the slider-equals-track poll times out; the first -100 sent no frame and tmux stayed `pane_in_mode 0`, so the `#{pane_in_mode}` poll for `1` after that single event times out too. After the fix: slider 552/552, one -100 gives `scroll 5`.

Notes: the flick and the reversal are separated by one `waitForAnimationFrame` (one flush per gesture; in one frame the two would sum). The post-flick `pane_in_mode` 0 check is a poll, since the daemon's enter-then-exit of copy-mode for the clamped flick is not instantaneous (a single read after one frame saw `1`). An earlier live run saw the pre-existing E4 test's `fillShellHistory` time out once; it passed on every later run and in the 10x soak (80 passed), so it is not touched.

No assertion was deleted, skipped, or weakened. No Repairs: only additions. Tiles-shell reversal is not covered by a new journey (the reviewer measured it passing; the xterm fix is one shared construction).

Title follow-up: the two new test titles dropped their `review cycle 1` labels (comment-check feedback); bodies unchanged.

## Fix Attempt 2 (review cycle 2)

Issues: code Major 2 `[e2e-specs]` (no test pins a background shell's size) and code Minor 1 `[e2e-specs]` (vacuous `undefined === undefined` final scrollbar check). Read first: web-implementation.md `## Fix Attempt 2` (`refit()` now sends nothing when `proposeDimensions()` proposes nothing; commit 9c014e8e).

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/shell-scroll.spec.ts | a background shell keeps its fitted tmux window size while docs is showing and across a switch to another session and back (REQ-8) | REQ-8 (the `rows: 2` construction must not change an unmounted shell's tmux size) | Two sessions; shell opened on A, tmux `#{window_width}x#{window_height}` read once fitted (poll until width is not the unfitted 80). Docs selected on A (shell region count 0): size unchanged. Click B's card, then A's (docs still pressed, no shell region), 1.5 s hold, size unchanged in both width and height | ran-green: `9 passed (14.8s)` for the file; soak `90 passed (1.5m)` three times (270 runs), one earlier soak run `89 passed, 1 failed` (see Notes) |
| web/e2e/shell-scroll.spec.ts | after a flick that clamps, the very first reversed wheel notch scrolls the shell at once, and xterm itself holds no scroll range (REQ-8) | REQ-8 | Final check now `expect(bars).not.toBeNull()`, `track > 0`, then `slider === track`, so a missing scrollbar fails | ran-green (in the file runs above) |

**Red against the defect, measured**: I temporarily restored `web/src/terminal/pane.ts` from `9c014e8e^` (the `rows: 2` tree without the `refit()` guard), rebuilt, and ran the file. The new journey failed on the size assertion and nothing else (`8 passed, 1 failed`):

```
Expected: "130x24"
Received: "80x5"
```

That is the review's `afterSwitchBack=80x5`. I then restored the file with `git checkout web/src/terminal/pane.ts`; `git status` shows only `web/e2e/shell-scroll.spec.ts` and the log changed. Against the current tree (9c014e8e) the journey is green, as the fix makes true. Width and height are both asserted, since the size is one string `WxH`.

Minor 1: the final re-read is no longer a bare `bars?.slider` vs `bars?.track`; it asserts non-null and `track > 0` first. By construction it now fails on a `null` return from `xtermScrollbarHeights` (`expect(null).not.toBeNull()` fails); I did not break the scrollbar deliberately.

## Repairs

None: additions and one strengthening only. No assertion was deleted, skipped, or weakened.

## Notes (Fix Attempt 2)

The first soak of the whole file (N=10) ended `89 passed, 1 failed`; the failure was `a slow trackpad-shaped wheel gesture …` (REQ-7), a test and a code path this wave did not touch. I did not capture the assertion (the output was cut by `tail`). Reruns: the file alone 9 passed; that test alone N=10 `10 passed (24.0s)`; the whole-file soak N=10 three more times, `90 passed (1.5m)`, `90 passed (1.4m)`, `90 passed (1.5m)`. I could not reproduce it, so I made no change; it ran while other agents were building on this machine. If it reds again at the gate, its failing line is the lead (the test's `pane_in_mode` / `scroll_position` polls are its only waits).

Test title carries no review/cycle wording. (The pre-existing REQ-7 slow-trackpad title still says `review cycle 1 Major 1`; it predates this wave and is not mine to rename here without breaking its coverage-table mapping.)

## Fix Attempt 3 (review cycle 2, flake repair)

The plan's E5 check (`make e2e SPECS='e2e/update.spec.ts'`) went red in 3 of the last 4 gate runs on one test, with `clock.pauseAt: Error: Cannot fast-forward to the past` at `web/e2e/update.spec.ts:1009`. The test predates this branch and is identical on `main`; this batch did not touch it.

**Diagnosis verified in `playwright-core` 1.63.0** (`coreBundle.js`, the injected `ClockController`): `Clock.install()` with no time seeds the page's fake clock from `Date.now()` and lets it tick in real time. `pauseAt(t)` runs `toConsume = t - this._now.time` and then `_innerFastForwardTo(ticks + toConsume)`, which throws `Cannot fast-forward to the past` when that is negative. The test passed Node's `new Date()` as `t`, and the page's fake `now.time` can sit a few milliseconds ahead of Node's wall clock, so the target was occasionally behind.

## Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | Check now disables the button the instant it starts and shows its result the instant it settles, not on the next periodic render tick (e-note-4) | `clock.pauseAt: Cannot fast-forward to the past` in 3 of 4 gate runs | The pause target came from Node's wall clock, which can trail the page's fake clock by milliseconds | Before: `await page.clock.pauseAt(new Date());`. After: `const fakeNow = await page.evaluate(() => Date.now()); await page.clock.pauseAt(fakeNow + 2000);` (target read off the page's own fake clock, 2 s ahead). | WF1 (e-note-4): the clock is still paused before `fakeServer.hold()` and the click, so the periodic 1 s `app.render()` cannot fire between the pause and the final expects; the jump forward fires due timers once, before the click only. All assertions, timeouts and the title are unchanged. |

No assertion was deleted, skipped, or weakened. No timeout was raised and no retry added.

Live: `make e2e SPECS='e2e/update.spec.ts'` gave `28 passed (54.6s)`. Soak `make e2e-soak SPEC=e2e/update.spec.ts N=10` gave `280 passed (8.3m)`.

## Fix Attempt 4 (review cycle 3)

No `[e2e-specs]` issue was tagged; this is the coverage task from web-implementation.md Fix Attempt 3 (`web/src/terminal/pane.ts` opens xterm only once its body is laid out) and review.cycle3.md browser Major 1.

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/shell-scroll.spec.ts | a shell built while docs was showing, then reselected after a switch to another session and back, has no xterm scroll range and its first flick and first reversed notch reach tmux (REQ-8) | REQ-8 | Shell with 200 history lines on A, then Docs, B's card, A's card, Shell again, no new output: `hist-line-200` is visible, xterm's scrollbar slider equals its track (null fails), a +10000 wheel sends exactly `scroll -200`, a -100 wheel then sends `5` (frames `[-200, 5]`), tmux reads `pane_in_mode 0` after the flick then `1` and `scroll_position 5` after the notch | `make e2e SPECS=...`: 10 passed (12.7s); soak `make e2e-soak SPEC=e2e/shell-scroll.spec.ts N=10`: 100 passed (1.6m) |

Added `WsScrollRecorder` to `web/e2e/helpers/shellinput.ts` (additive): records the `{"type":"scroll","lines":N}` text frames the page sends on a `/ws/shell/` socket (shape from docs/protocol.md's terminal.ws scroll frame). The existing REQ-8 background-size test is unchanged; the new test sits beside it with its own journey, so no coverage mapping changed.

**Red against the pre-fix tree, measured.** `git checkout fc3856c9^ -- web/src/terminal/pane.ts`, `make web-build build`, then the new test alone: it failed at the slider assertion (`the reselected shell xterm's scrollbar slider must fill its track`, `Expected: true  Received: false`, 15 s poll exhausted), matching the reviewer's slider 20 / track 48. The frame and `pane_in_mode` assertions after it are red on the same numbers (no frames reached tmux, `pane_in_mode 0`). Restored with `git checkout fc3856c9 -- web/src/terminal/pane.ts`, rebuilt; `git diff --stat fc3856c9 -- web/src internal cmd` is empty and `git status` shows only the two e2e files (plus the orchestrator's state file).

## Repairs

None this attempt; no existing assertion was touched. No assertion was deleted, skipped, or weakened.

## Handoff (Fix Attempt 4)

None.
