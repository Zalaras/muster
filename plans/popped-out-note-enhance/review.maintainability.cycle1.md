# Maintainability review: Popped-out note enhance

**Plan**: popped-out-note-enhance
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 11484 words (budget 30000)
**Scope**: 13 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (web only; no daemon file touched, so there is no `daemon-implementation.md`). `web/note.html` and `web/vite.config.ts` are outside that pathspec; I read them too (a third entry, the same shape as `doc.html` and its config line).

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| web/src/app.ts | wsapp.ts, features/actions.ts | yes (`applyRemoved`) | none | pass, see Note 2 |
| web/src/wsapp.ts | doc.ts, note.ts, app.ts | covered by `applyRemoved` line | none | pass |
| web/src/note.ts | doc.ts, main.ts (via the composition-root rules) | yes (`notespage.ts` line) | none | pass |
| web/src/features/actions.ts | app.ts, wsapp.ts | yes (`applyRemoved`) | none | pass |
| web/src/features/CLAUDE.md | (doc) | Fix Attempt 1 | n/a | pass |
| web/src/features/notes.ts | notesedit.ts, notespage.ts, notespanelstate.ts, notesgeometry.ts, notesdrafts.ts, notessave.ts, main's notes.ts | yes (split, derived popped state, places owner) | none | Major 1 |
| web/src/features/notesedit.ts | notes.ts (main and branch), notesdrafts.ts, notessave.ts, notesview.ts | yes | none | pass |
| web/src/features/notespage.ts | reader.ts `mountStandaloneReader`, notes.ts, reader/notice.ts, connectionhealth.ts | yes | none | Minor 1, Minor 2 |
| web/src/features/noteswindows.ts | reader.ts `parseStandaloneQuery`, notesdrafts.ts, notessave.ts | yes (W6 seam) | none | Major 2 |
| web/src/features/notespanelstate.ts | notesdrafts.ts, storage.ts users | yes (places owner) | none | pass |
| web/src/features/notesgeometry.ts | notes.ts | not separately stated; `defaultPlacement` builds on `defaultRect`, nothing duplicated | none | pass |
| web/src/render/notespanel.ts | render/reader.ts, render/notes.ts, render/anchored.ts | yes (`NotePanelHandlers` split) | none | Minor 3, Note 1 |
| web/src/style.css | the existing `.npanel` block | Decisions bullets (hidden companions, info status) | n/a | pass, Note 3 |

`$GATES_LOG_DIR/19-size.log`: `size-warn: 0 hits`. No funlen, dupl or file-length warning on any touched file. `notes.ts` went from about 370 lines on main to 304 here.

## Issues

### Critical

None.

### Major

1. **[web-impl]** A drag cut short by a close keeps writing to `places` and can move another session's rectangle. `web/src/features/notes.ts:225-243` (`beginGesture`) and `web/src/render/notespanel.ts:110-134` (`wireGesture`).
   - **The state.** `places` is the per-session places memory. Its declared writers are `remember` and the gesture's `update` (Decisions, `NotePanelHandlers` split line). The gesture closes over the `id` and `base` it started with.
   - **How the gesture ends today.** It ends only on `pointerup`/`pointercancel` delivered to the captured surface. The surface is `refs.head` or an `.rz` handle, and those are built once and reused across every open.
   - **The interleaving.** These steps follow from the code and the Pointer Events implicit-release rule. I did not run them in a browser.
     1. Session A's popped panel is being dragged.
     2. A focus change to B arrives mid-drag (a keyboard chord), or `sessionRemoved` for A arrives. Either way `notes.ts:255-257` or the render phase calls `close(false)`, which runs `refs.root.remove()` (`:178`).
     3. Removing the root releases pointer capture implicitly. The following `pointerup` goes to the document, not the detached surface, so `finish` never runs and the `move` listener stays bound.
     4. B's panel opens popped and B is dragged on the same surface. Both listeners fire. The stale one runs `places = withPlace(places, A, { popped: true, rect: A's base + B's deltas })`, and B's `end` persists that.
   - **What the branch changed.** On main a focus change did not detach the root, because the popped panel stayed open and swapped content. The rect was also not keyed per session, so this path could not reach another session's record.
   - **What a fix must make true.** A gesture stops writing once its panel closes or its surface loses capture. A gesture never writes a place for any session but the one shown. If the guard is a name, it sits where `places` is declared.

