# Maintainability review: Popped-out note enhance

**Plan**: popped-out-note-enhance
**Verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 11483 words (budget 30000)
**Scope**: 18 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (web only). This is a full cycle, not a delta, because cycle 1 had Majors. I re-read every file the fix waves touched since `review_commits[1]` (`7f3a2629..HEAD`: connectionhealth.ts, notes.ts, notespage.ts, notessave.ts, notesview.ts, noteswindows.ts, reader.ts, reader/query.ts, render/notespanel.ts, style.css). The other eight files have no change since 7f3a2629, so their cycle-1 rows carry forward as written.

## Prior cycle

| Cycle-1 issue | Fix commit | Verified how | Result |
|---|---|---|---|
| Major 1: a stale gesture writes `places` | 3f3d05bf | `notes.ts:63` declares `liveGesture` beside `places`. `update`/`end` (`:234,:243`) return unless `liveGesture === gesture`. `close()` clears it (`:176`). `beginGesture` returns a no-op unless popped (`:229`). `wireGesture` ends the surface's previous gesture on a new pointerdown (`notespanel.ts:114-135`). After a close, a stale gesture no longer writes, and the id it would write is always the one that began. | fixed for close; one path out of `popped` is not covered (Minor 1) |
| Major 2: duplicate `?session=` parse | 3f3d05bf | `rg -n 'get\("session' web/src --glob '!*.test.ts'` → only `web/src/reader/query.ts:2`. `reader.ts:83` and `noteswindows.ts:25` both call `parseSessionParam`. | fixed |
| Minor 1: inline `"warn" \| "info"` | 3f3d05bf | `notesview.ts:17-20` `WindowStatus.kind: StatusKind` comes from `render/notespanel.ts:43`. A pure feature module importing a render type has precedent (`connectionhealth.ts:2`, `updateview.ts:8`). | fixed |
| Minor 2: third `"connecting…"` literal | 3f3d05bf | `connectionhealth.ts:4` exports `CONNECTING_WORD`, which `notesview.ts:3,25` uses. The reader's own copy stays (that was optional). | fixed |
| Minor 3: removed-notice text in render | 3f3d05bf | `REMOVED_NOTICE_TEXT` moved to `notesview.ts:7`. `showRemovedNotice(refs, text)` takes it as an argument (`notespanel.ts:225`). The `design:` line states why this differs from `render/reader.ts` importing `reader/notice.ts`: render must not import `features/`. | fixed |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| web/src/app.ts | (cycle 1) | yes (`applyRemoved`) | none | pass, unchanged since cycle 1 |
| web/src/wsapp.ts | (cycle 1) | covered by `applyRemoved` | none | pass, unchanged since cycle 1 |
| web/src/note.ts | (cycle 1) | yes | none | pass, unchanged since cycle 1 |
| web/src/features/actions.ts | (cycle 1) | yes | none | pass, unchanged since cycle 1 |
| web/src/features/CLAUDE.md | (doc) | Fix Attempt 1 | n/a | pass, unchanged since cycle 1 |
| web/src/features/connectionhealth.ts | notesview.ts, reader/notice.ts | Fix Attempt 2 (`CONNECTING_WORD`) | none | pass, Note 3 |
| web/src/features/notes.ts | notesedit.ts, notespanelstate.ts, render/notespanel.ts | yes (guard identity, declared beside `places`) | none | Minor 1 |
| web/src/features/notesedit.ts | (cycle 1) | yes | none | pass, unchanged since cycle 1 |
| web/src/features/notesgeometry.ts | (cycle 1) | n/a | none | pass, unchanged since cycle 1 |
| web/src/features/notespage.ts | reader.ts `mountStandaloneReader`, notes.ts | yes | none | pass |
| web/src/features/notespanelstate.ts | (cycle 1) | yes | none | pass, unchanged since cycle 1 |
| web/src/features/notessave.ts | notesdrafts.ts, notesedit.ts, notes.ts/notespage.ts (`failed` callers) | yes (Fix Attempt 3, `stillFailed`) | none | pass, Note 1 |
| web/src/features/notesview.ts | connectionhealth.ts, reader/notice.ts, updateview.ts | yes (Fix Attempt 2) | none | pass, Note 2 |
| web/src/features/noteswindows.ts | reader.ts, reader/query.ts | yes (W6 seam) | none | pass |
| web/src/features/reader.ts | reader/query.ts, noteswindows.ts | yes (`query.ts` line) | filelen 707, no reason given | Note 4 |
| web/src/reader/query.ts | reader/slug.ts (the exemplar), reader/notice.ts, sessions/paths.ts | yes (`query.ts` in `reader/`) | none | pass, Note 5 |
| web/src/render/notespanel.ts | render/reader.ts, render/notes.ts | yes | none | pass |
| web/src/style.css | `.menu`, `.pop`, `.cardtip` z-index rules | Fix Attempt 2 (z-index survey) | n/a | pass |

