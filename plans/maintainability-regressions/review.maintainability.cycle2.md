# Maintainability review: Maintainability Regressions

**Plan**: maintainability-regressions
**Verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 20782 words (budget 20000) — sections: rules 1938 · features 2133 · diagrams 4305 · decisions 6992 · proposed 0 · facts 5237 · lessons 169 · runbooks 2 (WARN: over budget)
**Scope**: 15 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`. Four of them are GENERATED `CLAUDE.md` trailers: only the hash and record-count lines changed, plus the hand-written `launchmodels.ts` list entry in `features/CLAUDE.md`. This is a full re-review, not a delta, because cycle 1 had open Majors.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/claudecode/settings.go | server/launcher.go `writeSettings`, selfupdate/apply.go `installBinary`, the leaf packages boundedwait/evict/keyedlock/locate (package docs and importers) | yes (`AtomicWriteFile` home, fix attempt 1) | — | pass (Notes 1, 2) |
| internal/claudecode/modelcheck.go | version.go, credentials.go, server/updatemanager.go:325 | yes (`BinaryIdentity`/`ResolveBinaryIdentity`) | — | pass |
| internal/server/launchermodels.go | browse.go, usage.go, issue.go, terminal.go (sentinels), session/writeorder.go | yes (`modelsFeature`, `inflight`, `modelVerdict`) | — | pass (Notes 3, 4) |
| internal/server/launcher.go | browse.go, usage.go | yes (`defaultClaudeBin`) | funlen `Launch` 83>60; pre-existing and unchanged, reason corrected in fix attempt 1 and it holds | pass |
| internal/server/launcherrors.go | respond.go | n/a (extract of an existing literal) | — | pass |
| internal/server/server.go | composition root, checked against kb:adr/process-composition-roots-registration-only | covered by the `modelsFeature` line | funlen `New` 42>40; reason in `New`'s doc comment holds | pass |
| web/src/api/launch.ts | api/reader.ts (`READER_LISTING_KINDS`/`isReaderListingKind`), api/issue.ts, api/update.ts, protocol/session.ts (`PERMISSION_MODES`) | yes (fix attempt 1, parser moved here) | — | pass |
| web/src/features/launchmodels.ts | launchcrumbs.ts, launchrestore.ts | yes | — | pass |
| web/src/features/launch.ts | issue.ts, surfaces.ts, connection.ts (focus handling) | yes | filelen 589; reason (controller glue, plus the writer-list and generation comments) holds | pass |
| web/src/render/launch.ts | render/crumbs.ts (`Crumb`), render/focuskeep.ts, render/diagramdialog.ts, render/rename.ts (`.focus()` in `render/`) | yes (corrected to cite `Crumb`) | — | pass |
| web/src/style.css | `.btn:disabled`, `.surfseg button:disabled`, `.launch-error` | n/a | — | pass (Note 6) |
| internal/server/launchermodels_test.go (size log only) | — | — | funlen `TestModelsFeature_CheckInFlightWhenIdentityChanges_NotCachedNorServed` 55>40 statements; **no reason** | Minor 1 |
| internal/claudecode/CLAUDE.md, internal/server/CLAUDE.md, web/src/features/CLAUDE.md, web/src/render/CLAUDE.md | — | generated trailer | — | not reviewed |

## Cycle 1 findings

| Cycle 1 finding | Fix commit | Verified how |
|-----------------|-----------|--------------|
| Major 1: duplicate atomic write | 893805c | `rg -n 'AtomicWrite\|writeScriptAtomically\|CreateTemp\|os\.Rename\(' internal cmd tools -g '!*_test.go'` shows one temp/fsync/rename body (`settings.go:376`), called from `settings.go:361` and `launcher.go:480`. The design line names the home and says why `selfupdate`'s variant is left out. |
| Major 2: `render/` → `features/` import | dea21cf | `rg -n '"\.\./features' web/src/render --glob '!*.test.ts'` finds nothing. `features/launchmodels.ts:7` imports the types from `../render/launch`, the same direction as `launchcrumbs.ts:5` → `render/crumbs`. |
| Minor 1: finishing call deletes a newer entry | 893805c | `launchermodels.go` has `if f.inflight[model] == call { delete(...) }`. `TestModelsFeature_CheckInFlightWhenIdentityChanges_NotCachedNorServed` drives the A/B/C interleaving through `identify`/`check`, under `-race` in the gates' test line. |
| Minor 2: waiters take the leader's ctx | 893805c | The run uses `context.WithoutCancel(ctx)`. Waiters `select` on `call.done` and on their own `ctx.Done()`. The verdict doc comment states the trade-off (see Note 3). |
| Minor 3: missing design: lines | 893805c | `design:` lines exist for `modelVerdict`, `BinaryIdentity`/`ResolveBinaryIdentity` (it weighs `updatemanager.go:325`) and `defaultClaudeBin`. |
| Minor 4: `Launch` funlen reason contradicts the code | log only | The fix attempt's Decisions entry says the warning is pre-existing on `main` and unchanged. That holds. |
| Minor 5: `protocol/models.ts` placement | dea21cf | `protocol/` no longer has `models.ts`. The parser sits in `api/launch.ts` beside `parseRepo`/`parseBrowseResult`. `MODEL_VERDICT_KINDS` + `isModelVerdictKind` follow `api/reader.ts:16-28` line for line. |
| Minor 6: `modelVerdicts` writers and generation | dea21cf | The declaration (`features/launch.ts:118-125`) names all three writers. `submit` now captures `generation` before `await launchSession(body)`, like `requestModelVerdicts`. |

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[daemon-tests]** `internal/server/launchermodels_test.go:203`, `TestModelsFeature_CheckInFlightWhenIdentityChanges_NotCachedNorServed`, trips `funlen` (55 > 40 statements; `15-size.log`), and nothing in `daemon-tests.md` gives a reason. The test was added in the cycle-1 fix wave (0ceccac). The "Fix Cycle 1" section never mentions size. The only size claim in the log, "none of the touched test files triggered a size warning" (`daemon-tests.md:203`), dates from wave 1 and no longer holds. This breaks `docs/conventions.md` § Design, "Size is read, not obeyed … Exceeding one is fine with a reason in Decisions". To fix, the log must state a reason for this hit that the test's shape supports. Do not split the test (kb:adr/process-size-linters-warn-never-fail). The test is one ordered interleaving with four gate channels, and a table would not express that. If that is the reason, say so.

### Notes

1. **[note]** `AtomicWriteFile` is generic file I/O exported from the Claude Code adapter package, whose package doc says it is "the adapter boundary for everything Claude-Code-specific". The design line gives two reasons. There is no import cycle to break. A new package would need a feature-spec `go:` glob that daemon-impl cannot add mid-wave. The first reason only half holds: `internal/locate` is a leaf package that breaks no cycle (it is imported by `cmd/musterd` and `internal/server`). The second is a process limit, not a design reason. Both callers write Claude Code config files (the wrapper scripts and `settings.local.json`), so a newcomer would find this home plausible. `selfupdate.installBinary` is still a third variant, and the design line names it as a follow-up. That follow-up is worth a `TODO.md` entry, so it does not live only in a plan log.
2. **[note]** Behaviour for `review-work`, not shape. `writeSettings` now inherits `AtomicWriteFile`'s skip-if-unchanged path. Before, every launch rewrote `settings.local.json` and re-applied 0o600. Now a file whose bytes already equal `merged` keeps whatever mode it has. `writeSettings` also reads the file (`launcher.go:456`) and `AtomicWriteFile` reads it again to compare (`settings.go:377`).
3. **[note]** The leader of a shared check runs on `context.WithoutCancel(ctx)`, so the leader's own caller waits out the run (bounded by `modelCheckTimeout`, 5 s), even after its request has gone. Waiters do not wait. The `verdict` doc comment states this, and cycle 1 accepted either a fix or a stated reason. One symmetric alternative: start the run detached and have the leader `select` on `done`/`ctx.Done()` like the waiters. That would bring the whole function in line with § Go "nothing ignores ctx". No change requested.
4. **[note]** `modelCatalogCall.verdict` is shared across goroutines, but the lock doesn't guard it. It is written once by the leader before `close(done)` and read only after `<-done`, which is sound through the close's happens-before. The struct's doc says others "wait on done" but doesn't state that write-before-close rule. The `mu` comment on `modelsFeature` lists its own fields only. One clause would complete § Design "names its writers and its guard". `errModelsInvalid` (cycle 1 Note 5) is still a sentinel no caller branches on, and it still hard-codes "8" beside `modelsMaxRequested`.
5. **[note]** For `review-work`, comment truth:
   - `New`'s doc (`server.go:138`) says "13 features". The file has 17 `register(s,` calls, against 16 on `main`.
   - `render/launch.ts`'s `ModelRowState` doc says "`features/launchmodels.ts` recomputes this on every verdict arrival". The recompute happens in `features/launch.ts`'s `updateModelRowState`.
   - `MODEL_PRESETS`'s doc (`launchmodels.ts:9-10`) calls it "the one place this list is written" in the same sentence that says `index.html` names the same four values.
   - `AtomicWriteFile`'s doc lists its two callers by name, which will go stale the next time someone calls it.
6. **[note]** In `style.css`, `.seg-track label:has(input[aria-invalid="true"])` and `#custom-model-input[aria-invalid="true"]` still repeat the same outline, offset and colour declarations (cycle 1 Note 7). A selector list would give one rule.
7. **[note]** Diagram check: no new module or dependency edge. The `features/` → `render/` and `features/` → `api/` edges are already on kb:diagram/web-components. `server` → `claudecode` is already on kb:diagram/daemon-components. Focus placement in `render/launch.ts:206-210` has `render/` precedent (`focuskeep.ts:66`, `diagramdialog.ts:93,126`, `rename.ts:117`).
