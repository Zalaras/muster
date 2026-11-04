# Correctness review: Popped-out note enhancements

**Plan**: popped-out-note-enhance
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 31552 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 per-session pop-out, one panel | Yes: `notes.ts` `renderPhase`/`stillWanted`, `focusChanged` closes | R1, R8, E1, E2, E8, E11 | pass |
| REQ-2 own rectangle per session | Yes: `places` map, `effectiveRect` | R1, E1 | pass |
| REQ-3 per-tab memory, old key ignored | Yes: `muster.note-places` via `safeSessionStorage`; `muster.note-panel` never read | W1, W2, W3, E1, old-key E2E | pass |
| REQ-4 pop in / close / window keep rect, Remove forgets | Yes: `closeByUser`, `popIn`, `openInWindow`; `withoutPlace` on `sessionRemoved`, `withoutAbsent` on snapshot | R2, R3, W5, E2, E3, E4 | pass |
| REQ-5 drag/resize anywhere in the window, clamped, 260×150 floor, default 360×300 | Yes: viewport-bounded `clampRect`/`dragRect`/`resizeRect`, `defaultPlacement` | R4 (partial, correctness Major 1), R5, R6, W4; edge case 3 untested (correctness Major 2) | fail |
| REQ-6 anchored Close saves at once, returns focus | Yes: `closeByUser` → `close(true)` → `editor.release()` flush | R11, E2E "Close on the anchored panel…" (700 ms bound), keyboard test | pass |
| REQ-7 three controls per form, inside at 260px | Yes: DOM order Pop out, Pop in, Open in window, Close | R7, 260×150 test | pass |
| REQ-8 Open in window: popup, close panel, focus existing, blocked keeps panel | Yes: `noteswindows.ts` `openOrFocus`, early return in `openInWindow` | W6 (seam), E3, popped-out window test | pass |
| REQ-9 note window content, no controls, Escape only leaves edit, title, theme | Yes: `notespage.ts`, `note.ts`, `note.html` | R9, R12, E5 | pass |
| REQ-10 window stays on its session, two-way sync | Yes: fixed `sessionId`, `adoptIncoming` via shared editor | E5 | pass |
| REQ-11 `connecting…`, unsaved status, kept text re-sent | Yes: `statusFor`, `saver.resend` on snapshot | R13, E6 ×2 (correctness Minor 1) | pass |
| REQ-12 removed notice, drafts dropped, unknown/malformed id | Yes: `markRemoved`, `parseNoteQuery`, `noteWindowWsHandlers` wires `sessionRemoved` | R9, W7, E7 | pass |
| REQ-13 storage unavailable | Yes: every access through `safeSessionStorage()`/`safeLocalStorage()` | R8, E2E blocked-storage test | pass |
| REQ-14 hidden in Tiles, window live in Tiles | Yes: `showsFor` requires `view === "focus"` | R10 (existing test, `notes-tiles` prefs), E5 | pass |
| DIAG | `kb:diagram/web-components` (every changed web file maps to it): third entry `note.ts`, its four edges, `features/` 48 modules (counted 48), `render/` 45 (counted 45), sessionStorage use all true | — | pass (one mislabelled phrase, correctness Minor 2) |

## Build & Tests

E2E tests: pass (663, full suite: the gate ran `make e2e-run SPECS=''`, no `NOTE e2e scope` line) · Daemon tests (race): pass (all packages ok) · Web tests: pass (3070 in 107 files) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues, biome clean) — all read from $GATES_LOG_DIR (`gates-c1`, 0 failed lines). Also green there: render-fixtures (106 scenarios up to date), render-lint, render-test (438 passed), contrast (54 pairs ×3 themes, 0 failures), features-inventory, versions, e2e-honest, kb check (662 records, 0 problems), e2e-lint, features-scope, comments, comment-ledger, size (0 hits), e2e-level (census only; `notes.spec.ts` not flagged).

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| W1 | `make web-build` | pass (04-web-build.log) |
| W2 | `make web-test` | pass (05-web-test.log, 3070 passed) |
| W3 | `make web-lint` | pass (09-web-lint.log) |
| R1 | `make render-test` | pass (08-render-test.log, 438 passed) |
| E1 | `make e2e` | pass (21-e2e.log, 663 passed) |
| C1 | `make check` | pass (22-C1.log) |
| C2 | `! grep -rn "muster.note-panel\"" web/src --include=*.ts --exclude=*.test.ts` | pass (23-C2.log empty, so grep matched nothing) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. Both proposed ADRs exist with `refs: plan:popped-out-note-enhance`. `notes-popout-per-session-anywhere-in-window` supersedes `notes-popout-hidden-in-tiles-geometry-per-tab`, and both ADRs describe what shipped. The logs carry no `deviation:` lines. The notes spec `web:` globs own `web/note.html` and `web/src/note.ts`. The `TODO.md` #112 tick waits for an approved `review.md`, as the orchestrate skill requires. Every Doc Delta "becomes true" line holds in the code. The web-impl `doc-delta:` line about the shared Close sentence is covered by the delta's first line ("Close, like the glyph, saves at once and returns focus"), and its CLAUDE.md half was resolved in Fix Attempt 1. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| V1 | no `any` in new web code | pass | `rg ': any\b\|as any\|<any>'` over `features/notes*.ts`, `note.ts`, `render/notespanel.ts`: no hits |
| V2 | `note.ts` only wires | pass | 22 lines: createApp, initTheme, initUpdateRestart, mountNotePage, tick, connection state, WsClient. It has no DOM lookup, listener or state and follows `doc.ts`'s order. `#note-host` is looked up in `notespage.ts` |
| V3 | Chrome popup without a tab strip; second press brings it to the front | pass (code read) | `window.open(url, "muster-note-<id>", "popup,width=520,height=460")` with no `noopener`, so the handle is kept. A second press calls `existing.focus()` while `!closed`. E3 proves no second page opens. Whether the window really comes to the front on screen cannot be measured headless and is left to review-browser |
| V4 | note window fills the window at 320×240 and 1200×900, body scrolls | pass (measured) | Scratch Chromium run of the built `note.html?session=3` with the `notes` fixture frames. At 320×240 the panel is `[0,0,320,240]`, `.bd` is 215px tall with scrollHeight 848 and `overflow-y: auto`, and the document is 320×240 (no page scroll). At 1200×900 the panel is `[0,0,1200,900]` with no document scroll. In both, 0 visible controls and title `Note · notes-long` |
| V5 | storage only through `safeSessionStorage()`/`safeLocalStorage()` | pass | `rg 'sessionStorage\|localStorage'` over the new and changed `src` files: no direct access. `notes.ts:57` and `notesedit.ts:33` use the accessors. The `note.html` hint script is the same guarded inline copy as `doc.html` |
| V6 | design-system § Note panel describes per-session pop-out, window bounds, three controls, note window | pass | `docs/design/design-system.md:333-346` (diff read) |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass: web-only change, no Claude Code format knowledge |
| 2 | Terminal-output state parsing | pass |
| 3 | Blocking hook handler | pass: no daemon change |
| 4 | Bare tmux / resize-pane | pass: none |
| 5 | Payload logging | pass |
| 6 | Empty-gauge dishonesty | pass: the note window reads `connecting…` before `hello`, never a blank "ok" |
| 7 | Session identity on `session_id` | pass: keyed on the Muster session id |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary | pass: E2E uses `launchNoted` with the stub |

