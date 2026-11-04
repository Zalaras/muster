# Correctness review: Popped-out note enhancements

**Plan**: popped-out-note-enhance
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 31732 words (budget 30000)

Full review: cycle 1 had a browser Critical, so this is not a delta cycle. The cycle 1 issues of all
three parts are re-checked against `git diff 7f3a2629..HEAD` in the Delta table below.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 per-session pop-out, one panel | Yes: `notes.ts` `renderPhase`/`stillWanted`; `focusChanged` closes | R1, R8, E1, E2, E8, E11 | pass |
| REQ-2 own rectangle per session | Yes: `places` map, `effectiveRect` | R1, E1 | pass |
| REQ-3 per-tab memory, old key ignored | Yes: `muster.note-places` via `safeSessionStorage`; `muster.note-panel` never read (C2) | W1, W2, W3, E1, old-key E2E | pass |
| REQ-4 pop in / close / window keep the rectangle, Remove forgets it | Yes: `closeByUser`, `popIn`, `openInWindow`; `withoutPlace` on `sessionRemoved`, `withoutAbsent` on snapshot | R2, R3, W5, E2, E3, E4 | pass |
| REQ-5 drag/resize anywhere in the window, clamped, 260×150 floor, 360×300 default | Yes: viewport-bounded `clampRect`/`dragRect`/`resizeRect`, `defaultPlacement`. The gesture is now guarded by `liveGesture` (`notes.ts:63,229-249`, cleared in `close`), and `wireGesture` abandons a stale gesture on the next pointerdown (`notespanel.ts:114-135`) | R4 now steps to 400×300 and asserts ≥260×150 (`render/notes.spec.ts:368-373`); edge case 3 has its own test (`notes-places.spec.ts:327`); cut-short drag (`:399`); menu over panel (`:365`); R5, R6, W4 | pass |
| REQ-6 anchored Close saves at once, returns focus | Yes: `closeByUser` → `close(true)` → `editor.release()` flush | R11, E2E Close (700 ms bound), keyboard test | pass |
| REQ-7 three controls per form, inside at 260px | Yes: DOM order Pop out, Pop in, Open in window, Close | R7 (now polled until the boxes settle), 260×150 test | pass |
| REQ-8 Open in window: popup, close panel, focus existing, blocked keeps panel | Yes: `noteswindows.ts` `openOrFocus`, early return in `openInWindow` | W6 (seam), E3, popped-out window test | pass |
| REQ-9 note window content, no controls, Escape only leaves edit, title, theme | Yes: `notespage.ts`, `note.ts`, `note.html` | R9, R12, E5 | pass |
| REQ-10 window stays on its session, two-way sync | Yes: fixed `sessionId`, `adoptIncoming` via the shared editor | E5 | pass |
| REQ-11 `connecting…`, unsaved status, kept text re-sent; amended: `musterd unreachable` while reconnecting | Yes: `notesview.ts` `windowStatus` (failed save > reconnecting > connecting); `saver.resend` on snapshot; `notessave.ts` `stillFailed` and the no-draft clear in `pump` | R13, new render test for the reconnecting status in `--warn` (`notes-window.spec.ts:69`), `windowStatus` table (`notesview.test.ts`), 3 new `notessave.test.ts` cases, E6 ×2 (stopped daemon now asserts `musterd unreachable` before typing), new mirror-ordering E2E (`notes.spec.ts:1249`) | pass |
| REQ-12 removed notice, drafts dropped, unknown/malformed id | Yes: `markRemoved`; `parseNoteQuery` → shared `reader/query.ts` `parseSessionParam`; `noteWindowWsHandlers` wires `sessionRemoved` | R9, W7, `query.test.ts`, E7 | pass |
| REQ-13 storage unavailable | Yes: every access through `safeSessionStorage()`/`safeLocalStorage()` | R8, E2E blocked-storage test | pass |
| REQ-14 hidden in Tiles, window live in Tiles | Yes: `showsFor` requires `view === "focus"` | R10 (existing test, `notes-tiles` prefs), E5 | pass |
| DIAG | `kb:diagram/web-components` (`kb for` names it for every changed web file, `reader/query.ts` included). Cycle 1's wording fix is in. `features/` 48 (counted 48), `render/` 45 unchanged. **`reader/` says "11 modules" but it now has 12**, because `query.ts` was added in cycle 1's fix wave | — | fail (correctness Major 1, `[orchestrator]`) |

