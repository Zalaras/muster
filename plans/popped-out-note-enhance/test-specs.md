# E2E Test Specs: Popped-out note enhancements

**Plan**: popped-out-note-enhance
**Mode**: fix (attempt 2, review cycle 1, wave 3)
**Pack**: kb: pack 17194 words (budget 30000)
**Verdict**: pass
**Tests created**: 14 new, 3 existing tests rewritten to the plan's new behaviour (all in `web/e2e/notes.spec.ts`)
**Live run**: 37/37 passing (fix attempt 2); soak 370/370 (N=10, second run)

## Tests

Fixture plan: `daemon` (fresh per test), the existing choice for `notes.spec.ts` kept as the plan's header says. Claude Code is faked (enveloped `SessionStart` through `launchNoted`, as the existing tests do); the note has no Claude Code source.

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/notes.spec.ts | a session popped out at a moved rectangle reloads popped out there when focused, and a session never popped out shows no panel (E1) | REQ-1, REQ-2, REQ-3, INV-1 | A moved and resized by pointer, B never popped: B shows none, A returns at its box, and again after a reload | collection-only |
| web/e2e/notes.spec.ts | a place stored by the single-panel version is ignored: after a reload every session is anchored | REQ-3, edge case 1 | Today's `muster.note-panel` value planted in session storage: no panel for either session after reload, glyph opens an anchored panel | collection-only |
| web/e2e/notes.spec.ts | removing a popped-out session leaves another popped-out session's panel unchanged and forgets the removed session's place, and removing the focused popped-out session shows no panel for the next one (E2) | REQ-1, REQ-4, INV-1 | 3 sessions; Remove of B keeps A's box and drops B's rectangle from the tab's memory; Remove of focused A shows no panel for C | collection-only |
| web/e2e/notes.spec.ts | Open note in window opens a popup on the session's note and closes the panel, a second press opens no second page, and another session's window makes two (E3) | REQ-4, REQ-8, INV-5 | Popup URL `note.html?session=<id>`, header and title, panel closed, no second page on the second press, two windows for two sessions | collection-only |
| web/e2e/notes.spec.ts | Open note in window from a popped-out panel closes it and takes only that session out of the popped-out set, and its next pop-out returns to its rectangle | REQ-4, REQ-8, INV-1 | 2 popped sessions; window from A leaves B popped at its box; A's re-pop returns to A's box | collection-only |
| web/e2e/notes.spec.ts | stopping a popped-out session leaves it popped out at its rectangle when focused, and another session still shows none (E4) | REQ-4, INV-1 | End API; dead surface shown; panel and box kept; B shows none | collection-only |
| web/e2e/notes.spec.ts | text typed in A's note window reaches A while the dashboard focuses B and then Tiles, and an edit saved from the dashboard panel shows in A's window while it is not editing (E5) | REQ-9, REQ-10, REQ-14, INV-3 | Window stays on A across focus and Tiles; Escape leaves edit mode without closing; dashboard edit shows in the window in place | collection-only |
| web/e2e/notes.spec.ts | with musterd stopped, text typed in a note window shows the unsaved status and is on the daemon after musterd restarts with no further input (E6) | REQ-11 | Unsaved status in `--warn` words, kept text re-sent on reconnect, status clears | collection-only |
| web/e2e/notes.spec.ts | text a note window could not save survives a reload of that window and reaches the daemon on reconnect (E6, network failure) | REQ-11 | Aborted PUTs (connection-level failure), window reload, draft re-sent after the abort is lifted and musterd restarts | collection-only |
| web/e2e/notes.spec.ts | a note window stays editable after its session is stopped, and after Remove reads that the session has been removed with no editable note, while another session's window is unaffected (E7) | REQ-12 | Stop: window still edits and saves; Remove: removed notice, no editor, no rendered note; B's window unaffected | collection-only |
| web/e2e/notes.spec.ts | Close on the anchored panel saves the typed text at once, closes it and returns focus to the terminal | REQ-6 | Typed text on the daemon within 700 ms of Close (inside the autosave debounce), panel gone, terminal focused | collection-only |
| web/e2e/notes.spec.ts | Close and Open in window work from the keyboard on the anchored panel and keep focus across a tick before they act | REQ-6, REQ-7, REQ-8 | Both controls: focus and node identity held across a 1.4 s tick, then a real Enter closes (focus to terminal) / opens the popup | collection-only |
| web/e2e/notes.spec.ts | with browser storage blocked, popping out, placing, Close and Open in window all work and raise no page error | REQ-13, edge case 15 | Context-wide storage block; pop out, drag, Close, Open in window; no `weberror` from dashboard or window | collection-only |
| web/e2e/notes.spec.ts | with the panel popped out for A, typing and then focusing B saves the text to A and shows no panel for B, and focusing A again shows A's panel with the text (E8) | REQ-1, REQ-9, REQ-15, INV-1, INV-3 | Rewritten old E5 (below) | collection-only |
| web/e2e/notes.spec.ts | removing a session whose note panel is popped out shows no panel for the next focused session, which is not popped out, and the removed note is gone from the state (E11) | REQ-1, edge case 9 | Rewritten old E11 (below) | collection-only |
| web/e2e/notes.spec.ts | click-away and the glyph leave a popped-out panel open, Pop in returns it to the anchored form, and Escape inside the panel closes it (REQ-7, REQ-12) | REQ-7 | One line changed: the anchored panel now carries Close | collection-only |
| web/e2e/notes.spec.ts | every other existing test in the file (unchanged) | REQ-1..REQ-4 of session-notes | Regression pins for the single-session flows | ran-green-at-authoring: `npm run e2e -- e2e/notes.spec.ts` after `make web-build build` -> 20 passed, 16 failed (the 16 are exactly the new-behaviour rows above) |

