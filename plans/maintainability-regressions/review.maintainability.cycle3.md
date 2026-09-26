# Maintainability review: Maintainability Regressions

**Plan**: maintainability-regressions
**Verdict**: needs-changes
**Cycle**: 3
**Pack**: kb: pack 20782 words (budget 20000) — sections: rules 1938 · features 2133 · diagrams 4305 · decisions 6992 · proposed 0 · facts 5237 · lessons 169 · runbooks 2 (WARN: over budget)
**Scope**: 15 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`, the same set as cycle 2. Four of them are GENERATED `CLAUDE.md` trailers. This is a full re-review, since the spawn prompt did not declare a delta. Since cycle 2 (`26a060d..HEAD`), five of the 15 files changed. Three are comment-only: `settings.go`, `launcher.go` and `server.go`. The other two, `features/launch.ts` and `render/launch.ts`, have a code change: the `forceFocusInvalid` parameter. I re-read the remaining ten against cycle 2's reading. They are byte-identical, so cycle 2's results for them stand.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/claudecode/settings.go | (cycle 2) server/launcher.go `writeSettings`, selfupdate/apply.go, leaf packages. Changed since cycle 2: comment only (`MergeSettings` doc, `:221`) | yes | — | pass |
| internal/claudecode/modelcheck.go | (cycle 2) version.go, credentials.go, server/updatemanager.go:325. Unchanged | yes | — | pass |
| internal/server/launchermodels.go | (cycle 2) browse.go, usage.go, issue.go, terminal.go. Unchanged | yes | — | pass (cycle 2 Notes 3 and 4 still stand, not repeated) |
| internal/server/launcher.go | (cycle 2) browse.go, usage.go. Changed since cycle 2: comment only (`:82-83`) | yes | funlen `Launch` 83>60. Pre-existing and unchanged on `main`; the reason holds | pass |
| internal/server/launcherrors.go | respond.go. Unchanged | n/a | — | pass |
| internal/server/server.go | composition root. Changed since cycle 2: doc comment only. `awk '/^func New\(/,/^}/' … \| grep -c 'register(s'` → 15, which matches the corrected "15 features" | covered | funlen `New` 42>40; the reason in `New`'s doc holds | pass |
| web/src/api/launch.ts | api/reader.ts, api/issue.ts, protocol/session.ts. Unchanged | yes | — | pass |
| web/src/features/launchmodels.ts | launchcrumbs.ts, launchrestore.ts. Unchanged (`applyVerdicts` read again for Minor 1) | yes | — | pass |
| web/src/features/launch.ts | issue.ts, surfaces.ts, connection.ts; the boolean-parameter precedent in `features/tiles.ts:204`. Changed since cycle 2: `updateModelRowState(forceFocusInvalid)`, `submit`'s refusal branch | no new type/module/seam, so none needed | filelen 602 (504 on `main`). The growth is controller glue plus doc comments; the reason in `web-implementation.md:30,67,103` holds | **Minor 1**, Note 1 |
| web/src/render/launch.ts | render/mainhead.ts:57 and render/tiles.ts:67 (positional `boolean` params in `render/`), render/focuskeep.ts:66, render/diagramdialog.ts:93,126, render/rename.ts:117 (`.focus()` in `render/`). Changed since cycle 2: 7th parameter `forceFocusInvalid` | none needed (widened signature, not a new seam) | — | pass (Note 1) |
| web/src/style.css | Unchanged | n/a | — | pass (cycle 2 Note 6 stands) |
| internal/server/launchermodels_test.go (size log only) | — | — | funlen `TestModelsFeature_CheckInFlightWhenIdentityChanges_NotCachedNorServed` 55>40. The reason is now in `daemon-tests.md:207-215` and holds: one ordered interleaving over four gate channels (`aStarted`/`releaseA`/`bStarted`/`releaseB`, 12 references in the file) | pass |
| internal/claudecode/CLAUDE.md, internal/server/CLAUDE.md, web/src/features/CLAUDE.md, web/src/render/CLAUDE.md | — | generated trailer | — | not reviewed |

## Cycle 2 findings

| Cycle 2 finding | Fix commit | Verified how |
|-----------------|-----------|--------------|
| Minor 1: no size reason for the launchermodels test funlen | 25ee176 | `daemon-tests.md` now gives the reason: one ordered interleaving that a table cannot express, citing kb:adr/process-size-linters-warn-never-fail. The test at `launchermodels_test.go:203` does drive A/B through four channels, so the reason matches the code. |

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[web-impl]** The launch-time focus force skips the generation guard that `modelVerdicts` names at its declaration. The race is at `web/src/features/launch.ts:436-444`. `modelVerdicts`'s declaration (`:118-125`) names generation as the guard against a response from an earlier open. `submit` honours that guard for the store write: `applyVerdicts` returns the store unchanged when `generation !== store.generation` (`launchmodels.ts:71`). But the new `updateModelRowState(true)` runs unconditionally after that write. So a refusal the guard dropped still forces focus in whatever dialog is open now. Concrete interleaving:
   - Open g1 with model X selected. X's verdict is not in the store yet (cold cache).
   - The developer presses Enter in Title. `submit` captures g1 and awaits `POST /api/sessions`, whose daemon-side check shares the in-flight run for X.
   - The developer cancels and reopens: `resetForm` advances to g2, and `applyModelRestore(X)` or the preset request asks for X again, joining the same in-flight run.
   - g2's `GET /api/models` response lands first and marks X unrecognized. Now g2's `state.invalid` is true.
   - The stale g1 refusal lands. `applyVerdicts` drops it, and `updateModelRowState(true)` → `renderModelRowState` (`render/launch.ts:217`) moves focus onto the model control. The developer's focus is on the browse list or Title in a dialog they did not submit from.

   That breaks the invariant `renderModelRowState`'s own doc states (`render/launch.ts:193-196`): "a verdict arriving from the dialog-open request or a restore must never steal focus". It also breaks § Design "Shared state names its writers and its guard": the guard is named, but this async writer's side effect runs outside it. A fix must make one thing true: a refusal that the generation guard drops moves no focus. The force applies only when the refusal was merged into the current open's store.

### Notes

1. **[note]** The same reason for `forceFocusInvalid` is now written three times: `updateModelRowState`'s doc (`features/launch.ts:139-144`), `renderModelRowState`'s doc (`render/launch.ts:190-196`) and the inline comment at the call site (`features/launch.ts:439-443`). The `render/` doc also names its caller ("`features/launch.ts`'s `submit` is the only one that passes `true`"). That claim goes stale as soon as a second caller appears, the same pattern as cycle 2 Note 5's `AtomicWriteFile` caller list. § Comments says "Don't explain what well-named code already says". One statement at the parameter's home would carry it. A trailing positional `boolean` on a `render/` function has sibling precedent (`render/mainhead.ts:57`, `render/tiles.ts:67`), so the signature shape is not a divergence.
2. **[note]** Cycle 2 Notes 1, 3, 4 and 6 are unchanged, since their code did not move: the `AtomicWriteFile` home and the `selfupdate` follow-up, the leader running on `WithoutCancel`, `verdict`'s write-before-close rule left unstated, and the repeated invalid outline in `style.css`. I am not refiling them.
3. **[note]** Diagram check: no module or dependency edge was added since cycle 2. kb:diagram/web-components already shows `protocol/` as "8 modules" (`docs/diagrams/web-components.md:59`), which matches `ls web/src/protocol/*.ts` without tests → 8.