## Build & Tests

E2E tests: pass (664, full suite: the gate ran `make e2e-run SPECS=''` and there is no `NOTE e2e scope` line) · Daemon tests (race): pass (every package ok) · Web tests: pass (3101) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues, biome clean: 419 files). All read from `$GATES_LOG_DIR` (`gates-c2`, 0 failed lines). Also green there: render-fixtures (106 scenarios up to date), render-lint, render-test (442 passed), contrast (54 pairs ×3 themes, 0 failures), features-inventory, versions, e2e-honest, kb check (663 records, 0 problems), e2e-lint, features-scope (notes; Touches connection, reader, actions), comments, comment-ledger, e2e-level (census only). `19-size.log` has one `WARN` on `reader.ts` file length; that is review-maintainability's.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| W1 | `make web-build` | pass (04-web-build.log) |
| W2 | `make web-test` | pass (05-web-test.log, 3101 passed) |
| W3 | `make web-lint` | pass (09-web-lint.log) |
| R1 | `make render-test` | pass (08-render-test.log, 442 passed) |
| E1 | `make e2e` | pass (21-e2e.log, 664 passed) |
| C1 | `make check` | pass (22-C1.log) |
| C2 | `! grep -rn "muster.note-panel\"" web/src --include=*.ts --exclude=*.test.ts` | pass (23-C2.log is empty: grep matched nothing) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. All three proposed ADRs exist with `refs: plan:popped-out-note-enhance`. The new `notes-window-says-musterd-unreachable-while-reconnecting` describes what shipped (`windowStatus`, `--warn`, note still editable). There are no `deviation:` lines. Both `doc-delta:` lines are folded into `doc-delta.md`: "its Close control", and the reconnecting status. The optional design-system half of the second line is not folded in; see Note 3. The `TODO.md` #112 entry (line 195) stays open until an approved `review.md`. Every Doc Delta line, the folded ones included, holds in the code. "Draws below menus and hover popovers" holds: `.npanel` is 45, `.menu` 50, `.pop`/`.cardtip` 55, and nothing else is `position: fixed`. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| V1 | no `any` in new web code | pass | `rg ': any\b\|as any\|<any>'` over `features/notes*.ts`, `note.ts`, `render/notespanel.ts`, `reader/query.ts`, `connectionhealth.ts`: no hits |
| V2 | `note.ts` only wires | pass | Unchanged since cycle 1: 22 lines (createApp, initTheme, initUpdateRestart, mountNotePage, tick, connection state, WsClient). No DOM lookup, listener or state of its own |
| V3 | Chrome popup without a tab strip; a second press brings it to the front | pass (code read) | `window.open(url, "muster-note-<id>", "popup,width=520,height=460")` without `noopener`. A second press calls `existing.focus()` while `!closed`, and E3 proves no second page opens. Raising the window on screen cannot be seen headless; cycle 1's browser review measured the 520×460 popup |
| V4 | note window fills the window at 320×240 and 1200×900, body scrolls | pass (carried) | Measured in cycle 1. The only `style.css` change since then is `.npanel` `z-index` 55 → 45, which does not affect `.npanel.window` (`position: static`) |
| V5 | storage only through `safeSessionStorage()`/`safeLocalStorage()` | pass | `rg 'sessionStorage\|localStorage'` over the new and changed `src` files: no direct access |
| V6 | design-system § Note panel describes per-session pop-out, window bounds, three controls, note window | pass | `docs/design/design-system.md:325-346` |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass: web-only change (`git diff --stat main...HEAD -- internal cmd` is empty); no Claude Code format knowledge |
| 2 | Terminal-output state parsing | pass |
| 3 | Blocking hook handler | pass: no daemon change |
| 4 | Bare tmux / resize-pane | pass: none |
| 5 | Payload logging | pass |
| 6 | Empty-gauge dishonesty | pass: the note window shows `connecting…` before `hello` and `musterd unreachable` while reconnecting; it never shows a blank status for a socket that is down |
| 7 | Session identity on `session_id` | pass: keyed on the Muster session id |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary | pass: E2E uses `launchNoted` with the stub |