## Deleted Tests

None. Three existing tests were rewritten to the plan's new behaviour, as its "Existing tests this breaks" lists:

- Old E5 (`...saves the text to the first session, and the panel shows the second session's note`) is now E8: the save-to-A assertions are kept (`noteOnWire` for A and B), the "panel shows B's note" half is replaced by "no panel for B" plus "focusing A again shows A's panel with the typed text" (stronger, not weaker).
- E11 (`removing a session whose note panel is popped out ...`): "shows the next focused session's note in a panel" is replaced by "no panel", then the glyph opens B's anchored panel showing B's note (Pop out visible, Pop in absent); the removed-note-gone-from-state assertions are kept.
- The test named `click-away and the glyph leave a popped-out panel open ...`: `closeNoteButton(page).toHaveCount(0)` in the anchored form becomes `toBeVisible()`, because the plan adds Close to both forms.

Existing `E12` (reload one panel), `a new tab starts with the panel anchored ...` and the other pre-existing tests were checked against the plan and left as they are.

## Fixture Changes

No payload builders added. `web/e2e/helpers/notes.ts` gains, additively: `openInWindowButton`, `noteWindows`, `openNoteWindow`, the note-window locators (`windowRendered`, `windowEditor`, `windowStatus`, `windowEmptyLine`, `windowRemovedNotice`), `expectWindowReady`, `panelBox`, `panelBoxDiff`, `moveAndResizePanel`, `popOutFromGlyph`. Locators follow the plan's Testable UI Elements table (roles and names); the window's header is read from `body` text and the document title from `toHaveTitle`.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 | E1; E2; E8; E11 |
| REQ-2 | E1 |
| REQ-3 | E1 (reload); old-key test |
| REQ-4 | E2; E3; popped-out Open in window; E4 |
| REQ-5 | none here: render tests R4, R5 (drag and resize anywhere in the window, window resize) |
| REQ-6 | Close saves at once; keyboard Close |
| REQ-7 | keyboard test; render R7 owns the 260px header measure |
| REQ-8 | E3; popped-out Open in window; keyboard Open in window; blocked-storage test |
| REQ-9 | E5; render R9, R12 own the markup and edit-mode display |
| REQ-10 | E5 |
| REQ-11 | E6 (stopped); E6 (network failure); render R13 owns `connecting…` before `hello` |
| REQ-12 | E7; render R9 owns the unknown-id notice, unit W7 the malformed query |
| REQ-13 | blocked-storage test; render R8 |
| REQ-14 | E5 (window live in Tiles); render R10 owns the panel hiding |

## Handoff

- **Plan defect, edge case 9 / E6**: "Open in window while musterd is down: the window opens and reads `connecting…`". The note window's page is served by musterd, so with it stopped the popup cannot load; the browser shows its error page. E6 therefore stops musterd with the window already open, and the reload case aborts the PUTs instead of stopping the daemon (a connection-level failure, per kb:lesson/network-mode-covered-by-http-errors-only). `connecting…` before the first `hello` stays with render R13.
- **Storage-key oracle**: the plan names no key for the new per-tab memory, so E2's "B's place is gone from the tab's memory" scans the serialized session storage for B's distinctive width and height (A is resized differently); the test first asserts both numbers are present, so the oracle cannot pass vacuously. If web-impl stores rectangles rounded differently from `boundingBox()` floors, that precondition names it.
- **Bring to front** (REQ-8, V3) is not observable from Playwright; the second-press assertion is "no second page opens", the reviewer-verified V3 covers the front.
- No change needed to `playwright.config.ts`, `fixtures.ts`, `gatelock.ts` or `e2e-lint.sh`. No wire shape is synthesized beyond the existing enveloped `SessionStart`; no `/interface-probe` needed.

