# Maintainability review: Popped-out note enhance

**Plan**: popped-out-note-enhance
**Verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 11487 words (budget 30000)
**Scope**: 18 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (web only). The spawn prompt did not call this a delta cycle, so it is a full one. Since `review_commits[2]` (`f6627357..HEAD`), only two files changed: `web/src/features/notes.ts` (+9/−5) and `web/src/style.css` (+3). I re-read both in full context. The other 16 files have not changed since cycle 2, so their cycle-2 rows carry forward.

## Prior cycle

| Cycle-2 issue | Fix commit | Verified how | Result |
|---|---|---|---|
| Minor 1: `liveGesture` ends on `close()` but not on `popIn()` | 2a55004f | `notes.ts:69-72` adds `setForm(next)`, which clears `liveGesture` whenever `next !== "popped"`. `rg -n "form =" web/src/features/notes.ts` finds only the assignment inside `setForm` (`:70`). Every other transition goes through it: `open` `:170`, `close` `:185`, `popOut` `:208`, `popIn` `:218`. `close()`'s own clear is gone, so the clear has one owner. `open("popped", …)` is reached only from `form === "closed"` (`renderPhase` `:299-300`), so it never inherits a live gesture. A gesture that is still running across pop-in now fails `liveGesture !== gesture` (`:238`, `:247`) and cannot write `popped: true` or call `layoutPopped`. The Fix Attempt `design:` line (web-implementation.md:120-125) lists every path out of `popped` and how each one ends the gesture. | fixed |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| web/src/app.ts | (cycle 1) | yes (`applyRemoved`) | none | pass, unchanged since cycle 2 |
| web/src/wsapp.ts | (cycle 1) | covered by `applyRemoved` | none | pass, unchanged since cycle 2 |
| web/src/note.ts | (cycle 1) | yes | none | pass, unchanged since cycle 2 |
| web/src/features/actions.ts | (cycle 1) | yes | none | pass, unchanged since cycle 2 |
| web/src/features/CLAUDE.md | (doc) | Fix Attempt 1 | n/a | pass, unchanged since cycle 2 |
| web/src/features/connectionhealth.ts | (cycle 2) | Fix Attempt 2 | none | pass, unchanged since cycle 2 |
| web/src/features/notes.ts | render/notespanel.ts (`wireGesture`), notespanelstate.ts | yes (Fix Attempt, `setForm` is the single writer of `form`) | none (315 lines) | pass |
| web/src/features/notesedit.ts | (cycle 1) | yes | none | pass, unchanged since cycle 2 |
| web/src/features/notesgeometry.ts | (cycle 1) | n/a | none | pass, unchanged since cycle 2 |
| web/src/features/notespage.ts | (cycle 2) | yes | none | pass, unchanged since cycle 2 |
| web/src/features/notespanelstate.ts | (cycle 1) | yes | none | pass, unchanged since cycle 2 |
| web/src/features/notessave.ts | (cycle 2) | yes | none | pass, unchanged since cycle 2 (cycle-2 Note 1 stands) |
| web/src/features/notesview.ts | (cycle 2) | yes | none | pass, unchanged since cycle 2 (cycle-2 Note 2 stands) |
| web/src/features/noteswindows.ts | (cycle 2) | yes | none | pass, unchanged since cycle 2 |
| web/src/features/reader.ts | (cycle 2) | yes (`query.ts` line) | filelen 707, also 707 on main | Note 2 |
| web/src/reader/query.ts | (cycle 2) | yes | none | pass, unchanged since cycle 2 |
| web/src/render/notespanel.ts | (cycle 2) | yes | none | pass, unchanged since cycle 2 |
| web/src/style.css | `.menu` (`:4303-4305`), `.pop`/`.cardtip` (`:4382`), `.npanel` (`:4777-4779`), `.banner.neutral` | Fix Attempt (z-order, kb:adr/notes-banner-above-popped-panel) | n/a | pass, Note 1 |

`$GATES_LOG_DIR/02-size.log`: `WARN web/src/features/reader.ts:1: file is 707 lines (threshold 500) (filelen)`, `size-warn: 1 hits`. `01-test.log` ran `go test -race -count=1 ./...` and every package passed. No Go file is touched. The only new shared state is `form`/`liveGesture`. Both live in the single-threaded render and event path, and `setForm` is now the one writer of `form` and the clear of `liveGesture`.

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** The stacking order now has four levels: popped panel 45, banner and readout 46, `.menu` 50, `.pop`/`.cardtip` 55. They are bare literals at `style.css:361`, `:511`, `:4305`, `:4382` and `:4779`, and no comment beside any of them names the order. The order itself is written down only in kb:adr/notes-banner-above-popped-panel. That ADR has `files: []`, so `go tool kb for web/src/style.css` does not list it (checked). Someone who changes `.npanel` or `.menu` later will not see that the banner must stay between them. There is no convention on z-index (`rg -i 'z-index|stacking' docs/conventions.md` finds nothing), so nothing is requested. The ADR's `files` list is kb truth, which is review-work's.
2. **[note]** `features/reader.ts` triggers filelen at 707 lines, the same as on `main`. The branch only swaps in `parseSessionParam` there, with no net change in lines. The warning predates this branch (same reading as cycle-2 Note 4).
3. **[note]** Cycle-2 Notes 1 (`stillFailed` is a read that also writes), 2 (`unsavedStatus` and `windowStatus` repeat one rule) and 5 (`query.ts` sits in `reader/`) still apply as written. No code they refer to has changed.
