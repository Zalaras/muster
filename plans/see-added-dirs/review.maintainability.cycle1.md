# Maintainability review: See added directories

**Plan**: see-added-dirs
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 16269 words (budget 30000)
**Scope**: 24 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/claudecode/status.go | (package exemplar itself), its `statusPayload`/`StatusUpdate` siblings `Cwd`, `Effort` | covered by REQ-1 line | none | pass |
| internal/server/reporefresh.go | sessionwire.go, server.go | yes (`checkoutRepo`, `RepoState.AddedRepos`, `ResolvePath` move) | none | pass |
| internal/server/sessionwire.go | reporefresh.go, server.go | covered (reuses `toWireLocation`) | funlen `toWireSession` 61 > 60, newly over, no reason | Minor 5 |
| internal/session/actions.go | location.go (`clearClaudeLocation`) | yes (writers line) | none | pass |
| internal/session/addeddirs.go | location.go, effort.go, status.go | yes | none | Minor 2 |
| internal/session/apply.go | status.go, manager.go (`nudgeRepoPoll`) | yes (nudge reuse) | none | Minor 3 |
| internal/session/liveness.go | location.go | yes (writers line) | none | pass |
| internal/session/manager.go | apply.go, server/server.go | yes (callback reuse, rename deferred) | filelen 625, reason holds | Minor 3 |
| internal/session/repo.go | location.go, row.go, writeorder.go | yes | none | pass |
| internal/session/row.go | its own `xFromRow`/`xToRow` pairs | covered (store line) | none | pass |
| internal/session/session.go | location.go (`ClaudeLocation` field) | yes (guard `Manager.mu`, writers named) | none | pass |
| internal/session/status.go | location.go `adoptClaudeDir`, effort.go | yes | none | pass |
| internal/session/writeorder.go | `restoreIfUnchanged` siblings in the same func | no line; inline compare is forced (a slice is not `comparable`) | none | pass |
| internal/store/migrations/0017_added_dirs.sql | 0015, 0016 | n/a | none | pass |
| internal/store/session.go | group.go (JSON kv blob with warn-on-corrupt), `decodeRowTime` | yes | filelen 548, reason holds; funlen `UpdateSession` 69 (was 64), `scanSession` 68 (was 66), no reason | Minor 5 |
| web/src/features/focus.ts | rename.ts, launch.ts (same focused-session lookup) | covered (panel owned by focus) | none | pass |
| web/src/protocol/session.ts | decode.ts, usage.ts, groups.ts | yes (`AddedDirectory`) | none | Major 2 |
| web/src/render/locationpanel.ts | grouppopover.ts, cardtip.ts, anchored.ts | yes (duplication acknowledged) | none | Major 1 |
| web/src/render/mainhead.ts | repolines.ts, context.ts | covered | none | pass |
| web/src/render/repolines.ts | context.ts, mainhead.ts, selectbar.ts | covered (render-tick reuse line) | none | Major 3 |
| web/src/sessions/card.ts | sections.ts, paths.ts | covered (model moved out of card.ts) | at threshold 494 lines, none hit | Minor 1 |
| web/src/sessions/locationpanel.ts | sections.ts (`popoverModel`), card.ts | yes | none | Minor 1 |
| web/src/sessions/testfixtures.ts | n/a (fixture default) | n/a | none | pass |
| web/src/style.css | `.pop .pr`/`.pop .pt` group popover rules | covered | n/a | pass |

## Issues

### Critical

None.

### Major

1. **[web-impl]** `createLocationPanel` is a second copy of `createGroupPopover`'s hover controller — `web/src/render/locationpanel.ts:53-89` against `web/src/render/grouppopover.ts:77-117`. Cites docs/conventions.md § Design, "Reuse before add": "A second implementation of an existing idea is a defect even when both work." The two are the same line for line: the `timer`/`panel` pair, `close()` (clearTimeout, `panel?.remove()`, null both), `show()` (close, build, `document.body.append`, `placeAnchored`), `onEnter` (close, then `setTimeout(show, POPOVER_DELAY_MS)`), and the add/remove of `mouseenter`/`mouseleave`/`pointerdown`. The only differences are that the group popover also opens on a keyboard focus, and the location panel skips opening when the model is null. The web `design:` line says this was copied on purpose ("the timer/close logic is therefore duplicated once"). The reason it gives is that `attach` is typed to `PopoverModel`. That is a type parameter, not a different idea, so it does not justify a copy. Also, `locationpanel.ts:3` imports `POPOVER_DELAY_MS` from the group feature's module, which shows the delay already has one owner the panel depends on. A fix must make this true: the delayed-hover lifecycle of a body-appended tooltip (timer, open panel, close, the three pointer listeners) has one implementation, and both the group popover and the location panel use it. The group popover keeps its focus path and `grouppopover.ts`'s exported API and behaviour stay unchanged.