## Test Run Output

```
npx playwright test --list  ->  Total: 663 tests in 60 files
sh scripts/e2e-lint.sh      ->  e2e-lint: clean
live run of the whole notes.spec.ts (after make web-build build): 16 failed (the new-behaviour tests above), 20 passed (4.5m)
```

## Notes

- The two `muster.note-panel`-keyed assertions use the literal in a spec, which the plan's check C2 (`web/src` only) does not scan.
- New-behaviour tests are left red on purpose until the implementation exists.

## Validate Attempt 1

Rebuilt (`make web-build build`), ran `npm run e2e -- e2e/notes.spec.ts`: first run 35 passed, 1 failed (the known item below). After the repair: 36 passed; `npx playwright test --list` -> `Total: 663 tests in 60 files`; e2e-lint clean.

Soak (`make e2e-soak SPEC=e2e/notes.spec.ts N=10`): `360 passed (4.5m)`.

| File | Test Name | Requirement | Live run |
|------|-----------|-------------|----------|
| web/e2e/notes.spec.ts | all 36 tests (13 new, 3 rewritten, 20 unchanged) | REQ-1..REQ-15 as in the Tests table above | 36 passed; soak 360 passed (10x) |

## Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | text a note window could not save survives a reload of that window and reaches the daemon on reconnect (E6, REQ-11, network failure) | `expect(noteOnWire(...)).toBeNull()` after `win.reload()` received `"kept across the window's reload"` | The test blocked saves only with `context.route(...abort)`. REQ-9 requires a save when the page hides (pagehide/visibilitychange keepalive PUT), and the keepalive request issued during unload is not intercepted by the route, so it reached the daemon. The null assertion therefore did not model a network that is down; the product was right. | Kept the route abort and every assertion (null before reload, null after reload, status `unsaved, musterd unreachable` before and after, text on the daemon after reconnect). Added a fetch shim in the window (`win.evaluate` for the current document plus `win.addInitScript` for the reloaded one) that rejects `keepalive` PUTs with a `TypeError` (connection-level failure, not an error status), lifted by `win.evaluate` before `daemon.restart()`. An init script alone was tried first and still failed because it does not apply to the already-loaded document whose pagehide does the flush; measured: only after adding the `evaluate` did the test pass. | REQ-11: text the daemon has not acknowledged survives the window's own reload and is re-sent on reconnect with no further input; the unload flush's reaching a live daemon is REQ-9 behaviour, not contradicted. Not an absence-assertion weakening: the `toBeNull` checks are unchanged and now hold because the failure covers keepalive. Proven the shim is what makes the null checks hold: run before it was added failed at the post-reload `toBeNull` (received the text), after it passes (1 passed). |

No assertion was deleted, skipped, or weakened.

## Handoff (validate)

- None for implementation. Plan note: REQ-9 (save when the page hides) and REQ-11 (re-send after reload) interact: with a live daemon a reload delivers the text through the keepalive flush, so REQ-11's reload path is only observable when that flush also fails, which the repaired test arranges.

## Fix Attempt 1 (review cycle 1)

Issue fixed: Correctness Minor 1 `[e2e-specs]`, plus the unreachable-before-typing journey from Fix Attempt 2 of web-implementation.md.

Edits to `web/e2e/notes.spec.ts` (additions only, no assertion removed or weakened):
- stopped-daemon E6 test ("with musterd stopped, text typed in a note window shows the unsaved status…"): after the dashboard alert, before typing, `expect(windowStatus(win)).toHaveText("musterd unreachable")`. Green live.
- network-failure E6 test: after the `noteOnWire` poll, `expect(windowStatus(win)).toHaveText("")`, so the window's own re-send on reconnect is shown and not only the dashboard's. **Red live, twice**: the window's status stays `unsaved, musterd unreachable` after musterd is back and the daemon holds the text.

## E2E Implementation Bugs

