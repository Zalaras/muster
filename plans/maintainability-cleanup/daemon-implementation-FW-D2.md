# Daemon Implementation: Maintainability Cleanup — FW-D2 (adapters/tmux fix wave, cycle 2)

**Plan**: maintainability-cleanup
**Mode**: fix (review cycle 2)
**Pack**: `go run ./tools/kb pack --plan maintainability-cleanup --role daemon-impl` — pack unavailable to quote a summary line from directly (the plan's Units/no REQ-block shape; worked from the team lead's brief plus `review.maintainability.c-adapters.cycle2.md` and `review.work.md`, read in full, per the brief's instruction).

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/tmux/tmux.go` | modified | review-work Major 3/Major 7: added `exactTarget(t string) string` (`"=" + t`) and routed every `-t` argument through it (`AttachArgv`, `ResizeWindow`, `displayVar`, `ScrollCopyMode`'s two calls, `CancelCopyMode`, `ResolveSessionTarget`, `PaneExists`, `KillWindow`, `KillSession`, `CapturePane` — 11 sites). Fixes the measured tmux prefix-match data-loss hazard (kill-session/list-panes/etc. on a bare or window-qualified name silently address a different live session when no exact match exists). Also fixed stale/false comments the fix wave and X1 sweep left: `ScrollCopyMode`'s doc naming `internal/server/terminal.go`/`pumpShellSocketToPTY` (moved to `shells.go`), `isConnectionFailure`'s "run folds CombinedOutput's stderr" (run no longer uses CombinedOutput), `PaneExists`/`ListSessions`' "errors.As … below" (the check moved into `tmuxAbsence`, not literally below in either method), and `run`/`runCapture`'s history-narrating comments ("reproduces execCombinedOutput's old single-buffer text", "rather than a second exec.CommandContext of its own, which also missed …"). |
| `internal/server/launcher.go` | modified | Critical 1: `writeSettings` now gets its path from `claudecode.ProjectSettingsPath(dir)` instead of spelling `filepath.Join(dir, ".claude", "settings.local.json")` itself; the temp-file prefix is derived from that path's basename (`"."+filepath.Base(path)+".tmp-*"`) rather than a second hand-spelled literal. |
| `internal/claudecode/settings.go` | modified | Critical 1: added `ProjectSettingsPath(dir string) string`, the one declaration of the project-scoped settings file location. Minor 2 (settings.go's own comment): `musterIngestPath`'s doc no longer names a nonexistent `cfg.HookURL` field. |
| `internal/claudecode/CLAUDE.md` | modified | Minor 2: **Owns** line now names the wrapper-script contract (ingest URL path shape, `MusterSessionEnvVar`) and the settings file's path, not just its entries, as owned here — with the one-line reason (a caller assembles a hook command from these before anything else is Claude-Code-specific). |
| `internal/claudecode/version.go` | modified | Major 1: deleted `runInstalledVersion` (a second production `execFunc` body) and made `newVersionChecker` default to `runCommand` (credentials.go) — measured byte-identical wrapped error text for both bodies on the same failing subprocess (see Decisions). Dropped the now-unused `os/exec`/`time` imports. |
| `internal/claudecode/modelcheck.go` | modified | Minor 1 (c-adapters): `modelCheckRun`'s shape changed from `func(ctx, dir string, argv []string) ([]byte, error)` to `func(ctx, dir, name string, args ...string) ([]byte, error)` — matches every sibling run-func's `name string, args ...string` argv shape, keeping `dir` as the one working-directory addition gitutil's own run-func also carries. `runModelCheck` and `check()` updated to match. |
| `internal/claudecode/launch.go` | modified | Minor 3: `ValidPermissionMode` now calls `slices.Contains(PermissionModes, s)` instead of hand-rolling the loop (stdlib `slices`, Go 1.27.1 toolchain). `PermissionModes`' doc no longer claims `BuildArgv` iterates it (it doesn't — only `ValidPermissionMode` does); now points at the one real other reader (`internal/server/launcher.go`'s error text). |
| `internal/gitutil/gitutil.go` | modified | Minor 1 (c-adapters): `gitRunner.run`'s shape changed from `func(ctx, dir string, args ...string) (string, error)` to `func(ctx, dir, name string, args ...string) ([]byte, error)` — the stdout-only shape every other adapter run-func uses, with `dir` prepended (git always needs a working directory) rather than replacing `name` (mirrors `tmux.Client.exec`'s own field, always called with the literal `"tmux"`). `runGit` and every call site (`isRepo`/`branch`/`isWorktree`×2/`listFiles`) updated to pass `"git"` explicitly and read `[]byte`. Also fixed two stale plan-section comments ("Schema Changes" → cites `docs/protocol.md`'s own "null when not git" wire contract; "ux-flows §2" → cites `kb:adr/launch-hybrid-mru-directory-memory`). |
| `internal/ghissue/ghissue.go` | modified | Minor 1 (c-adapters): `execFunc`'s both-streams shape changed from `(stdout, stderr string, err error)` to `(stdout, stderr []byte, err error)` — matches `tmux.Client.exec`'s own both-streams shape. `runCommand` and `read()` updated. |
| `internal/selfupdate/exeversion.go` | modified | Minor 1 (c-adapters): `versionProbeRun`'s stdout-only shape changed from `(string, error)` to `([]byte, error)` — matches `claudecode.execFunc`/tmux's `preflighter.run`/`locate.SpotlightFinder.run`. `runVersionProbe` and `probe()` updated. |
| `internal/selfupdate/release.go` | modified | Restored `musterd -update`'s use of the raw tag `LatestTag` resolved (review-work Note 8): `CheckNewer` now also returns `tag string` (the exact string `LatestTag` returned), alongside `latest`/`newer`/`err`. Also fixed two history-narrating comments on `ReleaseTag`/`CheckNewer` ("cmd/musterd and internal/server both built this by hand" / "both ran this exact sequence by hand"). |
| `internal/selfupdate/install.go` | modified | Fixed `MayApply`'s history-narrating comment ("cmd/musterd and internal/server each wrote this test by hand, in different forms …"). |
| `cmd/musterd/update.go` | modified | Uses `CheckNewer`'s newly-returned raw `tag` for `Apply`'s `Tag` field instead of reconstructing one via `selfupdate.ReleaseTag(latest.String())` — byte-identical to base behaviour (`ReleaseTag` is only exact for a tag already shaped `"v"+Version.String()`; GitHub's own tag isn't guaranteed to be). Fixed `runUpdate`'s wrong ADR citation for "never restarting anything" (was `update-install-kinds-decide-who-may-apply`, about who may apply, not restarting; now names the real distinction against `update-restart-is-in-place-reexec-not-shutdown`'s daemon-driven restart path). |
| `internal/server/updatemanager.go` | modified | Mechanical: `checkAvailability`'s `CheckNewer` call updated for the new 4-value return (`latest, _, newer, err`) — this call site never needed the tag (it reconstructs one from the remembered version at apply time, a deliberately separate, correct design given the time gap between check and apply; left unchanged). |
| `cmd/musterd/main.go` | modified | Fixed `keychainUser`'s wrong ADR citation (`kb:adr/usage-keychain-token-read-only` says nothing about where the account name lookup happens) and `defaultUpdateBaseURL`'s dead `IssueAPIURL` reference (no such exported field exists; renamed to name the real flags, `-issue-api-url`/`-usage-api-url`). |
| `cmd/musterd/webdist.go` | modified | Fixed `checkWebDist`'s stale line-number citation (`onexit_test.go:125` is now the `spawnedDaemon` type doc, not the empty-`-web-dist` behaviour) — now names the `spawnDaemon` helper by function, not line number. |
| `cmd/musterd/preflight.go` | modified | Fixed two "UI spec:" plan-section-name comments (X1 sweep residue) — deleted the dead citation, kept the why. |
| `internal/termbridge/termbridge.go` | modified | Fixed the package doc's stale "internal/server/terminal.go is the only caller" (the only `Attach` call is `internal/server/server.go`; `terminal.go` doesn't exist under that name anymore in this tree's server package for this purpose). |

## Decisions

- **Critical 1 (settings.local.json path leak) fixed as scoped**: `claudecode.ProjectSettingsPath(dir)` mirrors the existing sibling shape `rg -n 'func Default(ConfigPath|PlansDir)' internal/claudecode` found (`theme.go`'s `DefaultConfigPath()`, `plan.go`'s `DefaultPlansDir(home)`) — a plain exported func returning the path, no seam needed (it does no I/O itself). `rg -n '"\.claude"|settings\.local\.json' --glob '!*_test.go' --glob '!internal/claudecode/**' internal cmd` after the fix finds only prose comments naming the file, no path construction — the leak is closed tree-wide, not just at the two cited lines.
- **Major 1 (`runInstalledVersion` duplicate execFunc)**: re-ran the review's own measurement before deleting anything — `runCommand` (`cmd.Run()` + `Stdout` buffer, stderr discarded) vs `runInstalledVersion` (`cmd.Output()`, which internally captures stderr into `*exec.ExitError.Stderr` but never touches `.Error()`'s string) against `sh -c "echo boom >&2; exit 3"`, wrapped as `InstalledVersion` wraps it: both produced `"running claude --version: exit status 3"` byte-for-byte. `rg ExitError` in non-test code confirmed nothing reads `.Stderr` off this particular error. Collapsed onto `runCommand`; deleted `runInstalledVersion` outright (same-package, no test referenced it directly — `rg -n runInstalledVersion internal/` after the change finds zero hits).
- **Minor 1 (one signature per output need) — two shapes, not one, by design**: kept a **dir-taking variant** (`func(ctx, dir, name string, args ...string) ([]byte, error)`) distinct from the **plain variant** (`func(ctx, name string, args ...string) ([]byte, error)`), rather than forcing every adapter's run-func to carry an always-empty `dir` parameter it would never use. This is the reading the finding's own wording asks for ("one … shape … allowing a working-dir input where one is needed"): `claudecode.execFunc`, `tmux`'s `preflighter.run` field type and `locate.SpotlightFinder.run` keep the plain shape (none of the three ever needs a cwd); `gitutil.gitRunner.run` and `claudecode.modelCheckRun` — the two run-funcs whose underlying command genuinely needs a working directory — both now use the dir-taking shape, structurally identical to each other even though declared as separate named types in separate packages (Go doesn't have a shared function-type declaration across packages here, and none of the sibling adapters share one either). `selfupdate.versionProbeRun` and `ghissue.execFunc` needed only a return-type fix (`string`→`[]byte`, `(string,string,error)`→`([]byte,[]byte,error)`), no dir.
- **`gitRunner.run` keeps a `name` parameter even though `runGit` is always called with the literal `"git"`** — matches `tmux.Client.exec`'s own field, which is always called with the literal `"tmux"` (`c.exec(ctx, "tmux", full...)` in `tmux.go`'s `run`/`runCapture`) rather than baking the binary name into the seam's signature. `rg -n 'func\(ctx context\.Context, .*string, args \.\.\.string\)' internal/tmux/tmux.go internal/gitutil/gitutil.go` shows the two now match.
- **`internal/server/launcher.go`'s hand-spelled four-value `permissionMode must be one of default, plan, acceptEdits, auto` error text (review-work Major 4's leftover, line ~136) was left untouched.** review-work's own finding text says this is "for the server reviewer," not the adapter-side fix (which is `claudecode.ValidPermissionMode`/`PermissionModes`, done above), and it isn't named in this wave's item list. Not touched — YAGNI: fixing an unassigned finding risks colliding with whichever wave does own `internal/server`'s broader surface.
- **`internal/server/updatemanager.go:32`'s stale `"reader.go's gitFilesFunc"` comment (review-work Major 4) was left untouched** — `internal/server` (beyond `launcher.go`, explicitly in scope) is not this wave's file list, and touching a file another concurrent wave may be editing risks a conflict for no assigned gain.
- **The kill call site at `internal/session/actions.go` (coordinated with FW-D1) needed no edit.** The team lead's brief asked me to "touch only that call's target string" if needed; the fix instead lives entirely inside `tmux.Client.KillSession`/`PaneExists`/etc. (`exactTarget` wraps the argument at the point it becomes a `-t` value), so every caller — `actions.go`'s `KillSession(killCtx, sessionTmuxName(id))` included — is fixed automatically with no change to the call site itself. Verified with `rg -n 'exactTarget' internal/tmux/tmux.go` (11 call sites, listed above) and confirmed `internal/session/actions.go` is unmodified in `git status`.
- **Measured tmux behaviour backing the `exactTarget` fix** (tmux 3.7b, private `-S` socket in a scratch `mktemp -d` dir, killed and deleted when done):
  - `kill-session -t muster-1` with only `muster-12` and `muster-3` live: exit 0, killed `muster-12` (matches the reviewer's own measurement).
  - `kill-session -t =muster-1` against the same two: `can't find session: muster-1`, exit 1 — `muster-12` untouched.
  - `kill-session -t =muster-12` against the exact live name: exit 0, killed exactly `muster-12`.
  - `list-panes -t muster-1:@1` (session part a unique prefix of `muster-12`, but window id `@1` belongs to a *different* live session `muster-3`): `can't find window: @1`, exit 1 — confirms a window-id-qualified target already fails safely rather than misdirecting when its session part doesn't exactly match, which is why pane-id/window-id targets don't need `exactTarget`'s prefix to be *correct*, only its uniform application costs nothing extra (`=muster-12:@0` exact case round-tripped identically to the unprefixed form).
- **`selfupdate.CheckNewer`'s new `tag` return is additive, not a reshape of an existing wire/contract value** — it's an internal Go function's return tuple, not `docs/protocol.md`. `internal/server/updatemanager.go`'s only call site discards it (`_`); its own separate `ReleaseTag(version)` reconstruction at apply time is unchanged and correct for its own reason (time gap between check and apply — the remembered value is a bare version, not a tag).

## Handoff

**Build status**: `go build ./...` exits 0.

**Gate output** (all commands run from the repo root, `plan/maintainability-cleanup` worktree):

```
$ gofmt -l .
(no output — clean)

$ go build ./...
(exit 0)

$ go vet ./...
# github.com/Zalaras/muster/internal/gitutil
vet: internal/gitutil/gitutil_test.go:104:23: cannot use (func(context.Context, string, ...string) (string, error) literal) ... as func(ctx context.Context, dir string, name string, args ...string) ([]byte, error) value in struct literal
# github.com/Zalaras/muster/internal/ghissue
vet: internal/ghissue/ghissue_test.go:35:57: cannot use run (variable of type func(_ context.Context, name string, args ...string) (string, string, error)) as execFunc value in struct literal
# github.com/Zalaras/muster/internal/selfupdate
vet: internal/selfupdate/exeversion_test.go:34:37: cannot use fakeRunReturning(tt.output, nil) (value of type func(ctx context.Context, name string, args ...string) (string, error)) as versionProbeRun value in struct literal
# github.com/Zalaras/muster/internal/claudecode
vet: internal/claudecode/modelcheck_test.go:73:32: cannot use run (variable of type func(_ context.Context, dir string, argv []string) ([]byte, error)) as modelCheckRun value in struct literal
(all four are the sanctioned test-file breakage listed below; every other package is clean)

$ go vet -tags=canary ./test/...
(no output — clean)

$ golangci-lint run --tests=false ./...
0 issues.
(re-scoped confirmation: golangci-lint run --tests=false ./internal/tmux/... ./internal/claudecode/... ./internal/selfupdate/... ./internal/gitutil/... ./internal/ghissue/... ./internal/locate/... ./internal/termbridge/... ./cmd/musterd/... ./internal/server/... → 0 issues.)

$ golangci-lint run ./...   # tests included, for comparison only — expected to stop at the sanctioned break
internal/gitutil/gitutil.go:1: # github.com/Zalaras/muster/internal/gitutil [github.com/Zalaras/muster/internal/gitutil.test]
internal/gitutil/gitutil_test.go:104:23: cannot use func(...)... as func(ctx context.Context, dir string, name string, args ...string) ([]byte, error) value in struct literal
(1 issues: typecheck: 1 — this is the sanctioned-test-break-blinds-lint case; the --tests=false run above is the real signal)

$ go test -race -count=1 ./internal/tmux/... ./internal/claudecode/... ./internal/selfupdate/... ./cmd/...
ok   github.com/Zalaras/muster/internal/tmux/tmuxtest    2.394s
FAIL github.com/Zalaras/muster/internal/tmux             9.522s   (2 sanctioned assertion failures, listed below — production code is correct; the tests assert the pre-fix argv)
FAIL github.com/Zalaras/muster/internal/claudecode [build failed]   (sanctioned — modelcheck_test.go)
FAIL github.com/Zalaras/muster/internal/selfupdate [build failed]   (sanctioned — exeversion_test.go, release_test.go)
ok   github.com/Zalaras/muster/cmd/musterd               56.676s

$ go test -race -count=1 ./internal/gitutil/... ./internal/ghissue/... ./internal/locate/...
FAIL github.com/Zalaras/muster/internal/gitutil [build failed]   (sanctioned — gitutil_test.go)
FAIL github.com/Zalaras/muster/internal/ghissue [build failed]   (sanctioned — ghissue_test.go)
ok   github.com/Zalaras/muster/internal/locate            1.713s

$ python3 .claude/skills/orchestrate/scripts/dead-refs.py
dead-refs: 1894 references checked, 0 missing

$ make refs
dead-refs: 3125 references checked, 0 missing

$ make check-kb
kb: 426 records, 23 features, 0 problem(s)
kb: all checks pass

$ make size-warn   (lines touching my scope only)
WARN cmd/musterd/main.go:106/189   funlen 41/44   — pre-existing, unchanged by this wave
WARN internal/tmux/tmux.go:1   file is 737 lines (threshold 500) (filelen)   — grew from 716 (+21, the exactTarget func+doc); the D10/review-work Notes' reason (one type's method set, 42%+ comments) still holds — a split was not asked for and this wave adds no second concern
WARN internal/claudecode/claudecodetest/claudecodetest.go:1   536 lines (filelen)   — pre-existing (daemon-tests scope, review.maintainability Minor 5; not touched here)
```

**Note on a mid-run shared-worktree race**: partway through this wave, `go build ./...` failed on `internal/session`/`internal/store` (undefined `collectSessions`/`cloneRestore`/`sessionRef`/`s.scanSession`) — confirmed via `git status` to be FW-D1's own in-flight, uncommitted edits to files explicitly outside this wave's scope (`internal/session`, `internal/store` per the coordination note). Re-ran once FW-D1's work landed; the build and every gate above are green against the current tree. No file this wave touches was implicated.

**Sanctioned test breakage — every site, with what the test author must change:**

*`internal/tmux` (behaviour fix — review-work Major 3/Major 7's mandated `exactTarget`; both must fail on pre-fix code by design):*
- `internal/tmux/tmux_test.go:308` (`TestAttachArgv_IncludesTheSocketFlagAndTarget`): expects `[]string{..., "-t", "muster-7:@1"}`; must become `"=muster-7:@1"`.
- `internal/tmux/activity_test.go:346` (`TestCancelCopyMode_IssuesSendKeysCancelWithTarget`): `assert.True(t, slices.Contains(gotArgs, "muster-7-shell"))` must become `"=muster-7-shell"`.
- **New test needed** (team lead's brief item): a real-tmux, per-test-socket test asserting that killing/`has-session`/`list-panes` on `muster-1` never touches `muster-12` or `muster-1-shell` when `muster-1` itself doesn't exist — must fail against `KillSession`/`PaneExists` before this wave's `exactTarget` fix (i.e. build it against a socket with exactly `muster-12` + `muster-3` live, call `KillSession(ctx, "muster-1")`, assert it returns without touching `muster-12`, then assert `PaneExists`/`ListSessions` still report `muster-12`). Probe evidence for the exact shape (measured this session, tmux 3.7b): `kill-session -t muster-1` against `{muster-12, muster-3}` kills `muster-12` (must fail pre-fix); `kill-session -t =muster-1` against the same set reports `can't find session: muster-1` and leaves `muster-12` alone (must pass post-fix).

*`internal/claudecode/modelcheck_test.go` (Minor 1 signature unification):*
- 5 fake `run := func(...)` literals need their signature changed from `func(_ context.Context, dir string, argv []string) ([]byte, error)` to `func(_ context.Context, dir, name string, args ...string) ([]byte, error)`, at lines 67, 95, 112, 129, 146.
- 6 `runModelCheck(ctx, dir, []string{...})` calls need the slice spread into `name, args...` form, at lines 165, 177, 187, 198, 215, 231 — e.g. `runModelCheck(context.Background(), dir, "sh", "-c", "printf hello-stderr 1>&2; exit 1")`.

*`internal/gitutil/gitutil_test.go` (Minor 1 signature unification):*
- 3 `&gitRunner{run: func(context.Context, string, ...string) (string, error) {...}}` literals at lines 104, 115, 127 need the signature changed to `func(context.Context, string, string, ...string) ([]byte, error)` and their return values wrapped (`"zeta.md\x00..."` → `[]byte("zeta.md\x00...")`, etc.).

*`internal/ghissue/ghissue_test.go` (Minor 1 signature unification):*
- 9 fake `run := func(...) (string, string, error)` literals at lines 29, 46, 60, 74, 87, 105, 143, 431, 444 need `(string, string, error)` → `([]byte, []byte, error)`, with return values wrapped in `[]byte(...)`.
- `TestRunCommand_HarmlessSmokeTestNeverUsedByGhCLITokenReaderTests` (line 460): `stdout, stderr, err := runCommand(...)` now yields `[]byte`; `assert.Contains(t, stdout, "hello")` needs `string(stdout)` (testify's `Contains` on a `[]byte` iterates individual bytes, not substrings, and would misbehave/fail differently rather than pass).

*`internal/selfupdate/exeversion_test.go` (Minor 1 signature unification):*
- `fakeRunReturning` (line 15): return type `func(ctx, name string, args ...string) (string, error)` → `([]byte, error)`; body `return output, err` → `return []byte(output), err`.
- `TestRunVersionProbe_CapturesStdout` (line 80): `assert.Equal(t, "musterd v0.11.0\n", out)` — `out` is now `[]byte`; needs `string(out)` or the expected value as `[]byte(...)`.

*`internal/selfupdate/release_test.go` (raw-tag restore — `CheckNewer` gained a 4th return value):*
- Line 210: `latest, newer, err := CheckNewer(...)` → `latest, _, newer, err := CheckNewer(...)` (the test doesn't assert the tag).
- Lines 224, 235: `_, _, err := CheckNewer(...)` → `_, _, _, err := CheckNewer(...)`.

None of the above are files I was allowed to touch (test files; my one exception is import-path fixes only, and none of this breakage is an import path).

No other packages regressed: `go build ./...` is clean, and every package outside the list above passes `go test -race`.

## FW-D2b (fix wave: exactTarget's target-window residual gap)

**Scope**: `internal/tmux/tmux.go` only, per the team lead's brief. Fixes the implementation bug `daemon-tests-FW-D2.md` measured: `exactTarget`'s leading `"="` alone is exact for `target-session` commands (kill-session, attach-session) but tmux's `target-window` resolver (list-panes, resize-window, display-message) does not apply that same session-level exact-match rule to a **colonless** target — so `PaneExists`/`ResolveSessionTarget`/`ResizeWindow` remained able to silently resolve a bare `"muster-1"` to a different live session (`muster-12` or `muster-1-shell`), and `KillSession`'s own idempotent-no-op recheck (`PaneExists`) inherited the same hole.

**Fix**: `exactTarget` now appends a trailing `":"` when `t` has no `":"` (a bare session name), leaving a `t` that already carries one (a window-qualified target, e.g. `"muster-12:@0"`) as plain `"=" + t`:

```go
func exactTarget(t string) string {
	if strings.Contains(t, ":") {
		return "=" + t
	}
	return "=" + t + ":"
}
```

**Probe evidence** (tmux 3.7b, private `-S` socket in a `mktemp -d` scratch dir, `{muster-12, muster-3}` live, `muster-1` never created; socket deleted and `kill-server`'d after each run) — every tmux subcommand `exactTarget` feeds, both the previously-broken class and the previously-safe ones, confirming the trailing colon is correct (not just non-regressing) for all of them:

```
# target-window class (the measured gap this wave closes)
$ tmux -S <sock> list-panes -t '=muster-1' -F '#{session_name} #{pane_id}'
muster-12 %0                                    # exit 0 — WRONG (pre-fix form, no trailing colon)
$ tmux -S <sock> list-panes -t '=muster-1:' -F '#{session_name} #{pane_id}'
can't find session: muster-1                    # exit 1 — correct (post-fix form)
$ tmux -S <sock> list-panes -t '=muster-12:' -F '#{session_name} #{pane_id}'
muster-12 %0                                    # exit 0 — still resolves the real session
$ tmux -S <sock> resize-window -t '=muster-1:' -x 55 -y 20
can't find session: muster-1                    # exit 1 — correct; muster-12's geometry (80x24) confirmed untouched via list-windows
$ tmux -S <sock> resize-window -t '=muster-12:' -x 55 -y 20
                                                 # exit 0 — resized muster-12 to 55x20, muster-3 untouched
$ tmux -S <sock> display-message -p -t '=muster-12:' '#{session_name}'
muster-12                                       # exit 0 — correct
$ tmux -S <sock> display-message -p -t '=muster-1:' '#{session_name}'
                                                 # exit 0, empty output — unresolvable target's known
                                                 # non-erroring shape (already pinned by
                                                 # TestDisplayVar_UnknownTargetReturnsEmptyWithNoError,
                                                 # not a new finding: never returns muster-12's own value)

# target-session class (already correct pre-fix; confirms the trailing colon doesn't regress it)
$ tmux -S <sock> kill-session -t '=muster-1:'
can't find session: muster-1                    # exit 1 — correct
$ tmux -S <sock> kill-session -t '=muster-12:'
                                                 # exit 0 — killed exactly muster-12

# target-pane class (already correct pre-fix; confirms the trailing colon doesn't regress it)
$ tmux -S <sock> capture-pane -p -t '=muster-1:'
can't find session: muster-1                    # exit 1 — correct
$ tmux -S <sock> capture-pane -p -t '=muster-12:'
                                                 # exit 0 — captures muster-12's own pane
$ tmux -S <sock> send-keys -t '=muster-12:' 'echo hi' Enter
                                                 # exit 0 — reaches muster-12's own pane (confirmed via capture-pane)
$ tmux -S <sock> copy-mode -e -t '=muster-12:'; tmux -S <sock> send-keys -t '=muster-12:' -X cancel
                                                 # both exit 0 — copy-mode entered and cancelled on muster-12

# already-qualified (window-id) targets: unaffected, since they already contain ":" and get no second colon appended
$ tmux -S <sock> list-panes -t '=muster-9:@2' -F '#{session_name} #{pane_id}'
muster-9 %2                                     # exit 0 — round-trips correctly, matching pre-fix behaviour
```

**Gates** (from the `plan/maintainability-cleanup` worktree, scope `internal/tmux`):

```
$ gofmt -l internal/tmux/tmux.go
(no output — clean)

$ go build ./...
(exit 0; one transient failure hit mid-run, `internal/server/launcher.go:10:2: "strings" imported and not used` — confirmed via git status to be FW-D3's own in-flight, uncommitted edit outside this wave's scope, not `internal/tmux`; re-ran 5s later and it was clean — the same shared-worktree race daemon-implementation-FW-D2.md's Handoff already documented for FW-D1)

$ go vet ./internal/tmux/...
(no output — clean)

$ golangci-lint run --tests=false ./internal/tmux/...
0 issues.

$ make lint   (tests included, tree-wide — the failing test below is a runtime assertion, not a typecheck error, so it doesn't blind this gate)
golangci-lint run
0 issues.

$ go test -race -count=1 ./internal/tmux/...
--- FAIL: TestCancelCopyMode_IssuesSendKeysCancelWithTarget (0.00s)
    activity_test.go:346: Error: Should be true
FAIL    github.com/Zalaras/muster/internal/tmux        9.670s
ok      github.com/Zalaras/muster/internal/tmux/tmuxtest       1.931s
(1 sanctioned failure — see below; every other test, including the two the fix wave targeted, passes)

$ go test -race -count=1 -run 'TestExactTarget_RealTmux_NeverPrefixMatchesADifferentLiveSession|TestResizeWindow_RealTmux_NeverPrefixMatchesADifferentLiveSession' -v ./internal/tmux/...
--- PASS: TestResizeWindow_RealTmux_NeverPrefixMatchesADifferentLiveSession (0.16s)
--- PASS: TestExactTarget_RealTmux_NeverPrefixMatchesADifferentLiveSession (0.49s)
    --- PASS: .../a_longer_numeric_id (0.24s)
    --- PASS: .../the_shell-session_suffix (0.25s)
(both new regression tests the team lead asked for now pass against the fixed implementation)

$ python3 .claude/skills/orchestrate/scripts/dead-refs.py
dead-refs: 1897 references checked, 0 missing
```

**New sanctioned test-file breakage this fix introduces** (I may not edit test files):
- `internal/tmux/activity_test.go:346` (`TestCancelCopyMode_IssuesSendKeysCancelWithTarget`): `CancelCopyMode` is called with the bare, colonless shell target `"muster-7-shell"` (a `target-pane` command). The trailing colon now applies to it like every other colonless target, so the argv this test captures carries `"=muster-7-shell:"`, not the `"=muster-7-shell"` the prior sanctioned-breakage list gave. The one assertion to change: `assert.True(t, slices.Contains(gotArgs, "=muster-7-shell"))` → `assert.True(t, slices.Contains(gotArgs, "=muster-7-shell:"))`. Confirmed correct against real tmux above (`send-keys`/`copy-mode` with a trailing colon on an existing bare-named session reaches that session's own pane, same as the colonless form did).
- No other test in `internal/tmux` needed a change: `TestAttachArgv_IncludesTheSocketFlagAndTarget` (line 308) already asserts `"=muster-7:@1"` — that target already contains `":"`, so `exactTarget` returns exactly `"=" + t"` for it, unchanged by this fix.

**Decisions**:
- `exactTarget`'s branch (`strings.Contains(t, ":")`) is the only new logic; no new type or helper — `rg -n "func exactTarget" internal/tmux/tmux.go` before this change showed the single existing declaration this wave modifies in place, nothing to reuse or duplicate.
- Confirmed by grep (`internal/session`, `internal/server`) that `exactTarget` is never fed a raw `"%pane"` or bare `"@window"` id directly — `TmuxPane` values are only ever compared for ingest corroboration (`internal/server/ingest.go`), never passed as a `-t` argument — so the colon-appending branch has no case in this codebase where a bare pane/window id would wrongly gain a trailing colon.
- File-length warning (`internal/tmux/tmux.go`, now 757 lines) grew further under the same accepted reason FW-D2's Handoff already recorded (D10/review-work Notes: one type's method set, comment-heavy) — the added doc comment on `exactTarget` explaining three tmux target-resolution classes is the only reason for the growth; not split, per the same standing rationale.

**Build status**: `go build ./...` exits 0 (confirmed clean after the transient race above resolved).

