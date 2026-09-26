# Maintainability review: Maintainability Regressions

**Plan**: maintainability-regressions
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 20774 words (budget 20000) — sections: rules 1938 · features 2133 · diagrams 4297 · decisions 6992 · proposed 0 · facts 5237 · lessons 169 · runbooks 2 (WARN: over budget)
**Scope**: 16 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (4 of them are GENERATED `CLAUDE.md` trailers, not reviewed for shape)

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/claudecode/modelcheck.go | version.go, credentials.go (seam shape), settings.go | none for `BinaryIdentity`/`ResolveBinaryIdentity` | — | Minor 3 |
| internal/claudecode/settings.go | server/launcher.go `writeSettings`, selfupdate/apply.go `installBinary` | none for `writeScriptAtomically` | — | Major 1 |
| internal/server/launchermodels.go | browse.go, usage.go, repos.go, launcherrors.go, session/writeorder.go (cited coalescing precedent), updatemanager.go | yes (`modelsFeature`, `inflight`); none for `modelVerdict` | — | Minor 1, Minor 2, Minor 3 |
| internal/server/launcher.go | browse.go, usage.go (constructor shape) | none for `defaultClaudeBin` | funlen `Launch` 83>60, filelen 507 | Minor 3, Minor 4 |
| internal/server/launcherrors.go | respond.go | n/a (extract of an existing literal) | — | pass |
| internal/server/server.go | — (composition root; checked against kb:adr/process-composition-roots-registration-only) | covered by `modelsFeature` line | funlen `New` 42>40, reason in `New`'s doc comment holds | pass (note) |
| web/src/api/launch.ts | api/issue.ts, api/reader.ts, api/update.ts, api/sessions.ts | n/a | — | pass |
| web/src/protocol/models.ts | protocol/update.ts, protocol/prefs.ts, protocol/session.ts; api/launch.ts, api/issue.ts, api/reader.ts | none | — | Minor 5 |
| web/src/features/launchmodels.ts | launchcrumbs.ts, launchrestore.ts | yes | — | pass |
| web/src/features/launch.ts | issue.ts, surfaces.ts (request-counter idiom) | yes (REQ-13 generation) | filelen 580, reason holds | Minor 6 |
| web/src/render/launch.ts | render/crumbs.ts, render/masthead.ts | yes (flagged as a judgment call) | — | Major 2 |
| web/src/style.css | `.launch-error`, `.seg-track` rules | n/a | — | pass (note) |
| internal/claudecode/CLAUDE.md, internal/server/CLAUDE.md, web/src/features/CLAUDE.md, web/src/render/CLAUDE.md | — | generated trailer only | — | not reviewed |

## Issues

### Critical

None.

### Major

1. **[daemon-impl]** `writeScriptAtomically` is a second implementation of the temp-file, fsync, chmod and rename replace that `sessionLauncher.writeSettings` already does. See `internal/claudecode/settings.go:364` against `internal/server/launcher.go:474-505`. This breaks `docs/conventions.md` § Design, "Reuse before add … A second implementation of an existing idea is a defect even when both work". Decisions has no `design:` line for the new helper and no grep. The two bodies match nearly line for line. They use the same temp-name pattern `"."+filepath.Base(path)+".tmp-*"`, the same `defer func() { _ = os.Remove(tmpPath) }() // no-op once the rename below succeeds`, and the same comment, `// fsync before the rename, or a crash between them can still lose the write despite the rename itself being atomic (durable, not just atomic).` They differ only in the file mode and in where the chmod sits.
   ```
   $ rg -n 'CreateTemp|os\.Rename\(' internal cmd tools -g '!*_test.go'
   internal/selfupdate/install.go:158:	f, err := os.CreateTemp(dir, ".musterd-writable-*")
   internal/selfupdate/apply.go:232:	if err := os.Rename(tmpPath, exePath); err != nil {
   internal/claudecode/settings.go:373:	tmp, err := os.CreateTemp(dir, "."+filepath.Base(path)+".tmp-*")
   internal/claudecode/settings.go:400:	if err := os.Rename(tmpPath, path); err != nil {
   internal/server/launcher.go:481:	tmp, err := os.CreateTemp(settingsDir, "."+filepath.Base(path)+".tmp-*")
   internal/server/launcher.go:503:	if err := os.Rename(tmpPath, path); err != nil {
   ```
   A fix must leave one implementation of "atomically replace a file with these bytes at this mode". Both the wrapper-script writer and `writeSettings` must call it. A `design:` line must name its home and why that package owns it. It is generic file I/O, not Claude Code format, so "it's in `claudecode/` because the scripts are" is not enough of a reason. `selfupdate.installBinary` (`apply.go:220`) is a third, older variant with a fixed temp name and no fsync. The line should say whether it folds in too or why not.

