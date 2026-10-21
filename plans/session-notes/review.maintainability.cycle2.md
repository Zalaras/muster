# Maintainability review: Session notes

**Plan**: session-notes
**Verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 19994 words (budget 30000)
**Scope**: 44 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (5 generated CLAUDE.md trailers among them). This is a full review, because cycle 1 had Majors. The 16 files changed since cycle 1 (`git diff 6a6d62bb..HEAD`) were read again in full, with their siblings open. The other files are unchanged since cycle 1, so their cycle-1 rows carry over.

## Cycle-1 issues

| Cycle-1 issue | Fix commit | Verified how | Result |
|---|---|---|---|
| Major 1: `decodeNote` was a third nullable-field decoder | 9d1df03d | `internal/server/nullable.go:5` `decodeNullable[T any](raw json.RawMessage) (value *T, ok bool)` is now the only decoder. `rg -n '"null"' internal cmd --glob '!*_test.go'` returns only `internal/server/nullable.go:6`. `note.go:51`, `rename.go:59`, `groups.go:133`, `rail.go:85` and `launchergroup.go:29` all call it. Each message and status at those call sites is the same as before. `decodeGroupID` and `decodeNote` are gone (`rg decodeGroupID\|decodeNote internal` returns nothing). | fixed |
| Major 2: the one-key draft map was rewritten whole from a stale copy in another window | 53f6d325 | `features/notesdrafts.ts:11-15` gives each session its own key, `muster.note-draft.<id>`. `set` (`:51-54`) and `drop` (`:56-59`) touch only `keyFor(id)`, so a window can no longer delete or overwrite another session's draft, whatever its own cached copy holds. The cycle-1 interleaving (B's `drop(2)` writing `{}` over A's `{1:"x"}`) cannot happen now. `pump` reads `drafts.get`, which returns the window's in-memory `typed` map before storage (`:47-49`), so a send no longer depends on storage at all. The precedent is `reader/memory.ts:20` `keyFor(sessionId)`. The `design:` line names the guard that holds. | fixed |
| Minor 1: `PutNoteOptions` duplicated `RequestOptions` | 53f6d325 | `api/sessions.ts:6,65` imports and takes `RequestOptions`. `rg PutNoteOptions web` returns nothing. | fixed |
| Minor 2: the note glyph had two owners | 53f6d325 | `noteBtn` is gone from `MainheadElements` (`render/mainhead.ts`) and from `focus.ts` (`rg noteBtn web/src` returns nothing). `features/notes.ts:49` looks the glyph up once, wires its click, and `syncGlyph` (`:156-165`) writes both its `aria-expanded` and its class. Writing control state from a controller has precedent: `groups.ts:502` (`aria-pressed`) and `groupsselect.ts:126-127`. | fixed |
| Minor 3: the diagram pass stamp was written twice | 53f6d325 | `render/notes.ts:59` `rerenderNoteDiagrams` now spreads `stampPass(host)`. `rg noteInstance web/src` shows the key is written only in `stampPass` (`:35`). | fixed |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/server/nullable.go | groups.go, rename.go, rail.go, launchergroup.go, respond.go | yes (fix attempt 1) | none | pass |
| internal/server/note.go | rename.go, effort.go, nullable.go | yes | none | pass |
| internal/server/rename.go | note.go, groups.go | yes (folded into `decodeNullable`) | none | pass, Note 3 |
| internal/server/groups.go | rail.go, launchergroup.go | yes | none | pass |
| internal/server/rail.go | groups.go | yes | none | pass |
| internal/server/launchergroup.go | launcher.go, groups.go | yes | none | pass |
| internal/server/renderfix_scenarios_notes.go | unchanged since cycle 1 | yes | none | pass |
| internal/server/server.go | unchanged since cycle 1 (composition root, one `register` line) | n/a | funlen `New` 53>40, over on main already | pass, Note 1 |
| internal/server/sessionwire.go | unchanged since cycle 1 | n/a, one field | funlen `toWireSession` 62>60, over on main already | pass, Note 1 |
| internal/server/CLAUDE.md | — | generated trailer | — | Note 5 |
| internal/session/note.go | unchanged since cycle 1 (title.go, writeorder.go) | yes | none | pass |
| internal/session/row.go | unchanged since cycle 1 | n/a | none | pass |
| internal/session/session.go | unchanged since cycle 1 | yes (shared state `Note`) | none | pass |
| internal/session/writeorder.go | unchanged since cycle 1 | n/a | none | pass |
| internal/session/CLAUDE.md | — | generated trailer | — | pass |
| internal/store/migrations/0018_note.sql | unchanged since cycle 1 | n/a | none | pass |
| internal/store/session.go | unchanged since cycle 1 | yes (file length) | filelen 550, `UpdateSession` 69, `scanSession` 68 | pass, Note 1 |
| web/src/api/http.ts | unchanged since cycle 1 (api/sessions.ts) | plan hint (keepalive) | none | pass |
| web/src/api/sessions.ts | api/http.ts | n/a (uses `RequestOptions`) | none | pass |
| web/src/features/CLAUDE.md | — | hand-written Owns line | — | pass |
| web/src/features/notes.ts | focus.ts (its `ResizeObserver` at `:141`), groups.ts, groupsselect.ts, rename.ts | yes (glyph owner, slot observer) | none (367 lines) | pass |
| web/src/features/notesdrafts.ts | reader/memory.ts, storage.ts, theme.ts, updaterestart.ts | yes (draft store guard) | none | Minor 1 |
| web/src/features/notesgeometry.ts | unchanged since cycle 1 | yes | none | pass, Note 2 |
| web/src/features/notespanelstate.ts | unchanged since cycle 1 | yes | none | pass |
| web/src/features/notessave.ts | notesdrafts.ts, usage.ts | yes | none | pass |
| web/src/features/notesview.ts | unchanged since cycle 1 | yes | none | pass |
| web/src/features/rail.ts | unchanged since cycle 1 | yes (hover) | none | pass |
| web/src/features/reader.ts | unchanged since cycle 1 | yes (counter move) | filelen 685, down from 698 on main | pass, Note 1 |
| web/src/features/tiles.ts | unchanged since cycle 1 | yes (hover) | none | pass |
| web/src/features/updaterestart.ts | storage.ts | yes (accessor moved to `storage.ts`) | none | pass |
| web/src/main.ts | unchanged since cycle 1 (composition root, one `initNotes` line) | n/a | none | pass |
| web/src/protocol/session.ts | unchanged since cycle 1 | n/a, one field | none | pass |
| web/src/render/CLAUDE.md | — | generated trailer | — | Note 5 |
| web/src/render/diagrams.ts | unchanged since cycle 1 | yes | none | pass |
| web/src/render/mainhead.ts | focus.ts | yes (`stackMeta`); glyph removed | none | pass |
| web/src/render/notes.ts | render/reader.ts, features/reader.ts | yes | none | pass |
| web/src/render/notespanel.ts | confirm.ts, diagramdialog.ts | yes | none | pass |
| web/src/render/sessions.ts | unchanged since cycle 1 | yes (hover) | none | pass |
| web/src/render/tiles.ts | unchanged since cycle 1 | yes (hover) | none | pass |
| web/src/sessions/store.ts | unchanged since cycle 1 | none (one getter) | none | pass |
| web/src/sessions/testfixtures.ts | unchanged since cycle 1 | n/a | none | pass |
| web/src/storage.ts | reader/memory.ts, theme.ts, updaterestart.ts | yes (`KeyedStorage`, guarded accessors) | none | pass (owner named in Minor 1) |
| web/src/storagefakes.ts | api/testfakes.ts, sessions/testfixtures.ts | web-tests log | none | pass, Note 4 |
| web/src/style.css | the notes section's own earlier rules | n/a | none | pass |

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[web-impl]** Listing a storage's keys is now the only storage access in the dashboard that `storage.ts` does not guard. `features/notesdrafts.ts:34-45` `storedIds` wraps `storage.length` and `storage.key(i)` in a try/catch of its own. Every other access that can throw goes through `storage.ts`: `readJson` (`:27-31`), `writeJson` (`:48-53`), `removeItem` (`:59-63`), and the accessor guard `guardedStorage` (`:70-82`). This branch moved that guard into `storage.ts` from `updaterestart.ts`. A loop over every module with a try block shows these are the only two that touch storage:
   ```
   $ for f in $(rg -l "try \{" --glob '!*.test.ts' web/src); do rg -q -i storage "$f" && echo "$f"; done
   web/src/storage.ts
   web/src/features/notesdrafts.ts
   ```
   The `design:` line says `KeyedStorage` went into `storage.ts` because the draft store must list its keys. The guarded read that uses it stayed in the caller, and the `design:` line gives no reason for that. The next feature that needs to list keys will copy the loop. This breaks `docs/conventions.md` § Design "One owner per concept" and "Match the siblings" (the error path). **A fix must make true:** tolerating a throwing storage while listing keys is owned by `storage.ts`, beside the other three helpers, and `notesdrafts.ts` asks it. The behaviour stays as it is: a throwing storage lists nothing.

