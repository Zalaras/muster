# E2E Test Specs: Session notes

**Plan**: session-notes
**Mode**: fix (attempt 4, review cycle 3)
**Pack**: kb: pack 29443 words (budget 30000)
**Verdict**: pass
**Tests created**: 23 (21 + 2 blocked-storage tests in fix wave 4)
**Live run**: 23/23 passing after review cycle 3's fix wave (`npx playwright test e2e/notes.spec.ts`: `23 passed (14.6s)`; soak N=5: `115 passed (1.2m)`); at validate, 21/21 (`npm run e2e -- e2e/notes.spec.ts`: `21 passed (18.2s)`; soak `make e2e-soak SPEC=e2e/notes.spec.ts N=10`: `210 passed (2.2m)`). Authoring-time note: no regression pins exist; the file was run once against the current tree to prove every test is red for the right reason (21 failed: 13 on `note PUT failed: 404`, 8 on the missing `Note` glyph in `#mainhead`)

## Tests

At authoring all rows were `collection-only` (now green, see Live run): every test asserts new behaviour (the `PUT …/note` endpoint, the header glyph, the panel), so each fails today. The filtered live run found no test that passes against the current tree, so there is no `ran-green-at-authoring` pin. `npx playwright test --list`: `Total: 635 tests in 59 files` (21 in `notes.spec.ts`); `sh scripts/e2e-lint.sh`: `e2e-lint: clean`; `npx tsc --noEmit`: clean.

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/notes.spec.ts | typing a note and leaving edit mode turns the glyph foreground and shows the rail marker, and a reload shows the same text rendered (E1, …) | E1, REQ-6, REQ-7, REQ-8, REQ-18 | Glyph click, empty-note line, typed markdown, Escape renders it (heading, no `##`), glyph computes `--fg`, rail marker appears, `GET /api/state` carries the text, reload shows it rendered | ran-green at validate 1 — 21 passed (18.2s); soak N=10: 210 passed (2.2m) |
| web/e2e/notes.spec.ts | clearing a note's text to whitespace turns the glyph muted, removes the rail marker and stores null (E2, …) | E2, REQ-2, REQ-6, REQ-18 | Select-all, delete, type spaces and Enter, Escape: glyph leaves `--fg`, marker gone, state `note: null` | ran-green at validate 1 — 21 passed (18.2s); soak N=10: 210 passed (2.2m) |
| web/e2e/notes.spec.ts | typing without leaving edit mode puts the text in the daemon's state within two seconds (E3, REQ-9) | E3, REQ-9 | Autosave while the editor is still focused; poll shortened to 2 s with a comment | ran-green at validate 1 — 21 passed (18.2s); soak N=10: 210 passed (2.2m) |
| web/e2e/notes.spec.ts | typing and reloading at once keeps every character after the reload (E4, REQ-9, REQ-10) | E4, REQ-9, REQ-10 | Reload straight after the last keystroke; the full text reaches musterd and the panel | ran-green at validate 1 — 21 passed (18.2s); soak N=10: 210 passed (2.2m) |
| web/e2e/notes.spec.ts | with the panel popped out, typing and then focusing another session saves the text to the first session, and the panel shows the second session's note (E5, …) | E5, REQ-9, REQ-15, INV-4 | Two sessions; typing in A's popped panel then clicking B's card: A's wire note is the text, B's untouched, panel shows B's note and title | ran-green at validate 1 — 21 passed (18.2s); soak N=10: 210 passed (2.2m) |
| web/e2e/notes.spec.ts | focusing another session closes an anchored panel (REQ-15) | REQ-15 | Anchored panel closes and `aria-expanded` resets on a focus change | ran-green at validate 1 — 21 passed (18.2s); soak N=10: 210 passed (2.2m) |
| web/e2e/notes.spec.ts | a note survives Stop and Resume, and is readable and editable on the ended session (E6, …) | E6, REQ-4, edge case 4 | End, glyph still foreground on the dead surface, edit the ended session's note, Resume keeps it | ran-green at validate 1 — 21 passed (18.2s); soak N=10: 210 passed (2.2m) |
| web/e2e/notes.spec.ts | a note survives a musterd restart for a live session and for one whose pane died while musterd was down, readable and editable after a reload (E6, …) | E6 (amended), REQ-4, edge cases 3, 4 | `daemon.restart()` live keeps the note; then `daemon.kill()`, `killTmuxWindow`, restart: the session is ended (`alive: false`), glyph foreground, the note still reads, and an edit saves | ran-green at validate 1 — 21 passed (18.2s); soak N=10: 210 passed (2.2m) |
| web/e2e/notes.spec.ts | an edit saved in one window shows without a reload in a second window whose panel is open and not editing (E7, …) | E7, REQ-21, edge case 22 | Second browser context; window B saves, window A's open view-mode panel updates in place | ran-green at validate 1 — 21 passed (18.2s); soak N=10: 210 passed (2.2m) |
| web/e2e/notes.spec.ts | a window that is editing keeps its own text when another window saves, and its next save wins (REQ-21, last write wins) | REQ-21 | Editing window keeps `mine` after B saves `theirs`; its next keystrokes win on the wire and in B's panel | ran-green at validate 1 — 21 passed (18.2s); soak N=10: 210 passed (2.2m) |
| web/e2e/notes.spec.ts | with musterd stopped, typing shows the unsaved status and keeps the text, and after musterd restarts the note saves without any action and a reload shows it (E8, …) | E8, REQ-10, REQ-11 | `daemon.kill()`, typing, `role=status` reads `unsaved, musterd unreachable`, restart clears it and saves, reload shows it | ran-green at validate 1 — 21 passed (18.2s); soak N=10: 210 passed (2.2m) |
| web/e2e/notes.spec.ts | with the panel popped out, clicking the terminal and typing leaves the panel open and the typed text reaches the pane (E9, REQ-12) | E9, REQ-12 | Click-away into the terminal, keyboard typing echoes through the stub pane, panel stays popped | ran-green at validate 1 — 21 passed (18.2s); soak N=10: 210 passed (2.2m) |
| web/e2e/notes.spec.ts | with the panel popped out and the terminal focused, Escape reaches the terminal and leaves the panel open (E10, …) | E10, REQ-23, INV-2 | `WsByteRecorder` sees one raw ESC frame on `/ws/terminal/`; panel still popped out after a hold | ran-green at validate 1 — 21 passed (18.2s); soak N=10: 210 passed (2.2m) |
| web/e2e/notes.spec.ts | removing a session whose note panel is popped out shows the next focused session's note, and the removed note is gone from the state (E11, edge case 9) | E11, REQ-15, edge case 9 | Remove through the confirm dialog; popped panel shows the survivor's note; no trace of the removed note in `GET /api/state` | ran-green at validate 1 — 21 passed (18.2s); soak N=10: 210 passed (2.2m) |
| web/e2e/notes.spec.ts | removing the only session closes a popped-out panel (REQ-15, edge case 9) | REQ-15 | With no session focused the popped panel closes | ran-green at validate 1 — 21 passed (18.2s); soak N=10: 210 passed (2.2m) |
| web/e2e/notes.spec.ts | a popped-out panel reloads popped out at the same position and size (E12, REQ-13, REQ-16) | E12, REQ-13, REQ-16 | Real header drag and corner resize, reload, same rectangle within 1 px, still the popped form | ran-green at validate 1 — 21 passed (18.2s); soak N=10: 210 passed (2.2m) |
| web/e2e/notes.spec.ts | a new tab starts with the panel anchored at its default form even when another tab popped it out (REQ-16) | REQ-16 | Second tab in the same context opens anchored (Pop out present, Pop in absent) | ran-green at validate 1 — 21 passed (18.2s); soak N=10: 210 passed (2.2m) |
| web/e2e/notes.spec.ts | click-away and the glyph leave a popped-out panel open, Pop in returns it to the anchored form, and Escape inside the panel closes it (REQ-7, REQ-12) | REQ-7, REQ-12 | Popped panel survives a terminal click and the glyph; Pop in anchors it; Escape with focus inside closes it | ran-green at validate 1 — 21 passed (18.2s); soak N=10: 210 passed (2.2m) |
| web/e2e/notes.spec.ts | the glyph keeps focus and node identity across a tick, and a real Enter opens the panel without dropping focus to the page (REQ-6, REQ-7) | REQ-6, REQ-7 | Tagged glyph keeps `activeElement` over a >1 s tick, Enter opens, node and `aria-expanded` survive a tick | ran-green at validate 1 — 21 passed (18.2s); soak N=10: 210 passed (2.2m) |
| web/e2e/notes.spec.ts | Pop out, Pop in and Close work from the keyboard and leave focus in the panel across a tick (REQ-12) | REQ-12 | Each header control focused and activated with Enter or Space; focus stays inside the panel across ticks; Close removes the panel | ran-green at validate 1 — 21 passed (18.2s); soak N=10: 210 passed (2.2m) |
| web/e2e/notes.spec.ts | the editor keeps focus, node identity and its text across render ticks and a session upsert while typing (REQ-8, REQ-9) | REQ-8, REQ-9 | Tagged textarea stays focused with its text over ticks and a `UserPromptSubmit` upsert; the final text reaches musterd | ran-green at validate 1 — 21 passed (18.2s); soak N=10: 210 passed (2.2m) |

