# Maintainability review: Session notes

**Plan**: session-notes
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 18238 words (budget 30000)
**Scope**: 40 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (5 generated CLAUDE.md trailers among them)

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/server/note.go | rename.go, effort.go, groups.go (`decodeGroupID`), ingest.go, locate.go | yes | none | Major 1 |
| internal/server/renderfix_scenarios_notes.go | renderfix_scenarios_rail.go, _shortcuts.go, _groups.go, _focus.go | yes | none | pass |
| internal/server/server.go | (composition root) | n/a, one `register` line | funlen `New` 53>40, already over on main (113 lines to 114) | pass, Note 1 |
| internal/server/sessionwire.go | usagewire.go | n/a, one field | funlen `toWireSession` 62>60, already over on main (64 lines to 65) | pass, Note 1 |
| internal/server/CLAUDE.md | — | generated trailer | — | Note 12 |
| internal/session/note.go | title.go, writeorder.go | yes | none | pass |
| internal/session/row.go | — | n/a, one field each way | none | pass |
| internal/session/session.go | — | yes (shared state `Note`) | none | pass |
| internal/session/writeorder.go | — | n/a, one restore line | none | pass |
| internal/session/CLAUDE.md | — | generated trailer | — | pass |
| internal/store/migrations/0018_note.sql | 0017 and earlier | n/a | none | pass |
| internal/store/session.go | — | yes (file length) | filelen 550, `UpdateSession` 69, `scanSession` 68; lengths unchanged from main except +1 column | pass, Note 1 |
| web/src/api/http.ts | api/sessions.ts, api/testfakes.ts | plan hint (keepalive) | none | Minor 1 |
| web/src/api/sessions.ts | api/http.ts | none for `PutNoteOptions` | none | Minor 1 |
| web/src/features/CLAUDE.md | — | hand-written Owns line updated | — | pass |
| web/src/features/focus.ts | rename.ts, notes.ts | none for `noteBtn` | none | Minor 2 |
| web/src/features/notes.ts | usage.ts, readerfind.ts, rename.ts, focus.ts | yes | none (358 lines) | Minor 2 |
| web/src/features/notesdrafts.ts | reader/memory.ts, theme.ts, updaterestart.ts | yes | none | Major 2 |
| web/src/features/notesgeometry.ts | reader/zoom.ts, reader/find.ts | yes | none | pass, Note 3 |
| web/src/features/notespanelstate.ts | updaterestart.ts | yes | none | pass |
| web/src/features/notessave.ts | usage.ts, readerfind.ts | yes | none | pass |
| web/src/features/notesview.ts | updateview.ts, connectionhealth.ts | yes | none | pass, Note 9 |
| web/src/features/rail.ts | tiles.ts | yes (hover) | none | pass |
| web/src/features/reader.ts | render/diagrams.ts | yes (counter move) | filelen 685, shrank from 698 on main | pass, Note 1 |
| web/src/features/tiles.ts | rail.ts | yes (hover) | none | pass |
| web/src/features/updaterestart.ts | storage.ts | yes | none | pass |
| web/src/main.ts | (composition root) | n/a, one `initNotes` line + phase comment | none | pass |
| web/src/protocol/session.ts | — | n/a, one field | none | pass |
| web/src/render/CLAUDE.md | — | generated trailer | — | Note 12 |
| web/src/render/diagrams.ts | reader.ts, mermaid.ts | yes | none | pass, Note 6 |
| web/src/render/mainhead.ts | focus.ts | yes (`stackMeta`); none for `noteBtn` | none | Minor 2 |
| web/src/render/notes.ts | locationpanel.ts, grouppopover.ts, cardtip.ts, hovertip.ts, reader.ts | yes | none | Minor 3, Note 4 |
| web/src/render/notespanel.ts | confirm.ts (exemplar), diagramdialog.ts, menu.ts | yes | none | pass, Note 5 |
| web/src/render/sessions.ts | tiles.ts, context.ts | yes (hover) | none | pass, Note 8 |
| web/src/render/tiles.ts | sessions.ts | yes (hover) | none | pass, Note 8 |
| web/src/sessions/store.ts | — | none (one getter) | none | pass, Note 7 |
| web/src/sessions/testfixtures.ts | — | n/a, one field | none | pass |
| web/src/storage.ts | — | yes | none | pass |
| web/src/storagefakes.ts | api/testfakes.ts, sessions/testfixtures.ts | web-tests log line 43 | none | pass, Note 10 |
| web/src/style.css | earlier plan sections (rail groups, rail card density) | n/a | none | pass, Note 11 |

## Issues

### Critical

None.

### Major

