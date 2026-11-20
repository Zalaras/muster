# Daemon Tests: diff-viewer

**Plan**: diff-viewer
**Verdict**: pass
**Pack**: kb: pack 24659 words (budget 30000)

## Summary

Tests created: 13 test functions with table rows and subtests, plus the cross-state invariant (about 270 subtests) | Passing: all | Failing: 0

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/gitdiff/gitdiff_test.go` | TestRead_TrackedChangeShapes, OddPaths, NonUTF8, NoNewlineMarker | modified/deleted/renamed/binary/added, line numbers, old/new null rules, CRLF, odd names, U+FFFD | pass |
| `internal/gitdiff/gitdiff_test.go` | TestRead_UntrackedRules, NoCommitsEveryFileIsAdded | ignored, empty, NUL, 256 KiB bound, symlink, no-commit repo | pass |
| `internal/gitdiff/gitdiff_test.go` | TestRead_BranchScopeBases | merge base, already on default, master fallback, no default, no merge base, origin/HEAD first | pass |
| `internal/gitdiff/gitdiff_test.go` | TestFingerprint_DependsOnContentOnly, TestSummary | stable across calls and a clone at another path, moves on change; summary equals diff counts and fingerprints; repo false | pass |
| `internal/gitdiff/gitdiff_test.go` | TestRead_NeverWritesTheRepository | no file under .git changes across Summary and both scopes (REQ-25) | pass |
| `internal/gitdiff/gitdiff_test.go` | TestReader_RunSeam, ParseRaw, ParseRange, ParseHunkHeader | exit 128 is ErrNotRepo, other failures errors, count mismatch errors, flags | pass |
| `internal/session/diffreview_test.go` | TestPutDiffComment, TestUpdateDiffTicks, empty/unknown/no-broadcast/concurrency/Remove/corrupt | create/replace/delete/tick semantics, order, CreatedAt kept, NULL when empty, no upsert, per-item concurrency, Remove with a bystander | pass |
| `internal/session/diffreview_test.go` | TestDiffReview_INV_ChangesOnlyThroughItsWrites | review unchanged from every source state x every non-review input, bystander untouched, store equals memory | pass |
| `internal/server/diff_test.go` | TestDiffRoutes_RequireTheCookie, UnknownSession, TestHandleDiffSummary, TestHandleDiffRead, RealReaderThroughTheFullServer | 401 on all six routes, 404, 409 directory_missing / not_a_repo, 500 diff_failed with no raw error on the wire, scope handling, wiring | pass |
| `internal/server/diffreview_test.go` | TestHandlePutDiffComment_Validation, 413, Delete, Ticks, NeverBroadcast | every 400 message and boundary (64/65 id, 500/501 quote, 256/257 runes), id/createdAt ignored, 413, 204 bodies, no WS upsert, not on the Session object | pass |
| `internal/store/migrate_test.go`, `store_test.go` | existing migration tests | count 20 to 21 | pass |

## Review cycle 1 fixes

- `internal/gitdiff/gitdiff_test.go` `TestRead_NeverWritesTheRepository` is now a 3-row table that ages the index 10 s and sets `a.txt`'s mtime explicitly (+2 s, -1 h, +3 s beside a real change and an untracked file). Proof on a throwaway `git archive 32d3eb69` copy: 6/6 runs fail (18/18 subtests, "index changed"); at HEAD `-count=6` passes.
- `TestRead_TrackedFileOverThreeThousandLinesIsListedWhole` (D7): 3,500 changed lines in a tracked file, asserts counts and every line present in hunks.
- `internal/server/diffreview_test.go` `TestBuildIssueSnapshot_CarriesNoReviewText` (D10): session with stored comment, quote and tick; snapshot JSON and markdown contain none of the text and no review/comments/ticks key.
- `internal/gitutil/gitutil_test.go`: `TestGitRunner_Root_ExitCode128IsErrNotRepo` (real exit 128, other errors passed through, empty output) and `TestExec_IsLockFreeAndHonoursWithEnv` (probe script: `GIT_OPTIONAL_LOCKS=0`, `--no-optional-locks -c core.quotepath=off` argv, `WithEnv` passthrough).
- `make test` green, `make lint` 0 issues.

## Handoff Received

- `internal/store/migrate_test.go`: counts 20 to 21 (three assertions), range comment and the migration list gained `0021_diff_review (diff-viewer)`.
- `internal/store/store_test.go`: line 52 count 20 to 21.

## Notes

- Real git in per-test temp repos, through the reader's own `runGit` (the established pattern in `internal/gitutil`); the run seam is faked for failure paths. Test repos pass `gc.auto=0 -c maintenance.auto=false` as a harmless guard. The earlier belief that detached commit-time maintenance caused the one-in-six index change was wrong: the reader itself rewrote the index (Critical 1, porcelain `diff` refreshing stat data), visible only when a same-bytes rewrite landed in a new second.
- Server handler tests mount `diffFeature` with a fake `diffReader` and a pass-through guard; auth is proven on the full server, which is also where the real reader is wired.
- Declined: the web-only requirements; `D8`/`D13` hold by construction and are covered by the Remove and INV tests above. Migration column existence is not tested (plan: "Not tested").
- Load flakes seen once under a concurrent run of `make test` while web-impl built the tree (`cmd/musterd` embed of `internal/webui/assets` empty mid-build, `tmux` and `onexit` timeouts); each passed when re-run alone. Not related to this work.
- `dupl`: no warning names my files.

## Test Run Output

```
make lint: 0 issues
go test ./internal/gitdiff ./internal/session ./internal/server ./internal/store ./cmd/musterd ./internal/tmux: ok
```

## Review cycle 3 fixes (wave 2)

**Verdict**: pass

Handoff Received (cycle 3): applied daemon-impl's mechanical patch after reading it, and own the result.
- `internal/gitutil/gitutil_test.go`: `gitRunner` -> `Git`, fakes take `env []string` after dir, `IsWorktree`/`ListFiles`, `TestGitRunner_TopLevel` asserts through `Root` (error assertion made `require.Error` for testifylint), `TestExec_IsLockFreeAndHonoursWithEnv` passes env as Exec's argument.
- `internal/gitdiff/gitdiff_test.go`: `&Reader{git: gitutil.NewGit(f)}`, fake signatures gain `[]string`.

New: `TestReader_RunSeam/only_the_two_tracked_diffs_carry_env...` records every call of a real-git-backed Reader through `NewGit(fake)` delegating to `gitutil.Exec`. It asserts both `git diff` calls carry exactly one env entry `GIT_INDEX_FILE=<abs path>` that exists while git runs and is outside the git dir and the repo, and every other call carries no env.

`TestRead_NeverWritesTheRepository` is unchanged (all 3 subtests pass).

Gates: `make lint` 0 issues; `make test` ok. `make test-race` had 3 `internal/server` wrapper-script tests time out while other worktrees' gates held the machine (TestWrapperReply_*, TestWrapperScriptsShellRoundTrip_*; none touch this plan's code); all pass in isolation with `-race` (24 s).