2. **[web-impl]** `render/launch.ts:10` adds `import type { ModelRowState, ModelSelection } from "../features/launchmodels"`. It is the only shipped `render/*.ts` → `features/` edge, and it inverts the layering that three places document. kb:diagram/web-components says "features above render", with `features → render` as the only drawn direction. `web/src/render/CLAUDE.md` says wiring lives in `features/` and "a builder here takes the computed value". § Composition roots says "`render/` holds the DOM half only, taking the already-computed value as a parameter". The `design:` line says the only alternative was "two structurally-identical interfaces, one per file". The exact sibling in this same launch feature shows a third option: the type lives with the DOM half and the pure helper imports it downward.
   ```
   web/src/features/launchcrumbs.ts:5:import type { Crumb } from "../render/crumbs";
   web/src/render/crumbs.ts:8:export interface Crumb {
   ```
   Beside it, the new code has:
   ```
   web/src/render/launch.ts:10:import type { ModelRowState, ModelSelection } from "../features/launchmodels";
   ```
   A fix must leave `render/` importing nothing from `features/`. The parameter types `renderModelRowState` takes must be declared where `features/` already reaches, as `Crumb` is. The `design:` line must be corrected to name the sibling it matches.

### Minor

1. **[daemon-impl]** `modelsFeature.verdict` can let two check runs for the same (identity, model) go at once. Its own `modelCatalogCall` doc says this never happens ("every other caller for the same key waits on done instead of starting a second one"). The cause is that a finishing call deletes whatever inflight entry holds its key, including a newer generation's entry. Concrete interleaving:
   - A calls `verdict("opus")` under identity 1, registers `inflight1["opus"]=callA` and runs.
   - The binary changes.
   - B calls `verdict("opus")`, sees the new identity and replaces the map (`launchermodels.go:187`). It registers `inflight2["opus"]=callB` and runs.
   - A finishes. `delete(f.inflight, model)` (`:207`) removes callB from `inflight2`. The generation check correctly skips caching.
   - C calls `verdict("opus")`. It finds no cache entry and no inflight entry, so it starts a second concurrent run.
   - When B finishes it deletes C's entry the same way.

   Every run still returns a correct verdict, so this is extra subprocesses, not wrong answers. It breaks § Design, "Shared state names its writers and its guard": the guard is present, but the map's invariant is not held under it. None of the `TestModelsFeature_*` cases changes identity while a check is in flight. A fix must make a finishing call remove only its own entry, and a unit test must drive that interleaving through the `identify`/`check` seams.

2. **[daemon-impl]** Waiters on a shared run get the answer that depends on the leader's context. They also ignore their own context: `<-call.done` at `launchermodels.go:196` has no `ctx.Done()` arm, and the run uses the leader's `ctx` (`:203`). This breaks § Go, "context.Context is the first parameter of anything that blocks … nothing ignores ctx". Concrete interleaving:
   - The dialog-open `GET /api/models?model=opus` is the leader.
   - Its client goes away (a page reload), so `r.Context()` is cancelled. `runModelCheck` returns `ctx.Err()` (`modelcheck.go:90`), and the run becomes `catalogUnchecked`.
   - A `POST /api/sessions` with `model=opus`, already waiting on that call, gets `unchecked`. `newSessionLauncher`'s closure maps that to `ModelRecognised`, and the launch proceeds unchecked.

   On `main` that launch ran its own check under its own context. The cited precedent, `session/writeorder.go`'s write chain, also waits without ctx, but its waiters don't consume the leader's result. A fix must make one caller's cancellation unable to become another live caller's verdict. Alternatively, a `design:` line can state why that is accepted here.

3. **[daemon-impl]** New types and helpers have no `design:` line, which breaks § Design ("reported in its log's `## Decisions` as a `design:` line per new type, module or seam"):
   - `claudecode.BinaryIdentity`/`ResolveBinaryIdentity` (`modelcheck.go:130-160`). This is a new exported type in the adapter whose own doc calls it "generic file identity, not anything about Claude Code". `internal/server/updatemanager.go:325` already identifies a binary by size and mtime (`info.Size() == prev.Size() && info.ModTime().Equal(prev.ModTime())`). The line should say whether that was considered.
   - `modelVerdict`, the server-side tri-state beside `claudecode.ModelVerdict` (`launchermodels.go:23-33`).
   - `defaultClaudeBin` (`launcher.go:104`).

   A fix must add a `design:` line for each, giving the shape, why, and what it reused or matched.

4. **[daemon-impl]** The size reason for `launcher.go`'s `Launch` funlen hit contradicts the code. Decisions says `Launch` "crossed `funlen`'s 60-line threshold … from the `checkModel`/`newSessionLauncher` doc-comment expansion". But the only change inside `Launch` is two comment lines (hunk `@@ -208,10 +222,12 @@`), and funlen counts no comments. Counting non-comment lines in the body gives 83 on both `main` (`launcher.go:205-302`) and this branch (`:219-318`), so the warning predates the branch unchanged. The entry gives no reason why an 83-line `Launch` is fine; it only misattributes the cause. kb:adr/process-size-linters-warn-never-fail asks for a reason, and this is none. A fix must make the Decisions line state the pre-existing length and a reason that holds, or state that it is pre-existing and out of this plan's scope. Do not split `Launch`.