### Notes

1. **[note]** These size warnings are unchanged from cycle 1, and each was already over on `main`:
   - `server.go` `New`
   - `sessionwire.go` `toWireSession`
   - `store/session.go` `UpdateSession`, `scanSession` and the 550-line file
   - `features/reader.ts`, which shrank

   The cycle-1 reading still holds: each grew by only the one line its field or registration needs. No split is asked for (kb:adr/process-size-linters-warn-never-fail). The size log has no `dupl` lines. Two test-file funlen hits are outside this part: `note_test.go:323` `noteDaemonInputs` and the store and session tests.
2. **[note]** Carried over from cycle 1: `features/notesgeometry.ts` `sameRect` has no production caller, and `render/notes.ts` `NoteTipModel` is exported but used only in its own file.
3. **[note]** `rename.go:59` names the decoded `*string` `raw`. Everywhere else in the package, `raw` is the undecoded `json.RawMessage`, including the parameter of `decodeNullable` itself (`nullable.go:5`). A name like `requested` would read better. This is taste, so no change is asked for.
4. **[note]** Carried over from cycle 1: `web/src/storagefakes.ts` is test-only, but its name drops the `test` marker that its siblings `api/testfakes.ts` and `sessions/testfixtures.ts` carry. It now also holds `failingAfter`.
5. **[note]** For review-work: the hand-written Owns lines still do not name the new files. In `internal/server/CLAUDE.md`, the route-by-file list has no `note.go`, and the new `nullable.go` is not listed either. In `web/src/render/CLAUDE.md`, `notes.ts` and `notespanel.ts` are not named. Only the generated trailers changed in both files.
6. **[note]** Not a guard defect, because REQ-21 makes the same-session case last write wins, so it is left to review-work. `pending()` (`notesdrafts.ts:65-73`) lists every session's stored draft, including drafts typed in other windows. That means window B's `flushAll` on a snapshot can PUT, and then acknowledge, text that window A typed. The text comes from B's storage copy, which may be stale. A still holds its newer text in `typed` and sends it on its own debounce, so nothing is lost. The order of the two PUTs is not fixed, though.
