# Daemon Implementation: Maintainability Cleanup — Unit D10 (adapters)

**Plan**: maintainability-cleanup
**Mode**: initial
**Pack**: `kb: pack 68157 words (budget 8000)` — WARN pack exceeds budget; sections rules 1295 · features 26181 · diagrams 0 · decisions 27308 · proposed 0 · facts 9486 · lessons 3237 · runbooks 644 (`--plan maintainability-cleanup --role daemon-impl`). Worked primarily from the team lead's brief plus `review.maintainability.c-adapters.md` (Major 1, Major 2, Minors 1–8/10/12/15) and `review.maintainability.b-server.md` Major 7, read in full, not the raw pack.

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/gitutil/gitutil.go` | modified | Minor 1/c-m1 + b-M7/V3. Added `gitRunner` (constructor-default seam, `run` field defaulting to `runGit`) and rewired `IsRepo`/`Branch`/`IsWorktree` through it. Added `ListFiles(ctx, dir) ([]string, error)` — runs `git ls-files -co --exclude-standard -z`, parses the NUL-separated output into a plain path list (no `.md` filtering — that stays the reader's own concern). |
| `internal/server/reader.go` | modified | Minor 1/Major 7. Deleted `readerExecFunc`/`readerRunGit` (the server's own second git runner, `git -C dir ls-files ...`). Added `gitFilesFunc` — the reader's consumer-side seam over `gitutil.ListFiles`, defaulting to it in `newReaderFeature`. `listMarkdown` now filters/sorts a plain `[]string` instead of parsing NUL-delimited bytes itself; `bytes`/`os/exec` imports dropped. Also Minor 7: `readerPathQualifies`'s hand-rolled containment check → `filepath.IsLocal`. |
| `internal/claudecode/plan.go` | modified | Minor 7. `IsUnderDefaultPlansDir`'s hand-rolled containment check → `filepath.IsLocal`; `strings` import dropped (now unused). |
| `internal/selfupdate/install.go` | modified | Minor 7. `withinDir`'s hand-rolled containment check → `filepath.IsLocal`; `strings` import dropped. |
| `internal/claudecode/version.go` | modified | Minor 2 + Minor 8. Added `versionChecker` (constructor-default seam reusing credentials.go's `execFunc` type) and `runInstalledVersion`; `InstalledVersion`'s exported signature is unchanged (`ctx, bin` → `string, error`), so it stays a no-seam wrapper. `compareSemver`'s `compareInt` → stdlib `cmp.Compare`; `compareInt` deleted. |
| `internal/selfupdate/semver.go` | modified | Minor 8. `Version.Compare`'s `cmpInt` → `cmp.Compare`; `cmpInt` deleted. |
| `internal/claudecode/status.go` | modified | Minor 10. `StatusAccount.Source` field and its `Source: "subscription"` construction removed — the adapter no longer invents Muster's usage-source vocabulary. |
| `internal/server/ingest.go` | modified | Minor 10 + Major 2. Dropped `Source: acct.Source` from the `usage.Sample` literal (Aggregator's own default fills it). Major 2: `mount`'s two `mux.HandleFunc` patterns now build from `claudecode.IngestHookPath("{token}")`/`IngestStatusPath("{token}")` instead of a hand-spelled `"/ingest/{token}/hook"`/`.../status`. |
| `internal/usage/aggregator.go` | modified | Minor 15. `Aggregator`'s doc comment now names Record as its single writer and what `mu` guards, at the declaration (matches `ModelScoped`'s own declaration-level statement). |
| `internal/claudecode/credentials.go` | modified | Major 1. `RunCommand` → unexported `runCommand` (same body). Added `keychainReader{user, run}`; `KeychainTokenReader(user string) TokenReader` is now a no-seam wrapper over it — the `run execFunc` parameter is gone. |
| `internal/claudecode/modelcheck.go` | modified | Major 1. `ModelCheckRun`/`RunModelCheck` → unexported `modelCheckRun`/`runModelCheck`. Added `modelChecker{run}`; `CheckModel(ctx, bin, dir, model)` drops its `run` parameter and delegates to `newModelChecker().check`. |
| `internal/ghissue/ghissue.go` | modified | Major 1. `RunCommand` → unexported `runCommand` (same body, resolves the two-packages-share-the-name-"RunCommand" collision by construction). Added `ghTokenReader{lookPath, run}` defaulting to `exec.LookPath`/`runCommand`; `GhCLITokenReader()` takes no parameters now. |
| `internal/selfupdate/exeversion.go` | modified | Major 1. `RunVersionProbe` → unexported `runVersionProbe`. Added `versionProber{run}`; `ProbeVersion(ctx, exePath)` drops its `run` parameter. |
| `internal/server/updatemanager.go` | modified | Major 1. Removed `updateExecFunc` type and the `ExeRun`/`exeRun` field from `updateManagerConfig`/`updateManager` — `checkSwap` calls `selfupdate.ProbeVersion(probeCtx, m.exePath)` directly; the `m.exeRun == nil` guard is gone (nothing to be nil any more). |
| `internal/server/update.go` | modified | Major 1. Removed `UpdateConfig.ExeRun` and its wiring into `updateManagerConfig`. |
| `internal/server/usage.go` | modified | Major 1. `claudecode.KeychainTokenReader(cfg.KeychainUser, claudecode.RunCommand)` → `claudecode.KeychainTokenReader(cfg.KeychainUser)`. |
| `internal/server/issue.go` | modified | Major 1. `ghissue.GhCLITokenReader(exec.LookPath, ghissue.RunCommand)` → `ghissue.GhCLITokenReader()`; `os/exec` import dropped (now unused). |
| `internal/server/launcher.go` | modified | Major 1 + Minor 6. `claudecode.CheckModel(ctx, claudecode.RunModelCheck, claudeBin, dir, model)` → `claudecode.CheckModel(ctx, claudeBin, dir, model)`. Minor 6: `killWindowAfterRecordFailure(ctx, target, action)` → `killSessionAfterRecordFailure(ctx, id, action)`, now calling `l.tmux.KillSession(killCtx, tmux.SessionName(id))` instead of `KillWindow(killCtx, target)`, so launch/resume rollback shares KillSession's idempotent already-gone semantics with every other production caller. `MUSTER_SESSION` literal in `buildLaunchEnv` → `claudecode.MusterSessionEnvVar`. |
| `cmd/musterd/main.go` | modified | Major 1. Dropped `ExeRun: selfupdate.RunVersionProbe` from the `server.UpdateConfig{}` literal (the composition root no longer threads a never-varied run func). |
| `internal/claudecode/settings.go` | modified | Major 2. Added `MusterSessionEnvVar = "MUSTER_SESSION"` and `ingestPathPrefix`/`ingestHookSuffix`/`ingestStatusSuffix` + `IngestHookPath`/`IngestStatusPath`, the one declaration of the ingest URL path shape. `musterIngestPath`'s regexp and `WriteWrapperScripts`' URL-building both now derive from these instead of separately hand-spelling `/ingest/...`. `writeEnvelopeScript`'s generated shell body now interpolates `MusterSessionEnvVar` instead of a literal `$MUSTER_SESSION` (byte-identical output — `MusterSessionEnvVar == "MUSTER_SESSION"`). |
| `internal/tmux/tmux.go` | modified | Minor 3. `Client.exec`'s signature changed from `(ctx, name, args...) ([]byte, error)` (combined output) to `(ctx, name, args...) (stdout, stderr []byte, err error)`, renamed production default `execCombinedOutput` → `execSeparated`. `run` and `runCapture` both now go through this one seam; `runCapture` no longer builds its own `exec.CommandContext` and now gets `run`'s ctx-expiry wrapping (a deadline surfaces as `context.DeadlineExceeded`, not a bare `*exec.ExitError`), while still never folding stdout into its returned error. |
| `internal/claudecode/CLAUDE.md` | modified | The Invariants line naming `execFunc`/`ModelCheckRun` as the run-seam types updated to the current (now-unexported) names, so the hand-written doc stays true after the Major 1 rename. |

## Decisions

- **c-M2 ownership call ("say which")**: kept the ingest-route-shape and `MUSTER_SESSION` declarations in `internal/claudecode` rather than moving them to `internal/server`. `internal/server` already imports `internal/claudecode` at both call sites that now reference the declarations (`ingest.go`'s route registration, `launcher.go`'s `buildLaunchEnv`), so this uses the diagram's existing edge and adds no new one. The alternative (declaring in `internal/server` and having `claudecode.WriteWrapperScripts` take fully-built URLs instead of `baseURL`/`ingestToken`) would have needed a signature change breaking ~10 call sites across `settings_test.go`, `settings_shell_test.go` and `harness_test.go` for no behaviour gain, and `claudecode` still needs the *shape* on its own for `musterIngestPath`'s legacy-detection regexp regardless of who builds the final URL. This does not fully resolve the finding's secondary complaint ("claudecode holds Muster's own route/env vocabulary, not Claude-Code-format knowledge") — that vocabulary was already inside `claudecode` before this unit (duplicated, not sourced elsewhere); this unit collapses the duplication without relocating it. Flagging for the docs pass / a future ADR if the boundary is worth enforcing harder than "one declaration."
- **c-m12 (dead `claudecode.Classify`) — NOT done, evidence contradicts the finding.** `rg '\bClassify\('` over the whole tree (including `test/canary`, outside the review's own scope) finds a real caller: `test/canary/canary_test.go:59` (`TestInstalledVersionClassifies`) calls `claudecode.Classify(installed)` against a real installed `claude` binary on every canary run. The review's own rg ("finds only `selfupdate.Classify` in main.go and three assertions in `version_test.go:314-316`") did not include this file, presumably because it scoped to `cmd/musterd`+`internal/*` and `test/canary` sits outside that tree. `Classify` is not exported only for its own test — it has a genuine (if test-only) caller in a different package — so removing it would break a canary test for no correctness gain. Left in place.
- **Minor 4 (session-name prefix) and Minor 5 (absent-vs-error decision) were already fixed** by earlier work in this tree (a prior session-side unit): `tmux.go` already declares `sessionPrefix` once and `NewSession`/`ShellSessionName`/`SessionName`/`IsShellSessionName` all derive from it (`rg '"muster-"' internal/tmux/tmux.go` — the only production hits left are inside that one declaration's own doc comment); `ListPaneActivity`/`PaneExists`/`ListSessions` already share the absent-vs-could-not-ask decision through `tmuxAbsence`. Verified, not re-done.
- **Major 3 (selfupdate newer-check duplication) and Major 4 (claudecodetest builders)** were confirmed already landed by D7a and D9a respectively (per the team lead's brief) — not re-verified line-by-line beyond confirming `cmd/musterd/update.go` already calls `selfupdate.CheckNewer`/`ReleaseTag` rather than re-deriving them.
- **design: `gitutil.gitRunner`** — matches `tmux`'s `preflighter` shape exactly (unexported struct, one `run` field, `newGitRunner()` builds a fresh one per call since none of gitutil's functions carry per-call config beyond `ctx`/`dir`). `rg -n 'newPreflighter\(\)|NewSpotlightFinder\('` was the search that found the two existing shapes to match; the free-function API (no persistent state) matches `Preflight`'s "fresh struct per call" form rather than `SpotlightFinder`'s "constructed once, held by caller" form, since `gitutil`'s callers already call `IsRepo`/`Branch`/etc. as bare functions with no config to carry between calls.
- **design: `server.gitFilesFunc`** — the reader's own consumer-side seam, named for what it returns (a neutral file list) rather than the git command it happens to run today, per the debate's point 4 (`decisions/adapter-run-seam-shape/debate.md` turn 1, point 4): "server fakes a neutral `listFiles` result at its consumer instead" of git's own byte stream. `rg -n 'Func func\(ctx' internal/server/*.go` showed `usage.go`'s `TokenReader`/`execFunc` pattern is the sibling shape (a function-typed field on the feature struct, defaulted in the constructor) — matched that rather than inventing an interface.
- **design: `claudecode.versionChecker`/`ghissue.ghTokenReader`/`claudecode.keychainReader`/`claudecode.modelChecker`/`selfupdate.versionProber`** — all five follow the one shape the ADR settles (unexported struct holding the run func(s), a `newX()` constructor setting the production default, an exported no-seam wrapper function). `versionChecker` reuses credentials.go's existing `execFunc` type rather than declaring a fifth near-identical `func(ctx, name, args...) ([]byte, error)` type (`rg -n 'type .*Func func\(ctx context.Context'` inside `internal/claudecode` before adding it — only `execFunc` and `modelCheckRun` existed, and `execFunc`'s signature already matched what `InstalledVersion` needed).
- **`runInstalledVersion` keeps its own body** rather than becoming a second caller of `runCommand`: `runCommand` (credentials.go) uses `cmd.Run()` with `Stdout` set directly, which does not populate `*exec.ExitError`'s stderr on a non-zero exit; the pre-existing `InstalledVersion` used `cmd.Output()`, which does. Reusing `runCommand` would have silently changed `InstalledVersion`'s error text on the (already-tested, `docs/conventions.md §Testing` real-subprocess) descendant-leak case. Kept the two bodies distinct rather than risk an unverified behaviour change for a two-line dedup.
- **Minor 6 scope**: only `sessionLauncher`'s rollback path was moved from `KillWindow` to `KillSession` (the one production caller Minor 6 names). Did not remove `KillWindow` from the `paneSpawner` interface or from `tmux.Client`, even though it now has no remaining production caller: `paneSpawner` is a shared interface (also used by `server.go`'s `tmuxClient`/`TmuxClient` fields), and several test files across `internal/tmux`, `internal/termbridge` and `internal/server` call `KillWindow` through it deliberately (its own doc comment: "used by tests to simulate a dead pane without needing the E2E harness's own tmux socket") — removing it from the interface would break those call sites for a cosmetic gain the finding didn't ask for.
- **Minor 3 (`runCapture`/`Client.exec`) changes a shared field's signature** — measured blast radius: `rg -n '\.exec = func\(|exec: func\(' internal/tmux/*_test.go` finds two same-package sites: `activity_test.go`'s `fakeActivityExec` helper (the single choke point ~16 call sites in that file go through) and its own direct override in `TestListPaneActivity_RealTmux_OneInvocationCoversEveryPane`; plus `tmux_test.go:685`'s one direct `Client{exec: ...}` literal. No other package reaches `Client.exec` (it's unexported); every cross-package fake in `internal/server`/`internal/termbridge` tests already goes through `paneSpawner`/`Bridge`, not this field.

## Handoff

**Build status**: `go build ./...` exits 0.

**Gate output**:
- `gofmt -l .` — clean (no output).
- `go vet ./...` — clean except the sanctioned test-file breakage listed below (each failure is a `too many arguments`/`undefined`/`unknown field` typecheck error in a file this unit was not allowed to edit).
- `go vet -tags=canary ./test/...` — one sanctioned failure: `test/canary/harness_test.go:783: undefined: claudecode.RunModelCheck` (see below).
- `golangci-lint run --tests=false ./...` — **0 issues** (this is the signal-preserving run per the sanctioned-test-break rule; `make lint` itself fails at the first typecheck error the same way `go vet` does, in `internal/ghissue`).
- `go test -race -count=1 ./internal/gitutil/... ./internal/usage/...` — both `ok` (untouched-by-breakage packages, confirming Minor 1/15 didn't regress anything test-visible).
- `go test -count=1 ./internal/... ./cmd/...` — every package not listed below passed; the ones below fail to build, matching the sanctioned list exactly (re-run with the full tail pasted below).
- `make check-kb` — `kb: 426 records, 23 features, 0 problem(s)`.
- `make refs` — `dead-refs: 3084 references checked, 0 missing`.
- `make size-warn` — whole-tree run (not branch-scoped from here): the only touched-file hit is `internal/tmux/tmux.go:1: file is 716 lines (threshold 500)` (grew from 680), kept — Wave 1's own Notes already judged this file's size as comment volume (40%) plus Minors 4/5 (now fixed/verified), "a split is not asked for"; my change added doc comments plus one extra small function (`execSeparated`) to the same one-type method set, not a second concern.

**Sanctioned test breakage — every site, with what the test author must inject:**

*Same-package, run-func-shape changes (Major 1):*
- `internal/claudecode/credentials_test.go`: 7 calls `KeychainTokenReader("bob", run)` (lines 27, 40, 50, 60, 70, 86, 104) must become `KeychainTokenReader("bob")` with `run` injected as `(&keychainReader{user: "bob", run: run}).read` (or a same-package literal), and the exported wrapper covered separately if still wanted. Line 200's `RunCommand(...)` → `runCommand(...)` (mechanical rename, same signature).
- `internal/claudecode/modelcheck_test.go`: 5 calls `CheckModel(ctx, run, ...)` (lines 73, 99, 116, 133, 150) must inject via `(&modelChecker{run: run}).check(ctx, bin, dir, model)` instead of the dropped `run` parameter. 6 calls to `RunModelCheck(...)` (lines 165, 177, 187, 198, 215, 231) → `runModelCheck(...)` (mechanical rename).
- `internal/ghissue/ghissue_test.go`: 11 calls `GhCLITokenReader(lookPath, run)` (lines 35, 51, 64, 78, 91, 110, 129, 147, 421, 434, 447) must inject via `(&ghTokenReader{lookPath: lookPath, run: run}).read` instead of the dropped parameters. Line 461's `RunCommand(...)` → `runCommand(...)` (mechanical rename).
- `internal/selfupdate/exeversion_test.go`: 3 calls `ProbeVersion(ctx, run, path)` (lines 34, 54, 66) must inject via `(&versionProber{run: run}).probe(ctx, path)`. Lines 77, 89's `RunVersionProbe(...)` → `runVersionProbe(...)` (mechanical rename).
- `internal/server/reader_test.go`: 2 struct literals `&readerFeature{runGit: fakeGit, ...}` (lines 168, 186) must become `&readerFeature{gitFiles: fakeGit, ...}` where `fakeGit` changes shape from `func(ctx, dir, args...) ([]byte, error)` returning a NUL-joined byte stream to `func(ctx, dir) ([]string, error)` returning the plain list directly (e.g. the first test's fixture becomes `[]string{"zeta.md", "notes.txt", "docs/alpha.MD", "docs/"}, nil`; the second stays `nil, errors.New("exit status 128: not a git repository")`).
- `internal/tmux/activity_test.go`: `fakeActivityExec` (line 21) is the one choke point — change its body from `exec: func(_ context.Context, name string, args ...string) ([]byte, error) { ...; return fn(args) }` to `exec: func(_ context.Context, name string, args ...string) (stdout, stderr []byte, err error) { ...; out, err := fn(args); return out, nil, err }` and every one of its ~14 call sites (whose `fn` closures keep their existing `([]byte, error)` shape) compiles unchanged. Line 153's direct override (`TestListPaneActivity_RealTmux_OneInvocationCoversEveryPane`) needs the same 3-return wrapping around `realExec(ctx, name, args...)`.
- `internal/tmux/tmux_test.go:685`: one direct `Client{exec: func(...) ([]byte, error) {...}}` literal (`TestKillSession_PostKillRecheckStillThereReturnsTheOriginalKillError`) needs its `kill-session` branch split into an explicit stderr-only capture (it currently uses `cmd.CombinedOutput()` to get a real `*exec.ExitError`; under the new signature it should run the same `sh -c` fixture with `cmd.Stderr` captured separately and return `(nil, stderrBytes, err)`), and its `list-panes`/default branches return `(out, nil, nil)`.
- `internal/server/update_test.go`: 3 assignments `c.ExeRun = func(...) (string, error) {...}` (lines 364, 388, 403) have no field to assign any more — `updateManagerConfig.ExeRun` is gone, since `selfupdate.ProbeVersion` no longer takes a run func at all. These three tests (`TestUpdateManager_CheckSwap_DetectsAnExternalSwap` and the two `TestUpdateManager_CheckSwap_ProbeFailureOrTimeoutLeavesInstalledNull` subtests) already write a real file to `c.ExePath` for the size/mtime-change half of the fixture; they need to write a real executable there instead (a `#!/bin/sh` script printing `probed`/`musterd v0.11.0`, one exiting non-zero, one sleeping past the context deadline — the same pattern `claudecode/version_test.go`'s `writeVersionStub` and `exeversion_test.go`'s own real-subprocess tests already use), since `checkSwap` now really execs `exePath -version` through `selfupdate.ProbeVersion`'s own unexported seam.
- `cmd/musterd/main_test.go:329`: `assert.NotNil(t, cfg.Update.ExeRun, ...)` — delete this one assertion line; `server.UpdateConfig` no longer has an `ExeRun` field to guard, and the class of bug it guarded against (a forgettable nil default) no longer exists structurally once the composition root has nothing to pass.
- `internal/claudecode/status_test.go:67`: `assert.Equal(t, "subscription", got.Account.Source)` — delete; `StatusAccount` no longer has a `Source` field (Minor 10: the adapter doesn't set it, `usage.Aggregator.Record`'s own default still makes the wire value "subscription", covered unbroken by `internal/server/usagewire_test.go`, `state_test.go`, `ws_test.go`).
- `test/canary/live_test.go:42`: `claudecode.KeychainTokenReader(u.Username, claudecode.RunCommand)` → `claudecode.KeychainTokenReader(u.Username)`.
- `test/canary/harness_test.go:783,789`: `claudecode.CheckModel(ctx, claudecode.RunModelCheck, "claude", f.repo, <model>)` → `claudecode.CheckModel(ctx, "claude", f.repo, <model>)`. Comments at lines 34 (live_test.go) and 772 (harness_test.go) name the old `RunCommand`/`RunModelCheck` symbols in prose and are now stale wording, not compile errors — worth a pass when the test agent is in the file anyway.

None of the above are files I was allowed to touch (test files; the one exception in my constraints is import-path fixes only, and none of this breakage is an import path).

No other packages regressed: `go test -count=1 ./internal/... ./cmd/...` shows every package outside the list above still passing.

## D10b (restore updateManager's own probe-version consumer port)

**Mode**: fix (D10 follow-up, no review cycle — team lead brief)

**Problem**: D10 removed `updateManagerConfig.ExeRun`/`updateManager.exeRun` entirely and had
`checkSwap` call `selfupdate.ProbeVersion` directly. That satisfied Major 1 (no run func threaded
through the composition root for something that never varies) but left `checkSwap` with no seam of
its own, so `internal/server/update_test.go`'s three `checkSwap` tests (tests-D10's repair pass)
fork real `#!/bin/sh` stub executables to reach the subprocess boundary — the exact
`kb:lesson/first-exec-of-fresh-script-costs-270ms` cost, and a violation of docs/conventions.md
§ Testing's "tests cross the boundary through [a run func], never a $PATH shim". The accepted
`kb:adr/process-adapter-run-seam-constructor-default` and its debate name the server-owned probe as
a legitimate **consumer port** ("server fakes a neutral result at its consumer instead", debate
point 4) — distinct from Major 1's target, which was the *adapter's own* run func being exported
solely to be passed back into the same package.

### Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/server/updatemanager.go` | modified | Added `probeVersionFunc` type (`func(ctx, exePath) (string, error)`) and an unexported `probeVersion probeVersionFunc` field on `updateManager`, defaulted in `newUpdateManager` to `selfupdate.ProbeVersion` — not threaded through `updateManagerConfig` or `cmd/musterd/main.go` (D10's composition-root removal stays). `checkSwap` now calls `m.probeVersion(probeCtx, m.exePath)` instead of `selfupdate.ProbeVersion` directly. The `m.exePath == "" \|\| m.exeRun == nil` guard was already reduced to just `m.exePath == ""` by D10; unchanged here (`probeVersion` is never nil — the constructor always sets it). |

No other files touched. Behaviour unchanged: `probeVersion` always resolves to `selfupdate.ProbeVersion` in production, so `checkSwap`'s runtime behaviour is byte-for-byte what D10 shipped.

### Decisions

- **design: `probeVersionFunc`/`probeVersion`** — matches `internal/server/reader.go`'s `gitFilesFunc` shape exactly: a named function type + one unexported field on the feature/manager struct, defaulted in the constructor, same-package tests overwrite the field post-construction. `rg -n 'Func func\(ctx' internal/server/*.go` before adding: `gitFilesFunc` (reader.go) was the only existing sibling of this shape in the package; matched it rather than the `Preflight`-style "unexported struct + `newX()` constructor" shape from `internal/gitutil`/`internal/selfupdate`/`internal/claudecode`, because `updateManager` already *is* the long-lived struct the seam belongs to (unlike gitutil/selfupdate/claudecode's free-function APIs, which needed a small struct built fresh per call to hold the seam at all) — `docs/conventions.md` § Testing's constructor-default rule is satisfied by `newUpdateManager` itself, no extra type needed.
- Did not touch `internal/selfupdate/exeversion.go`'s exported `ProbeVersion(ctx, exePath)` signature — it stays the no-seam wrapper D10 made it; `probeVersion` in `internal/server` is a separate, consumer-side seam over that same exported function, not a change to selfupdate's own API.

### Handoff — test agent (do NOT write scripts)

`internal/server/update_test.go`'s three `checkSwap` tests currently write real `#!/bin/sh` stub
executables at `c.ExePath` and let `checkSwap` really exec them. They should instead fake at the new
consumer port: keep writing *some* file to `c.ExePath` (any content works — only its size/mtime vs.
`startInfo` matters for the stat-diff branch `checkSwap` checks before probing) but stop making it an
executable script, and instead set `m.probeVersion` directly (same-package field overwrite, no
struct-literal change needed since `newTestUpdateManager` already returns `*updateManager`):

- `TestUpdateManager_CheckSwap_DetectsAnExternalSwap`: after `newTestUpdateManager`, before
  `m.checkSwap(...)`, set `m.probeVersion = func(context.Context, string) (string, error) { return
  "0.11.0", nil }`; `os.WriteFile(exePath, []byte("changed"), 0o644)` (or similar) replaces
  `writeMusterdVersionStub(t, exePath, "musterd v0.11.0", 0)`.
- `TestUpdateManager_CheckSwap_ProbeFailureOrTimeoutLeavesInstalledNull` / "probe returns an error":
  `m.probeVersion = func(context.Context, string) (string, error) { return "", errors.New("boom") }`;
  same plain-file rewrite in place of the exit-1 stub.
- `TestUpdateManager_CheckSwap_ProbeFailureOrTimeoutLeavesInstalledNull` / "probe hangs past its
  deadline": `m.probeVersion = func(ctx context.Context, _ string) (string, error) { <-ctx.Done();
  return "", ctx.Err() }` — blocks on the ctx `checkSwap` passes in (the short-deadline one the test
  already constructs) instead of a real `sleep 30` subprocess; same plain-file rewrite in place of
  the `#!/bin/sh\nsleep 30\n` stub.

`writeMusterdVersionStub` can then be deleted (no remaining caller) or trimmed to just the
plain-file-rewrite half, whichever reads better in context — the test agent's call, not scripted
here. This closes every one of the three sites; there is no fourth `checkSwap` test or other
`m.exeRun`/`ExeRun` reference left anywhere (`rg -n 'exeRun|ExeRun' --glob '!plans/**'` → no hits
after this change).

### Handoff — build status

**Build status**: `go build ./...` exits 0.

**Gate output**:
- `gofmt -l .` — clean.
- `go build ./...` — exits 0.
- `go vet ./...` — clean (no output; every test file already compiles, since tests-D10's repair
  pass already lands cleanly on top of D10 and this change doesn't alter any signature the tests
  reference — it only replaces `checkSwap`'s internal call and un-does nothing test-visible until
  the injection shape above is applied).
- `golangci-lint run --tests=false ./internal/server/...` — `0 issues`.
- `make lint` (full `golangci-lint run`, tests included) — `0 issues`.
- `go test -race -count=1 ./internal/server/...` — `ok` (107.8s; the still-forking checkSwap tests
  pass unchanged, since `checkSwap`'s runtime behaviour is unaffected by this change until the test
  agent moves them onto the field).
- `wc -l internal/server/updatemanager.go` — 460 lines (was under D10's own count; well under the
  500-line size-warn threshold, no warning to report).
