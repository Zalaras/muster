# Doc Reconcile: session-notes

**Verdict**: reconciled
**Pack**: kb: pack 33070 words (budget 30000)
**Features derived**: notes, focus, tiles, rail, lifecycle, connection, reader, actions, rename, issue, update, theme, groups, launch (plan header: Features notes, focus, tiles; Touches rail, lifecycle, connection, reader, actions, rename, issue, update, theme, groups, launch). No changed file maps outside those; `web/src/style.css` maps to no feature glob (contrast gate's, as before).

## Claims

| Feature | Claim | Verified against | Action |
|---------|-------|------------------|--------|
| notes | Ended session keeps note until Remove or next daemon start; sweep of already-ended row deletes it | `docs/adr/notes-ended-row-sweep-takes-its-note.md`; note is a row column (`internal/store/migrations/0018_note.sql`, `internal/session/note.go:SetNote`) | edited |
| notes | Link click in rendered note opens new tab, no edit | `web/src/render/notes.ts` (`target=_blank`), `web/src/render/notespanel.ts:137` | added |
| notes | Glyph while popped out moves focus into panel | `web/src/features/notes.ts` glyph click handler | added |
| notes | Failed save retried on reconnect and next edit; `404 unknown_session` drops kept text | `web/src/features/notessave.ts:outcomeOf,pump`, `notes.ts:320` | added |
| notes | Status `unsaved, musterd unreachable`; narrow panel to 260px: label shrinks first, status ellipsizes with hover title | `notesview.ts:UNSAVED_TEXT`, `notespanel.ts:189`, `style.css` `.npanel .ph .st`, `notesgeometry.ts:MIN_WIDTH` | added |
| notes | (deleted) "Stop, resume and a daemon restart keep it, and Remove deletes it" | superseded by the above | deleted |
| notes | (trimmed for 800-word budget, no claim lost except below) "never merged when two windows edit" (restated by "last write wins"); "Escape pressed anywhere outside the panel is never taken by it" (the spec still says only Escape inside it closes) | — | deleted |
| focus | Mainhead opens with the note glyph, muted while note empty, never gives way | `web/index.html` `.ng` in `.idrow`, `notes.ts:syncGlyph` | edited |
| tiles | Tile with a note shows the marker before its context readout | `web/index.html` tile `.mk` before `.ctxinfo`, `web/src/render/tiles.ts:applyNoteMarker` | added |
| protocol | Session `note` comment: deleted by Remove or start-up sweep of an ended row | same ADR | edited |

The plan's REQ-1..23 prose in `notes/spec.md` was authored at approval; I spot-checked it against `internal/server/note.go` (PUT, null/string, 413, 404), `internal/session/note.go` (whitespace = no note, no-op on equal) and the panel code.

## Contradictions
None.

## For the orchestrator
- [orchestrator] `notes/spec.md` is at 800 words; the sentence about Escape outside the panel and the "never merged" clause were dropped to fit (both still follow from kept sentences). Any further notes delta needs a split.
- [orchestrator] The pack ran 33070 words against a 30000 budget (touched features 26447 words) — the plan's wide Touches list is the cause.
- [orchestrator] `TODO.md`, `docs/history/todo-done.md` and `plans/session-notes/proposed-backlog.md` are uncommitted and not mine.
- No Touches claim changed a touched feature's behaviour, so no widening of `**Features**` is needed.

## Checks
```
go tool kb gen
kb: all generated files fresh
go tool kb check
kb: 628 records, 29 features, 0 problem(s)
kb: all checks pass
```
Words: notes 800, focus (body under budget, check passes), tiles under budget. Commits: 93a94d40 (notes), 720d5fcf (focus), 0fc217f7 (tiles), 089bacc6 (protocol + four regenerated contracts).
