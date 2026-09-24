# Maintainability review: maintainability-cleanup (scope c: cmd + adapters)

**Plan**: maintainability-cleanup
**Verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 17577 words (budget 8000) · rules 1938 · features 3080 · diagrams 4290 · decisions 3904 · proposed 0 · facts 3361 · lessons 354 · runbooks 644 (`--features ingest,update`)
**Scope**: Scope line: cmd/musterd plus internal/{claudecode (incl. claudecodetest), tmux (incl. tmuxtest), selfupdate, ghissue, locate, gitutil, usage, termbridge, tty, webui}. I re-read every non-test file in scope after the fix wave (D8, D10, D10b and D7a's selfupdate half), with the D8 and D10 Decisions sections open. Test files were read only where a finding depends on them.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| cmd/musterd/main.go | claudeversion.go, onexit.go, tokens.go, webdist.go, open.go, preflight.go, update.go | D8 (layout, pure moves) | funlen run 44, parseFlags 41; reasons hold | pass |
| cmd/musterd/{claudeversion,onexit,tokens,webdist}.go | preflight.go (exemplar), open.go, update.go | D8 | none | pass (Minor 4 comment) |
| cmd/musterd/update.go | internal/server/updatemanager.go, selfupdate/release.go | D7a | none | pass |
| cmd/musterd/preflight.go, open.go | each other | n/a | none | Minor 4 comment, Note 3 |
| internal/claudecode/credentials.go | modelcheck.go, version.go, ghissue.go, tmux/preflight.go, locate/spotlight.go | D10 | none | Major 1 |
| internal/claudecode/version.go | credentials.go, modelcheck.go, selfupdate/semver.go | D10 | none | Major 1 |
| internal/claudecode/modelcheck.go | credentials.go, version.go | D10 | none | Minor 1 |
| internal/claudecode/settings.go | internal/server/ingest.go, launcher.go, CLAUDE.md | D10 (ownership call) | none | Minor 2 |
| internal/claudecode/launch.go | internal/session/session.go, internal/server/launcher.go | none (consts plus one func) | none | Minor 3 |
| internal/claudecode/{status,interpret,ingest,files,theme,usageapi,plan,doc}.go | each other, usage/aggregator.go | n/a | none | pass |
| internal/claudecode/claudecodetest/claudecodetest.go | claudecode/*.go | none (tests) | filelen 536 (137 comment lines) | Minor 5 |
| internal/tmux/tmux.go | preflight.go, tmuxtest, termbridge.go | D10 (Minor 3 blast radius) | filelen 716 (303 comment lines, 42%); reason holds | Minor 4 comments |
| internal/tmux/preflight.go, tmuxtest/tmuxtest.go | tmux.go, locate/spotlight.go | n/a | none | Minor 1 (signature), Minor 5 (tmuxtest comments) |
| internal/selfupdate/exeversion.go | release.go, install.go, semver.go, claudecode/credentials.go | D10 | none | Minor 1 |
| internal/selfupdate/{release,install,semver}.go | cmd/musterd/update.go, internal/server/updatemanager.go | D7a | none | Minor 4 comments |
| internal/selfupdate/{apply,verify,lock,pubkey,doc}.go | each other | n/a | none | pass |
| internal/ghissue/ghissue.go | claudecode/credentials.go, tmux/tmux.go | D10 | none | Minor 1 |
| internal/gitutil/gitutil.go | tmux/preflight.go, internal/reader/reader.go, internal/server/reader.go | D10 `gitRunner` | none | Minor 1, Minor 4 comments |
| internal/locate/{locate,spotlight,walk}.go | tmux/preflight.go | n/a | none | pass |
| internal/usage/{aggregator,modelscoped,usage}.go | internal/server/ingest.go | D10 | none | pass (Note 6) |
| internal/termbridge, internal/tty, internal/webui | tmux/tmux.go, internal/server/terminal.go | n/a | none | pass |

## Cycle-1 findings: verdicts

| Cycle-1 finding | Verdict | Evidence |
|---|---|---|
| Major 1: the run-func seam came in five shapes, wired two ways | **fixed**, with one residue | Every adapter now sets an unexported production default in its own constructor: `claudecode/credentials.go:62` `keychainReader{run: runCommand}`, `modelcheck.go:45` `newModelChecker`, `version.go:30` `newVersionChecker`, `ghissue/ghissue.go:89` `ghTokenReader`, `selfupdate/exeversion.go:42` `newVersionProber`, `gitutil/gitutil.go:26` `newGitRunner`, and tmux and locate as before. `rg 'claudecode\.(RunCommand\|RunModelCheck\|ModelCheckRun)\|ghissue\.RunCommand\|selfupdate\.RunVersionProbe\|ExeRun'` across the tree exits 1. The residue is that output-need signatures still differ; see new Minor 1. |
| Major 2: two owners each for the ingest route shape and `MUSTER_SESSION` | **fixed** | Declared once at `claudecode/settings.go:24` (`MusterSessionEnvVar`) and `:33-42` (`IngestHookPath`/`IngestStatusPath`). Consumers: `internal/server/ingest.go:271-272` for the routes, `internal/server/launcher.go:146` for the pane env, the script body at `settings.go:338`, and the legacy regexp at `settings.go:111-112`. The ownership placement has a stated reason in D10 Decisions that holds (existing server→claudecode edge). The package doc does not say so yet; see new Minor 2. |
| Major 3: update-available check and may-apply rule written twice | **fixed** | `selfupdate/release.go:105` `CheckNewer`, `install.go:42` `MayApply`, `release.go:93` `ReleaseTag`. Called from `cmd/musterd/update.go:53,60,80` and `internal/server/updatemanager.go:204,331,393`. |
| Major 4: near-duplicate claudecodetest builders | **fixed**, with one residue | One envelope (`claudecodetest.go:36`), one SessionStart payload (`:91`), one status-line base (`:327`), and a single defaults block (`:12-21`). `StatusLinePreFirstResponseOpts` (`:343`) now matches `StatusLineFullOpts`, and the statusLineFullPayload funlen hit is gone. Residue: `EnvelopedSessionStartTranscript` survives as a second exported entry point; see new Minor 5. |
| Minor 1: gitutil had no seam; server carried git argv | **fixed** | `gitutil.go:23-28` `gitRunner`, `:88` `ListFiles`. `rg '"(ls-files\|rev-parse\|git)"'` outside gitutil finds only `internal/reader/reader.go:104`, a listing-source label, not argv. |
| Minor 2: `InstalledVersion` had no seam | **fixed**, but the production value is a duplicate; see new Major 1 | `version.go:26-45` `versionChecker`. `version_test.go:382` injects through it. |
| Minor 3: `runCapture` bypassed `Client.exec` | **fixed** | `tmux.go:703-715` goes through `c.exec` and gets `run`'s ctx-expiry wrapping. |
| Minor 4: `"muster-"` spelled five times | **fixed** | One `sessionPrefix` at `tmux.go:191`. `NewSession` delegates via `SessionName(id)` (`:115-117`). `rg '"muster-'` in non-test Go finds only comments and `muster-data`/`muster-tmuxtest-`. |
| Minor 5: absent-vs-could-not-ask written three times | **fixed** | `tmuxAbsence` (`tmux.go:503-512`) is used by `ListPaneActivity` (`:355`), `PaneExists` (`:488`) and `ListSessions` (`:625`). |
| Minor 6: two kill primitives with different already-gone semantics | **fixed** | Rollback now uses `KillSession` (`internal/server/launcher.go:193`), so every production kill goes through one primitive. `KillWindow` keeps only test callers; see Note 2. |
| Minor 7: hand-rolled path containment ×3 | **fixed** | `filepath.IsLocal` at `selfupdate/install.go:93`, `claudecode/plan.go:119`, `internal/reader/reader.go:41`. The regex `rg '".."\s*\+\s*string\(filepath.Separator\)'` exits 1. |
| Minor 8: `compareInt`/`cmpInt` | **fixed** | `cmp.Compare` at `claudecode/version.go:163-167` and `selfupdate/semver.go`. Neither helper exists any more. |
| Minor 9: `-version` line had two owners | **fixed** | `selfupdate/exeversion.go:20` `VersionLinePrefix`, used by `:26` and `cmd/musterd/main.go:196`. |
| Minor 10: adapter set `Source: "subscription"` | **fixed** | The `StatusAccount.Source` field is gone. `rg 'Source\|subscription' internal/claudecode/status.go` finds nothing. The only owner is `usage/aggregator.go:15`. |
| Minor 11: permission-mode set written three times | **fixed** (adapter half) | `claudecode/launch.go:9-27` owns it. `session/session.go:34-37,52-54` derives from it, and BuildArgv consults `ValidPermissionMode`. The server scope's leftover is `internal/server/launcher.go:136`, whose error text still lists the four values by hand. That is for the server reviewer; see new Minor 3 for the adapter-side helper. |
| Minor 12: `claudecode.Classify` has no production caller | **withdrawn**: cycle 1 was wrong | `test/canary/canary_test.go:59` calls `claudecode.Classify(installed)`, and it already did on `main` (`git show main:test/canary/canary_test.go`, line 59, from b8bbddf). My cycle-1 grep missed it. That call site is a real external consumer. |
| Minor 13: cmd/musterd file layout | **fixed** | `onexit.go`, `webdist.go`, `tokens.go` and `claudeversion.go` exist. main.go is 491 lines (was 791) and keeps flags, `run` and wiring. The D8 reason for keeping `keychainUser` in main.go holds: it is wiring and has no test file. |
| Minor 14: plan IDs in `-help` strings | **fixed** | `main.go:125-147`: no `-help` string names a plan ID. |
| Minor 15: `Aggregator`'s single writer not named at its declaration | **fixed** | `usage/aggregator.go:24-28` now names it, matching `modelscoped.go`. |
| Minor 16: dead claudecodetest builders and an unreachable branch | **fixed** | `RawUserPromptSubmit`, `RawPostToolUse` and `TurnActivityOpts` are gone. Every exported builder has 1 to 4 caller files (per-name `rg -l 'claudecodetest\.<Name>\('`). The zero-session defaulting now lives only in `envelope` (`:37-39`). |
| Note 5: "the Claude Code boundary holds" | **was wrong**; see new Critical 1 | |

## Seam ADR check (kb:adr/process-adapter-run-seam-constructor-default, conventions § Testing)

- **Exported production run funcs:** none left in scope. The search `rg '^func [A-Z]\w*\(ctx context\.Context, (name|path|bin|dir) string, args \.\.\.string\)' -e '^type [A-Z]\w*(Run|Func|Exec)\w* func' -e 'func Run[A-Z]'` over cmd, internal, test and tools matches only three things, all outside this scope: `internal/reader/reader.go:82` `ListFilesFunc` (a consumer port), `internal/triage/fetch.go:16` `RunFunc` (dev tool) and `internal/triage/checks.go:35` `CheckFunc` (not a subprocess seam).
- **Run funcs passed by the root or cmd:** none. `buildServerConfig` (`cmd/musterd/main.go:394-446`) passes no function-typed value. `runTmuxPreflight(ctx, stderr, tmux.Preflight)` (`main.go:309`) passes a consumer port over the exported no-seam wrapper, which is the ADR's shape. `server.UpdateConfig` has no `ExeRun` field.
- **Function-shaped API as an exported no-seam wrapper over an unexported struct:** met by `KeychainTokenReader`, `CheckModel`, `InstalledVersion`, `GhCLITokenReader`, `ProbeVersion`, and gitutil's `IsRepo`/`Branch`/`IsWorktree`/`ListFiles`.
- **One signature per output need:** not met. See Minor 1.

## Issues

### Critical

1. **[daemon-impl]** Claude-Code-format knowledge sits outside internal/claudecode. `internal/server/launcher.go:431` builds `filepath.Join(dir, ".claude", "settings.local.json")`, and `:459` names the temp file `".settings.local.json.tmp-*"` after it.
   - Where Claude Code reads project-local settings is Claude Code format. `internal/claudecode/CLAUDE.md` claims it ("Owns: … `settings.local.json` entries"; invariant "Settings land in the project-scoped `.claude/settings.local.json`").
   - This breaks the CLAUDE.md hard rule "All Claude-Code-format knowledge … lives in `internal/claudecode/`".
   - The adapter already has the sibling shape for Claude Code's own paths: `claudecode.DefaultConfigPath()` (called from `cmd/musterd/main.go:120`) and `claudecode.DefaultPlansDir(home)` (`plan.go:100`).
   - The leak predates this branch (`main:internal/server/sessions.go:448`). The branch moved it into `launcher.go`, and my cycle-1 Note 5 wrongly reported the boundary as holding.
   - The file is in the server scope's territory. It is filed here because the boundary check was asked of this scope.
   - A fix must make true that server gets the settings file's location from internal/claudecode and spells no `.claude` path or settings file name. The temp-file prefix may derive from that name.

### Major

1. **[daemon-impl]** `claudecode/version.go:64-74` `runInstalledVersion` is a second production `execFunc` in the package, beside `credentials.go:34-47` `runCommand`.
   - D10 Decisions gives the reason: "`runCommand` … does not populate `*exec.ExitError`'s stderr … Reusing `runCommand` would have silently changed `InstalledVersion`'s error text". The comment at `version.go:58-63` repeats it.
   - Measurement contradicts that reason. `ExitError.Error()` is `ProcessState.String()` and never includes `.Stderr`. I ran the same failing `sh -c "echo boom >&2; exit 3"` through both bodies, wrapped as `InstalledVersion` wraps it. Output: `"running claude --version: exit status 3"`. Run: `"running claude --version: exit status 3"`.
   - Nothing reads `.Stderr` from this error: `rg ExitError` in non-test code finds only tmux and modelcheck. The two bodies therefore differ in nothing a caller can observe.
   - This breaks § Design "Reuse before add": a second implementation is a defect even when both work, and the reason given is one the code contradicts.
   - It also makes `credentials.go:28`'s "runCommand is the production value" false for one of the type's two users.
   - A fix must make true that the package has one production stdout `execFunc` and `versionChecker` defaults to it, or that Decisions gives a difference that holds.

### Minor

1. **[daemon-impl]** The ADR's Consequences line "Each output need (stdout, stderr, or both) has one signature" does not hold across the adapters.
   - Stdout-only is `([]byte, error)` in `claudecode/credentials.go:29`, `tmux/preflight.go:27` and `locate/spotlight.go:20`, but `(string, error)` in `selfupdate/exeversion.go:30` and in the new `gitutil/gitutil.go:24`. gitutil also takes `dir` in place of `name`.
   - Both-streams is `(stdout, stderr []byte, err error)` in `tmux/tmux.go:34`, which D10 changed this cycle, but `(stdout, stderr string, err error)` in `ghissue/ghissue.go:54`.
   - The stderr-only `modelCheckRun` (`claudecode/modelcheck.go:35`) takes `argv []string` where every sibling takes `name string, args ...string`.
   - D10 introduced two of these divergences, gitutil's and tmux's, with no `design:` line naming the choice.
   - A fix must make true that each output need has one parameter-and-result shape across the adapters, allowing a working-dir input where one is needed. Otherwise conventions § Testing must say that the element type is per-package.
2. **[daemon-impl]** `internal/claudecode/CLAUDE.md`'s **Owns** line no longer describes the package.
   - D10 made claudecode the single declared owner of Muster's own ingest path shape and pane env var. `internal/server/ingest.go:271-272` now registers the daemon's own mux routes from `claudecode.IngestHookPath`.
   - The package contract still reads "every Claude-Code-format fact … No session state, HTTP or tmux here".
   - A newcomer looking for where Muster's ingest routes are defined would not look in the adapter. D10 Decisions flags exactly this gap ("Flagging for the docs pass / a future ADR").
   - A fix must make true that the package doc names the wrapper-script contract, meaning the ingest path shape and `MusterSessionEnvVar`, as owned here, together with the one-line reason D10 gives (§ Design "One owner per concept": the owner must be findable).
3. **[daemon-impl]** `claudecode/launch.go:20-27` `ValidPermissionMode` hand-rolls `slices.Contains` (Go 1.21+; the toolchain is 1.27.1). This is the same stdlib-as-existing-implementation case as cycle-1 Minors 7 and 8 (§ Design "Reuse before add").
   - Its doc at `:16-17` says `PermissionModes` is in "the order BuildArgv/ValidPermissionMode iterate them", but BuildArgv does not iterate it.
   - A fix must make true that the membership test is not hand-rolled and the doc names only real users.
4. **[daemon-impl]** Comments added or rewritten this cycle narrate this run's refactor history or are now false (conventions § Comments: "don't narrate history").
   - **History:**
     - `selfupdate/install.go:38-41` ("cmd/musterd and internal/server each wrote this test by hand, in different forms …")
     - `selfupdate/release.go:90-91` ("both built this by hand") and `:98-100` ("both ran this exact sequence by hand")
     - `tmux/tmux.go:673` ("reproduces execCombinedOutput's old single-buffer text") and `:699-700` ("rather than a second exec.CommandContext of its own, which also missed …")
     - `claudecode/version.go:59-63` ("the way it always has … rather than folding")
   - **False after the fix wave:**
     - `tmux.go:518` ("run folds CombinedOutput's stderr"; run no longer uses CombinedOutput)
     - `tmux.go:479` and `:616` ("errors.As … below misses"; that check moved into `tmuxAbsence`)
     - `claudecode/credentials.go:28` (see Major 1)
     - `cmd/musterd/webdist.go:17` (`onexit_test.go:125` is now the `spawnedDaemon` doc; the empty `-web-dist` use is at `:185`. It was already stale on main.)
   - **Plan-section names left by the X1 sweep:**
     - `gitutil/gitutil.go:41` ("Schema Changes")
     - `gitutil/gitutil.go:59` ("ux-flows §2")
     - `cmd/musterd/preflight.go:36` and `:46` ("UI spec:")
   - A fix must make true that each comment states the current why, or is deleted where the code already says it.
5. **[daemon-tests]** claudecodetest has three residues.
   - **A this-run finding tag.** `claudecodetest.go:11` cites "review.maintainability.c-adapters Major 4", which becomes a dangling pointer once `plans/` is history.
   - **Plan IDs the X1 sweep did not reach:**
     - `claudecodetest.go`: `:2` (D4), `:70` and `:111` (REQ-12), `:82` (m1-sessions plan), `:102` ("review Major 11"), `:119` (REQ-13/16/18/26), `:140`, `:164`, `:167` (D6), `:188`, `:382-393` (REQ-2/3/4), `:418` (m4-hook-quoting), `:487`, `:499` and `:523` (D3)
     - `tmux/tmuxtest/tmuxtest.go:1-2` (plan v1-cleanup REQ-4) and `:28` (D5)
   - **A second entry point that should be an option.** `EnvelopedSessionStartTranscript` (`:191-194`) exists only to vary `transcript_path`. Its sibling `ToolFileOpts` carries `TranscriptPath` as an option field (`:125`), and the doc's own reason ("that builder's own transcript_path is a fixed default") describes the gap rather than justifying it (§ Design "Match the siblings").
   - A fix must make true that no comment in either helper package cites a plan or finding ID, and that SessionStart's transcript path is set the way the siblings set theirs.

### Notes

1. **[note]** The size warnings:
   - `run` (44) and `parseFlags` (41) are unchanged, and cycle 1's reasons still hold.
   - `tmux.go` is 716 lines, of which 303 are comments (42%). It is one type's method set, and the D10 reason (comment volume, not a second concern) holds.
   - `claudecodetest.go` is 536 lines: the defaults block plus 137 comment lines.
   - The in-scope test funlen hits (`TestVersionChecker_InstalledVersion` 65, `TestClassify_Table` 84 and others) are all table tests.
   - There are no `dupl` hits in scope (`gates/cycle2/size.log`).
2. **[note]** `tmux.Client.KillWindow` (`tmux.go:561`) now has no production caller. Its doc ("used by tests") is true again. D10 kept it because tests in tmux, termbridge and server call it, and that reason holds for the tmux method. `internal/server/launcher.go:28`'s `paneSpawner` interface still declares it with no production consumer, which sits awkwardly with conventions § Go "Interfaces live where they are consumed". That is for the server scope.
3. **[note]** Two in-scope subprocess calls have no run-func field, and both are sanctioned.
   - `cmd/musterd/open.go:27` runs `-open-cmd`. The flag itself is the seam, and its tests drive the real musterd binary.
   - `termbridge/termbridge.go:60` is the PTY attach, a tmux-observable effect that conventions § Testing reserves for real tmux.
4. **[note]** The gitutil seam now exists, but `IsRepo`/`Branch`/`IsWorktree` tests still `git init` real repos (`gitutil_test.go:36-100`). They assert git-observable semantics (a detached HEAD, a linked worktree) that a fake would only restate, so no change is requested.
5. **[note]** Exported surface wider than its callers:
   - `selfupdate.LatestTag` has no caller outside its package now that `CheckNewer` wraps it (this adds to cycle-1 Note 7).
   - `ReleaseTag` takes a `string` where a `Version.Tag()` method would make `ReleaseTag("v1.2.3")` impossible.
   - `claudecode.PermissionModes` is a mutable exported slice.
   - `claudecode.CheckVersion` calls the no-seam `InstalledVersion`, so its assembly is covered only by the missing-binary row (`version_test.go:425-438`).

   Nothing here is dead. `update.go:88`'s `"updated to v%s"` follows `semver.go:52`'s stated display convention.
6. **[note]** `usage.Sample.Source` (`usage/usage.go:32`) has no production writer now that the adapter stopped setting it. `rg 'usage\.Sample\{' -A12 | rg Source` exits 1. The field is the kb:adr/usage-no-source-interface seam that stays for later sources, so no change is requested.
7. **[note]** Plan-ID comments in the in-scope **test** files: 368 lines across 40 files. The largest are `tmux_test.go` (50), `onexit_test.go` (40), `settings_test.go` (34) and `preflight_test.go` (20). The X1 sweep covered non-test files only. Whether tests are in its remit is the orchestrator's call.
8. **[note]** kb:diagram/daemon-components still holds for this scope. `go list` shows cmd/musterd importing claudecode, locate, selfupdate, server, store, tmux and webui, which matches the diagram's seven `cmd` edges. termbridge imports only tmux, usage only store, and every other in-scope package imports nothing internal. No DIAG row is needed.
9. **[note]** Shared state: the only change in scope is the `Aggregator` declaration doc (cycle-1 Minor 15). `make test-race` passed for every in-scope package (`gates/F2X1d/race.log`: cmd/musterd, claudecode, ghissue, gitutil, locate, selfupdate, tmux, tmuxtest and usage all `ok`). I found no interleaving.