## Delta (delta re-review only)

This is not a delta cycle. Every cycle 1 issue was checked anyway:

| Prior issue | Fix commit | Verified how |
|-------------|------------|--------------|
| cycle 1 correctness Major 1 `[render-tests]` R4 never steps to 400×300 or asserts the floor | `060357f4` | `render/notes.spec.ts:368-373`: 400×300, inside the viewport, width ≥ 259.25, height ≥ 149.25 |
| cycle 1 correctness Major 2 `[render-tests]` edge case 3 untested | `060357f4` | `notes-places.spec.ts:327`: pops out two sessions and moves one to the corner at 1440×900, shrinks to 700×500 while the other session is focused, focuses the moved one, then reloads; checks it lies inside the window after each step |
| cycle 1 correctness Minor 1 `[e2e-specs]` network-failure E6 does not pin the window's half | `feaf27fa` | `windowStatus(win)` → `""` added at `notes.spec.ts:1246`. Since `79810d6a` that assertion alone no longer isolates the window's own re-send (Note 1); the new mirror test does |
| cycle 1 correctness Minor 2 `[orchestrator]` diagram calls `notespage` shared | `83e361da` | the phrase now reads "three notes modules beside notes.ts … notespage (the note window's controller)" |
| cycle 1 browser Critical 1 `[web-impl]` note window silent on daemon-down | `3f3d05bf` (+ plan amendment, ADR `83e361da`) | `windowStatus` returns `musterd unreachable`/`warn` for `reconnecting`. Pinned by the render test `notes-window.spec.ts:69` (text plus `--warn` colour, note still shown and editable) and by the stopped-daemon E6 at `notes.spec.ts:1171` |
| cycle 1 browser Major 1 `[web-impl]` card menu under the popped panel | `3f3d05bf` | `.npanel` z-index 45 < `.menu` 50 < `.pop`/`.cardtip` 55. Render test `notes-places.spec.ts:365` checks that every menu item is the hit target at its centre while the menu overlaps the panel |
| cycle 1 maintainability Major 1 `[web-impl]` stale gesture writes another session's place | `3f3d05bf` | `liveGesture` identity guard on `update`/`end`, cleared in `close()`, declared beside `places`. `wireGesture` abandons the previous gesture. Render test `notes-places.spec.ts:399` |
| cycle 1 maintainability Major 2 `[web-impl]` duplicate `?session=` parse | `3f3d05bf` | `reader/query.ts` `parseSessionParam`, called by `parseStandaloneQuery` and `parseNoteQuery`. `query.test.ts` runs both over one case table |
| cycle 1 maintainability Minor 1 inline `"warn" \| "info"` | `3f3d05bf` | `WindowStatus.kind: StatusKind` |
| cycle 1 maintainability Minor 2 third `connecting…` literal | `3f3d05bf` | `CONNECTING_WORD` exported from `connectionhealth.ts`; `notespage.ts`'s literal is gone |
| cycle 1 maintainability Minor 3 removed-notice text in the render module | `3f3d05bf` | `REMOVED_NOTICE_TEXT` moved to `notesview.ts`; `showRemovedNotice(refs, text)` |

## Issues

### Critical

None.

### Major