1. **[daemon-impl]** `decodeNote` is a third copy of "decode a required JSON key that is null or a value" in one package. It is at `internal/server/note.go:71-83`. `internal/server/groups.go:92` `decodeGroupID(raw json.RawMessage) (id *int64, ok bool)` already has this shape for an integer, and `internal/server/rename.go:59-71` does it inline for a string: absent key is invalid, `"null"` is nil, otherwise unmarshal. `decodeNote` repeats that same logic for a string. `rg -n '"null"' internal --glob '!*_test.go'`:
   ```
   internal/server/note.go:75:	if string(raw) == "null" {
   internal/server/rename.go:67:	if string(req.Title) != "null" {
   internal/server/groups.go:93:	if string(raw) == "null" {
   ```
   Decisions says `rg -n "json.RawMessage" internal/server` found only `rename.go`. That same grep also lists `groups.go:92 decodeGroupID`, the existing named helper of this shape. The reason given, that the shared part is too small to hoist and the rules differ, does not hold: the rules that differ (rename's trim and length limit) run after the shared decode, not inside it. This breaks `docs/conventions.md` § Design "Reuse before add": "What it finds is reused or generalised, never copied, whatever Decisions says". **A fix must make true:** `internal/server` has one decoder for the nullable string case, and the note handler and the title handler both call it. Whether `decodeGroupID` folds into the same generic helper is the implementer's choice, and the choice goes in a `design:` line. The wire behaviour of both endpoints stays as it is: the same status codes and messages.

2. **[web-impl]** The shared draft store does not protect what its `design:` line says it protects. `features/notesdrafts.ts:12` keeps every session's draft under one local-storage key, `muster.note-drafts`. Every `set`/`drop` (`:36-48`) reads the whole map, changes one entry and writes the whole map back. Two windows share this state, and the `design:` line names it so: "read-modify-write per change so two windows never overwrite each other's other-session drafts". Read-modify-write is not a guard across windows. Chrome serves each renderer's `localStorage` reads from its own cached copy and propagates another window's write asynchronously, so a window can rewrite the whole key from a stale copy. The interleaving:
   1. Window A types into session 1. `set(1, "x")` writes `{1:"x"}`.
   2. Before A's write reaches window B's cache, B's save for session 2 returns. `acknowledge(2)` calls `drop(2)`, which reads B's stale `{2:"y"}`, deletes key 2 and writes `{}`.
   3. A's debounce fires. `pump` (`notessave.ts:56`) calls `drafts.get(1)`, gets `undefined` and returns without sending. Nothing marks the save as failed.

   The typed text is never sent, and the panel never shows `unsaved`. That is the loss the kept-draft design exists to prevent (kb:adr/notes-unsaved-text-kept-in-browser-until-acknowledged). The window is the cross-renderer propagation delay, so it is narrow. I argued this from the code and Chrome's storage model; I did not reproduce it in a browser, which is why this is a Major and not a Critical. This breaks § Design "Shared state names its writers and its guard". **A fix must make true:** a write for one session's draft cannot remove or overwrite another session's draft, whatever another window's copy holds. The `design:` line must then describe the guard that actually holds.

### Minor

1. **[web-impl]** `PutNoteOptions` in `web/src/api/sessions.ts:8-10` (`{ keepalive?: boolean }`) is a second declaration of `RequestOptions` from `web/src/api/http.ts:56-58` (`{ keepalive?: boolean }`), added in the same change. `putNote` passes it straight through to `requestEmpty(…, options?: RequestOptions)`. This breaks § Design "One owner per concept": two declarations of one shape will drift. **A fix must make true:** the keepalive option has one declared type, which `putNote` takes.

2. **[web-impl]** The Focus-header note glyph has two owners. `features/focus.ts:120` looks it up into `MainheadElements.noteBtn`, and `render/mainhead.ts:187-188` writes its class from focus's render phase. `features/notes.ts:49` looks up the same `#mainhead .ng` a second time, wires its click (`:287`) and writes `aria-expanded` from the notes phase (`:157-161`). Every other `#mainhead` control is looked up once, in `focus.ts:113-121`. A feature that adds behaviour to one hands it to focus: rename passes `deps.renameHandlers` (`focus.ts:62,128`), and the group button's click is wired at `focus.ts:165`. No `design:` line explains why the glyph is split. This breaks § Design "Match the siblings" and "One owner per concept". **A fix must make true:** one controller looks up the glyph and writes every attribute it carries (class, `aria-expanded`, the click), or a `design:` line states why the split is right.

3. **[web-impl]** `render/notes.ts` writes the diagram pass-guard rule in two places. `stampPass` (`:33-37`) mints an instance, stamps `dataset.noteInstance` and returns the `isCurrent` check. `rerenderNoteDiagrams` (`:57-66`) re-inlines the same three steps instead of calling it. Each body render and each theme re-render depends on the two copies agreeing on the dataset key and the comparison. This breaks § Design "One owner per concept" ("Two places that must agree will not"). **A fix must make true:** the stamp and its `isCurrent` check are written once in the file, and both the initial pass and the theme re-render use them.

### Notes

1. **[note]** Size warnings on touched files. Each one already existed on `main`, measured by function line span:
   - `server.go` `New`: 113 lines to 114, the one `register` line the composition-root rule requires.
   - `sessionwire.go` `toWireSession`: 64 to 65, one wire field.
   - `store/session.go`: `UpdateSession` and `scanSession` unchanged apart from one column in each list; the file went from 548 to 550 lines.
   - `features/reader.ts`: shrank from 698 to 685.

   Only the store file has a reason in Decisions ("the column belongs beside its siblings"). The same reason holds for the other three, since each grew by the one line the field or registration needs. No split is asked for (kb:adr/process-size-linters-warn-never-fail).
2. **[note]** `internal/session/note_test.go:323` `noteDaemonInputs` (funlen 70>60) is a test-file length warning, not a `dupl` hit. It is outside this part. The size log has no `dupl` lines.
3. **[note]** `features/notesgeometry.ts:64` `sameRect` has no production caller: `rg sameRect web/src` hits only the module itself and `notesgeometry.test.ts`. `render/notes.ts:16` `NoteTipModel` is exported but used only inside its own file.
4. **[note]** `render/notes.ts:39-47` `renderNoteInto` repeats the reader's body sequence: `renderMarkdown`, prepend `buildFrontmatterNode`, `replaceChildren`, then `renderDiagrams`. The reader splits that sequence across `features/reader.ts:312` and `render/reader.ts:511-513` (`setReaderBody`). Every piece is reused, so this is not a second implementation. But the spec says a note renders "as the docs reader renders markdown", and nothing makes the two compositions agree. Each new reader body step will need adding in both places.
5. **[note]** `render/notespanel.ts:97-122` `wireGesture` and `render/diagramdialog.ts:190-215` (diagram pan) are two inline pointer-capture drag loops. The `design:` line says it matched the idiom. The two differ (pointer-id filtering, explicit `releasePointerCapture`), so this is a candidate for a shared helper when a third one appears.
6. **[note]** `render/diagrams.ts:21` now holds the module-level `nextDiagramInstanceId` counter. `render/CLAUDE.md` says "No cross-call state here". The same file already holds `sourceByFigure`, and the `design:` line gives the reason: two hosts minting from separate counters would collide on SVG ids. So the placement has precedent and a reason.
7. **[note]** `SessionStore.get` (`sessions/store.ts:27`) is an improvement. Older callers still do `app.store.values().find((s) => s.id === …)`: `focus.ts:149,159,166`, `rename.ts:31,36`, `actions.ts:201`, `railmenu.ts:57`, `launch.ts:830`. Moving them over is not this plan's work.
8. **[note]** The card, tile and mainhead builders read raw `session.note` (`render/sessions.ts:90`, `render/tiles.ts:111`, `render/mainhead.ts:187`) instead of a view-model field, and `applyRepoBlocks` gained a `session` parameter beside its `vm`. Precedent: `renderContextRow(…, session.context, …)` in the same functions. The decision is only `note === null`.
9. **[note]** `features/notesview.ts` is 9 lines with two one-line functions. `features/CLAUDE.md` says "inline when short". The `design:` reason, that Vitest needs a module with no DOM, holds because `notes.ts` touches the DOM.
10. **[note]** `web/src/storagefakes.ts` is test-only support. Its name drops the `test` marker its siblings carry (`api/testfakes.ts`, `sessions/testfixtures.ts`), so at the root beside `storage.ts` a newcomer reads it as a production module. Its earlier name, `features/notestestfakes.ts`, did match. The web-tests log (line 43) records the three older private copies (`theme.test.ts:73-80`, `reader/memory.test.ts:39`, `features/updaterestart.test.ts:22`) and leaves them, as the `sessions/testfixtures.ts` header allows.
11. **[note]** `style.css`'s notes section turns `.r2` into a grid at the end of the file (`.r2 { display: grid; … }`), away from the base `.r2` rule at line 2507. A reader of the rail-card section will not see it there. The earlier plan sections (rail card density, rail groups) set the precedent of overriding from their own section.
12. **[note]** For review-work:
    - The DIAG row for `kb:diagram/web-components`: the module counts for `features/` and `render/`. The storage text says local storage holds only the reader's memory and the theme hint, and session storage only the update handoff; notes now uses both. The `render → reader` edge now carries `markdown`.
    - The hand-written Owns lines in `internal/server/CLAUDE.md` (its route-by-file list does not name `note.go`) and `web/src/render/CLAUDE.md` (it does not name `notes.ts`/`notespanel.ts`).
    - The drafts ADR's "keyed by session" against the single map key in `notesdrafts.ts:12`.

    Reusing `maxIngestBodyBytes` in `note.go:39` matches kb:adr/notes-request-bounded-at-ingest-ceiling.
