# Maintainability review: Rail groups

**Plan**: groups
**Verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 44313 words (budget 20000)
**Scope**: delta re-review. Cycle 2's only open agent-tagged issue was a Minor. The delta is `git diff 8a2bdd36..HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`, 5 files, from commits fdb5aed3, d1eb995a and 6bb10267. The siblings of each were opened.

## Delta

| Prior Minor | Fix commit | Verified how |
|---|---|---|
| Minor 1: the two sub-controllers of `features/groups.ts` get their elements differently (`groupsselect.ts` handed them, `groupsdialogs.ts` looked its own up), and the `design:` line claims both take `launchgroup.ts`'s shape | fdb5aed3 | `groupsdialogs.ts` now exports `GroupsDialogsElements` (`:28-31`), built from the render module's own `NewGroupElements` and `DeleteGroupElements`. Its signature is `initGroupsDialogs(app, elements, deps)` (`:48-52`), the same as `initGroupsSelect(app, { toggle, bar }, deps)` (`groupsselect.ts:50`). `rg requireElement` over `groupsdialogs.ts` and `groupsselect.ts` finds nothing. `groups.ts:110-145` looks up the dialog markup beside the select-bar lookups (`:99-108`) and passes it at `:181`. `launch.ts:729-748` looks up its `resume` and `group` elements inside `initLaunch` and hands them to `initLaunchResume` (`:161`) and `initLaunchGroup` (`:171`), so all four sub-controllers now follow one shape. The `design:` line (`web-implementation.md:226`, "`init<Name>(app, elements/deps)`") is true of both modules. The header comment (`groupsdialogs.ts:3-6`) and `features/CLAUDE.md` say the caller looks the markup up. `groups.ts` grew from 435 to 475 lines, which is under the 500 threshold and not on `15-size.log`. |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/session/railorder.go | actions.go, groupops.go, manager_rail.go | n/a (comments only) | — | pass (cycle 2 Notes 5 and 6 answered) |
| web/src/features/CLAUDE.md | groups.ts, groupsselect.ts, groupsdialogs.ts, launchgroup.ts | n/a (doc) | — | pass |
| web/src/features/groups.ts | groupsselect.ts, groupsdialogs.ts, launch.ts, launchgroup.ts, launchresume.ts | yes (`web-implementation.md:226`, fix log `:254-258`) | none (475 lines) | pass |
| web/src/features/groupsdialogs.ts | groupsselect.ts, launchgroup.ts, launchresume.ts, render/groupdialogs.ts | yes (`:226`, `:254`) | — | pass (cycle 2 Minor 1 fixed) |
| web/src/render/CLAUDE.md | anchored.ts, options.ts, menu.ts, grouppopover.ts | n/a (doc) | — | pass |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** The fix wave changed no shared state. The daemon change in `railorder.go` touches only comments. The `ErrInvalidOrder` comment (`:9-15`) now names `runBatch` as a source, and `rg ErrInvalidOrder internal/session` confirms the three sources it lists (`railorder.go:85,100,105,136`, `actions.go:131`). Whether the reworded `applyPin` comment (`:42-45`) is true belongs to review-work.
2. **[note]** The size log is unchanged from cycle 2. The cycle 2 reasons still hold for `launcher.go`, `manager.go`, `launch.ts`, `launchResume` and `New`. No delta file appears in it.
3. **[note]** This is for review-work, as plan-doc truth. The file table row for `groupsdialogs.ts` (`web-implementation.md:195`) still lists "element lookups" among the module's jobs. The fix log at `:254` records the change. The `design:` line, the header comment and the package guide agree with the code.
4. **[note]** `kb:diagram/web-components` now says 33 `features/` modules and 37 `render/` modules. It describes groups' select mode and dialogs as sub-controllers. Both counts match the tree, which closes cycle 2's Note 8.
5. **[note]** Cycle 2's Note 2 is still open. No `design:` line says why `groupsselect.ts` adds its own `window` keydown listener for Escape. It is not a divergence, so no change is requested.