1. **[orchestrator]** The `kb:diagram/web-components` fence is stale for `reader/`. It reads `Component(reader, "reader/", "11 modules", …)`. Cycle 1's fix wave added `web/src/reader/query.ts`, so the directory now has 12 non-test modules: find, freshness, frontmatter, markdown, memory, mermaid, notice, paths, query, slug, tree, zoom. On `main` it had 11. `go tool kb for web/src/reader/query.ts` names this diagram. The `Rel(features, reader, "markdown, tree")` label also leaves out the new use (the shared session-query parse, used by `noteswindows`). A fix must make the count 12 and, if the edge label is meant to list every use, add the query parse. Doc upkeep, so it does not block approval.

### Minor

1. **[orchestrator]** The plan's Testable UI Elements row "Panel / window status" lists `` (empty), `connecting…` or `unsaved, musterd unreachable``. The cycle 1 States amendment added a fourth status for the window, `musterd unreachable`. Specs and code assert it (`notes-window.spec.ts:86`, `notes.spec.ts:1171`, `notesview.test.ts`), but the table that names the asserted strings does not. A fix adds `musterd unreachable` (window only, while reconnecting) to that row, matching the States amendment.

### Notes

1. **[note]** Since `79810d6a`, `failed(id)` is true only while some host still keeps a draft (`stillFailed`). So the network-failure E6's last assertion, `windowStatus(win)` → `""` (`notes.spec.ts:1246`), would pass even if the window never re-sent, because the dashboard's re-send drops the shared draft. The window's own re-send is still pinned by the new mirror test (`notes.spec.ts:1249`). There, only the window's route is lifted, and the dashboard panel's status can clear only once some host has acknowledged and dropped the shared key. The page being unloaded cannot do that, so it must be the reloaded window's snapshot re-send. That is the same `app.on("snapshot")` handler a reconnect runs. Coverage of REQ-11's window half holds; it now rests on that test.
2. **[note]** `stillFailed` changes REQ-11's "until a save succeeds" from "until this host's save succeeds" to "until any host's save of the shared draft succeeds". A host that still holds its own typed text stays `unsaved` (unit-tested). This matches kb:adr/notes-unsaved-text-kept-in-browser-until-acknowledged and needs no doc delta.
3. **[note]** `docs/design/design-system.md` § Note panel lists the note window's `connecting…` status but not the amended `musterd unreachable` (`--warn`) status. It also does not say that the popped panel draws below menus and popovers. Neither sentence there is false. web-impl's second `doc-delta:` line marked the design-system half as optional, and doc-reconcile does not touch `docs/design/`.
4. **[note]** For review-maintainability: `notesview.ts` (notes) now imports `CONNECTING_WORD` from `connectionhealth.ts` (connection's pure helper), and `noteswindows.ts` (notes) imports `reader/query.ts`. The hand-written part of `web/src/reader/CLAUDE.md` neither lists `query.ts` nor names notes as a user. web-impl says it left the file alone because of its word budget.
5. **[note]** `render-tests.md` and `web-tests.md` record nothing of the cycle 1 fix wave (`060357f4`, `950cdab5`, `958555bd`). Their counts, 438 and 3070, are cycle 1's. The tests themselves are in the gate run and green (442 render, 3101 web). Only the logs are stale.
6. **[note]** During an update restart, the note window will briefly read `musterd unreachable` in `--warn`, where the dashboard's banner reads updating, until `initUpdateRestart` reloads it. `windowStatus` sees only `ConnectionStatus`, not the restart override. The plan does not cover this, and it lasts only seconds.
7. **[note]** The gate's E2E line ran the whole suite (`SPECS=''`, 664 tests), not a scoped list. That is more than the scope requires, and it is green. The flake test-specs.md recorded in its first soak, "typing without leaving edit mode… within two seconds", was not repaired, so there is no soak for me to run. The second soak was 370/370.
8. **[note]** The pack exceeds its budget (31732 of 30000 words); `kb` warned.
