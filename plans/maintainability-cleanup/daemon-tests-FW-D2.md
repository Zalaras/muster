# Daemon Tests: Maintainability Cleanup — FW-D2 (adapters/tmux fix wave, cycle 2)

**Plan**: maintainability-cleanup
**Verdict**: implementation-bug
**Pack**: pack unavailable to quote a summary line from directly (same shape daemon-implementation-FW-D2.md's own header notes — the plan's Units/no REQ-block shape); worked from the team lead's brief, `daemon-implementation-FW-D2.md`'s Handoff (the sanctioned-breakage list, with exact lines) and `internal/tmux/tmux.go`'s own `exactTarget` doc comment, read in full.

## Summary

Tests created: 4 new test functions (one with 2 subtests) | Repaired (sanctioned test-file breakage): 6 files | Passing: every repaired/new test except 2 | Failing: 2 (both new, both revealing a real implementation gap — see below)

**Every one of the sanctioned test-file breakages named in `daemon-implementation-FW-D2.md`'s Handoff is fixed and green.** The two new real-tmux regression tests the team lead asked for (KillSession/PaneExists/ResolveSessionTarget never touching a live `muster-12`/`muster-1-shell`) are correct and **fail against the current, already-"fixed" implementation** — not because of a test bug, but because `exactTarget` (review-work Major 3/Major 7's fix) does not actually close the measured prefix-match hazard for every command it was applied to. Full evidence below.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/tmux/tmux_test.go` | `TestAttachArgv_IncludesTheSocketFlagAndTarget` | sanctioned repair: argv now expects `=muster-7:@1` | pass |
| `internal/tmux/activity_test.go` | `TestCancelCopyMode_IssuesSendKeysCancelWithTarget` | sanctioned repair: argv now expects `=muster-7-shell` | pass |
| `internal/tmux/tmux_test.go` | `TestExactTarget_RealTmux_NeverPrefixMatchesADifferentLiveSession/a_longer_numeric_id` | **new** (team lead's ask): KillSession/PaneExists/ResolveSessionTarget for `muster-1` never touch a live `muster-12`, on a real per-test socket | **FAIL — implementation bug, see below** |
| `internal/tmux/tmux_test.go` | `TestExactTarget_RealTmux_NeverPrefixMatchesADifferentLiveSession/the_shell-session_suffix` | same, against a live `muster-1-shell` instead of `muster-12` | **FAIL — implementation bug, see below** |
| `internal/tmux/tmux_test.go` | `TestResizeWindow_RealTmux_NeverPrefixMatchesADifferentLiveSession` | **new**, added while chasing the failure above: `ResizeWindow` (also `exactTarget`-wrapped) has the identical residual gap | **FAIL — implementation bug, see below** |
| `internal/claudecode/modelcheck_test.go` | `TestCheckModel_ArgvAndDir`, `TestCheckModel_VerdictFollowsStderr`, `TestCheckModel_ExitErrorIsNotAFailure`, `TestCheckModel_RunError_FailsOpen`, `TestCheckModel_ContextDeadlineExceeded_FailsOpen`, `TestRunModelCheck_*` (6 call sites) | sanctioned repair: `modelCheckRun`'s `(dir, argv []string)` → `(dir, name string, args ...string)` | pass |
| `internal/claudecode/settings_test.go` | `TestProjectSettingsPath` | **new** (team lead's ask): `ProjectSettingsPath("/home/bob/project")` joins `.claude/settings.local.json` — the one declaration Critical 1's fix introduced | pass |
| `internal/gitutil/gitutil_test.go` | `TestGitRunner_ListFiles_ParsesNulSeparatedOutput`, `_EmptyOutputIsNilNotEmptySlice`, `_RunErrorPropagates` | sanctioned repair: `gitRunner.run`'s `(string, ...string) (string, error)` → `(string, string, ...string) ([]byte, error)` | pass |
| `internal/ghissue/ghissue_test.go` | 9 `run := func(...)` literals + `TestRunCommand_HarmlessSmokeTestNeverUsedByGhCLITokenReaderTests` | sanctioned repair: `execFunc`'s `(string, string, error)` → `([]byte, []byte, error)`, plus the `assert.Contains(t, string(stdout), "hello")` fix the Handoff called out (testify's `Contains` on `[]byte` iterates bytes, not substrings) | pass |
| `internal/selfupdate/exeversion_test.go` | `fakeRunReturning`, `TestRunVersionProbe_CapturesStdout` | sanctioned repair: `versionProbeRun`'s `(string, error)` → `([]byte, error)` | pass |
| `internal/selfupdate/release_test.go` | `TestCheckNewer` (table), `TestCheckNewer_Errors` (2 subtests) | sanctioned repair: `CheckNewer`'s new 4-value return (`latest, tag, newer, err`) | pass |
| `internal/selfupdate/release_test.go` | `TestCheckNewer_ReturnsTheRawResolvedTagNotAReconstructedOne` | **new** (team lead's ask): `CheckNewer`'s `tag` is the raw string `LatestTag` resolved, not `ReleaseTag(latest.String())` — proven with a tag missing the leading `"v"` (still a valid `ParseRelease` match), where a reconstructed tag would visibly differ from the raw one | pass |

Every other pre-existing test in every touched package still passes (`internal/tmux`: 75 top-level `PASS`, 2 top-level `FAIL` — both the new ones above; every other package `ok`).

## Implementation Bug

**`exactTarget` (review-work Major 3/Major 7's fix, `internal/tmux/tmux.go:89`) does not close the measured prefix-match hazard for `list-panes` or `resize-window` when given a bare, colonless session name — only for `kill-session`/`attach-session` (target-session) and `capture-pane`/`send-keys`/`copy-mode` (target-pane). `PaneExists`, `ResolveSessionTarget` and `ResizeWindow` remain vulnerable to exactly the cross-session hazard the fix's own doc comment claims is closed.**

| Bug | File | Expected (per exactTarget's own doc comment / review-work Major 3/7) | Actual |
|-----|------|---------------------------------------------------------------------|--------|
| `PaneExists`/`ResolveSessionTarget` silently resolve a bare `"muster-1"` target to a different live session's window when `muster-1` itself has no session | `internal/tmux/tmux.go:476,502` (`ResolveSessionTarget`, `PaneExists`, both via `list-panes -t exactTarget(name)`) | `"=muster-1"` against `{muster-12, muster-3}` reports "can't find session: muster-1" — same as `kill-session` | `list-panes -t '=muster-1'` (no window part) resolves to **muster-12's own pane** (`%0`), exit 0. Reproduced identically for `muster-1-shell` as the colliding name. |
| `ResizeWindow` silently resizes a different live session's window | `internal/tmux/tmux.go:321` (`resize-window -t exactTarget(target)`) | same exact-match guarantee | `resize-window -t '=muster-1' -x 55 -y 20` against `{muster-12, muster-3}` resizes **muster-12's window** to 55×20, exit 0 |
| `KillSession`'s own idempotent-no-op guarantee (REQ-6, `kb:adr/actions-kill-is-idempotent`) breaks as a side effect | `internal/tmux/tmux.go:606` (`KillSession`) | `KillSession(ctx, "muster-1")` against `{muster-12, muster-3}` returns `nil` (idempotent success — the initial `kill-session` correctly reports "can't find session", but the recheck must not un-do that) | Returns `tmux kill-session "muster-1": exit status 1: can't find session: muster-1` — because `KillSession`'s post-`ExitError` recheck calls `PaneExists(ctx, "muster-1")`, which (per the bug above) reports `stillThere=true` (it found muster-12's pane), so `KillSession` treats the correct "not found" as if the kill had failed |

**Root cause, isolated by hand (tmux 3.7b, private `-S` socket, `{muster-12, muster-3}` live, `muster-1` never created):**

```
$ tmux -S <sock> list-panes -t '=muster-1' -F '#{session_name} #{pane_id}'
muster-12 %0                                    # exit 0 — WRONG, should be "can't find"
$ tmux -S <sock> resize-window -t '=muster-1' -x 55 -y 20
                                                 # exit 0 — resized muster-12
$ tmux -S <sock> kill-session -t '=muster-1'
can't find session: muster-1                    # exit 1 — this one IS correct
```

tmux's own manual (`TARGET SPECIFICATION`) explains why: `kill-session`'s `-t` is a `target-session` (the `=` exact-match rule the doc comment measured), but `list-panes`/`resize-window`/`display-message`'s `-t` is a `target-window`, specified as `session:window` — and for a **colonless** string, tmux's `target-window` resolver does not apply the `=`'s session-level exact-match rule the way `target-session` does; it falls through to an ordinary (non-exact) resolution instead. Adding a trailing colon restores the exact-match guarantee for this class of command — measured, not applied by me (implementation is not mine to touch):

```
$ tmux -S <sock> list-panes -t '=muster-1:' -F '#{session_name} #{pane_id}'
can't find session: muster-1                    # exit 1 — correct
$ tmux -S <sock> resize-window -t '=muster-1:' -x 55 -y 20
can't find session: muster-1                    # exit 1 — correct
$ tmux -S <sock> kill-session -t '=muster-12:'   # sanity: trailing colon still works for an existing session
                                                  # exit 0 — killed muster-12
```

`capture-pane`/`send-keys`/`copy-mode` are `target-pane`, a third resolution class that already refuses a bare unresolvable name correctly (`can't find pane: =muster-1`, exit 1) — confirmed by hand, not newly broken. `display-message` (used by `displayVar`/`paneCopyModeState`, in turn by `ScrollCopyMode`) is `target-window` too, but its own failure mode is different again: an unresolvable `=muster-1` returns **empty** output with exit 0 (not muster-12's real values) — this one is already pinned by the existing `TestDisplayVar_UnknownTargetReturnsEmptyWithNoError` and is not a new finding; `paneCopyModeState`'s own `len(fields) != 2` check turns that empty output into a safe parse error rather than a wrong-session action, so `ScrollCopyMode`/`CancelCopyMode` are not part of this bug (their own `send-keys`/`copy-mode` calls are `target-pane`, already safe, as above).

**Production reachability**: `internal/session/reconcile.go:220,254` (`RepairOwnedSession`, `reviveOwnedSession`) both call `ResolveSessionTarget(ctx, tmux.SessionName(id))` — a bare, colonless name — specifically in the race-repair path where a row believes it does *not* own a live session. If that row's own `muster-<id>` genuinely has no live tmux session but a numerically-prefixed sibling (`muster-<id>` is a prefix of `muster-<id>X`) or that id's own `-shell` session does, `ResolveSessionTarget` can silently hand back the *other* session's window/pane, and the caller persists it as this row's own `tmux_target`/`tmux_pane` with `Alive = true` — a session-identity mixup, not merely a display glitch (CLAUDE.md: "Session identity keys on the tmux target").

## Test Run Output

```
$ go build ./...
(exit 0)

$ go vet ./...
(no output — clean; every sanctioned test-file breakage from the Handoff is repaired)

$ go vet -tags=canary ./test/...
(no output — clean)

$ make lint
golangci-lint run
0 issues.

$ go test -race -count=1 ./internal/tmux/... ./internal/claudecode/... ./internal/gitutil/... ./internal/ghissue/... ./internal/selfupdate/... ./internal/locate/... ./cmd/...
--- FAIL: TestResizeWindow_RealTmux_NeverPrefixMatchesADifferentLiveSession (0.16s)
    tmux_test.go:358: Error Trace: .../internal/tmux/tmux_test.go:358
        Error:      An error is expected but got nil.
        Messages:   resizing a name with no live session must error, never silently resize a DIFFERENT live session (muster-12)
--- FAIL: TestExactTarget_RealTmux_NeverPrefixMatchesADifferentLiveSession (0.41s)
    --- FAIL: .../a_longer_numeric_id (0.20s)
        tmux_test.go:654: Error Trace: .../internal/tmux/tmux_test.go:654
            Error:      Received unexpected error:
                        tmux kill-session "muster-1": exit status 1: can't find session: muster-1
            Messages:   REQ-6: killing a name with no live session is a successful (idempotent) no-op — it must not report success by having killed muster-12 instead
    --- FAIL: .../the_shell-session_suffix (0.21s)
        tmux_test.go:654: (same shape, "muster-1-shell" instead of "muster-12")
FAIL    github.com/Zalaras/muster/internal/tmux        12.541s
ok      github.com/Zalaras/muster/internal/tmux/tmuxtest       1.953s
ok      github.com/Zalaras/muster/internal/claudecode  7.640s
?       github.com/Zalaras/muster/internal/claudecode/claudecodetest  [no test files]
ok      github.com/Zalaras/muster/internal/gitutil     3.789s
ok      github.com/Zalaras/muster/internal/ghissue     4.195s
ok      github.com/Zalaras/muster/internal/selfupdate  3.862s
ok      github.com/Zalaras/muster/internal/locate      3.356s
ok      github.com/Zalaras/muster/cmd/musterd  57.030s

$ python3 .claude/skills/orchestrate/scripts/dead-refs.py
dead-refs: 1896 references checked, 0 missing

$ make refs
dead-refs: 3127 references checked, 0 missing

$ make check-kb
kb: 426 records, 23 features, 0 problem(s)
kb: all checks pass
```

**Proof the new regression test fails on the pre-`exactTarget` code, as the team lead asked** (scratchpad byte-diff: `cp internal/tmux/tmux.go $SCRATCH/tmux.go.fixed`, then `git show HEAD:internal/tmux/tmux.go > internal/tmux/tmux.go`, ran the test, then restored `$SCRATCH/tmux.go.fixed` back and confirmed byte-identical with `diff`):

```
=== RUN   TestExactTarget_RealTmux_NeverPrefixMatchesADifferentLiveSession/a_longer_numeric_id
    tmux_test.go:629: Error: Should be true
        Messages: KillSession("muster-1") must never touch muster-12
    tmux_test.go:636: elements differ — extra: ["muster-12"]  (muster-12 was killed)
=== RUN   TestExactTarget_RealTmux_NeverPrefixMatchesADifferentLiveSession/the_shell-session_suffix
    tmux_test.go:629: Error: Should be true
        Messages: KillSession("muster-1") must never touch muster-1-shell
    tmux_test.go:636: elements differ — extra: ["muster-1-shell"]  (muster-1-shell was killed)
--- FAIL: TestExactTarget_RealTmux_NeverPrefixMatchesADifferentLiveSession (0.44s)
```

Both subtests correctly fail against the pre-fix code (`kill-session -t muster-1` silently kills the colliding session) — confirming the test itself is sound — and both **also** fail against the post-fix code, for the different reason documented above (`PaneExists`/`ResolveSessionTarget`'s own residual gap, surfaced through `KillSession`'s recheck). `TestResizeWindow_RealTmux_NeverPrefixMatchesADifferentLiveSession` was not run against the pre-fix `tmux.go` (it calls `ResizeWindow`, which had no `exactTarget` wrapping at all pre-fix, so it would trivially fail there too — not a useful confirmation) but stands on its own as a second, independent measurement of the same post-fix gap.