`$GATES_LOG_DIR/19-size.log`: `WARN web/src/features/reader.ts:1: file is 707 lines (threshold 500) (filelen)`, `size-warn: 1 hits`. The `02-test.log` gate ran `go test -race`. No Go file is touched.

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[web-impl]** `liveGesture` ends on `close()` but not on `popIn()`. Pop-in is the other way out of the popped form, so a drag that is still running across a pop-in writes `popped: true` back into `places`. See `web/src/features/notes.ts:211-220` (`popIn`) against `:173-176` (`close`) and `:233-246` (the guard). This is § Design "Shared state names its writers and its guard": the guard covers only some of the paths that end the state it protects.
   - **The interleaving.** I followed it in the code. I did not run it in a browser.
     1. Pop out with the button. `popOut()` moves focus to `refs.popIn` (`:208`).
     2. Press the header to drag. The pointerdown calls `preventDefault` (`notespanel.ts:116`), so focus stays on Pop in, and the head has pointer capture.
     3. Press Enter while the pointer is still down. The button's click runs `popIn()`: `form = "anchored"`, then `remember(withPlace(places, id, { popped: false }))`. `liveGesture` is still this gesture, and the root is not detached, so capture holds.
     4. The next `pointermove` runs `update`. It writes `places = withPlace(places, id, { popped: true, rect })` and calls `layoutPopped(id)` on an anchored panel. `pointerup` runs `end`, which saves those places.
   - **The result.** The session the developer just popped in is stored as popped. The next render or focus return opens it popped again (`renderPhase` `:295`).
   - **What a fix must make true.** Every path that leaves `form === "popped"` ends the live gesture, so a gesture never writes `popped: true` or lays out the panel once the panel is no longer popped.

### Notes

1. **[note]** `notessave.ts:78-83` `stillFailed` is a read that also writes: it deletes from `failedIds` without `onChange`. `failedIds` now has two writers, `setFailed` and the `failed` query that both render passes call (`notes.ts:137`, `notespage.ts:41`), and the result depends on whether a render read the flag in between. I looked for an interleaving where that shows a wrong status and found none. A host can only hold a failed id with no typed text by having re-sent another host's stored draft. If it types before any render prunes the flag, the status reads `unsaved` for the new text after an unreachable send, which is true. The Fix Attempt 3 `design:` line names the sharing. This is something to know, not a defect.
2. **[note]** `notesview.ts` holds two status derivations for one panel: `unsavedStatus` (dashboard, `:13`) and `windowStatus` (window, `:22`). Both start with the same rule, `failed → UNSAVED_TEXT`. The string has one owner. The one-line rule is written twice, and a third status that both hosts need would have to be added in both functions.
3. **[note]** For review-work (DIAG): `notesview.ts` (notes) now imports `connectionhealth.ts` (connection). The `web-components` diagram's `features/` node says "18 DOM-free helpers each owned by one controller", and `connectionhealth.ts` is now shared by two. Separately, `reader/` gains `query.ts`, and the diagram's `reader/` node still reads "11 modules" and does not mention the session-id parse. `web/src/reader/CLAUDE.md`'s **Owns** does not list `query.ts` either (Fix Attempt 2 left it out on the word budget). Doc truth is review-work's.
4. **[note]** `features/reader.ts` hits filelen at 707 lines, and Decisions gives no reason. It was also 707 lines on `main` (`git show main:web/src/features/reader.ts | wc -l`). The branch's only edit there is the net-zero swap to `parseSessionParam` that cycle-1 Major 2 asked for. The warning predates this branch, so no reason is owed here.
5. **[note]** The `design:` line says `parseSessionParam` lives in `reader/` because a root-level module would be unowned. `sessions/` was not weighed. Its CLAUDE.md claims "A session's identity is its Muster id" and it already shares `paths.ts` downward with `reader/`. A newcomer looking for the note window's URL parse finds it in the reader's pure directory. The reason given holds, so this is placement taste only.
