# Web Implementation: bugs-one-batch-1

**Plan**: bugs-one-batch-1
**Mode**: initial
**Pack**: kb: pack 54518 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/terminal/shellkeys.ts` | edited | REQ-8: `accumulateWheelDelta` drops the carry when a non-zero event reverses its sign |
| `web/src/features/railmenuitems.ts` | edited | REQ-3: pure `selectionMenuItems(sessions, state)` returning `{ label, actions, moveDisabled }` |
| `web/src/features/railmenu.ts` | rewritten | REQ-3/4: `open()` builds the selection menu when selecting and the card is in the selection, else today's single-card menu; `RailMenuDeps` widens structurally |
| `web/src/features/groups.ts` | edited | REQ-3: handle's `moveToEntries` takes `readonly Session[]` (the one caller wrapped one session) |
| `web/src/reader/memory.ts` | edited | REQ-6: `scroll` field, tolerant parse, `withScroll`, `withScrollPruned` |
| `web/src/features/readerscroll.ts` | created | REQ-6: reading-position save/restore sub-controller of `reader.ts` |
| `web/src/features/reader.ts` | edited | REQ-6: builds the scroll handle, restores on user-initiated opens (incl. the remembered open at build), settles after the diagram pass, prunes to the listing; `storage` adoption never touches scroll |
| `web/src/features/notes.ts` | edited | REQ-5: `NotesDeps { surfaces.focusSelected }`; a user close focuses the selected surface, the glyph when nothing took focus |
| `web/src/main.ts` | edited | REQ-5: `initNotes(app, { surfaces })` |
| `web/src/api/http.ts` | edited | REQ-9: `networkError` body exported |
| `web/src/features/actions.ts` | edited | REQ-9: remembers the shown message; `helloArrived` clears it when it is the network error |
| `web/src/wsapp.ts` | edited | REQ-10: `updateWsHandlers` (shared), `popoutWsHandlers`; dashboard handlers reuse the shared relays |
| `web/src/doc.ts` | edited | REQ-10: `initUpdateRestart(app)` before the socket; `popoutWsHandlers`; header updated |
| `web/src/features/CLAUDE.md` | edited | names `readerscroll.ts` beside `readerfind.ts` |

REQ-7 (sizenote NBSP guard, E4 comment): web code already holds one NBSP; the guard test and the comment correction belong to web-tests and e2e-specs, nothing for web-impl to change. REQ-1/REQ-2 are daemon-impl's.

## Decisions

- Selection menu keeps the select-bar's behaviour: Stop…/Remove… go through `actions.dispatchMany(…, "selection")` (count confirm, `batchPlan` filters to the sessions each fits); select mode and the selection are untouched by opening the menu, so they stay afterwards.
- The selection menu's in-flight rule is "any selected id in flight" disables every item.
- REQ-6 clamp: `body.scrollTop = restored` is clamped natively by the browser to `scrollHeight − clientHeight`; applied again after the diagram pass settles (the layout is final then). Not clamped by hand.
- REQ-6 restore policy: applied on every opener with the loading cue (the remembered open at instance build, and a nav/plan click), `0`/top for a document with no stored position; silent refetches (`docChanged`, focus, snapshot) never touch scroll. A user wheel/key/pointer/touch on the body drops a pending restore, so the post-diagram re-apply never fights the reader. Find's reveal runs after the restore in `fileOpened` and again in `diagramsSettled` (scroll settles first), so find's jump still wins.
- REQ-6 saving: debounced 150 ms on `scroll`, ignored while a restore is pending, flushed on dispose using the last scroll value seen (a detached body reports `scrollTop` 0, so it is never read at dispose). Pruning runs when the listing arrives against absolute listed paths, the plan path and the pop-out's `?path=`.
- REQ-9 compares the shown message with `networkError.message` rather than threading a code through `showError(message)`: every caller (groups, effort, dialogs) keeps its signature, and the plan allows "compares against the shared network-error body".
- REQ-10: the pop-out gets `onUpdate` + `onHelloArrived` through `popoutWsHandlers`; the dashboard's two relays moved into `updateWsHandlers` and are spread by both, so nothing is duplicated. `updaterestart.ts` untouched (its comments read fine for the pop-out).
- Testable UI Elements: the plan has none; no row to honour. Menu label `Actions for N sessions`, items `Stop…`, `Remove…`, `Move to` entries as the e2e spec expects.
- No CSS was added; no element gains a `hidden` toggle.

design: `features/readerscroll.ts` is a sub-controller of `reader.ts` in the shape of its neighbour `features/readerfind.ts` (`initReaderScroll(body, deps)` returning a small handle, deps are a structural `save(path, top)`, owned state is its private `restoring`/`latest`/timer, one writer). Precedent grep: `rg -n "scrollTop" web/src` found only `render/reader.ts`'s `scrollHeadingIntoView`/`attachScrollSpy` and `render/readerfind.ts`'s reveal — none persist or restore a position, so there was nothing to extend; the pure half (transition, prune, parse) is in `reader/memory.ts` beside the other `with*` transitions.
design: `railmenu.ts` splits `open()` into `openCard` / `openSelection` over a shared `actionEntries`, rather than a flag on one builder; `openFor` is now an id list so a removal of any selected session closes the selection menu. `groups.moveToEntries` already took a list internally (`select`'s bar uses it), so the handle method is widened, not duplicated.
design: size warnings kept: `web/src/features/groups.ts` 507→508 and `web/src/features/reader.ts` 688→709 lines, both already over 500 before this work; the reader's growth is the scroll wiring (the logic itself is in the new module).
Precedent for `notes.ts` focus return: `rg -n "focusSelected" web/src` → `rail.ts` and `launch.ts` call `surfaces.focusSelected(id)`; `notes.ts` takes the same structural dep (no thunk: `surfaces` is built before `initNotes`).

Measured: `make web-test` 105 files / 3017 tests passed; `make web-lint` clean; `make web-build` ok; render specs `render/notes.spec.ts render/reader.spec.ts`: 62 passed (21.3s), including the three reader-position tests and the `reader-docs-large-pair` leg (fixture `web/render/fixtures/reader-docs-large-pair.json` present from daemon-impl); scoped E2E: first run 88 passed, 1 failed (`update.spec.ts:986` Check now ... e-note-4, `clock.pauseAt: Cannot fast-forward to the past`, a Playwright clock error in a test this change does not touch); `make e2e SPECS='e2e/update.spec.ts'` rerun 28 passed, including the new pop-out test.

doc-delta: a new file `web/src/features/readerscroll.ts` is owned by no feature (`make check-kb` reports exactly that one problem); `docs/features/reader/spec.md`'s `web:` glob needs `web/src/features/readerscroll.ts` and `make gen-kb`. I did not edit `docs/`.
doc-delta: reader — the remembered position applies to any open with the loading cue (a nav click on a document with a stored position returns to it), not only to the rebuilt reader; a sentence saying "last open file" only is incomplete.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0 (no test file is broken).
**E2E smoke**: covered by the plan's own specs above — `make e2e SPECS='e2e/rail-menu.spec.ts e2e/effort-header.spec.ts e2e/update.spec.ts e2e/terminal.spec.ts'`: 88 passed, 1 failed on the first run (unrelated clock flake, passes on rerun: `e2e/update.spec.ts` 28 passed).
`make check-kb` is red on one item only: the `readerscroll.ts` ownership glob above (needs the orchestrator's glob edit and `make gen-kb`). No spec locator mismatches. No test files need changes.

## Fix Attempt 1

**Failures addressed**: review cycle 1 browser Major 1 (Focus shell: first wheel notch after a reversal swallowed), code Minor 1 (`Actions for 1 sessions`), maintainability Minor 1 (two owners of the label → entry mapping, no `design:` line).

**Changes made**:

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/terminal/pane.ts` | edited | `new Terminal({ rows: 2 })` so the alternate buffer's line list is sized from the minimum and grown by the first fit |
| `web/src/features/railmenuitems.ts` | edited | `menuEntry(label)` owns label text, action and `danger`; `cardMenuItems` and `selectionMenuItems` spread it and add their own `disabled`; the selection label uses `sessionsPhrase` |

