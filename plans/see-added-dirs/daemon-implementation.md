# Daemon Implementation: See added directories

**Plan**: see-added-dirs
**Mode**: initial
**Pack**: kb: pack 25748 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/claudecode/status.go` | modified | REQ-1: `InterpretStatus` reports `workspace.added_dirs` as `StatusUpdate.AddedDirs *[]string` (nil = key absent/null, non-nil empty = reported none) |
| `internal/session/addeddirs.go` | created | REQ-1/2/5a: `ResolvePath`, `adoptAddedDirs`, `normalizeAddedDirs` (relative resolved against launch dir, symlink-resolved, launch dir and repeats dropped, held repo reading kept), `addedDirsEqual`, `clearAddedDirs` |
| `internal/session/session.go` | modified | `Session.AddedDirs []Location` with its writers and guard in the field doc |
| `internal/session/status.go` | modified | REQ-1: `applyStatusUpdate` adopts the list (alive sessions only, REQ-3/D7) |
| `internal/session/apply.go` | modified | `ApplyStatus` broadcasts and nudges the repo poll when the list changed (D15: no git on this path) |
| `internal/session/liveness.go` | modified | REQ-3: `markEnded` (the one death path: liveness, Stop, reconcile) empties the list |
| `internal/session/actions.go` | modified | REQ-3: `RecordLaunch` and `RecordResume` empty the list |
| `internal/session/repo.go` | modified | REQ-5/D10: `RepoTarget.AddedDirs`, `RepoState.AddedRepos`; `SetRepoState` applies a reading only to directories still listed, under the lock, after the alive/epoch checks |
| `internal/session/row.go` | modified | REQ-4: `AddedDirs` row mapping (paths only) |
| `internal/session/writeorder.go` | modified | `AddedDirs` joins the failed-write restore and the field-coverage list |
| `internal/session/manager.go` | modified | `OnClaudeDirChange` doc names the added-directory nudge |
| `internal/store/session.go` | modified | REQ-4: `SessionRow.AddedDirs []string`, JSON in the `added_dirs` column (NULL when empty), read/written with the row |
| `internal/store/migrations/0017_added_dirs.sql` | created | additive column |
| `internal/server/reporefresh.go` | modified | REQ-5: poll reads each added directory's checkout (`readAddedRepos`); `checkoutRepo` extracted from `deriveLocation`; `resolvePath` moved to `session.ResolvePath` |
| `internal/server/sessionwire.go` | modified | `addedDirs` wire key, always an array |

## Decisions

REQ coverage: REQ-1 status.go (claudecode, session); REQ-2 addeddirs.go; REQ-3 liveness/actions/status.go; REQ-4 store + row.go; REQ-5, REQ-5a reporefresh.go + repo.go (a directory is listed from the post that reports it with repo nil; the reading never gates it); REQ-6..REQ-9 are web's and not done here.

Measurements (throwaway probes, deleted after running; Manager-level and repo-poll-level):
- post `[launch+"/", other, symlink→other, "rel", ""]` gave two entries (other resolved to `/private/var/...`, `rel` joined to the launch dir), launch dir dropped under a trailing slash, symlink duplicate collapsed, empty entry skipped; the same post again nudged nothing; a post with no key kept the list; `[launch]` alone gave `[]`; the persisted row held only paths.
- after `markEnded` the list and the row's column were empty, and a status post routed afterwards left both empty (D7).
- poll over a git checkout, a plain directory and a launch checkout: before tick `repo=nil` for both added dirs (D15), after one tick `{infra main false}` and `nil`, one upsert, a second tick broadcast nothing, a checkout of `feat-x` showed on the next tick, and removing the directory kept `{infra feat-x}`.
- D11: `! rg -n '"added_dirs"' cmd/ internal/ --glob '!internal/claudecode/**' --glob '!**/*_test.go'` prints nothing (exit 0 for the negation).

design: `Session.AddedDirs []Location` reuses `Location` (directory plus checkout readout) rather than a second type with the same two fields. `rg -n 'type .*Location' internal/session` found `Location`/`LocationRepo` in location.go and nothing else shaped like it. Writers: `adoptAddedDirs` (ApplyStatus), `SetRepoState` (each entry's Repo), `clearAddedDirs` (markEnded, RecordLaunch, RecordResume); guard `Manager.mu`; the slice is always replaced, never mutated, so a `Clone` shared outside the lock is safe (matches `ClaudeLocation`).

design: `ResolvePath` moved from `server/reporefresh.go` (private `resolvePath`) to `session.ResolvePath` because the status path (session package) and the poll (server) must normalise identically. `rg -n 'EvalSymlinks' internal --glob '!*_test.go'` found only that one in the status/poll area (the others are reader, locate, selfupdate, claudecode transcripts, unrelated). `session` already owns `Elsewhere`, the symlink-resolved comparison rule.

design: normalisation does `EvalSymlinks` stats under `Manager.mu` inside `applyStatusUpdate`, not before the lock. Siblings: `persistWholeRowLocked` already does SQLite I/O under that lock, and doing it inside `applyStatusUpdate` keeps one place that applies a status update (the existing `title_test.go` calls it directly). No git runs there.

design: `RepoState.AddedRepos map[string]*LocationRepo` where key presence means "read" (nil value = not a checkout or detached) and absence means "keep last-known" (directory gone, or vanished mid-read; `readAddedRepos` re-checks `isDir` after the reads, per kb:lesson/off-lock-reading-revalidated-at-apply). `SetRepoState` builds the new list from the list as it stands at apply, so a reading of a directory that has since been dropped is ignored and a newly added one stays nil (D10, edge case 13). Matched the sibling shape of `RepoState.Location`/`ClaudeDir`.

design: `checkoutRepo(ctx, dir, top)` extracted from `deriveLocation` so the claude location and the added directories build `LocationRepo` one way; `deriveLocation` behaviour is unchanged.

design: `store.SessionRow.AddedDirs []string` with JSON encode/decode inside the store (`encodeAddedDirs`/`decodeAddedDirs`), so the store keeps its "neutral values, no session types" rule and the storage format has one owner. A corrupt column logs and reads as none, like `decodeRowTime`.

design: the OnClaudeDirChange callback and `nudgeRepoPoll` are reused for the added-directory nudge rather than a second callback (`rg -n 'OnClaudeDirChange|nudgeRepoPoll' internal` shows one wiring in server.go:198); only its doc changed. The name is now slightly narrow; renaming it touches `repo_test.go`, `reporefresh_test.go` and `server.go`, left to a later tidy.

design: the repo tick skips a session whose launch directory is gone (existing behaviour), so its added directories are not read either and keep their last reading.

design: size warnings on files I touched: `internal/store/session.go` (551 lines, was 514, already over) and `internal/session/manager.go` (628, only a doc edit). The column read/write belongs with the row, so no split.

deviation: none from the plan.

doc-delta: card-location spec's "Where Claude is" prose says a path is "symlink-resolved"; added directories also resolve a relative entry against the launch directory, and a nonexistent entry is only cleaned (an unresolvable path keeps its spelling), same as `claudeLocation`.
doc-delta: `docs/diagrams/store-schema` prose range "0001-0016" becomes "0001-0017" (already in the plan's Doc Delta; unchanged).

## Handoff

**Build status**: `go build ./...` exits 0; `go vet ./...` clean; `make lint` 0 issues; `gofmt -l` clean. `go test -race -count=1` passes for `internal/session`, `internal/server`, `internal/claudecode`, `cmd/musterd`; `internal/store` fails 3 tests that pin the migration count.

Sanctioned test breakage (the plan's Schema Changes add migration `0017_added_dirs.sql`):
- `internal/store/migrate_test.go:39,43` (`TestMigrate_AppliesInitSchema`) and `:60` (`TestMigrate_SecondCallIsANoOp`): expect 16, now 17.
- `internal/store/store_test.go:52` (`TestOpen_SecondOpenOnSamePathDoesNotReapplyMigrations`): expects 16, now 17.

Fixtures for the daemon-tests agent to extend (they still pass, they just do not cover the new field): whole-wire Session assertions in `internal/server/sessionwire_test.go` (new required `addedDirs` key, `[]` when none), `internal/store/session_test.go` `TestUpdateSession_RoundTripsEveryField` (`AddedDirs`), `internal/session/repo_test.go` (`RepoTarget{...}` literals at :276-277 now carry `AddedDirs`; nil there). New unit coverage needed for D1-D10, D15 as listed in the plan.

Untouched on purpose: `plans/see-added-dirs/orchestration-state.json`, anything under `web/`.

## Fix Attempt 1 (review cycle 1)

**Failures addressed**: correctness Major 1 (subdirectory reads `isWorktree: true`), browser Major 1 (many added directories discard the whole reading), maintainability Minors 2, 3, 5.

**Changes made**:
- `internal/gitutil/gitutil.go`: `isWorktree` asks git for `--git-dir --git-common-dir` in one call and compares both as absolute, symlink-resolved paths (`resolveFrom`, a relative one taken relative to the directory git ran in), not as git spells them.
- `internal/server/reporefresh.go`: `readRepoState` reads the launch directory (branch, worktree flag, `claudeLocation`) under `repoReadTimeout` and the added directories under a second, separate `repoReadTimeout`; `readAddedRepos` reads `addedReadWorkers` (8) directories at once and leaves out any directory whose read did not finish, so it keeps its last-known reading.
- `internal/session/location.go` / `addeddirs.go`: `ResolvePath` moved beside `Elsewhere`; `addeddirs.go` holds added-directory logic only.
- `internal/session/manager.go`, `internal/server/server.go`: `OnClaudeDirChange` / `onClaudeDirChange` renamed `OnRepoPollNeeded` / `onRepoPollNeeded`; `nudgeRepoPoll`'s doc names both triggers.

**Paths reaching the isWorktree defect** (blast radius, `rg -n 'IsWorktree\(' internal cmd` non-test: one caller, `checkoutState`): `checkoutState` serves `repoContext` (Launch and launchResume's launch directory, and the repo poll's launch directory), `deriveLocation` via `checkoutRepo` (`claudeLocation`) and `readAddedRepos` via `checkoutRepo` (added directories). All three go through the one `gitutil.isWorktree`, so one fix closes all of them. Probe over a scratch repo `r`, `r/pkg`, linked worktree `wt`, `wt/pkg` and a plain parent: `r -> false`, `r/pkg -> false`, `wt -> true`, `wt/pkg -> true`, parent `-> false` (before: `r/pkg` read true per review). Existing `internal/gitutil` tests pass under `-race`.

**Paths reaching the discarded-reading defect**: (a) the added read outlasting the launch read's 5 s deadline discarded the whole state, closed by the separate deadline plus `launchCtx.Err()` deciding `ok` alone; (b) a serial read of N directories taking N x 220 ms, closed by 8 at once; (c) a wedged added directory, bounded by the added deadline, and its siblings still apply. Repro re-run (a throwaway probe test over `readRepoState`, 32 scratch git checkouts, launch checkout moved to `moved-launch`, deleted afterwards): `ok=true branch=moved-launch added=32 took=1.569s` (before: reading discarded past 5 s). With the same 32 repeated 40 times (1280 entries, forcing the added deadline): `ok=true branch=moved-launch added=32 took=5.14s`, so the launch reading survives an expired added deadline.

**Decisions**:
- design: the added read stays inside `readRepoState` and one `SetRepoState` call (one apply, so no second partial-apply method and no stale launch fields re-sent); it matches `usagepoll`-style bounded work by `repoReadTimeout`. `rg -n 'errgroup|x/sync' go.mod internal` found no errgroup, so `readAddedRepos` uses a buffered-channel slot pool and `sync.WaitGroup` like `launchermodels.go`. Each worker writes only its own `readings[i]`; no shared state.
- limit: a list long enough that one session's added read needs more than one `repoReadTimeout` (roughly more than 180 directories at 8 at once, 220 ms each) reads the front of the list each tick and the tail stays at its last-known reading (null if never read). No rotation was added; the plan names no list that long.
- Session latency: a session's tick still includes its added read, up to 1.6 s for 32 directories (5 s worst case for a wedged one), so a long list still delays the sessions after it in that tick. The launch directory's own reading is no longer lost.
- design: `ResolvePath` now sits in `location.go` with `Elsewhere`, its stated owner; same body, no behaviour change.
- design: `OnRepoPollNeeded` names what the callback means (the repo poll is needed), matching `nudgeRepoPoll`; the old name pinned one of its two triggers.
- size: `toWireSession` (61 > 60), `UpdateSession` (69) and `scanSession` (68) are each one flat field-for-field mapping (a struct literal plus one nil-guard per optional field; one UPDATE with every column; one Scan with every column). Each grows by one line per column and has no nested branching, so a split would only move lines between functions; kept on purpose, like the earlier columns they already carried.
- deviation: none.
- doc-delta: card-location spec: the repo poll reads the added directories under their own deadline, so a long list never stops the launch directory's branch, worktree flag and claudeLocation refreshing; a worktree flag is a resolved-path comparison, so a subdirectory of an ordinary checkout is not a worktree (feature `launch` territory: `internal/gitutil`, Note 5 of the review, `launch` needs adding under **Touches**).

**Handoff** (fix wave):
- `go build ./...` exits 0; `gofmt -l .` clean; `golangci-lint run --tests=false ./...` prints `0 issues.`; `make lint` stops at the sanctioned test break below.
- Sanctioned test breaks (Minor 3 rename): `internal/session/repo_test.go:36` and `internal/server/reporefresh_test.go:77` set `c.OnClaudeDirChange`, now `c.OnRepoPollNeeded` (also the comment at `repo_test.go:17`). With those two lines renamed locally (reverted afterwards) `go test -race -count=1 ./internal/session/ ./internal/server/` passes in full; `./internal/gitutil/ ./internal/store/ ./internal/claudecode/` pass as they stand.
- Tests wanted (daemon-tests, wave 2): `TestReadAddedRepos_SubdirectoryNamesItsCheckoutsTopLevel` asserts `IsWorktree` false for an ordinary checkout's subdirectory and true for a linked worktree's; a `gitutil` test for `IsWorktree` from a subdirectory (ordinary false, linked true); a regression for many added directories (the launch reading's `ok` stays true and its branch applies when the added read hits its deadline; unread directories absent from `AddedRepos`).

## Fix Attempt 2 (review cycle 2)

**Failures addressed**: maintainability Minor 1 (`gitutil.resolveFrom` repeats `session.ResolvePath`'s resolve-else-clean rule with no `design:` line).

**Changes made**: none to code. Option (a): the divergence is kept on purpose and now written down. No file under `internal/` changed, so no symbol a test uses moved and there is no sanctioned break.

**Decisions**:
- design: `gitutil.resolveFrom(dir, path)` keeps its own copy of the resolve-else-clean rule that `session.ResolvePath` owns. Grep for an existing one: `rg -n 'resolveFrom|ResolvePath\(|func resolveTranscriptDir|EvalSymlinks' internal --glob '!*_test.go'` finds `session.ResolvePath` (`location.go:41`), `claudecode.resolveTranscriptDir` (`launchtranscripts.go:54`, a third copy, in another leaf adapter) and gitutil's own. Why gitutil cannot call `session.ResolvePath`: `go list -deps ./internal/gitutil` shows `gitutil` imports nothing from Muster, and `session` imports `store`, `tmux` and `claudecode`, so an import the other way makes a leaf adapter depend on the domain (`kb:diagram/daemon-components`) and would pull the store into every package that runs git. Why the caller cannot resolve instead (the `server.topLevel` shape): `IsWorktree` returns a bool and the comparison of `--git-dir` with `--git-common-dir` has to happen on resolved paths inside the one function that holds both strings; handing back two raw paths would put git's relative-to-dir spelling into the caller's hands. `resolveFrom` also is not `ResolvePath` alone: it first joins a relative path onto the directory git ran in, an input `ResolvePath` never receives. Why not option (b), a new shared leaf package: the rule is four stdlib lines, a third adapter (`claudecode`) already holds its own copy for the same reason, and a package for it would be a new seam across three packages for no behaviour; if a fourth caller appears, extracting a leaf `pathutil` that `session.ResolvePath`, `claudecode` and `gitutil` all call is the move.
- deviation: none.
- doc-delta: none.

**Handoff**: `go build ./...` exits 0, `gofmt -l .` clean, `go test -race -count=1 ./internal/gitutil/...` passes (no code changed). Test files needing changes: None.
