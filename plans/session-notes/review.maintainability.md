# Maintainability review: Session notes

**Plan**: session-notes
**Verdict**: approved
**Cycle**: 4
**Pack**: kb: pack 19994 words (budget 30000)
**Scope**: a delta re-review. Cycle 3 approved this part with no agent-tagged issues. The diff is `git diff 4f8bce4c..HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`, which touches 2 files: `web/src/theme.ts` (+2/−2) and `web/src/features/reader.ts` (+6/−5). Both changes come from fix commit 6c815fff.

## Delta

| Prior Minor | Fix commit | Verified how | Result |
|---|---|---|---|
| None. Cycle 3 had no Critical, Major or Minor issues. | — | `plans/session-notes/review.maintainability.cycle3.md`: § Critical, § Major and § Minor each read "None." | n/a |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| web/src/theme.ts | storage.ts, features/updaterestart.ts, features/notes.ts | yes (web-implementation.md, latest fix attempt, lines 140 and 162) | none | pass |
| web/src/features/reader.ts | storage.ts, features/notes.ts, features/updaterestart.ts, reader/memory.ts | yes (lines 141, 153 and 162) | filelen 686; the reason holds | pass, Notes 1–2 |

The per-file questions, asked of the delta:

1. **Does this already exist?** Nothing new was added. Both files now call the existing `safeLocalStorage()` seam (`storage.ts:101-103`) where they used to touch the global directly. `rg -n "window\.localStorage|window\.sessionStorage|\blocalStorage\b|\bsessionStorage\b" web/src --glob '!*.test.ts'` now finds the globals only inside the seam itself, plus one comment:
   ```
   web/src/storage.ts:1:// The one localStorage seam and safe-JSON helper pair: …
   web/src/storage.ts:98:  return guardedStorage(() => sessionStorage);
   web/src/storage.ts:102:  return guardedStorage(() => localStorage);
   web/src/features/updaterestart.ts:2:// `sessionStorage` handoff, …   (comment)
   ```
   Every storage access in `web/src` outside tests now goes through `storage.ts`.
2. **Does it match its siblings?** Yes.
   - `theme.ts:49`'s new default parameter, `storage: Pick<StorageLike, "setItem"> = safeLocalStorage()`, has the same shape as `updaterestart.ts:102`'s `storage: StorageLike = safeSessionStorage()`.
   - The theme.ts import line stays a single `../storage` import, like `updaterestart.ts:18` and `notes.ts:17`.
   - reader.ts looks up storage at each call site, while `notes.ts:54-55` and `updaterestart.ts:102` look it up once at init. Line 153 of web-implementation.md gives the reason: a storage that is blocked at first read must not stay unavailable. That is a stated reason, so this is fine (see Note 1).
3. **Shared state.** No change. All the storage calls in reader.ts run on the main thread, inside existing synchronous handlers. No new writer was added.
4. **Layer crossed?** No. Neither file is a composition root, and neither imports protocol types into `render/`.
5. **Patterns.** None were introduced.
6. **Size.** Gate log `19-size.log` reports `web/src/features/reader.ts:1: file is 686 lines (threshold 500) (filelen)`. Line 159 of web-implementation.md gives the reason: the file was already over the threshold, and this fix added one import line.
   - Measured: the file is 698 lines on `main`, 685 at `4f8bce4c` and 686 now.
   - The reason holds. Splitting the file only to clear the warning is not what the fix should be (kb:adr/process-size-linters-warn-never-fail).
   - No `dupl` lines appear.
7. **Seams explained?** No new seam was added. The `design:` line at line 162 explains the reuse.
8. **Diagram.** No new module was added and no dependency edge changed.

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** The `design:` line in web-implementation.md (line 162) has a precedent that does not match the code. It says `reader.ts` looks up storage at each call "like notes.ts does". But `features/notes.ts:54-55` looks it up once at init (`const sessionStore = safeSessionStorage(); const drafts = createDraftStore(safeLocalStorage());`), and so does `updaterestart.ts:102`, through the default parameter of `initUpdateRestart`. `theme.ts:49` is the actual per-call precedent.
   - This does not affect the code: the reason on line 153 holds on its own.
   - It does leave two lookup policies among the storage callers, with nothing saying which one a new caller should pick.
   - No change is asked for.
2. **[note]** Cycle 3's Note 2 still applies. The header comment at `storage.ts:1-5` says "the one localStorage seam and safe-JSON helper pair". The module now also holds `listKeys`, `removeItem` and the two accessor guards, and it is now the only place in `web/src` that touches either storage global.