**Root cause (measured, not the reviewer's theory)**: not xterm's `scrollback` option. xterm builds the alternate buffer's line list from the construction rows (24) and only grows it while that buffer is still empty (`Buffer.resize` guards its shrink-trim with `lines.length > 0`). tmux enters the alt screen after the fit has shrunk the terminal to 23 rows, so the list is 24 long over a 23-row screen; the first linefeed at the bottom then pushes `ybase` to 1. xterm's scrollable element then has a one-row range and, at its bottom, consumes the first upward wheel event. Constructing at the 2-row minimum makes the first fit grow the list to exactly the fitted rows. It applies to every `TerminalSurface` (Claude, Focus shell, Tiles shell), which all hit it.

**Before** (Focus shell, `VP=690` so the fit lands on 23 rows; throwaway spec, deleted; +10000 wheel then −100 twice, 2 animation frames + 200 ms between):
```
buffer {len:24, ybase:1, ydisp:1, rows:23}  slider 529 / track 552, sliderTop 23px
wheel +10000  frames [scroll -200]            pane_in_mode 0
wheel -100    frames []                       pane_in_mode 0   (ydisp 1 -> 0: xterm scrolled itself)
wheel -100    frames [scroll 5]               pane_in_mode 1, scroll_position 5
Claude terminal, same viewport: slider 529 / 552 as well
```
**After** (same spec, same viewport):
```
buffer {len:23, ybase:0, ydisp:0, rows:23}  slider 552 / track 552, sliderTop 0px
wheel +10000  frames [scroll -200]            pane_in_mode 0
wheel -100    frames [scroll 5]               pane_in_mode 1, scroll_position 5
wheel -100    frames [scroll 5]               pane_in_mode 1, scroll_position 10
Claude terminal: slider 552 / 552 (was 529 / 552)
fresh shell, first wheel -100 at VP=690: frames [scroll 5], buffer len 23 ybase 0
default 1280x720 (24 rows): slider 576 / 576, unchanged behaviour
Tiles shell (Meta+Backslash, 200 history lines): +10000 [scroll -200]; -100 [scroll 5] mode 1 pos 5; -100 [scroll 5] mode 1 pos 10
```
Gates: `npx vitest run src/terminal/shellkeys.test.ts src/features/railmenuitems.test.ts`: 2 files, 43 tests passed. `make web-test`: 106 files, 3030 tests passed. `npx tsc --noEmit` and `npm run build` exit 0; `npm run -s lint` clean; `make check-kb` 0 problems; `make size-warn` names neither touched file. Smoke: `npx playwright test e2e/shell-scroll.spec.ts e2e/terminal.spec.ts e2e/plain-shell.spec.ts e2e/shell-keys.spec.ts e2e/rail-menu.spec.ts e2e/tiles.spec.ts`: 76 passed (41.9s).

Category sweep: every `new Terminal` in `web/src` is the one in `pane.ts` (`rg -n "new Terminal" web/src` → one hit), so every xterm surface gets the fix. The label → entry mapping: `rg -n "ACTION_BY_LABEL\[" web/src/features` → `menuEntry` only. Menu labels built from a session count: `rg -n "sessions\`" web/src/features` shows the selection label was the one bypassing `sessionsPhrase`.

**Decisions**:
- design: `menuEntry(label)` in `railmenuitems.ts` is the one home of "which action is dangerous and what text and action a label maps to"; the two builders differ only in their `disabled` rule (the card menu per-action, the selection menu all-or-nothing). `selectionMenuItems` lives beside `cardMenuItems` because the rule "Stop… if any selected session is alive, Remove… if any is not, never Resume or Pin" is the selection analogue of that card rule and shares `MENU_TEXT`/`CARD_MENU_LABELS`; it is pure and returns the label too, so `railmenu.ts` only renders. Precedent: `sessionsPhrase` (`sessions/sections.ts`) is the count phrase the batch confirms already use, now also the menu label (`Actions for 1 session`, `Actions for 2 sessions`).
- design: the xterm fix is an option, not a handler. Considered and dropped: a capture-phase wheel listener on the body (hides the symptom, leaves xterm's own viewport and a stray 1-row scrollbar range), and `term.clear()` after a fit (blanks the screen until tmux repaints). The comment on `rows: 2` records the why because the option reads as a no-op.
- Residual, not closed: a container shrink that lands before tmux's first alt-screen entry would still size the list from the pre-shrink rows only if the terminal had been constructed at more rows; with `rows: 2` the list can only be too small, never too large, so it cannot leave a range. Not separately measured.
- Browser Note 1 (Remove… on a mixed selection removes live sessions after the count confirm), Note 2 (open menu closes on daemon-down) and maintainability Notes 3-5: no change requested, none made.
- `railmenuitems.test.ts` pins the label at 2 and 3 sessions only; the one-session row is wave 2's (web-tests).

**Handoff additions**: no test file edited. web-tests: add the `Actions for 1 session` row to `railmenuitems.test.ts`. e2e-specs (browser Major 1, item 2): a journey that flicks, reverses once and asserts `pane_in_mode 1` after that single event, at a viewport that fits 23 rows (e.g. 1280x690), plus a slider = track check on both surfaces.

## Fix Attempt 2

**Failures addressed**: review cycle 2 code Major 1 (the `rows: 2` construction made a never-mounted background shell surface send an 80x2 resize, which the daemon clamped to 80x5 and applied to the shell's tmux window).

**Changes made**:

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/terminal/pane.ts` | edited | `refit()` asks `fitAddon.proposeDimensions()` first and returns, sending nothing, when it proposes nothing (no layout) or a non-finite size; only then calls `fit()` and reads `term.cols/rows` |

**Root cause**: `refit(true)` on socket open ran `fit()`, which silently returns on a detached element, and then sent whatever `term.cols/rows` held, the constructor geometry. That was always unfitted (80x24 before cycle 1, 80x2 after). The fix removes the send instead of changing the number: an unfitted terminal never reports a geometry. Property (b) (alternate buffer line list no larger than the fitted rows) is unchanged, since `rows: 2` stays.

**Before** (throwaway spec on this tree's build, deleted; Docs selected over a shell, click B's card then A's, `#{window_width}x#{window_height}` on `muster-<id>-shell`):
```
fitted=130x24 onDocs=130x24 afterSwitchBack=80x5 docsPressed=true afterShellSelected=130x24
```
**After** (same spec):
```
fitted=130x24 onDocs=130x24 afterSwitchBack=130x24 docsPressed=true afterShellSelected=130x24
```
The 80-column width of that send, which predates the plan, goes with it: the send no longer exists for an unmounted surface (`afterSwitchBack` keeps 130 columns, was 80). When the surface is later mounted, `focus.ts`/`tiles.ts` call `surface.refit()` after `mountSlotRoot`, which now fits and sends the real geometry (debounced; `lastSentCols/Rows` reset to 0 by `attach()`), as the `afterShellSelected=130x24` line shows.

Cycle 1 repro re-run (Focus shell, viewport 1280x690, 200 history lines, +10000 wheel, then one -100):
```
slider/track=552/552 pane_in_mode=1 scroll_position=5 window=130x23
```
(first-notch fix holds; slider height equals track height.)

**Blast radius** (every `TerminalSurface`: `rg -n "refit\(" web/src` → `pane.ts` (definition, and `attach()`'s open handler), `focus.ts:255` (Claude and Focus shell), `tiles.ts:201` (Tiles Claude and Tiles shell); the never-mounted background shell has only the open-handler call, which is now a no-op). Measured: `npx playwright test e2e/shell-scroll.spec.ts e2e/terminal.spec.ts e2e/plain-shell.spec.ts e2e/shell-keys.spec.ts e2e/tiles.spec.ts e2e/rail-menu.spec.ts`: 78 passed (41.8s). `npx vitest run src/terminal/`: 6 files, 167 tests passed. `make web-test`: all passed. `npx tsc --noEmit`, `npm run build`, `npm run -s lint` exit 0; `make check-kb` 0 problems; `make size-warn` names no web file.

**Decisions**:
- design: the guard lives in `refit()` (the one place that turns a fit into a `resize` frame), not in `attach()`'s open handler or the surface manager, so every caller (open, focus, tiles) gets it. It reuses xterm's own `FitAddon.proposeDimensions()`, the check `fit()` itself makes; `rg -n "proposeDimensions" web/src` found nothing prior to reuse. Considered and dropped: constructing at 24 rows again (brings back the first-notch defect), and having the surface manager skip `refit` for unmounted surfaces (leaves `refit()` able to send an unfitted size from any future caller).
- No test file edited; no doc-delta.

## Fix Attempt 3

**Failures addressed**: review cycle 3 browser Major 1 (a shell rebuilt while unmounted keeps a 2-row xterm scroll range: slider 20 / track 48, the first flick and first reversed notch never reach tmux).

**Changes made**:

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/terminal/pane.ts` | edited | `term.open()` moved out of the constructor into `openIfLaidOut()`, called first thing in `refit()`: xterm opens only once `bodyEl` has a non-zero client size. `opened` flag gates `focus()`, `canPasteNow()` and `geometry` (null until opened) |

**Root cause**: a surface built while Docs is selected (or in any unmounted host) called `term.open()` on a detached body; xterm measured and sized its scrollable element there, with the 2-row construction geometry and the daemon's first output already inside. The later mount-time `fit()` resized the buffer but not the scrollable element's range. Opening xterm only once the body is laid out means the first output is buffered by the headless core (xterm accepts `write` before `open`), and the open, the fit and the scroll area all happen against the real layout. The daemon's first `resize` frame (sent by the mount-time `refit`) makes tmux repaint, so the buffered 80-column paint is replaced; measured below that the screen is repainted (`hist-line-200` visible after the remount).

**Before** (throwaway spec, deleted; shell on A with 200 history lines, Docs, click B, click A, Shell; no new output; +10000 wheel then -100):
```
switch@720  bars={track:48,slider:20}   flick=[] mode0=0 notch=[] mode=0
switch@690  bars={track:48,slider:20}   flick=[] mode0=0 notch=[] mode=0   (no history fill in this run; frames empty)
```
**After** (same spec, history filled, content check `hist-line-200` visible after the remount):
```
switch@720        bars=576/576  flick=[scroll -200] mode0=0 notch=[scroll 5] mode=1 pos=5 win=130x24
switch@690        bars=552/552  flick=[scroll -200] mode0=0 notch=[scroll 5] mode=1 pos=5 win=130x23
nodocs-switch@720 576/576 same frames, mode=1 pos=5 | @690 552/552 same
fresh@720 / @690  576/576, 552/552, [scroll -200] then [scroll 5], mode=1 pos=5
docs-same@720/690 576/576, 552/552, same frames, mode=1 pos=5
ABA-shell@720/690 576/576, 552/552, same frames, mode=1 pos=5
10 passed (19.3s)
```
Cycle-2 background size, same spec: `fitted=130x24 bgWhileUnmounted=130x24` at 720 and `130x23` / `130x23` at 690 for both switch variants (unmounted shell sends no resize, tmux size unchanged after a 1.5 s hold).

**Blast radius** (every `TerminalSurface`): `rg -n "term\.open|new Terminal" web/src` → `pane.ts` only. Consumers of the changed members: `refit()` (`focus.ts:255`, `tiles.ts:201`, the socket-open handler), `focus()` (`surfaces.ts`, `dropwire.ts`), `canPasteNow()` / `pasteText` (`dropwire.ts`), `geometry` (`focus.ts` sizenote, `tiles.ts` footer). Claude and shell surfaces in Focus and Tiles all open on the first mounted `refit`, which every host already calls straight after `mountSlotRoot`; the never-mounted background shell stays unopened until it is mounted. Measured: `npx playwright test e2e/shell-scroll.spec.ts e2e/terminal.spec.ts e2e/plain-shell.spec.ts e2e/shell-keys.spec.ts e2e/tiles.spec.ts e2e/drop.spec.ts e2e/focus-header.spec.ts`: 88 passed (52.0s). `npx vitest run src/terminal/`: 167 passed; `make web-test`: 106 files, 3032 tests passed. `npx tsc --noEmit`, `npm run build`, `npm run -s lint` exit 0; `make check-kb` 0 problems; `make size-warn` names no web file. No render spec references xterm.

**Decisions**:
- design: lazy open lives in `pane.ts` as one private `openIfLaidOut`, called from the one place that fits (`refit`), so no caller needs to know; its owner is the surface itself (the `opened` flag is written there only). Reuse check: `rg -n "isConnected|clientWidth" web/src/terminal web/src/features/surfaces.ts` found no existing layout test to reuse. Considered and dropped: `term.reset()`/`clear()` after the first fit (blanks the screen until tmux repaints, and leaves the scrollable element sized by a detached open), and refreshing xterm's scrollable element from outside (private API).
- `geometry` now answers `null` until the terminal has opened (its doc comment already said "null before the terminal has ever been laid out"); sizenote and tile footer render that as no geometry instead of the constructor's 80x2.
- No test file edited; no doc-delta.

**Handoff additions**: e2e-specs: the REQ-8 background-size journey should reselect Shell after the switch and assert slider = track and the flick, reversed-notch frames (review browser item 1 of the e2e-specs findings); not done here, test files are not mine.