## Issues

### Critical

None.

### Major

1. **[render-tests]** R4 is only partly asserted. The plan's R4 says the window is resized "to 800×600 and to 400×300" and that the panel stays "never smaller than 260×150 while the viewport allows". Both updated tests (`web/render/notes.spec.ts:300` and `:472`) resize only to 800×600 and 1440×900 and never assert the floor. So the shrink step of REQ-5 / edge case 2 ("moves in, then shrinks, never below 260×150") is never measured on screen. A fix must add the 400×300 step after the edge and corner resizes, and assert that the panel's box is inside the viewport and at least 260×150 there.
2. **[render-tests]** Edge case 3 and INV-2's "reload with a stored rectangle larger than the window, and focus switch to a session whose stored rectangle no longer fits" have no test. The plan maps edge case 3 to R5, but the R5 test (`web/render/notes-places.spec.ts:151`) only drags over the rail, masthead and header. `effectiveRect` (`web/src/features/notes.ts:86-90`) clamps on every show, so the code looks right; it is just never falsified. A fix needs a render test that pops out two sessions with one moved near the bottom-right of a 1440×900 window, then shrinks the viewport while the other is focused. It then focuses the moved session and reloads, and asserts after each step that the panel lies inside the viewport.

### Minor

1. **[e2e-specs]** The network-failure E6 test (`web/e2e/notes.spec.ts`, "text a note window could not save survives a reload… (E6, REQ-11, network failure)") ends on `noteOnWire(...) === "kept across the window's reload"` alone. Drafts live in shared `localStorage`, and the dashboard tab's snapshot handler re-sends every pending draft (`notes.ts:264-269`). That final poll therefore passes even if the window's own re-send on reconnect never happens. The sibling stopped-daemon E6 test pins the window's half with `windowStatus(win)` → `""`. Add the same assertion at the end of this test, so REQ-11's "re-sent … on reconnect" is shown for the window and not only for the dashboard.
2. **[orchestrator]** `docs/diagrams/web-components.md` (doc-upkeep commit `bffa0433`) describes the `features/` node's "three notes modules shared by the dashboard and the note window: notesedit, noteswindows, notespage". `notespage.ts` is imported only by `note.ts`; it is the note window's controller and is not shared. Reword that phrase to say `notesedit`/`noteswindows` are shared and `notespage` is the window's controller. The edges and counts are right.

### Notes

1. **[note]** The gate's E2E line ran the whole suite (`SPECS=''`, 663 tests), not a scoped list. That is more than the scope requires, and it is green.
2. **[note]** Plan defect, already handed off by e2e-specs: edge case 9 ("Open in window while musterd is down: the window opens and reads `connecting…`") cannot happen, because musterd serves `note.html`. `connecting…` before `hello` is covered by R13, and E6 opens the window before stopping musterd. Nothing in the Doc Delta claims the impossible half.
3. **[note]** Repairs row 1 is honest. Every `toBeNull()` check is kept, and the fetch shim rejects only `keepalive` PUTs with a `TypeError` (a connection-level failure, per kb:lesson/network-mode-covered-by-http-errors-only). It is lifted before the restart. No assertion was weakened.
4. **[note]** W6 is asserted at the seam (`noteswindows.test.ts`: blocked returns `false`), as the plan allowed. The "panel unchanged" half is the `return` at `notes.ts:194`, which I verified by reading it.
5. **[note]** The note window's `pagehide`/`visibilitychange` flush (`notesedit.ts:41-44`, `saver.flushAll`) sends every session's pending draft from the shared `localStorage`, not only its own session's. The text sent is the same text, so nothing is lost or reordered beyond last-write-wins. Recorded for review-maintainability's read of the shared `createNoteSaving`.
6. **[note]** The pack exceeds its budget (31552 of 30000 words); `kb` warned.
