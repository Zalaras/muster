# Daemon Implementation: diff-viewer

**Plan**: diff-viewer
**Mode**: initial
**Pack**: kb: pack 29205 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/gitdiff/gitdiff.go` | created | Reader (run seam), scopes, base resolution, fingerprint, wire types (REQ-3, REQ-25) |
| `internal/gitdiff/tracked.go` | created | `git diff --raw -z` + `--patch` paired and parsed into files and hunks (REQ-11, REQ-26) |
| `internal/gitdiff/untracked.go` | created | Untracked/no-commit files read from the working tree as added; 256 KiB / NUL read as binary (REQ-26) |
| `internal/server/diff.go` | created | `diffFeature`: mount, summary, diff read |
| `internal/server/diffreview.go` | created | review read, comment PUT/DELETE, ticks POST, validation |
| `internal/server/server.go` | modified | one registration line |
| `internal/session/diffreview.go` | created | per-session comments/ticks, per-item writes under `Manager.mu`, open count (REQ-5, 6, 8) |
| `internal/session/session.go`, `row.go`, `writeorder.go` | modified | `DiffReview *string` field, row mapping, restore on failed write, field-coverage list |
| `internal/store/session.go` | modified | `diff_review` column load/save |
| `internal/store/migrations/0021_diff_review.sql` | created | the column |
| `internal/server/renderfix.go`, `renderfix_normalise.go` | modified | `Diff` key recorded when `recordDiff`; `gitEnv`; normalised |
| `internal/server/renderfix_scenarios_diff.go` | created | the nine diff scenarios |
| `internal/server/renderfix_scenarios_shortcuts.go` | modified | `workingSessionIn` / `idleSessionIn` (dir given) |
| `web/render/fixtures/diff*.json` (9) | generated | `go run -tags renderfix ./tools/renderfix gen` |

Every daemon REQ (1, 3, 5, 6, 8, 11, 24, 25, 26 and the endpoints behind 4, 7, 9, 27, 28) is covered by the above; the rest are web.

## Decisions

- design: `gitdiff.Reader{run}` mirrors `gitutil.gitRunner` (`run(ctx, dir, "git", args...)`, constructor default `runGit`). Grep `rg -n 'func runGit|WaitDelay' internal` found `gitutil.runGit` (unexported, no timeout, no optional-locks), claudecode/tmux runners. Not reusable: the diff needs `--no-optional-locks` + `GIT_OPTIONAL_LOCKS=0`, a per-call timeout (30 s) and WaitDelay (V4). Top level is resolved by the same seam (exit 128 → `ErrNotRepo`) rather than `gitutil.TopLevel`, so tests can fake one seam.
- design: wire types (`File`, `Hunk`, `Line`, `Counts`, `Summary`, `Diff`) live in `gitdiff` with json tags — one owner of the shape; the server only wraps `Summary` with `openComments`. `usagewire.go`-style separate mapping would copy 40 lines with no second consumer.
- design: summary reads the full diff of both scopes and takes counts + fingerprint from it. This guarantees D1/D14 (summary equals diff by construction); cost is one diff read per poll per scope. Not cheaper `--numstat`, because the fingerprint must equal the diff endpoint's.
- design: tracked files pair `git diff --raw -z` entries with `--patch` blocks by order (headers are never parsed for paths, so odd names are exact). A type change (`T`) consumes two blocks; any count mismatch is an error (500 `diff_failed`), never a guess.
- design: review storage is one JSON string on `Session.DiffReview` (`*string`, replaced never written through). `mutateDiffReview` reads-modifies-writes under `Manager.mu` and persists through `persistWholeRowLocked` (broadcast false), matching `SetNote`'s shape (`rg 'func \(m \*Manager\) SetNote' internal/session/note.go`). Writers: the three review methods only; guard: `Manager.mu` plus the per-session write turnstile; failed write restores via `restoreIfUnchanged` and `DiffReview` is in `restoredSessionFields`. Not on `sessionwire` (grep `DiffReview internal/server/sessionwire.go` finds nothing), so never on the wire or in an issue snapshot.
- design: `diffFeature` is one handler type over two files (`diff.go` reads, `diffreview.go` review writes), matching `noteFeature`'s mount/guard shape; request validation stays in the handler file (decode + shape), storage logic in `session`.
- design: render fixtures record `diff` only for scenarios that set `renderRig.recordDiff` (the nine diff ones). deviation: the plan says "one entry per git-backed session"; recording for every scenario would rewrite ~115 existing fixtures for no consumer, so existing fixtures stay byte-identical (`make check-render-fixtures`: "125 scenarios up to date"; `git status` shows only the nine new files). The web harness gets `404` for a session with no entry, i.e. no button, as before. → ADR: kb:adr/process-render-fixtures-record-diff-opt-in
- design: `diffChangeKey` in `renderfix_scenarios_diff.go` is a Go port of `web/src/features/diffmodel.ts` `changeKey`/`hash` (cross-language duplicate, build-tagged renderfix only) so the fixture's two ticks match real changes. Drift is caught by the render test that reads those ticks; if the web hash changes, regenerate keys here.
- design: size: `renderfix.go` was already over 500 lines (564 → 579); `gitdiff` split into three files to stay readable. No funlen/dupl hit on touched files.
- Measured read-only (D3): scratch repo with modified, deleted, staged-rename, binary, untracked, symlink and a 300 KB file; sha of every file under `.git` before and after Summary + both scopes: `GIT-IDENTICAL`.
- Measured (D2/D5/D6/D4): uncommitted listed `added big.txt binary`, `modified bin.dat binary`, `modified f.txt`, `deleted gone.txt`, `added link`, `renamed new.txt (old.txt)`, `added untracked.txt`; branch base `main @ 93785ed`; on main `HEAD (93785ed) — already on main`; no-commit repo `empty repository`, file added; plain dir `repo:false`, read → `not a git repository`.
- REQ-7/17..23, 12..16 etc. are web-only. D8/D13 hold by construction: review is touched only by `mutateDiffReview`; Remove deletes the row. Not unit-tested here (test agent).
- doc-delta: `docs/protocol.md` anchors match what shipped. Unknown-session on malformed id follows `parseSessionID` (404). A body that is not JSON answers `400 invalid_request` with message `request body is not valid` (contract gives no text for that case).
- doc-delta: ticks/comment bodies over 1 MiB answer `413` via `MaxBytesReader`; a JSON `null` for a required key reads as missing (400).

## Handoff

**Build status**: `go build ./...` exits 0; `make lint` 0 issues; `go vet ./...` clean. `golangci-lint run --tests=false ./...` reports one `unused` (`claudecode.scanInterrupt`, used only by tests, untouched, not mine).

Sanctioned breakage (new migration `0021` per plan Schema Changes): the test agent must update the migration count 20 → 21 in
- `internal/store/migrate_test.go` (lines 39, 43, 60 and the list comment: add `0021_diff_review (diff-viewer)`)
- `internal/store/store_test.go` (line 52)

Failing now: `TestMigrate_AppliesInitSchema`, `TestMigrate_SecondCallIsANoOp`, `TestOpen_SecondOpenOnSamePathDoesNotReapplyMigrations`.

No tests exist yet for `internal/gitdiff`, `session/diffreview.go` or `server/diff*.go`. New files have no feature glob yet (orchestrator registers `internal/gitdiff/**`, `internal/server/diff*.go`, `internal/session/diffreview*.go`); the `renderfix_*` files are not matched by `diff*.go`.
Harness contract for web: fixture top-level `diff: [{sessionId, summary, uncommitted, branch, review}]` as the plan's Implementation Notes give it.

## Fix Attempt 1 (review cycle 1)

**Failures addressed**: Correctness Critical 1 (porcelain diff rewrites the index), Maintainability Major 1 (second git runner), Minor 1 (request ctx in review writes), Minor 2 (funlen reason).

**Changes made**:
- `internal/gitdiff/tracked.go`: `trackedFiles` copies the repository's index (`git rev-parse --git-path index`, so linked worktrees work) into a `MkdirTemp` scratch dir with the original's mtime and points `GIT_INDEX_FILE` at it for both porcelain `diff` calls; the refresh/rewrite lands on the copy, removed afterwards. Raw/patch pairing is untouched, so a stat-only change yields no raw entry and no fingerprint change. The copy keeps the source mtime because git's racy-clean check compares entry mtime with the index file's mtime: a fresh mtime made same-second same-size edits read as clean (measured flaky `TestRead_NoNewlineMarkerDropped`/`BranchScopeBases` before the `Chtimes`, 6/6 green with `-race` after). Absent index file: no override.
- `internal/gitutil/gitutil.go`: the single runner `Exec` (was `runGit`, now exported) is lock-free (`--no-optional-locks`, `GIT_OPTIONAL_LOCKS=0`, `core.quotepath=off`), has the 30 s timeout and WaitDelay, and takes extra env through `WithEnv(ctx, ...)`. Added `ErrNotRepo`, `Git`/`NewGit(run)`, `Root` (exit 128 -> `ErrNotRepo`), `ListFiles`, `ListUntracked`, `Run`. `TopLevel` now calls `Root`.
- `internal/gitdiff/{gitdiff,untracked}.go`: own `runGit`, `splitNul`, `checkout`'s rev-parse and both `ls-files` argvs deleted; they go through `gitutil.NewGit(r.run)`. `ErrNotRepo = gitutil.ErrNotRepo`. The `Reader.run` seam keeps its signature, so no test file changes.
- `internal/server/diffreview.go`: the three writes use `context.WithoutCancel(r.Context())` like `note.go:57`.

**Paths to the index-write defect**: Summary (both scopes), Read uncommitted, Read branch all reach `trackedFiles` (the only porcelain diff caller; `allFilesAdded` is the no-HEAD path and runs `ls-files` only); all three now run on the scratch index. `ls-files -o`, `rev-parse`, `merge-base` do not write the index.

**Blast radius** of runGit becoming lock-free + timeout (`rg 'gitutil\.(IsRepo|Branch|TopLevel|IsWorktree|ListFiles)' internal`): reader (ListFiles), server reporefresh (TopLevel), session/launch callers (IsRepo/Branch/IsWorktree). Their output is unaffected (rev-parse and `-z` ls-files are not quotepath-sensitive); they gain a 30 s cap and no optional locks.

**Repro re-run** (scratch repo, git 2.50.1, `touch f.txt` of an unchanged tracked file, one untracked file; Summary twice + Read both scopes): `shasum .git/index` before `9aa34cbd1e45d520dcc2e77df3085fc040ff0bff`, after `9aa34cbd1e45d520dcc2e77df3085fc040ff0bff`; no `*.lock` under `.git`; both reads returned exactly 1 file (the untracked one). `TestRead_NeverWritesTheRepository` passes with the rest of `./internal/gitdiff` under `-race`; `./internal/server` and `./internal/gitutil` pass; `make lint` 0 issues.

**Decisions**:
- design: one git runner for the daemon: `gitdiff.Reader` now builds `gitutil.NewGit(r.run)` per call (same constructor-default seam as `gitRunner`); `rg 'rev-parse --show-toplevel|ls-files' internal --glob '!*_test.go'` now finds each in gitutil only. Extra env travels as a context value (`gitutil.WithEnv`) rather than a new runner parameter so the existing `run` seam signature, and both packages' tests, stay as they are; the only writer is `trackedFiles`, nothing shared.
- design: size: `internal/session/writeorder.go:209 restoreChangedFields` is 61 > 60 because it is one `restoreIfUnchanged` line per mutable session field, a flat list with no interleaved concerns; splitting it would scatter a list `mustCoverEverySessionField` keeps honest. Kept on purpose. This corrects the earlier "No funlen/dupl hit on touched files": the pre-existing hits on touched files (`server.go New`, `store/session.go UpdateSession`/`scanSession` and its 561 lines) are not new.
- doc-delta: `docs/features/diff*/spec.md` and the read-only claim: diffs are read against a scratch copy of the index (`GIT_INDEX_FILE`), so no byte under the git directory changes and no lock is taken even for stat-dirty files.

**Handoff**: `go build ./...` exits 0; `make lint` 0 issues. No test file edited and none broken (Reader/gitRunner seams unchanged). daemon-tests: `TestRead_NeverWritesTheRepository` now passes on stat-dirty files; add a case that touches an unchanged tracked file and one that changes a file within the index's second.

## Fix Attempt 2 (review cycle 3)

**Failures addressed**: Maintainability Minor 1 (env as a context value), Minor 2 (alias and doubled `gitutil` surface), plus the stale `gitRunner` doc.

**Changes made**:
- `internal/gitutil/gitutil.go`: `gitRunner` + `type Git = gitRunner` + `newGitRunner()` → one exported struct `Git` built only by `NewGit(run)`; `RunFunc` and `Exec` now take `env []string` after `dir`; `WithEnv`/`envKey` deleted (no `context.WithValue` left in the daemon). One name per query: methods `IsRepo`, `Branch`, `IsWorktree`, `ListFiles`, `ListUntracked`, `Root`, `Run`; the package funcs `IsRepo`/`Branch`/`IsWorktree`/`ListFiles` are `NewGit(Exec).<same name>`; `listFiles` and `topLevel` deleted (`TopLevel` is the nil-on-error form of `NewGit(Exec).Root`). Type doc rewritten to the runner as it now is.
- `internal/gitdiff/gitdiff.go`: `runFunc` alias deleted; `Reader` holds `git *gitutil.Git` built once in `NewReader`; the four `gitutil.NewGit(r.run)` wraps are now `r.git.<method>`; the string helper `r.git(...)` is renamed `r.output(ctx, dir, env, args...)` (the field took the name).
- `internal/gitdiff/tracked.go`: `trackedFiles` passes `GIT_INDEX_FILE=<scratch>` as the `env` argument of its two `git diff` calls — visible to a fake `RunFunc`.
- `internal/gitdiff/untracked.go`: `r.git.ListUntracked` / `r.git.ListFiles`; `gitutil` import dropped.
- `internal/claudecode/modelcheck.go`: doc reference `gitutil.gitRunner` → `gitutil.Git` (the rename made it dangle).

**Paths that carried env**: only `trackedFiles` (both its diff calls) ever set `WithEnv`; `rg 'WithEnv|envKey' internal` is now empty. Every other `RunFunc` call passes `nil`, explicitly.

**Blast radius** (`rg 'gitutil\.' --glob '*.go' . | rg -v '^./internal/(gitutil|gitdiff)/'`): `server/reporefresh.go` (TopLevel), `server/browse.go`, `server/launcher.go` (IsRepo, Branch, IsWorktree), `server/repos.go` (Branch), `server/reader.go` (ListFiles as a func value) — all package funcs whose signatures are unchanged; `reader/reader.go` comments only. No production consumer of `RunFunc`, `Exec`, `NewGit` outside `gitdiff`.

**Read-only guarantee re-run**: with the two test files adapted locally to the new seam (mechanically: fake signatures gain `[]string`, `&gitRunner{` → `&Git{`, `&Reader{run: f}` → `&Reader{git: gitutil.NewGit(f)}`, `g.topLevel` case asserted through `Root`), then reverted: `TestRead_NeverWritesTheRepository` PASS (all 3 subtests), `TestReader_RunSeam` PASS; `go test -race -count=1` ok for `internal/gitutil`, `internal/gitdiff`, `internal/reader`, `internal/claudecode`, `internal/server` (142 s). The scratch index still reaches git the same way (`cmd.Env` = environ + `GIT_OPTIONAL_LOCKS=0` + env), only through the signature instead of ctx.

**Decisions**:
- design: `Git` is the one runner type, matching the constructor-default seam (`claudecode` execFunc, `tmux` preflighter, `locate.SpotlightFinder.run`) — every input a call depends on (dir, env, argv) is in `RunFunc`'s signature. `rg 'context.WithValue' internal cmd` is now empty.
- design: `Reader.git` field holds the built `*gitutil.Git` (the `tmux.Client`-style held adapter) instead of a raw run func re-wrapped per call; tests inject via `gitutil.NewGit(fake)` since `Git.run` is unexported.
- design: `TopLevel` (package, `*string`) keeps its wire-facing nil shape for `server/reporefresh.go` and is a three-line wrapper over `Root`; no second method for it.
- `golangci-lint run --tests=false ./...` reports one pre-existing `unused: scanInterrupt` in `internal/claudecode/interpret_transcript.go` — not touched by this branch (`git diff --stat main --` that file is empty) and reproduced identically in the primary checkout on `main`; it is used only by a test, so it surfaces only with tests excluded.

**Handoff**: `go build ./...` exits 0. Sanctioned test breakage (the seam renamed per this fix): `internal/gitutil/gitutil_test.go` (`gitRunner` → `Git`; fakes take `env []string` after dir; `g.isWorktree`/`g.listFiles` → `IsWorktree`/`ListFiles`; `TestGitRunner_TopLevel` must go through `Root` — `topLevel` is gone; `TestExec_IsLockFreeAndHonoursWithEnv` passes env as Exec's argument, `WithEnv` is gone) and `internal/gitdiff/gitdiff_test.go` (`&Reader{run: f}` → `&Reader{git: gitutil.NewGit(f)}` with the gitutil import; fakes take `env []string`; a fake can now assert `GIT_INDEX_FILE=` in env on the two diff calls). A ready mechanical patch that compiles and passes is at `/private/tmp/claude-501/-Users-damian-Documents-code-Projects-muster/4130bdaf-2c4c-45bd-88c0-902386f4aa29/scratchpad/diff-viewer-cycle3-test-adapt.patch`. `make lint` stops at the typecheck in `gitutil_test.go:342` (`undefined: WithEnv`); `golangci-lint run --tests=false ./...`:
```
internal/claudecode/interpret_transcript.go:37:6: func scanInterrupt is unused (unused)
1 issues:
* unused: 1
```
(pre-existing on main, see above).

## Fix Attempt 3 (review cycle 3, render-tests needs-scenario)

**Failures addressed**: render-tests Handoff `needs-scenario: diff-terminals` — no fixture held a dirty checkout with a recorded review and two terminals in the same session.

**Changes made**: `internal/server/renderfix_scenarios_diff.go` (build tag `renderfix`) gains `diff-terminals` → `driveDiffTerminals`: `r.diffSession(ctx, "diff-app", true)` (the `diff` scenario's checkout + full review) then `r.driveTerminalsOn(ctx, s, 2, {2: "build"}, {2: true})` (the call `terminals-two` makes via `driveTerminals`). New fixture `web/render/fixtures/diff-terminals.json`: `snapshot.terminals` = `{"1": [{"busy": false, "n": 1, "name": "shell 1"}, {"busy": true, "n": 2, "name": "build"}]}`, `diff` holds 1 recording carrying `c-single`. `make gen-render-fixtures` wrote only that file (`git status`: no existing fixture modified); `make check-render-fixtures` → `render fixtures up to date (129 scenarios)` twice; `go build ./...` OK; `make lint` and `golangci-lint run --build-tags renderfix ./internal/server/` → `0 issues.`

**Decisions**:
- design: composed two existing helpers (`diffSession`, `driveTerminalsOn`) — found with `rg -n terminals-two internal/server` → `renderfix_scenarios_misc.go:53` (`driveTerminals` wraps `driveTerminalsOn` on a fresh `idleSession`); nothing copied.