2. **[web-impl]** `parseAddedDirs` re-implements `parseListOf` — `web/src/protocol/session.ts:241-250` against `web/src/protocol/decode.ts:43-52`. Cites § Design, "Reuse before add". decode.ts's header says it "owns how … 'an array of these' … [is] recognised" and that every protocol module imports from it. The new function is the same loop, the same `Array.isArray` guard and the same reject-the-whole-array-on-one-bad-element rule:
   ```
   $ rg -n 'Array.isArray' web/src/protocol --glob '!*.test.ts'
   web/src/protocol/session.ts:242:  if (!Array.isArray(value)) return null;
   web/src/protocol/decode.ts:8:  return typeof value === "object" && value !== null && !Array.isArray(value);
   web/src/protocol/decode.ts:44:  if (!Array.isArray(value)) return null;
   ```
   `usage.ts`, `groups.ts`, `messages.ts` and `batch.ts` all import `parseListOf`. A fix must make this true: `addedDirs` is decoded through `parseListOf` with the existing `parseClaudeLocation`, and `protocol/` holds no second array-decode loop.

3. **[web-impl]** `writeText` in `web/src/render/repolines.ts:8-10` duplicates `setText` in `web/src/render/context.ts:85-87`. Both are `if (el.textContent !== text) el.textContent = text;`. Cites § Design, "Reuse before add".
   ```
   $ rg -n 'export function (set|write)Text|function (setText|writeText|setIfChanged)' web/src
   web/src/render/repolines.ts:8:function writeText(el: HTMLElement, text: string): void {
   web/src/render/context.ts:85:function setText(el: HTMLElement, text: string): void {
   ```
   A fix must make this true: one named write-if-changed helper exists, and both render modules call it. Do not add a third private copy.

### Minor

1. **[web-impl]** The folder label of a repo readout is now decided in three places. Cites § Design, "One owner per concept … Two places that must agree will not." `partsOf` (`web/src/sessions/card.ts:183-185`) composes `` `${repo.name} /` `` or the basename. `mainheadMeta` (`card.ts:248`) then strips that slash again with `repo.folder.replace(/ \/$/, "")`. `rowOf` (`web/src/sessions/locationpanel.ts:18`) decides "repo name, else basename" a second time, with its own null-branch rule. Checked with `rg -n 'basename\((session\.)?directory\)|\.name : basename' web/src` (only card.ts:183 and locationpanel.ts:18). A fix must make two things true: the repo-name-else-basename rule has one home, and the folder text is composed with or without the ` /` from the start, never composed and then edited back with a regex.

2. **[daemon-impl]** `session.ResolvePath` is in `internal/session/addeddirs.go:8`, but its callers and the stated owner are elsewhere. Its non-test callers include `deriveLocation` and `topLevel` (`internal/server/reporefresh.go:124,170`), which serve `claudeLocation`, not added directories. The daemon `design:` line puts it in `session` because that package "already owns `Elsewhere`, the symlink-resolved comparison rule". `Elsewhere` is in `location.go:31`, beside `Location`. The siblings put one concept per file (`location.go`, `effort.go`, `addeddirs.go`), so a reader looking for the path rule `Elsewhere` depends on would not look in the added-directories file. A fix must make this true: `ResolvePath` lives in the file its `design:` line names as its owner (with `Elsewhere`), and `addeddirs.go` holds only added-directory logic.

3. **[daemon-impl]** `Config.OnClaudeDirChange` and `Manager.onClaudeDirChange` (`internal/session/manager.go:96,122`; wired at `internal/server/server.go:198`) now also fire when the added-directory list changes (`internal/session/apply.go:196`, `nudgeRepoPoll(dirChanged || addedChanged)`). The name now states a narrower trigger than the code has. The `design:` line says so itself ("The name is now slightly narrow") and defers the rename. The reason it gives is the number of files the rename touches, which is not a reason the name is right. Cites § Design, "Match the siblings … naming". A fix must make this true: the callback's name describes what fires it, which is the repo poll being needed because the claude directory or the added-directory list changed. The `nudgeRepoPoll` name already does.

