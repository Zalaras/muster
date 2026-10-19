# Maintainability review: See added directories

**Plan**: see-added-dirs
**Verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 17205 words (budget 30000)
**Scope**: 33 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`. This is a full cycle, because cycle 1 had Majors open. The 18 files the fix wave touched (`git diff 7a4e67ea..HEAD`) were read in full. The other 15 were re-checked against their cycle-1 rows and are unchanged since then.

## Prior cycle's issues

| Cycle-1 issue | Fix commit | Verified how |
|---|---|---|
| Major 1, second hover controller | 4bca4ec0 | `render/hovertip.ts` `createHoverTip<M>(build)` now owns the timer, the open panel, `close` and the three pointer listeners. `grouppopover.ts` and `locationpanel.ts` are both `createHoverTip(buildPanel)`. The group popover keeps its focus/blur path in its own `attach`, and its exported `attach`/`close`/`POPOVER_DELAY_MS` are unchanged. `rg -n 'mouseenter' web/src --glob '!*.test.ts'` finds the lifecycle only in `hovertip.ts`, plus `cardtip.ts`, which has its own different per-card lifecycle (stated in the design line, and it holds) |
| Major 2, `parseAddedDirs` loop | 4bca4ec0 | `protocol/session.ts:385` is `parseListOf(rawAddedDirs, parseClaudeLocation)`. `rg -n 'Array.isArray' web/src/protocol --glob '!*.test.ts'` finds only `decode.ts` |
| Major 3, `writeText`/`setText` | 4bca4ec0 | there is one `setText` in `web/src/dom.ts:42`, and `render/context.ts` and `render/repolines.ts` both import it. Both private copies are gone |
| Minor 1, folder rule in three places | 4bca4ec0 | `folderName` (`sessions/card.ts:180`) is the one repo-name-else-basename rule, and `sessions/locationpanel.ts:18` calls it. `partsOf` takes `slash`, and `rg -n 'replace\(/ ' web/src/sessions/card.ts` finds nothing |
| Minor 2, `ResolvePath` home | 747e8d74 | `ResolvePath` is at `internal/session/location.go:41` beside `Elsewhere`, and `addeddirs.go` holds only added-directory logic |
| Minor 3 + 4, callback name | 747e8d74, 9f4adcbd | the callback is `Config.OnRepoPollNeeded` / `Manager.onRepoPollNeeded` (`manager.go:96,121`), wired at `server.go:198`. The tests use the new name, since `rg -n OnClaudeDirChange internal` finds nothing |
| Minor 5, three funlen hits | 747e8d74 | the Decisions `size:` line gives a reason, and the code bears it out (see Notes 4) |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/claudecode/status.go | `statusPayload`/`StatusUpdate` siblings `Cwd`, `Effort` | covered (REQ-1 line) | none | pass |
| internal/gitutil/gitutil.go | its own `isRepo`/`branch`/`topLevel` runners; `server/reporefresh.go` `topLevel`; `session/location.go` `ResolvePath` | no line for `resolveFrom` | none | Minor 1 |
| internal/server/reporefresh.go | sessionwire.go, usagepoll.go, launchermodels.go (`verdicts`) | yes (added read in `readRepoState`, slot pool) | none | pass (Note 2) |
| internal/server/server.go | n/a (one-line rename at the registration) | yes (rename) | `New` 52 > 40, predates this branch; the branch only renames one key | pass |
| internal/server/sessionwire.go | reporefresh.go, server.go | covered (reuses `toWireLocation`) | funlen `toWireSession` 61, reason holds | pass |
| internal/session/actions.go | location.go (`clearClaudeLocation`) | yes (writers line) | none | pass |
| internal/session/addeddirs.go | location.go, effort.go, status.go | yes | none | pass |
| internal/session/apply.go | status.go, manager.go (`nudgeRepoPoll`) | yes | none | pass |
| internal/session/liveness.go | location.go | yes | none | pass |
| internal/session/location.go | addeddirs.go, effort.go | yes (`ResolvePath` beside `Elsewhere`) | none | pass |
| internal/session/manager.go | apply.go, server/server.go | yes (rename) | filelen 622, reason holds | pass |
| internal/session/repo.go | location.go, row.go, writeorder.go | yes | none | pass |
| internal/session/row.go | its own `xFromRow`/`xToRow` pairs | covered (store line) | none | pass |
| internal/session/session.go | location.go (`ClaudeLocation` field) | yes (guard `Manager.mu`, writers named) | none | pass |
| internal/session/status.go | location.go `adoptClaudeDir`, effort.go | yes | none | pass |
| internal/session/writeorder.go | `restoreIfUnchanged` siblings | inline compare is forced (a slice is not `comparable`) | none | pass |
| internal/store/migrations/0017_added_dirs.sql | 0015, 0016 | n/a | none | pass |
| internal/store/session.go | group.go (JSON kv blob), `decodeRowTime` | yes | filelen 548, funlen `UpdateSession` 69, `scanSession` 68, reasons hold | pass |
| web/src/dom.ts | `requireElement`, `checkRadioValue` | covered (fix-wave table) | none | pass |
| web/src/features/focus.ts | rename.ts, launch.ts (same focused-session lookup) | yes (panel state owned by the hover-tip instance) | none | pass |
| web/src/protocol/session.ts | decode.ts, usage.ts, groups.ts | yes (`AddedDirectory`) | none | pass |
| web/src/render/CLAUDE.md | n/a | n/a | n/a | pass |
| web/src/render/cardtip.ts | hovertip.ts | covered | none | pass |
| web/src/render/context.ts | repolines.ts, dom.ts | covered | none | pass |
| web/src/render/grouppopover.ts | hovertip.ts, locationpanel.ts, railsections.ts | yes | none | pass (Note 1) |
| web/src/render/hovertip.ts | grouppopover.ts, cardtip.ts, anchored.ts, menu.ts | yes (shape, `refresh` key, state owner) | none | pass |
| web/src/render/locationpanel.ts | grouppopover.ts, hovertip.ts | yes | none | pass |
| web/src/render/mainhead.ts | repolines.ts, context.ts | covered | none | pass |
| web/src/render/repolines.ts | context.ts, mainhead.ts, dom.ts | covered (render-tick reuse line) | none | pass |
| web/src/sessions/card.ts | sections.ts, paths.ts, locationpanel.ts | yes (`folderName`) | filelen 501, reason holds | pass |
| web/src/sessions/locationpanel.ts | sections.ts (`popoverModel`), card.ts | yes | none | pass |
| web/src/sessions/testfixtures.ts | n/a (fixture default) | n/a | none | pass |
| web/src/style.css | `.pop .pr`/`.pop .pt` | covered | n/a | pass |

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[daemon-impl]** The new `gitutil.resolveFrom` (`internal/gitutil/gitutil.go:104-113`) repeats the resolve-else-clean rule that `session.ResolvePath` (`internal/session/location.go:41-46`) already owns, and its `design:` line says nothing about it. Cites docs/conventions.md § Design: "Reuse before add … `rg` for one that already does it and paste the grep in Decisions", and "Match the siblings … or says in Decisions why it diverges". The two implementations:
   ```
   $ rg -n 'resolveFrom|ResolvePath\(|func resolveTranscriptDir' internal --glob '!*_test.go'
   internal/session/location.go:41:func ResolvePath(path string) string {
   internal/gitutil/gitutil.go:104:func resolveFrom(dir, path string) string {
   internal/server/reporefresh.go:200:	resolved := session.ResolvePath(*top)
   internal/session/addeddirs.go:35:		dir := ResolvePath(entry)
   internal/claudecode/launchtranscripts.go:54:func resolveTranscriptDir(dir string) string {
   ```
   `resolveFrom` joins a relative path to `dir` and then runs `EvalSymlinks`, falling back to `Clean`. That is `normalizeAddedDirs`'s join (`addeddirs.go:32-35`) followed by `ResolvePath`. It also breaks the shape gitutil already has. Until now gitutil returned what git prints, and the caller resolved it: `server/reporefresh.go:196-201` `topLevel` is "gitutil.TopLevel with the answer resolved the same way as the directories it is compared against", through `session.ResolvePath`. `isWorktree` now resolves inside the adapter with its own copy. There is a reason that could hold. `IsWorktree` returns a bool, so the caller cannot resolve the two paths itself, and gitutil, a leaf adapter in `kb:diagram/daemon-components`, cannot import `session`. But that reason is not written down, and the cycle-1 fix wave's Decisions list no `rg` for this helper. A fix must make one of these true. (a) `## Decisions` has a `design:` line naming `resolveFrom`, the existing rule it repeats and why gitutil keeps its own copy, and that reason has to hold. (b) The resolve-else-clean rule has one implementation that both the domain and gitutil call, and no adapter imports `internal/session`.

### Notes

1. **[note]** `grouppopover.ts:14` still re-exports `POPOVER_DELAY_MS` from `hovertip.ts`, which keeps its exported API unchanged as cycle 1 asked. Its only remaining importer is a test, `web/src/render/locationpanel.test.ts:3`, while `cardtip.ts` and `hovertip.test.ts` import the constant from its owner. A later tidy could repoint that test and drop the re-export. No change requested here.
2. **[note]** The Decisions say `readAddedRepos`'s bounded fan-out (a buffered-channel slot pool plus `sync.WaitGroup`, `reporefresh.go:154-191`) works "like `launchermodels.go`". That is only partly true: `launchermodels.go:143-155` `verdicts` starts one goroutine per model with no slot pool. The slot pool is idiomatic and the `rg` for errgroup holds. Each worker writes only `readings[i]` and the read happens after `wg.Wait()`, so the readings are not shared state (question 3). Go 1.27 loop variables are per iteration, and the gates' `go test -race -count=1 ./...` is green.
3. **[note]** In `readRepoState` (`reporefresh.go:113-128`), `isDir(t.Directory)` is checked twice: before the added read (with `launchCtx.Err()`) and again in the return, together with the parent `ctx.Err()`. The second check revalidates after the added read, per kb:lesson/off-lock-reading-revalidated-at-apply. It reads as intentional, so it is not filed.
4. **[note]** The size reasons hold. `toWireSession` (61), `UpdateSession` (69) and `scanSession` (68) are flat field-for-field mappings: one struct literal plus nil-guards, one UPDATE with every column, one Scan with every column. None of them has nested branching that interleaves concerns, so a split would only move lines. `manager.go` (622) shrank on this branch. `store/session.go` (548) keeps the column read and write with the row gateway. `sessions/card.ts` is 501 lines, and its reason holds: `sessions/paths.ts:1` declares itself pure path derivation, so `folderName`, a `SessionRepo` rule, does not belong there.
5. **[note]** Shared state is unchanged from cycle 1 Note 2. `Session.AddedDirs` names `Manager.mu` and its writers, and every writer assigns a fresh slice. The new hover-tip `open`/`timer` pair belongs to one `createHoverTip` instance. `focus.ts` calls its `refresh()` only from `renderView`, so no second render pass writes it.
6. **[note]** The `kb:diagram/web-components` counts now match the tree: `render/` "43 modules" against 43 non-test `.ts` files, and `sessions/` "17 modules" against 17 (counting `testfixtures.ts`). That row is review-work's.
7. **[note]** Out of diff: these test funlen hits are in test files and none is a `dupl` line, so they are not filed: `internal/server/reporefresh_test.go:299` (113), `internal/session/addeddirsrepo_test.go:16` (97), `internal/session/repo_test.go:281` (145), `internal/store/session_test.go:181` (113 statements).