| Bug | Route | Plan reference | Expected (per plan) | Actual | Failing test |
|-----|-------|----------------|---------------------|--------|--------------|
| A note window's "unsaved, musterd unreachable" status never clears when the dashboard tab's snapshot handler re-sends the shared draft first. `notessave.ts` `pump` returns early when `drafts.get(id)` is `undefined` (the dashboard's ack dropped the shared localStorage draft), so the window's `failedIds` entry is never cleared (read from `pump`/`acknowledge`/`setFailed`; not instrumented further). | `[web-impl]` | REQ-11: re-sent on reconnect, status clears once saved | status empty once the text is on the daemon | status stays `unsaved, musterd unreachable` for 15 s | text a note window could not save survives a reload of that window and reaches the daemon on reconnect (E6, REQ-11, network failure) |

Suggested fix for web-impl: in `pump`, when there is no draft for the id, clear the failed flag (`setFailed(id, false)`) before returning. The honest test is left failing. The stopped-daemon E6 test passes, probably because the window's resend wins that race, so it may be order-dependent.

## Repairs (fix 1)

None. No assertion was deleted, skipped, or weakened.

## Fix Attempt 2 (review cycle 1, wave 3)

Rebuilt (`make web-build build`, tree at 79810d6a plus the spec edit), then:

1. **Bug fix confirmed.** `npm run e2e -- e2e/notes.spec.ts`: `37 passed (3.1m)`. The network-failure E6 test ("text a note window could not save survives a reload of that window and reaches the daemon on reconnect (E6, REQ-11, network failure)") is green; no assertion in it was touched. The earlier implementation-bug row is resolved by 79810d6a.
2. **New coverage (Fix Attempt 3's mirror ordering)**, one new test in `web/e2e/notes.spec.ts`:

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/notes.spec.ts | the dashboard panel's unsaved status clears when the note window re-sends and acknowledges the shared draft first (E6, REQ-11, network failure) | REQ-11 | A note window and the dashboard panel are open for one session. Each page's own route aborts the note PUT (connection-level failure, daemon up). Only the window types, so the dashboard holds the text only as the shared localStorage draft. A daemon restart makes both tabs re-send on their snapshot; both fail; the dashboard panel reads `unsaved, musterd unreachable` and the daemon has no note. Then only the window's route is lifted and the window reloads: it re-sends, musterd holds the text, the window status is empty, and the dashboard panel's status (its own route still failing, so it never re-sends successfully) must clear to empty. | green: `37 passed (3.1m)` for the file |

   Journey: real click and keyboard typing in the window, daemon restart, window reload; the panel status is `noteStatus(page)` (the role `status` inside the dialog).

   **Proven red on the pre-fix code** in a throwaway tree, never the shared one: `git archive 79810d6a~1` extracted into the scratchpad, its own `npm run build` and `go build`, this spec copied in, run with `-g "dashboard panel's unsaved status clears|reaches the daemon on reconnect"`: `2 failed`. The new test fails on its last assertion: `Locator: getByRole('dialog', { name: 'Note', exact: true }).getByRole('status')`, `Expected: ""`, `Received: "unsaved, musterd unreachable"` — after the daemon-has-the-text poll and the empty window status had both passed, so only the dashboard panel is stuck. The network-failure E6 test also fails there (the original bug, at `windowStatus(win)`). Both are green at 79810d6a.
3. **Hygiene**: `npx playwright test --list` -> `Total: 664 tests in 60 files`; `make e2e-lint` -> `e2e-lint: clean`; `make web-lint` clean.
4. **Soak** (`make e2e-soak SPEC=e2e/notes.spec.ts N=10`). First soak: `369 passed`, `1 failed` — the pre-existing, untouched test "typing without leaving edit mode puts the text in the daemon's state within two seconds (E3, REQ-9)" missed its deliberate 2 s budget (`Received: null`) while `uptime` showed load averages of 37 / 22 / 15 from sibling worktrees (the gate lock serialises Playwright runs, not other processes). Its path (1 s autosave debounce plus one PUT inside 2 s) is not touched by this plan's changes; I did not raise the budget. Second soak at load ~11: `370 passed (5.3m)`, 0 failed. Judged environmental; if it recurs on a quiet machine it is a latency question for the implementation, not a locator.

## Repairs (fix 2)

None to existing tests. One test added; none deleted, renamed or weakened. No assertion was deleted, skipped, or weakened.

## Handoff (fix 2)

None. For the reviewer: the new test uses page-level `route` on the dashboard and the window (not `context.route`) so that only the window's re-send can succeed; the window's pagehide keepalive PUT on reload is not intercepted either way and, with the window's route lifted, is a real window-side save, which is the ordering under test.