5. **[web-impl]** `web/src/protocol/models.ts` is a new module with no `design:` line. Its placement differs from every sibling HTTP-only response parser. `protocol/`'s other modules (`hello`, `messages`, `session`, `prefs`, `theme`, `update`, `usage`) are wire concepts the WS stream carries. Each HTTP-only response keeps its type and parser in its `api/<family>.ts`: `api/launch.ts:40 parseRepo`, `:91 parseBrowseResult`, `api/issue.ts:20 parseIssueCapture`, `api/reader.ts:51 parseReaderListing`, `api/update.ts:47 parseRestartImpact`, `api/terminal.ts:11 parseLocatedFile`. `GET /api/models` is HTTP-only. Its one runtime importer is `api/launch.ts:5`, and `features/launchmodels.ts` needs only the type, just as `launchrestore.ts:5` takes `Repo` from `api/launch`. This breaks § Design, "Match the siblings … or says in Decisions why it diverges". A fix must either put the verdict type and parser where the other launch-endpoint parsers live, or add a `design:` line saying why this wire gets a `protocol/` module.

6. **[web-impl]** The `modelVerdicts` declaration doesn't name all its writers, and one of them skips the generation capture the module rests on. The declaration (`features/launch.ts:118-122`) says "Read only through `updateModelRowState`/`requestModelVerdicts` below". Yet `resetForm` (`:382`) and `submit` (`:421`) also write it. `submit` passes `modelVerdicts.generation` read after `await launchSession(...)`, so its merge can never be dropped. `requestModelVerdicts` (`:154`) captures the generation before its await. Concrete interleaving:
   - Submit a model.
   - Press Cancel while the POST is in flight, then reopen. `resetVerdictStore` bumps the generation.
   - The 400 `model_unrecognized` lands and merges into the new open's store.

   `launchmodels.ts:59-63` says this staleness is what the generation exists to prevent. This breaks § Design, "Shared state names its writers and its guard". A fix must make the declaration name every writer. The launch-time merge must then either capture the generation before its await, like its sibling does, or state why a refusal deliberately applies to whichever open is current.

### Notes

1. **[note]** `review-work`'s part:
   - `features/CLAUDE.md`'s list of pure `<owner><concern>.ts` modules (`actionscopy.ts, connectionrestore.ts, connectionversion.ts, launchcrumbs.ts, launchrestore.ts, updateview.ts`) doesn't include `launchmodels.ts`.
   - `New`'s doc comment (`server.go:138`) still says "13 features".
   - The `.field-error` CSS comment says "same tone/type as `.launch-error`", but it uses `--fs-xs` against `.launch-error`'s `--fs-sm`.
   - The comments gate (`14-comments.log`) lists about 30 REQ-/INV-/D-/plan-name citations in shipped comments.
2. **[note]** For `review-work`'s DIAG row: the `render → features` edge in Major 2 is not drawn on kb:diagram/web-components. It goes away if Major 2 is fixed.
3. **[note]** The production `checkModel` closure (`launcher.go:127-132`) never returns an error, because `runCheck` now logs and folds errors into `catalogUnchecked`. Launch's own warn-and-proceed branch is therefore reachable only from test literals. It also round-trips the verdict: `claudecode.ModelVerdict`+err → `modelVerdict` → `claudecode.ModelVerdict`+nil. This is the shape kb:adr/launch-check-model-seam-keeps-its-signature (proposed) chose, so no change is asked.
4. **[note]** `newModelsFeature` takes a pre-defaulted `claudeBin` string, so `server.go:204` calls `defaultClaudeBin(...)` inline. Its sibling `newSessionLauncher` takes `LaunchConfig` and defaults inside. This is argument construction, not composition-root logic, but the two constructors resolve the same default at different layers.
5. **[note]** `errModelsInvalid` (`launchermodels.go:105`) is a sentinel no caller branches on. § Go allows "sentinel errors only where a caller genuinely branches on them", and `browse.go`'s sentinels exist because `handleBrowse` does branch. Its text also hard-codes "8" beside `modelsMaxRequested`.
6. **[note]** `launchermodels.go` holds `modelsFeature`/`GET /api/models`. § Composition roots names `internal/server/<name>.go`, but `themepoll.go`/`themeFeature` is prior art for a non-matching file name, so no change is asked.
7. **[note]** In `style.css`, `.seg-track label:has(input[aria-invalid="true"])` and `#custom-model-input[aria-invalid="true"]` repeat the same outline/offset/colour declarations. A selector list would give one rule.
8. **[note]** Size: `server.go` `New` 42>40 is pre-existing at 41 on `main`, with its reason in `New`'s own doc comment. That reason (one line per feature) holds for the added `models` line. `launcher.go` at 507 lines (491 on `main`) grew from comment prose plus `defaultClaudeBin`, and the reason holds. `features/launch.ts` at 580 lines (504 on `main`) grew from controller glue with the pure derivation extracted, and the reason holds.
