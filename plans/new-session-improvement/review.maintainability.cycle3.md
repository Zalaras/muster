# Maintainability review: New Session Improvement

**Plan**: new-session-improvement
**Verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 30625 words (budget 8000) — sections — rules 1874 · features 10176 · diagrams 3889 · decisions 11693 · proposed 0 · facts 2462 · lessons 523 · runbooks 2
**Scope**: 14 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`. Four of them are CLAUDE.md files that changed only in the generated trailer, plus one hand-written invariant line in `internal/claudecode/CLAUDE.md`. Since cycle 2 (`5d474a0..HEAD`), only 3 source files changed: `web/src/features/focus.ts`, `web/src/features/launch.ts` and `web/src/render/launchrestore.ts`, all in `3b4b5d5`.

## Cycle-2 findings, re-checked

| Cycle-2 finding | State now | Evidence |
|---|---|---|
| Minor 1 (`NavigateOutcome` declared in a module that neither produces nor consumes it) | resolved | `rg -n NavigateOutcome web/src web/e2e` now finds only `launch.ts:288` (declaration), `:296` (`navigate(): Promise<NavigateOutcome>`) and `:320` (`navigateUp`). `render/launchrestore.ts` exports `DEFAULT_MODEL`, `Touched`, `Restore`, `repoRestore` and `initialRestore`. Each of these is taken or returned by a function in that same module, or is the fallback those functions use, which matches `crumbs.ts` and `focusrestore.ts`. Both fix conditions hold. |
| Note 2 (comments that cite review findings) | web side resolved | A sweep of the branch's added lines (`git diff main...HEAD … \| grep '^+' \| grep -iE 'review\|cycle [0-9]\|before this plan'`) finds no review citations left in web files. Two daemon lines remain (see Note 2). |
| Notes 1, 3–11 | unchanged | No daemon source changed since cycle 2. The fail-open, timeout and layering shape is as re-checked then. |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/claudecode/CLAUDE.md | — (one hand-written invariant line, plus the trailer) | n/a | — | pass |
| internal/claudecode/launch.go | settings.go, credentials.go (cycle 2) | n/a (no new type) | — | pass |
| internal/claudecode/modelcheck.go | credentials.go, version.go (cycle 2) | yes | — | pass |
| internal/server/CLAUDE.md | — (generated trailer) | n/a | — | pass |
| internal/server/server.go | usage.go; the `attach` default in `New` (cycle 2) | yes (cycle-1 fix attempt) | funlen `New` 48>40, reason holds | pass |
| internal/server/sessions.go | the in-file `launchError` constructors, `validateLaunchRequest` | n/a | funlen `Launch` 83>60 and filelen 814, reason holds; `Resume` 41>40 is untouched | pass (Note 2) |
| web/src/api.ts | app.ts, protocol.ts (cycle 2) | n/a | filelen 776, reason holds (pre-existing; this change is comment-only) | pass |
| web/src/features/CLAUDE.md | — (generated trailer) | n/a | — | pass |
| web/src/features/focus.ts | rail.ts, surfaces.ts, launch.ts | yes (cycle-1 fix attempt) | — | pass |
| web/src/features/launch.ts | focus.ts, rail.ts; shortcuts.ts, render/masthead.ts (for placing a non-exported type) | yes (cycle-2 fix attempt) | filelen 578 (was 582), reason holds | pass (Note 1) |
| web/src/main.ts | — | n/a | — | pass (one registration argument changed) |
| web/src/render/CLAUDE.md | — (generated trailer) | n/a | — | pass |
| web/src/render/launchrestore.ts | render/crumbs.ts, render/focusrestore.ts | yes | — | pass (Note 3) |
| web/src/terminal/pane.ts | terminal/*.ts (cycle 2) | n/a (comment only) | — | pass |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** `NavigateOutcome` is now a non-exported type inside `initLaunchModal`'s closure (`launch.ts:288`), directly above `navigate()`. It is the only function-scoped type alias in `web/src`: `rg -n '^\s+type \w+ =' web/src --glob '!*.test.ts'` finds only this one. The tree's other non-exported types sit at module level, such as `shortcuts.ts:15` `interface Binding` and `render/masthead.ts:156` `interface ModelWeekState`. The cycle-2 fix asked for the type to sit "beside navigate()", and this placement meets it. A newcomer would not misread it, so no change is requested.
2. **[note]** For review-work (§ Comments, "don't narrate history"). The web comments were cleaned up. Two daemon comments on this branch still refer to the plan's own history: `internal/server/sessions.go:147` ("behave exactly as before this plan") and `:214` ("the launch proceeds exactly as before this plan"). "Before this plan" means nothing to someone reading the code later. The cycle-2 fix wave rewrote only web files.
3. **[note]** For review-work (comment truth). `render/launchrestore.ts:4-5` presents its placement as a settled rule: "a pure decision split out of a controller lives here, not in features/, which holds controllers only". Conventions § Composition roots bullet 3 and `render/CLAUDE.md` still say `render/` holds pure DOM builders. That conflict is the open item in `proposed-backlog.md` ("Settle where a controller's DOM-free pure decision lives"). So the comment states as fact a rule the backlog item has not settled yet.
4. **[note]** For review-work (registry). The gates' one failing line is `10-kb-check.log`: 7 files are "owned by no feature". They are `internal/claudecode/modelcheck.go` and its test, `web/src/render/launchrestore.ts` and its test, and three `web/e2e/launch-*.spec.ts` files. The diagram half of cycle-2 Note 10 is fixed: kb:diagram/web-components now says `render/` has "22 modules", and 22 non-test modules exist there.
5. **[note]** Shared state and races are unchanged from cycle 2: `touched` has named writers, and the daemon closure captures only an immutable value. The gates' `go test -race -count=1 ./...` (`02-test.log`) is green, as are web-test (45 files, 1837 tests) and lint. The size log has 12 WARN hits and no `dupl` lines. The test-file funlen hits are outside this diff.