2. **[web-impl]** A second copy of the `?session=` id parse. `web/src/features/noteswindows.ts:22-25` vs `web/src/features/reader.ts:80-83`. Cites `docs/conventions.md` § Design "Reuse before add … What it finds is reused or generalised, never copied, whatever Decisions says". The `notespage.ts` `design:` line pastes the grep that found `parseStandaloneQuery`.
   ```
   reader.ts:82-83      const rawSession = params.get("session");
                        const sessionId = rawSession !== null && /^\d+$/.test(rawSession) ? Number(rawSession) : null;
   noteswindows.ts:23-24 const raw = new URLSearchParams(search).get("session");
                        return raw !== null && /^\d+$/.test(raw) ? Number(raw) : null;
   ```
   The two pop-out pages share one rule: what counts as a valid session id in the URL. **A fix must make true:** that rule has one owner that both `parseStandaloneQuery` and `parseNoteQuery` call. If the two ever drift, one page would accept `?session=` values the other rejects.

### Minor

1. **[web-impl]** `notespage.ts:41` spells out `"warn" | "info"` inline. `render/notespanel.ts:43` exports the same union as `StatusKind`, and `NotePanelView.statusKind` is typed with it. Cites § Design "One owner per concept". **A fix must make true:** `statusFor` returns the exported type, so adding a third kind is a change in one place.
2. **[web-impl]** `notespage.ts:9` adds a third literal `"connecting…"`. The other two are `features/connectionhealth.ts:11` (the masthead word) and `reader/notice.ts:29`, whose comment calls it "the masthead's own word". Cites § Design "One owner per concept". The duplicate between the reader and the masthead predates this branch; this branch adds the third copy. **A fix must make true:** the note window takes the word from an existing owner rather than its own constant. Folding the reader's copy in as well is optional.
3. **[web-impl]** The removed-notice text lives in the render module. Its sibling keeps the text in a pure module. `render/notespanel.ts:52,221-228` defines `REMOVED_NOTICE_TEXT` and builds the notice. `render/reader.ts:37-41` `renderUnknownSessionNotice` builds the same kind of notice (a `role="status"` node from `replaceChildren`) but imports `UNKNOWN_SESSION_TEXT` from the pure `reader/notice.ts:10`. That follows `web/src/render/CLAUDE.md`: "Every displayed string comes from a pure view-model". `REMOVED_NOTICE_TEXT` is exported, but `rg -n REMOVED_NOTICE_TEXT web` finds no importer. The `design:` lines give no reason for the divergence. **A fix must make true:** the note's removed-notice string sits where its siblings' notice strings sit (a pure notes module beside `notesview.ts`), and the builder takes it from there. Otherwise, a `design:` line says why it differs.

### Notes

1. **[note]** In the note window, `buildNotePanel(handlers)` still builds the pop-out, pop-in, open-in-window and close buttons, then `renderNotePanel` hides them for `form: "window"` (`render/notespanel.ts:212-215`). Two places now decide that the window has no controls: whether `controls` is passed, and the form. They agree today. This is not a defect, only something to know when adding a fifth control.
2. **[note]** `applyRemoved` is the first free function in `app.ts` besides `createApp`. The store-write, emit and render effects of every other WS message live inline in `wsapp.ts`. `actions.ts` also needs this effect, which is the stated reason for the placement (Decisions, `applyRemoved` line). It is defensible on the seam. A later reader looking for "what happens on sessionRemoved" now finds it in `app.ts`, not `wsapp.ts`.
3. **[note]** Decisions says `.npanel[hidden]` is "kept though nothing toggles it now". A rule with no writer is dead CSS. The contrast gate owns `style.css`, so this is only an observation.
4. **[note]** For review-work: the `web-components` diagram on this branch already shows `note.ts` and the three shared notes modules. The `features/` count and module list there are theirs to check (DIAG).
5. **[note]** The dashboard and the note window each build their own `DraftStore` over the same `localStorage` keys. Each keeps an in-memory `typed` map that the other page cannot see. Drafts are stored one key per session (`notesdrafts.ts:13-15,42-45`), so neither page can clobber the other's whole map. I found no interleaving on the drafts that loses text. Whether both pages re-sending one draft on `snapshot` is wanted behaviour is review-work's question.
