# Maintainability review: New Session Improvement

**Plan**: new-session-improvement
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 30622 words (budget 8000) — sections — rules 1874 · features 10176 · diagrams 3889 · decisions 11693 · proposed 0 · facts 2459 · lessons 523 · runbooks 2
**Scope**: 12 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (3 of them generated CLAUDE.md trailers)

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/claudecode/CLAUDE.md | — (generated trailer) | n/a | — | pass |
| internal/claudecode/launch.go | settings.go, credentials.go | n/a (no new type) | — | pass |
| internal/claudecode/modelcheck.go | credentials.go, version.go, internal/ghissue/ghissue.go | yes (2) | — | Major 1 (wiring shape), notes |
| internal/server/CLAUDE.md | — (generated trailer) | n/a | — | pass |
| internal/server/server.go | usage.go, issue.go | no `design:` for the closure (a plain Decisions line gives the reason) | funlen `New` 48>40, no reason | Major 1, Minor 3 |
| internal/server/sessions.go | usage.go; in-file `launchError` constructors | n/a (`modelUnrecognized` matches its siblings) | funlen `Launch` 83>60 and filelen 814: growth recorded, no reason given; `Resume` 41>40 is an untouched function | Minor 3 |
| web/src/api.ts | app.ts, protocol.ts | n/a | filelen 777, no reason | Minor 4 |
| web/src/features/CLAUDE.md | — (generated trailer) | n/a | — | pass |
| web/src/features/launch-restore.ts | all 16 features/*.ts, sessions/rename.ts, render/focusrestore.ts, render/crumbs.ts | yes, but says "no grep … was needed" | — | Major 3, Minor 1 |
| web/src/features/launch.ts | focus.ts, rail.ts, surfaces.ts, tiles.ts | yes (3) | filelen 573, reason holds | Major 2, Minor 2 |
| web/src/main.ts | — | n/a | — | pass (one-line registration change) |
| web/src/terminal/pane.ts | terminal/*.ts | n/a (comment only) | — | pass |

## Issues

### Critical

None.

### Major

1. **[daemon-impl]** The model-check timeout policy and a closure that applies it live in the composition root: `internal/server/server.go:22-25` (`modelCheckTimeout` with its measured rationale) and `:198-202` (`context.WithTimeout` + `defer cancel()` + `claudecode.CheckModel(ctx, claudecode.RunModelCheck, claudeBin, dir, model)`). This breaks kb:adr/process-composition-roots-registration-only and conventions § Composition roots bullet 1 ("build dependencies and register each feature in one line"). It also diverges from the sibling that the `design:` line says it mirrors. `internal/claudecode/credentials.go` owns its own timeout: `const keychainExecTimeout = 2 * time.Second` (`:50`) is applied inside `KeychainTokenReader(user string, run execFunc) TokenReader` (`:57-59`). Its wiring is one expression, `claudecode.KeychainTokenReader(cfg.KeychainUser, claudecode.RunCommand)` (`internal/server/usage.go:77`), which sits in the feature file, not the root. The new shape is `CheckModel(ctx, run, bin, dir, model)`, with the deadline added by the caller. The reason Decisions gives for this ("keeps `CheckModel` timeout-agnostic … tested directly … without needing the production 5 s value") does not hold. `context.WithTimeout` on a parent that has an earlier deadline keeps the earlier one, so a test that passes a short-deadline ctx controls the timing even if the timeout lives inside `claudecode`, and `KeychainTokenReader`'s tests already work this way. This cites § Design "Match the siblings". I did not file it as Critical because the root's existing `attach` default (`server.go:157`) is a closure of the same form. **A fix must make these true:** the `checkModel` wiring in `server.go` is a single expression with no constant or policy of its own, and the timeout sits next to the check in `internal/claudecode`, the way `keychainExecTimeout` does.

2. **[web-impl]** `launch.ts:560-564` adds a second copy of focus.ts's `focusSession`. This cites § Design "Reuse before add" and "One owner per concept". `rg -n -B1 -A4 'app\.state\.view === "(tiles|focus)"' web/src/features/launch.ts web/src/features/focus.ts`:
   ```
   web/src/features/launch.ts:560:      if (app.state.view === "tiles") {
   web/src/features/launch.ts-561-        deps.tiles.promote(session.id);
   web/src/features/launch.ts-562-      } else {
   web/src/features/launch.ts-563-        app.focus(session.id);
   web/src/features/launch.ts-564-        app.render();
   --
   web/src/features/focus.ts-108-  function focusSession(session: Session): void {
   web/src/features/focus.ts:109:    if (app.state.view === "focus") {
   web/src/features/focus.ts-110-      app.focus(session.id);
   web/src/features/focus.ts-111-      app.render();
   web/src/features/focus.ts-112-    } else {
   web/src/features/focus.ts-113-      deps.promoteTile(session.id);
   ```
   focus.ts's own doc comment calls this "the shared tail of `nth`/`neediest`". Before this plan, launch.ts only split promote from render. The added `app.focus(session.id)` turns it into a line-for-line copy of `focusSession`. If one copy changes (for example, Tiles also setting `focusedId`), the other will not follow. **A fix must make this true:** "bring a session forward in the current view" has one owner. The number chords and `onLaunched` both call it, reaching it through a structurally typed `deps` entry (web/src/features/CLAUDE.md invariant 2: no sibling import).

3. **[web-impl]** `web/src/features/launch-restore.ts` is a pure-logic module in the controllers directory. `web/src/features/CLAUDE.md` "Owns" says: "one controller per feature … Pure logic lives in `sessions/` or `terminal/`, DOM building in `render/`". Conventions § Composition roots bullet 3 says the same, and kb:diagram/web-components draws `features/` as "16 controllers — Stateful per-feature controllers". Every sibling that splits a pure decision out of a controller puts it outside `features/`:
   - `sessions/rename.ts` holds the pure commit semantics that `render/rename.ts` calls.
   - `render/focusrestore.ts` holds the "pure focus-restore decision" for `features/connection.ts`.
   - Launch's own existing pure helper, `splitCrumbs`, is in `render/crumbs.ts`.

   `rg -n 'from "\./' web/src/features --glob '!*.test.ts'` returns one hit, `web/src/features/launch.ts:30`, so this is now the only intra-`features/` import in the tree. It is also the only hyphenated filename under `web/src`. A newcomer who reads kb:adr/process-one-name-per-feature (one name shared by controller, handler file, E2E prefix and helper) will look for a `launch-restore` feature that does not exist. The `design:` line says the plan named the location and "no grep … was needed". § Design "Reuse before add" asks for that grep in Decisions. **A fix must make these true:** `features/` holds only controllers, the pure restore decision lives where the directory rules put pure logic, and Decisions records the grep. A plan's placement does not override the directory's own CLAUDE.md. Changing that rule would be a conventions edit, and that is not an impl agent's call.

### Minor

1. **[web-impl]** `openFallback` (`launch-restore.ts:43`) is a 1:1 relabelling of `NavigateOutcome` (`ok→restore`, `failed→browse-root`, `superseded→none`). `initOpen` (`launch.ts:357-364`) then branches on its result with the same `if`/`else if` it would need on the outcome itself. The module header says the split keeps `initOpen` under Biome's cognitive-complexity ceiling, but that reason does not apply to this function, because the caller's branch count is unchanged. This cites § Design "seams where a test needs one and nowhere else" and "a pattern earns its name by the problem it solves". **A fix must make this true:** each exported decision in the module decides something its caller could not write as the same branch. (`initialRestore`'s touched filter does meet this bar.)

2. **[web-impl]** A repo's restore values are still computed in two places. The clicked-Recent path in `launch.ts:181-182` does `setModel(repo.lastModel ?? "sonnet")` / `setPermissionMode(repo.lastPermissionMode)`. `initialRestore` in `launch-restore.ts:27-28` computes the same pair, and with `touched` all false it gives an identical result. The default model `"sonnet"` now appears at `launch.ts:181`, `launch.ts:377` and `launch-restore.ts:27`, while `permissionModeToCheck` (api.ts) is the single owner for the mode fallback. This duplication existed before, but this change created an owner and left one caller outside it. This cites § Design "One owner per concept". **A fix must make this true:** a repo's restore values and the default model each have one owner, and both the Recent click and the initial restore ask it.

3. **[daemon-impl]** Two size warnings on touched functions lack a reason. `server.go:127` `New` funlen 48>40 grew with the closure, and Decisions gives no reason. `sessions.go:206` `Launch` funlen 83>60 and the 814-line file: Decisions records the growth ("noted here for the maintainability reviewer") but gives no reason the new step belongs inline. In this same function, the other steps are named (`validateLaunchRequest` `:159`, `writeSettings` `:252`, `spawnAndRecordLaunch` `:290`). This cites § Design "Size is read, not obeyed" and kb:adr/process-size-linters-warn-never-fail. **A fix must make this true:** Decisions gives a reason for each warning, and the code bears it out. This is not a request to split anything.

4. **[web-impl]** `web/src/api.ts` is 777 lines (filelen, threshold 500). This change touched it (a comment rewrite, +2 lines) and Decisions gives no reason. Citation as Minor 3. **A fix must make this true:** Decisions carries a reason.

### Notes

1. **[note]** `RunModelCheck` is the tree's fourth exec runner. `rg -n "^func Run[A-Za-z]*\(ctx context.Context" internal` finds `ghissue.RunCommand` (`ghissue.go:57`, stdout+stderr), `selfupdate.RunVersionProbe` (`exeversion.go:42`), `claudecode.RunModelCheck` (`modelcheck.go:52`) and `claudecode.RunCommand` (`credentials.go:32`, stdout only; stderr discarded; non-nil on exit ≠ 0). None of them can be reused here. `claudecode` is a leaf that imports nothing internal (kb:diagram/daemon-components), and `RunCommand`'s stderr-discarding behaviour is what `KeychainTokenReader` needs. The signature `(ctx, dir string, argv []string)` differs from every sibling's `(ctx, name string, args ...string)`, which the `dir` parameter explains.
2. **[note]** `modelCheckWaitDelay` (`modelcheck.go:38`) is a named constant, while all 11 other `cmd.WaitDelay` sites write `2 * time.Second` inline. It is harmless, but it is the one site that reads differently.
3. **[note]** `sessionLauncher.checkModel == nil` means "skip the check" (`sessions.go:145-148, 216`), and that branch exists only for literal-built test launchers. The nearest sibling optional dependency, `cfg.Attach`, resolves nil to the production default at construction (`server.go:155-163`), so a missing value there cannot silently drop the behaviour.
4. **[note]** `Restore.mode` is already a `PermissionMode` (via `permissionModeToCheck`). `applyInitialRestore` then passes it to `setPermissionMode`, which runs `permissionModeToCheck` on it again. This is idempotent, so the only cost is that the mode decision runs twice.
5. **[note]** Spelling: `claudecode.ModelUnrecognised` and `modelUnrecognized`/`"model_unrecognized"` sit on adjacent lines (`sessions.go:220-221`), so one grep will not find both. The tree already mixes the two spellings in identifiers (`tmux.StatusUnrecognized`, `kb.recognisedKBComment`), so there is no single convention to cite.
6. **[note]** The `launch.ts` filelen of 573 has a reason that holds: the decisions moved out, and `initOpen` meets the Biome ceiling. The `sessions.go` `Resume` funlen (41>40) is in a function this diff does not touch. The funlen hits on test files (`launch_test.go`, `sessions_test.go`) are outside this review's diff, and the size log has no `dupl` lines.
7. **[note]** Shared state. On the web side, `touched` (`launch.ts:91`) is declared with its writers named: the three DOM listeners at `:495/:500/:504` plus `resetForm`. Its one reader is `applyInitialRestore`. The page is single-threaded, and I found no interleaving that a guard would fix. On the daemon side, the `checkModel` closure captures only the immutable `claudeBin`, and `RunModelCheck`'s buffer is local. `go test -race` is green (`02-test.log`).
8. **[note]** Layering. `rg -n -e '"--no-session-persistence"' -e '"--bare"' -e "model catalog" internal cmd --glob '!internal/claudecode/**'` returns no matches (exit=1), so no Claude-Code-format knowledge has leaked. `main.ts` changed by one argument in an existing registration line.
9. **[note]** For review-work (registry/DIAG): `docs/features/launch/spec.md:10`'s `web:` glob (`web/src/features/launch.ts, web/src/render/crumbs*.ts`) does not cover `launch-restore.ts`, and `kb for web/src/features/launch-restore.ts` names no feature spec. kb:diagram/web-components counts `features/` as "16 controllers".
10. **[note]** For review-work (§ Comments, "don't narrate history"): `api.ts:278` begins "fallback changed by plan new-session-improvement REQ-5".