## Deleted Tests

None (new spec file; no existing spec rewritten).

## Fixture Changes

- `web/e2e/helpers/notes.ts` (new): locators from the plan's Testable UI Elements rows (glyph, `Note` dialog, `Note text` textbox, `status`, Pop out / Pop in / Close buttons, empty-note line), the card marker by its visually hidden `Has a note`, `putNoteViaApi`, `noteOnWire`, `activeElementInsideNotePanel`, `dragPointer`.
- `web/e2e/helpers/session.ts`: `SessionObject` gains `note: string | null` (the plan's "Existing tests this breaks" e2e-specs row).
- Payloads: no new builders. The note has no Claude Code source (INV-1), so the only hook shapes used are the existing `envelopedSessionStart` and `rawUserPromptSubmit` builders (synthesized from their measured captures); nothing new on the wire was invented.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| E1 | typing a note and leaving edit mode … (E1) |
| E2 | clearing a note's text to whitespace … (E2) |
| E3 | typing without leaving edit mode … (E3) |
| E4 | typing and reloading at once … (E4) |
| E5 | with the panel popped out, typing and then focusing another session … (E5) |
| E6 (amended) | a note survives Stop and Resume …; a note survives a musterd restart for a live session and for one whose pane died while musterd was down … |
| E7 | an edit saved in one window shows without a reload …; a window that is editing keeps its own text … |
| E8 | with musterd stopped, typing shows the unsaved status … |
| E9 | with the panel popped out, clicking the terminal and typing … |
| E10 | with the panel popped out and the terminal focused, Escape … |
| E11 | removing a session whose note panel is popped out …; removing the only session closes a popped-out panel |
| E12 | a popped-out panel reloads popped out at the same position and size; a new tab starts … |
| REQ-6, REQ-7 (journey half) | the glyph keeps focus and node identity …; click-away and the glyph … |
| REQ-8, REQ-9 | E1, E3, E4, E5, the editor keeps focus … |
| REQ-10, REQ-11 | E4, E8 |
| REQ-12 | E9, E10, click-away and the glyph …, Pop out, Pop in and Close … |
| REQ-15 | E5, focusing another session closes an anchored panel, E11, removing the only session … |
| REQ-16 | E12 and the new-tab test |
| REQ-21 | E7 and the editing-window test |
| REQ-23 / INV-2 | E10 |
| INV-4 | E5 |
| REQ-1 to REQ-5, REQ-13/14 (clamp), REQ-17 to REQ-20, REQ-22 | not E2E: daemon logic (D1 to D8), render tier (R1 to R13) and unit tests own them; E1 to E4 exercise REQ-1 and REQ-2 on the live wire |

## Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | a note survives a musterd restart for a live session and for one whose pane died while musterd was down, readable and editable after a reload (E6, REQ-4, edge cases 3 and 4) (was "…live and ended…") | Amendment-driven, not a red run (web-impl's smoke run measured it red): the second half ended the session and then restarted, asserting an already-ended row still shows after the restart | The assertion encoded behaviour the plan never required and that contradicts the accepted reconcile rule (an already-ended row is swept at the next start, kb:adr/lifecycle-reconcile-converges-with-the-socket); the orchestrator amended E6 in `plan.md` and recorded the decision in kb:adr/notes-ended-row-sweep-takes-its-note | Live-restart half kept as is. End-then-restart half replaced by a pane death while musterd is down: `daemon.kill()`, `daemon.killTmuxWindow(session.tmuxTarget)` on the test's own socket, `daemon.restart()`, reload; asserts the end cap, state `alive: false` with `note` equal to the text, glyph at `--fg`, the panel reads the note, and a real click-edit-Escape saves a new text to the wire | E6 as amended, REQ-4 (note survives while reconcile keeps the row), edge cases 3 and 4: the ended session's note is readable and editable after a restart. Strictly stronger on the ended half than before: it adds the `alive: false` state, glyph colour and an edit round-trip |

No assertion was deleted, skipped, or weakened. The one assertion replaced was replaced by the plan's amended criterion (kb:adr/notes-ended-row-sweep-takes-its-note), as the orchestrator directed.

## E2E Implementation Bugs

None.

## Handoff

For web-impl (assumptions the specs encode, none of them pinned by the plan; a mismatch at validate is a locator repair unless it contradicts the plan):

1. **Glyph colour**: the specs read the computed `color` of the `button[aria-label="Note"]` itself and compare it to `--fg` resolved on a probe (foreground) or assert it is *not* that colour (muted). If the colour is carried by the SVG's `stroke` or an inner element, `currentColor` on the button satisfies both.
2. **Edit entry**: the specs enter edit mode by clicking the empty-note line (empty note) or the note's rendered text, so the whole body must be the click target (REQ-8).
3. **Popped-out default position**: the specs click the terminal near its bottom-left (24 px in) as the "click away" so the panel's default corner cannot intercept the click. A default rectangle that covers the terminal's bottom-left would fail E9, E10 and the REQ-12 test.
4. **Resize and drag**: the E12 test drags the header 24 px right and 12 px down from the dialog's top-left (left of the right-hand controls), and resizes from 2 px inside the bottom-right corner. Handles narrower than that need a locator repair, or the handle's extent stated in the plan.
5. **Persisted form**: E12 expects a popped-out panel to be **open** after a reload (the plan says "reloads popped out"), and a second tab to show no panel until the glyph is clicked.
6. **Focus after activation**: the focus tests assert only that focus never falls to `<body>` — it is on the glyph or inside the dialog after Enter, and inside the dialog after each header-control key. The plan does not say where focus lands after the glyph opens the panel.
7. **Escape oracle (E10)**: one raw `0x1b` frame on `/ws/terminal/` via `WsByteRecorder`. A stub pane cannot show an Escape in its text, so the wire byte is the evidence the key reached the terminal.
8. **Marker**: located as `getByText("Has a note")` inside the card and counted (`toHaveCount(0|1)`), never `toBeVisible`, because the text is visually hidden.

No `/interface-probe` needed: the only Claude Code shapes used are the existing `SessionStart` and `UserPromptSubmit` builders. No change is needed to `playwright.config.ts`, `fixtures.ts`, `gatelock.ts` or `e2e-lint.sh`.

Not covered by E2E, on purpose: the marker hover (R5), the glyph's colour at every header width (R1, R2), the unsaved status colour (R8) and undo or redo (R12) are render properties.

## Test Run Output

```
npx playwright test --list            -> Total: 635 tests in 59 files
sh scripts/e2e-lint.sh                -> e2e-lint: clean
npx playwright test e2e/notes.spec.ts -> 21 failed (against the current tree, as expected)
  13 x  note PUT failed: 404 404 page not found
   8 x  waiting for locator('#mainhead').getByRole('button', { name: 'Note', exact: true })
```

## Notes

- Fixture plan honoured: `daemon` per test throughout; the E7 tests open the second window in `browser.newContext()` so the two windows do not share local-storage drafts.
- E3's 2 s poll is the one shortened timeout, commented in the spec; no timeout is raised anywhere. Fixed holds are `settleFor` only, each over a stays-unchanged check.
- Rebuilt with `make web-build build` before the red run.

## Validate attempt 1

- Rebuilt with `make web-build build` (`go build ... -o bin/musterd` ran after `built in 1.93s`).
- `npx playwright test --list`: `Total: 635 tests in 59 files` (unchanged: the repaired test was retitled, not added or removed). `sh scripts/e2e-lint.sh`: `e2e-lint: clean`.
- Run 1 of `npm run e2e -- e2e/notes.spec.ts`: `21 passed (18.2s)`; no locator repair was needed (the authoring handoff's eight assumptions all held against the built markup).
- Soak: `make e2e-soak SPEC=e2e/notes.spec.ts N=10` -> `210 passed (2.2m)`; a further N=3 run printed no SIGTERM escalation.
- Observation, not a failure: in the first (non-soak) run the E8 test's `daemon.kill()` printed the harness's `scratch musterd did not exit within 5s of SIGTERM; escalating to SIGKILL` warning once (daemon log ended at `leaving live sessions running count=1`). It did not recur in the N=3 re-run; the N=10 soak's full output was not scanned for it. If the reviewer sees it again it points at graceful shutdown with a connected dashboard, not at this spec.
- No other spec file was authored or changed by this plan, so no other soak applies; `web/e2e/helpers/session.ts` and `helpers/notes.ts` were not touched in this attempt.

## Fix Attempt 4 (review cycle 3)

**Mode**: fix. No issue is tagged `[e2e-specs]`; this is the coverage for the behaviour `## Fix Attempt 4` of `web-implementation.md` added (theme and reader read storage through `safeLocalStorage()`), requested by review.cycle3.md browser note 3 and the decision `review-cycle-exhaustion-theme-storage` (remove-while-blocked assertion beside the reconnect journey).

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/notes.spec.ts | with browser storage blocked, text typed while musterd is down is sent again after it restarts with no further input, and the unsaved status clears (REQ-10, REQ-11, review cycle 3) | REQ-10, REQ-11 | init script makes `window.localStorage` and `sessionStorage` getters throw before load; type with musterd killed, restart, banner clears, status clears, `GET /api/state` carries the text with no further keystroke, `pageerror` list empty | red pre-fix, green now |
| web/e2e/notes.spec.ts | with browser storage blocked, removing a session with another present takes it out of the rail and raises no page error (REQ-15, edge case 9, review cycle 3) | REQ-15, edge case 9 | same blocked storage, two sessions; Remove through the dialog; card leaves the rail, survivor stays and takes the Focus header with its note intact, state lacks the removed session, `pageerror` list empty | red pre-fix, green now |

**Red against the pre-fix build.** Built `6c815fff^` (ce0c8778) in a throwaway `git worktree add --detach` under the scratchpad (`make web-build build` there, spec copied in), ran the two tests, then removed the worktree (`git worktree list` shows only the primary tree):

```
✘ removing a session with another present ... : expect(pageErrors).toEqual([])  Received ["storage is blocked" x3]
✘ text typed while musterd is down ... : expect(noteStatus).toHaveText("")  Received "unsaved, musterd unreachable" (15000ms)
2 failed
```

**Green on the current tree** (`make web-build build`, then from `web/`):

- `npx playwright test e2e/notes.spec.ts -g "browser storage blocked"`: `2 passed (5.4s)`
- `npx playwright test e2e/notes.spec.ts`: `23 passed (14.6s)`
- `make e2e-soak SPEC=e2e/notes.spec.ts N=5`: `115 passed (1.2m)`
- `npx playwright test --list`: `Total: 637 tests in 59 files`

**Fixture Changes**: none to `web/e2e/helpers/`; the blocking init script and the `pageerror` collector are one local function (`blockStorageAndCollectErrors`) in `notes.spec.ts`.

**Repairs**: none; no existing test or assertion was edited. No assertion was deleted, skipped, or weakened.

**Verdict**: pass

**Handoff**: the Vitest assertion for `writeThemeHint` with a throwing `localStorage` global (web-impl's handoff) is web-tests' file, not e2e-specs'; not added here.