4. **[daemon-tests]** Follows maintainability Minor 3. `internal/session/repo_test.go:36` and `internal/server/reporefresh_test.go:77` set `OnClaudeDirChange`. They must use the renamed field in the same wave, so the tree compiles once Minor 3 lands.

5. **[daemon-impl]** Three funlen warnings on touched functions have no reason in `## Decisions`. Cites kb:adr/process-size-linters-warn-never-fail and § Design, "Size is read, not obeyed … Exceeding one is fine with a reason in Decisions". `toWireSession` (`internal/server/sessionwire.go:149`) goes from 60 to 61 on this branch's `AddedDirs:` line, so the warning is new. `UpdateSession` (`internal/store/session.go:296`, 64 to 69) and `scanSession` (`:466`, 66 to 68) grew past warnings they already had. The size `design:` line only covers the two file-length hits. A fix must make this true: each of the three has a reason in Decisions that the code bears out, or a real restructure. Do not split a function only to silence the warning.

### Notes

1. **[note]** `kb:diagram/web-components` gives `render/` as "41 modules". With `render/locationpanel.ts` added there are now 42 non-test modules (`ls web/src/render/*.ts | grep -v test | wc -l` gives 42). That is review-work's DIAG row.
2. **[note]** Shared state, question 3. `Session.AddedDirs` names its guard (`Manager.mu`) and its writers (`adoptAddedDirs`, `SetRepoState`, the three `clearAddedDirs` callers, and `restoreChangedFields`). Every writer assigns a fresh slice: `normalizeAddedDirs` and `withAddedRepos` both allocate, and nothing writes an element in place. So a `Clone()` that shares the backing array with a broadcast snapshot is safe. `RepoTargets` copies the paths under the lock. `readAddedRepos` reads off-lock and checks `isDir` again after the git reads (kb:lesson/off-lock-reading-revalidated-at-apply). `SetRepoState` applies a reading only to entries listed at apply time. The gates' `go test -race -count=1 ./...` is green. I found no interleaving that it would miss.
3. **[note]** `adoptAddedDirs` runs `EvalSymlinks` stats under `Manager.mu` on every status post that carries the key. The stated reason holds: `persistWholeRowLocked` already does SQLite I/O under that lock, and the stats run no git.
4. **[note]** `AddedDirectory` (`web/src/protocol/session.ts:44`) has the same shape as `ClaudeLocation`, while the Go side uses one `session.Location` and one `sessionWireLocation` for both. The `design:` line gives the naming reason. A shared name for `{directory, repo}` would mirror the daemon, but this is taste.
5. **[note]** Two display strings are composed in render builders: `+${addedCount}` (`web/src/render/repolines.ts:29`) and `` ` · ${row.branch}` `` (`web/src/render/locationpanel.ts:25`). render/CLAUDE.md says every displayed string comes from a view-model. The siblings do the same thing, for example `render/launch.ts:253` (`` ` · ${branch}` ``) and `render/context.ts:28`, so this matches local practice.
6. **[note]** The new panel CSS (`.pop .dr`, `.pop .sub`, `.pop .dr .df .b`, `.lead`) is scoped under the shared `.pop` class, not `.loc-pop`, which matches the group popover's `.pop .pr`/`.pop .pt`. A later `.sub` or `.b` inside the group popover would pick these rules up.
7. **[note]** `writeorder.go:222-224` restores `AddedDirs` with an inline `addedDirsEqual`, unlike its `restoreIfUnchanged` siblings. This is forced, because `restoreIfUnchanged` needs `comparable` and a slice is not.
8. **[note]** There are two test funlen hits, `internal/session/addeddirsrepo_test.go:16` (97 > 60) and `internal/store/session_test.go:181` (113 statements). Both are test files outside this diff, and neither is a `dupl` line, so they are not filed.
9. **[note]** The file-length warnings on `internal/session/manager.go` (625, which this branch only touched by removing lines) and `internal/store/session.go` (548) have a reason that holds: the column read and write belong with the row gateway.
