# Maintainability review: New Session Improvement

**Plan**: new-session-improvement
**Verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 30625 words (budget 8000) — sections — rules 1874 · features 10176 · diagrams 3889 · decisions 11693 · proposed 0 · facts 2462 · lessons 523 · runbooks 2
**Scope**: 14 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (4 of them CLAUDE.md files: 3 changed only in the generated trailer, and `internal/claudecode/CLAUDE.md` also changed one hand-written invariant line)

## Cycle-1 findings, re-checked

| Cycle-1 finding | State now | Evidence |
|---|---|---|
| Major 1 (timeout policy in the composition root) | resolved | `modelCheckTimeout` now sits in `internal/claudecode/modelcheck.go:80` and is applied inside `CheckModel` (`:121-122`), matching `credentials.go`'s `keychainExecTimeout`. `server.go:192-194` is a one-statement closure that only binds `claudeBin`, the same form as the root's existing `attach` default (`:151-158`). The canary harness's redundant outer wrap is gone (`rg modelCheckRunTimeout test/canary` finds nothing). |
| Major 2 (second copy of `focusSession`) | resolved | `rg -n 'app\.focus\(\|\.promote\(\|promoteTile\(' web/src --glob '!*.test.ts'` now finds the Focus/Tiles branch only in `focus.ts:114-121` (`bringForward`). `launch.ts:574` reaches it through a structurally typed `deps.focus`, the same shape as `rail.ts:23`'s `surfaces: { focusSelected(id: number): void }`. |
| Major 3 (pure module in `features/`) | resolved as filed | `rg -n 'from "\./' web/src/features --glob '!*.test.ts'` finds nothing, and there is no hyphenated filename left. The new location `render/` is covered in Note 1. |
| Minor 1 (`openFallback` relabel) | resolved | The function was removed, and `initOpen` (`launch.ts:351-379`) switches on the outcome itself. This removal is what Minor 1 below follows from. |
| Minor 2 (restore values computed twice) | resolved | `repoRestore` (`launchrestore.ts:33`) is the one owner. The Recent click (`launch.ts:188`) and `initialRestore` (`:42`) both call it. `DEFAULT_MODEL` is the only fallback literal, and `MODEL_PRESETS` at `launch.ts:38` is a separate concept. |
| Minor 3 (size reasons missing, daemon) | resolved | Reasons are now in Decisions. See Notes 4 and 5. |
| Minor 4 (`api.ts` filelen reason) | resolved | A reason is now in Decisions (pre-existing file; this change is comment-only). |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/claudecode/CLAUDE.md | — (one hand-written invariant line, plus the trailer) | n/a | — | pass |
| internal/claudecode/launch.go | settings.go, credentials.go | n/a (no new type) | — | pass |
| internal/claudecode/modelcheck.go | credentials.go, version.go | yes (2), plus the fix-attempt reason for the timeout | — | pass |
| internal/server/CLAUDE.md | — (generated trailer) | n/a | — | pass |
| internal/server/server.go | usage.go; the `attach` default in the same function | reason given in the cycle-1 fix attempt | funlen `New` 48>40, reason holds | pass (Note 4) |
| internal/server/sessions.go | the in-file `launchError` constructors; `validateLaunchRequest`/`writeSettings`/`spawnAndRecordLaunch` | n/a | funlen `Launch` 83>60 and filelen 814, reason holds; `Resume` 41>40 is untouched | pass (Note 5) |
| web/src/api.ts | app.ts, protocol.ts | n/a | filelen 776, reason holds | pass |
| web/src/features/CLAUDE.md | — (generated trailer) | n/a | — | pass |
| web/src/features/focus.ts | rail.ts, surfaces.ts, launch.ts, main.ts | yes (fix attempt) | — | pass |
| web/src/features/launch.ts | focus.ts, rail.ts, surfaces.ts | yes | filelen 582, reason holds | Minor 1 |
| web/src/main.ts | — | n/a | — | pass (one registration argument changed) |
| web/src/render/CLAUDE.md | — (generated trailer) | n/a | — | pass |
| web/src/render/launchrestore.ts | render/crumbs.ts, render/focusrestore.ts, render/dead.ts, sessions/*.ts | yes (fix attempt, with grep) | — | Minor 1, Note 1 |
| web/src/terminal/pane.ts | terminal/*.ts | n/a (comment only) | — | pass |

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[web-impl]** `NavigateOutcome` is declared at `web/src/render/launchrestore.ts:53`, but that module neither produces nor consumes it. Its only producer is `navigate()` at `web/src/features/launch.ts:297`, and its only consumers are `navigateUp` (`:321`) and `initOpen` (`:351-379`) in the same file. It stayed behind when `openFallback` was removed. This diverges from its siblings. Every other exported type in the pure `render/` modules appears in an exported function signature in its own module:
   - `crumbs.ts:7` `Crumb` → `splitCrumbs(path: string): Crumb[]` (`:18`)
   - `focusrestore.ts:10` `RestorableCandidate` → `isRestorableControl` (`:19`)
   - `focusrestore.ts:26` `FocusRestoreInput` → `shouldRestoreFocus` (`:41`)
   - `launchrestore.ts`'s own `Touched`/`Restore` → `initialRestore` (`:41`)

   `NavigateOutcome` is the only exception. `launch.ts` already declares its own exported types (`LaunchModalElements` `:40`, `LaunchModalHandlers` `:63`). The type's doc comment (`:49-52`) also describes a function that no longer exists ("why the outcome-to-fallback mapping that used to live here was removed"). This cites § Design "Match the siblings" and "One owner per concept". **A fix must make these true:** `navigate()`'s return type is declared beside `navigate()`, and `render/launchrestore.ts` exports only what its own functions take or return.

### Notes

1. **[note]** Where `launchrestore.ts` now lives. Conventions § Composition roots bullet 3 reads "`web/src/render/` holds pure DOM builders … `web/src/sessions/` and `web/src/terminal/` hold pure logic". `render/CLAUDE.md` opens "pure DOM builders, no state … derivation lives in `web/src/sessions/`/`web/src/reader/`", and kb:diagram/web-components labels `render/` "DOM only". `launchrestore.ts` has no DOM in it. The fix-attempt `design:` line gives a reason with a grep: it follows `render/focusrestore.ts`, which is also DOM-free ("No DOM here", from plan general-cleanup), and the `render/→api` edge already exists (`render/dead.ts:9`). Moving the module to `sessions/` would add a new `sessions/→api` edge to a graph the diagram calls strictly layered. So the placement follows a real sibling, and a newcomer would not misread it. My cycle-1 bar pointed at `focusrestore.ts` as a sibling, so filing this again would move the goalposts. The rule and the practice disagreed before this plan. Settling where a controller's non-DOM pure decision goes is a conventions edit, and that belongs in the backlog, not with an impl agent.
2. **[note]** For review-work (§ Comments, "don't narrate history"). This branch added comments that cite review findings or earlier states: `focus.ts:65-66` (the `bringForward` doc), `launch.ts:186`, `:347-349` (a paragraph about the removed `openFallback`), `:572-573`, `launchrestore.ts:4-5`, `:30`, `:51-52`, and `sessions.go:147` and `:214` ("before this plan"). A newcomer cannot resolve "review-maintainability cycle 1 Major 2" from the code. The tree already had this habit before this plan (`sessions.go:418, :470, :486, :584`, `pane.ts:195`).
3. **[note]** For review-work (comment truth, pre-existing). The "Launch validates req, runs the model check, …" paragraph (`sessions.go:150-153`) sits in the same comment block as `validateLaunchRequest`'s doc (`:154-158`), so Go attaches it to `validateLaunchRequest`. `Launch` itself (`:206`) has no doc comment. Cycle 1's correctness Minor 4 edited the paragraph where it stood.
4. **[note]** The reason given for `New` funlen 48>40 holds. `New` is the single composition root. The `checkModel` field is one more entry in the existing `launcher := &sessionLauncher{…}` literal, which adds no statement, and the fix attempt measured 48 on `main` as well.
5. **[note]** The reason given for `Launch` funlen 83>60 / file 814 holds in substance. The model-check block (`sessions.go:209-220`) has the same shape as the fail-open probe that already sits inline in the same function: the `MaxSessionID` call, warn on error, degrade (`:267-271`). One part of the argument is muddled, though. It cites `validateLaunchRequest` as a reason not to extract, but that function is exactly the extracted `if lerr := …; lerr != nil { return nil, lerr }` shape. No split requested (kb:adr/process-size-linters-warn-never-fail).
6. **[note]** Some Decisions lines now contradict the code, because the fix-attempt sections superseded them without striking them. `daemon-implementation.md` Decisions bullet 3 still says "The 5 s timeout is applied at the `server.go` wiring closure, not inside `CheckModel`". `web-implementation.md` Decisions bullets 3 and 6 still describe `launch-restore.ts` beside `launch.ts` and say "No grep … was needed". These are plan artifacts, not code, so no change is requested. A later reader of the log, such as retro, should take the fix-attempt sections as current.
7. **[note]** Unchanged from cycle 1 and still no change requested. `modelCheckWaitDelay` is the one named `WaitDelay` constant. A nil `checkModel` means "skip the check" for literal-built test launchers, where the sibling `cfg.Attach` resolves nil to a default instead. The spellings `ModelUnrecognised` and `modelUnrecognized` sit side by side.
8. **[note]** Shared state. `touched` (`launch.ts:97`) is declared with its writers named: the DOM listeners (`:508`, `:513`, `:517`) and `resetForm` (`:387`). Its one reader is `applyInitialRestore`. The page is single-threaded. The only async interleaving is a close and reopen while `initOpen` is still awaiting, and that already goes through `browseRequestId`'s `"superseded"` path. On the daemon side, the `checkModel` closure captures only the immutable `claudeBin`. `go test -race` is green (`02-test.log`).
9. **[note]** Layering. No Claude-Code-format knowledge has leaked: the D11 grep over `internal`/`cmd` outside `internal/claudecode/` is clean, and `server.go`/`sessions.go` see only `ModelVerdict`. `main.ts` changed by one argument in an existing registration line.
10. **[note]** For review-work (registry/DIAG). The gates' `10-kb-check.log` fails with `internal/claudecode/modelcheck.go` (and its test, plus two e2e specs) "owned by no feature". kb:diagram/web-components still counts `render/` as "21 modules", but 22 non-test modules now exist there.
11. **[note]** The size log's funlen hits on test files (`launch_test.go` `TestBuildArgv`, three in `sessions_test.go`, two in `test/canary/harness_test.go`) are outside this review's diff, and the log has no `dupl` lines.
