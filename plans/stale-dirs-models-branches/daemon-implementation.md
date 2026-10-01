# Daemon Implementation: Stale Dirs, Models and Branches

**Plan**: stale-dirs-models-branches
**Mode**: initial
**Pack**: kb: pack 48662 words (budget 20000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/claudecode/interpret.go` | modified | `StateInput.Cwd`; `Interpret` wraps the old switch (now `interpretKind`) and sets `Cwd` via `mainAgentCwd` (REQ-3, REQ-4) |
| `internal/claudecode/status.go` | modified | `StatusUpdate.Cwd` from `workspace.current_dir`, else top-level `cwd` (REQ-3) |
| `internal/gitutil/gitutil.go` | modified | `TopLevel(ctx, dir) *string` (`git rev-parse --show-toplevel`) |
| `internal/session/session.go` | modified | `ClaudeDir`, in-memory `ClaudeLocation *Location`; `Model` and `Branch` comments |
| `internal/session/location.go` | created | `Location`/`LocationRepo`, the pure `Elsewhere` rule (INV-1), `adoptClaudeDir`, `clearClaudeLocation` |
| `internal/session/repo.go` | created | `RepoTargets`, `RepoState`, `SetRepoState` (persist + one upsert only on a real change) |
| `internal/session/machine.go` | modified | `applyBind` model rule: same id unchanged, different id or no model gives `{id, displayName: id}` (REQ-9) |
| `internal/session/apply.go` | modified | `Apply`/`ApplyStatus` adopt a changed `Cwd` into `ClaudeDir`, persist it, nudge once after the persist; a status-only dir change persists without broadcasting |
| `internal/session/status.go` | modified | `applyStatusUpdate` adopts `Cwd` |
| `internal/session/actions.go` | modified | `RecordLaunch`/`RecordResume` clear `ClaudeDir` and `ClaudeLocation` (REQ-7) |
| `internal/session/liveness.go` | modified | `markEnded` clears `ClaudeLocation` so the wire is null for a dead session (REQ-5) |
| `internal/session/manager.go` | modified | `Config.OnClaudeDirChange`, `nudgeRepoPoll` |
| `internal/session/writeorder.go` | modified | `Branch`, `IsWorktree`, `ClaudeDir`, `ClaudeLocation` move from the immutable list into `restoreChangedFields` / `restoredSessionFields` |
| `internal/session/row.go`, `internal/store/session.go` | modified | `claude_dir` round trip (`SessionRow.ClaudeDir`, UPDATE, SELECT, scan); `branch`/`is_worktree` were already in the UPDATE |
| `internal/store/migrations/0012_claude_dir.sql` | created | `ALTER TABLE session ADD COLUMN claude_dir TEXT` |
| `internal/server/reporefresh.go` | created | `repoRefreshFeature`: poll on start, each `-repo-poll` tick and on nudge (coalesced); git runs outside the manager lock (REQ-1, REQ-2, REQ-6, D15, D17) |
| `internal/server/bgloop.go` | modified | `runTicked` treats `interval <= 0` as no timer, so `-repo-poll 0` runs only the first tick and nudges |
| `internal/server/sessionwire.go` | modified | `claudeLocation` always present, `null` when nil (D10) |
| `internal/server/server.go` | modified | `Config.RepoRefresh`, one `register` line, `OnClaudeDirChange` wiring, `StopLivenessPoll` also stops the repo poll |
| `cmd/musterd/main.go` | modified | `-repo-poll` flag (default 5s), negative is a flag error, `buildServerConfig` passes it |
| `internal/session/CLAUDE.md` | modified | one invariant bullet: `ClaudeDir`/`ClaudeLocation` are display-only |

REQ coverage (daemon side): REQ-1/2 reporefresh.go `tick` + `SetRepoState`; REQ-3/4 interpret.go, status.go, `adoptClaudeDir`; REQ-5 `Elsewhere` + `deriveLocation` + `markEnded`; REQ-6 `OnClaudeDirChange`; REQ-7 `Record*`; REQ-8 deliberately no change (nothing but `deriveLocation` reads `ClaudeDir`, `rg -l ClaudeDir internal cmd --glob '!*_test.go'` lists only `internal/session`, `internal/store/session.go` and `internal/server/reporefresh.go`/`server.go`, the last being the nudge wiring); REQ-9 machine.go. REQ-10 to REQ-17 are web.

## Decisions

- deviation: `internal/claudecode/ingest.go` is unchanged (plan listed it for "the raw hook struct reads the common `cwd`"). `Interpret` already receives the verbatim payload, so the key is read in `interpret.go` alone; an `Event.Cwd` would be a second reader of the same key with no consumer. → kb:adr/ingest-claude-cwd-read-in-interpret-only
- deviation: a repo-poll tick skips a session whose launch directory is gone wholesale, so its `claudeLocation` is also kept as last known, not just `repo` (plan REQ-2 names `repo` only). Deriving a location with no launch top level would mark every Claude directory inside a checkout as elsewhere. → kb:adr/lifecycle-branch-refreshed-by-repo-poll (amended)
- `-repo-poll 0` still runs one tick at start (edge case 15, D7: a restarted daemon must derive `claudeLocation` from a persisted `claude_dir`) and then only on nudges. The plan says "only on a nudge"; the start tick is the one exception and changes nothing on an unchanged row.
- `Apply` always persists and broadcasts (its tail is unchanged), so D5's "an unchanged `Cwd` persists nothing" holds only for the nudge and for `ApplyStatus`: an unchanged `Cwd` fires no nudge in either, and `ApplyStatus` skips the persist entirely.
- A reading taken outside the lock is discarded when stale: `SetRepoState` keeps the existing `ClaudeLocation` if the session died or its `ClaudeDir` changed since the reading was taken (a resume in between would otherwise resurrect a cleared location). The change that outdated it already nudged the poll.
- Stop: `StopLivenessPoll` also stops the repo poll (plan: "beside the liveness poll"). The name is now narrower than what it does; the doc comment says so. Renaming it would touch `cmd/musterd/onexit_test.go` and the server tests, which are not mine.
- `Interpret` skips `cwd` for any event carrying the subagent marker, not only the five events `FromSubagent` is derived for, plus `SubagentStart`/`SubagentStop`. Wider than `FromSubagent` on purpose: INV-4 says "from any state".
- `claudeLocation.repo` is non-null iff the location is a checkout with a branch (detached HEAD gives null), name = basename of the resolved top level; `isWorktree` from `gitutil.IsWorktree` on the location directory.

design: `repoRefreshFeature` is one type (lifecycle feature plus its own `bgLoop`), not the feature/poller pair `themeFeature`/`themePoller` use. Those split because the poller is optional (nil when `Poll <= 0`) and the feature owns a snapshot contribution; here neither is true (the poll always exists, mounts nothing, contributes nothing). Grep: `rg "TopLevel|show-toplevel|EvalSymlinks" internal --glob '!*_test.go'` found no existing top-level or path-resolving helper; `rg "refresh chan struct"` found only `usagePoller.refresh`, whose coalescing send I copied as `nudge` (four lines; extracting a shared type would have touched `usagepoll.go` and its tests). Matched siblings: `usagepoll.go` (nudge channel through `runTicked`), `shellactivity.go` (`mount` no-op). Shared state: `refresh` is a buffered channel written by the ingest worker (via `OnClaudeDirChange`) and read by the loop goroutine; no other shared state, the tick reads sessions only through `RepoTargets` copies.

design: `Manager.OnClaudeDirChange func()` is a plain nil-tolerant callback like `OnUpsert`/`OnRemoved`, wired in `New` as a closure over `s.repoRefresh`, assigned a few lines later and read only after `Start`. Chosen over handing the channel in because the manager must not know the poller's type. The callback must not block (documented on the field).

design: `session.Elsewhere` is a pure function taking pre-resolved paths and top levels (plan's shape), so INV-1 is a table test with no git. Path resolution (`resolvePath`, `topLevel`) lives in `reporefresh.go` beside the git calls that need it. `ClaudeLocation` is derived state on `Session` (in memory, never persisted), written only by `SetRepoState` and cleared by `markEnded`/`clearClaudeLocation` under `Manager.mu`, always replaced with a fresh pointer so `restoreIfUnchanged` can compare it. `repoContext` in `launcher.go` is reused unchanged for the launch directory read, so launch and poll answer "branch and worktree flag" through one function.

design: `Interpret` now delegates to `interpretKind` and adds `Cwd` after, so no per-arm edit and no new payload read per case; one extra `json.Unmarshal` per event (a small struct).

Size warnings: `internal/session/manager.go` 580 lines (was 564, already over 500) and `cmd/musterd/main.go` 525 lines (was 515, already over); both gained a few lines of one field and one flag, no split asked. `make size-warn` otherwise lists none of my new files.

doc-delta: lifecycle spec `go:` frontmatter must add `internal/server/reporefresh.go`; `make check-kb` currently fails "owned by no feature" for it (and for `web/src/render/repolines.ts` and two e2e files, which are not mine).
doc-delta: the plan's Doc Delta says the poll reads "a dead card keeps its last-known branch"; true as shipped. `-repo-poll 0` still runs one tick at start, so the Protocol Contract's "`0` disables the timer, and then the repo poll runs only on a nudge" should read "runs at start and on a nudge only".
doc-delta: the `ingest.go` entry in the plan's Affected Files (daemon) is wrong as shipped; the cwd read is entirely in `interpret.go`/`status.go`.

## Handoff

**Build status**: `go build ./...` exits 0; `make lint` 0 issues (every test file still compiles, so `--tests=false` was not needed); `gofmt -l .` empty; `go vet ./...` clean; dead-refs 0 missing.

Measured with a throwaway server-package test (deleted afterwards): launch in a real repo, then `git checkout -b fix` + one tick gave `repo.branch: "fix"`; a subagent-marked hook with `cwd` = a `.claude/worktrees/probewt` worktree left `claudeLocation: null`; the same cwd from the main agent gave `claudeLocation: {directory: <resolved worktree>, repo: {name: "probewt", branch: "worktree-probewt", isWorktree: true}}` with one nudge pending; `cwd` = `sub` gave null; `cwd` = `/tmp` (non-git outside) gave `{directory: "/private/tmp", repo: null}`; a `SessionStart` naming `claude-sonnet-5-5` on launch alias `sonnet` gave `displayName: "claude-sonnet-5-5"`, a status post then `Sonnet 5.5`, a repeat same-id `SessionStart` kept `Sonnet 5.5`; a status post with `workspace.current_dir` = the worktree set the location; deleting the launch directory left repo and location as they were; `RecordResume` cleared the location.

Sanctioned breakage (tests of behaviour this plan replaces or counts; the test agent updates them):
- `internal/session/machine_test.go` `TestApplyInput_Bind/leaves_DisplayName_at_its_launch_value_when_Model_already_existed` (expects `sonnet`, now `claude-haiku-4-5-20251001`) and `TestApplyInput_ClearRebind/keeps_updating_the_model_id_on_a_clear-rebind` (expects `Old Model`, now `new-model`): REQ-9 / kb:adr/lifecycle-bind-model-display-name-is-id.
- `internal/store/migrate_test.go` (`TestMigrate_AppliesInitSchema`, `TestMigrate_SecondCallIsANoOp`: 11 migrations now 12) and `internal/store/store_test.go` `TestOpen_SecondOpenOnSamePathDoesNotReapplyMigrations`: migration 0012. `TestUpdateSession_RoundTripsEveryField` (store/session_test.go) passes but should gain `ClaudeDir`.
- `internal/server/server_test.go` `TestNew_RegistersLifecycleFeaturesInStartOrder` (expects five lifecycle features, now six): `repoRefresh` is registered last.
- `cmd/musterd/main_test.go`: `buildServerConfig` is pinned field by field; it now sets `RepoRefresh`. It still passes, but should pin `-repo-poll`.
- `TestHandleTerminal_TakeoverNeverLeavesTwoClientsAttachedAtOnce` failed once under the full parallel `-race` run ("failed to get reader: context deadline exceeded") and passes alone (`ok 5.203s`); a load flake in a file I did not touch.

Untouched, not mine: web-impl's uncommitted `web/` files and the E2E files.

## Fix Attempt 1 (review cycle 1)

**Failures addressed**: correctness Critical 2 (repo poll nulls `repo` when the directory vanishes mid-tick), correctness Major 1 (`-repo-poll` help), correctness Minor 1 (`runTicked` names `repoRefresher`), maintainability Minor 1 (`resolvePath` duplicate), Minor 2 (`deriveLocation` re-implements `repoContext`'s body), Minor 3 (size warnings without reasons).

**Changes made**:

| File | What |
|------|------|
| `internal/server/reporefresh.go` | `readRepoState` now returns `(state, ok)`; `ok` is false when the 5 s read context expired or was cancelled, or `isDir(t.Directory)` is false after the reads. `tick` skips `SetRepoState` on `!ok`, so the card keeps its last-known repo. `deriveLocation` uses `checkoutState`. |
| `internal/server/launcher.go` | new `checkoutState(ctx, dir) (branch, isWorktree)`; `repoContext` calls it after `IsRepo`. |
| `cmd/musterd/main.go` | `-repo-poll` help: "runs at start and when Claude's reported directory changes". |
| `internal/server/bgloop.go` | `runTicked` comment names `repoRefreshFeature`. |

**Critical 2, every path to the defect** (a poll reading that looks like "not a checkout" while the directory is still, or was just, a checkout):
1. Directory removed between tick's `isDir` and the git reads: closed by the post-read `isDir` re-check (a directory present after the reads was present during them, so a reading that passes is genuine).
2. `repoReadTimeout` expiring under load, git killed, `IsRepo` false: closed by `ctx.Err() == nil` on the per-read context.
3. The poll's own context cancelled at shutdown mid-read (same shape: killed git reads as non-git): closed by the same `ctx.Err()` check (the read context derives from the tick's).
4. A git failure on an existing directory for any other reason (corrupt repo, ownership refusal) stays "not a checkout" — indistinguishable through `gitutil.IsRepo`'s bool, and a persistent condition rather than a transient one, so the null is the honest reading. Not widened: separating git exit codes in `gitutil` would change four exported functions for a case no test or requirement names.
Blast radius: `readRepoState` has one caller (`rg readRepoState internal cmd` lists only `tick`); `checkoutState` replaces the Branch/IsWorktree pair in `repoContext` (callers `Launch`, `launchResume`, unchanged behaviour) and `deriveLocation`.

**Repro re-run** (the reviewer's soak, `card-location.spec.ts`, after `make web-build build`; `npm run e2e` is blocked by web-impl's uncommitted `web/e2e/zz-probe.spec.ts` failing e2e-lint, so the build ran via `make e2e-soak` and the sweep via `bin/gatelock run --exclusive -- npx playwright test` directly): N=10 whole spec `250 passed (2.8m)`; the REQ-2 test alone (`-g "launch directory deleted" --repeat-each=60`) `60 passed (1.2m)`. The reviewer saw it fail 2 of 10 before.

**Gates**: `gofmt -l .` empty; `go vet ./...`, `go build ./...` ok; `make lint` 0 issues; `go test -race -count=1 ./internal/server/... ./cmd/...` ok.

**Decisions**:
- design: `resolvePath` stays in `reporefresh.go` and is not unified with `claudecode.resolveTranscriptDir` (`internal/claudecode/launchtranscripts.go:54`, same resolve-else-clean body). The earlier "found no path-resolving helper" was wrong: `rg "EvalSymlinks" internal --glob '!*_test.go'` also lists `launchtranscripts.go:56`, `locate.go:129` (a different job: dedupe verified matches), and `claudecodetest/transcripts.go:31` (a deliberate independent mirror of the encoding for a test oracle). `resolveTranscriptDir` is unexported inside the Claude-format adapter, and `internal/claudecode` imports no other internal package (a leaf, per `kb:diagram/daemon-components`); the server reaching into it for generic path code, or the adapter importing a new package, would each be a wider move than this fix wave. A shared home would be a new leaf package like `boundedwait`/`keyedlock`, which also needs kb ownership and a diagram edit (docs are not mine). Candidate follow-up for the orchestrator: one `internal/<leaf>.ResolveDir` used by both.
- design: `checkoutState` sits beside `repoContext` in `launcher.go` because `repoContext` is its other caller; it is `Branch` + `IsWorktree` with no `IsRepo` (the Claude directory's top level is already known non-nil in `deriveLocation`, which saves one git call per tick per moved session).
- Size warnings kept on purpose: `parseFlags` (48 statements) is one declaration per flag plus the validation switch, so it grows by one statement per flag; every statement is independent and a split would only scatter the flag table. `server.New` (44) already carries its reason in the doc comment (the composition root resolves spawner/attach/httpClient/shellScroll and wires every feature in one place; `kb:adr/process-size-linters-warn-never-fail`); this diff added one `register` line and one callback. `claudecodetest.go` (630) is a flat catalogue of independent hook-payload builders, each a few lines, and `EnvelopedHookInDirectory` is one more beside `EnvelopedHookBody`; splitting by event would scatter the one place a test outside `internal/claudecode` finds payload shapes. `launcher.go` is 559 (was 553, already over) after the six-line `checkoutState`.

## Handoff (fix attempt 1)

**Build status**: `go build ./...` exits 0; no test file is broken by this wave.
Untouched, not mine: web-impl's `web/` files and `web/e2e/zz-probe.spec.ts` (an uncommitted scratch probe, it fails `make e2e-lint` and so blocks `npm run e2e`/`make e2e`).

## Fix Attempt 2 (review cycle 2)

**Failures addressed**: e2e-specs bug `SetRepoState` wrote `Branch`/`IsWorktree` to a session that died while its reading was in flight (`card-location.spec.ts` "a dead session keeps its last-known branch ...", 10/60 and 21/60 in a 60-way soak).

**Changes made**:

| File | What |
|------|------|
| `internal/session/repo.go` | `SetRepoState` drops the whole reading (branch, worktree flag, location) when `!sess.Alive` or `sess.repoEpoch != state.Epoch`; only a stale `ClaudeDir` still drops the location alone. `RepoTarget.Epoch` / `RepoState.Epoch` carry the epoch from snapshot to apply. Doc comment now says what is true. |
| `internal/session/session.go` | `repoEpoch uint64`: in-memory death counter, writer `markEnded` under `Manager.mu`. |
| `internal/session/liveness.go` | `markEnded` increments `repoEpoch` before taking `post`. |
| `internal/session/writeorder.go` | `repoEpoch` joins `restoreChangedFields` / `restoredSessionFields`, so a failed persist of the death rolls the epoch back with `Alive` (and `CheckSessionFieldCoverage` stays empty). |
| `internal/server/reporefresh.go` | `readRepoState` copies `t.Epoch` into the state. |

**Every path to the defect** (a reading taken while alive, applied after the session's death):
1. Died, still dead at apply: `!sess.Alive` and the epoch bump (markEnded) both drop it.
2. Died and resumed before apply (`Alive` true again, `ClaudeDir` cleared by `RecordResume`, or `ClaudeDir` empty on both sides so the old location check could not see it): `Alive` alone would have let the branch through; the epoch bumped at the death does not match, so the reading is dropped. The resumed session's next tick (timer; resume does not nudge) reads it afresh, which is the "resume re-reads it" half of edge case 27.
3. Died, persist failed and rolled back: `restoreIfUnchanged` restores `Alive` and `repoEpoch` together, so a session that never ended is not made to drop a good reading (and if it were, the next tick re-reads).
4. A death missed by liveness (pane gone, `markEnded` not yet run): the reading is of a still-alive session, nothing to protect; the checkout is read legitimately.
Only `markEnded` sets `Alive=false` (`rg "Alive = false" internal`), so the epoch has one writer.

**Blast radius**: `rg "SetRepoState|RepoTargets|RepoTarget\b|RepoState\{"` outside tests: `reporefresh.go` `tick` (snapshot, then `readRepoState`, then `SetRepoState`, the only caller) and the definitions. `readRepoState` has one production caller (`tick`). Wire and DB unchanged (`repoEpoch` is never persisted nor serialised).

**Repro re-run**: after `make web-build build`, `bin/gatelock run --exclusive -- make e2e-soak-run SPEC="card-location.spec.ts -g 'dead session'" N=60` gave `60 passed (1.5m)` (was 10/60 and 21/60 failing).

**Gates**: `gofmt -l .` empty; `go vet ./...`, `go build ./...` ok; `make lint` 0 issues; `go test -race -count=1 ./internal/server/... ./cmd/...` ok; `./internal/session/...` has one failure, the sanctioned one below. `make size-warn`: only an existing test-file funlen warning, none in files I touched.

**Decisions**:
- design: the stale-reading guard is a death counter on `Session` (`repoEpoch`) copied through `RepoTarget`/`RepoState`, not `TmuxPane` identity and not a manager-side map. `rg "epoch|generation|incarnation" internal/session --glob '!*_test.go'` found no sibling counter. Pane identity would make every hand-built `RepoState{}` in tests drop (pane "" vs "%1") and couples the guard to tmux's pane-id uniqueness; a map would need its own guard and cleanup on remove. The field follows `ClaudeLocation`'s shape: in-memory, written under `Manager.mu`, listed in the restore partition.
- design: both `!sess.Alive` and the epoch stay in the one condition. The epoch covers a resumed session; `Alive` keeps a dead session closed to any reading whatever its provenance (a hand-built state with a matching epoch).
- doc-delta: `docs/features/lifecycle` / kb:adr/lifecycle-branch-refreshed-by-repo-poll: "a dead session keeps its last-known repo" now also holds for a reading in flight at its death, including one applied after a resume; the reading is dropped whole and the next tick reads afresh.

## Handoff (fix attempt 2)

**Build status**: `go build ./...` exits 0; `golangci-lint run --tests=false ./...` 0 issues; `make lint` 0 issues.

Sanctioned breakage (test agent, next step):
- `internal/session/repo_test.go` `TestRepoTargets_ListsEverySessionWithItsDirectories` (line 277): the ended session's `RepoTarget` now carries `Epoch: 1` (one death), expected `Epoch: 0`. Update the expectation.
- New unit tests to add: `SetRepoState` drops a reading (branch included) whose `Epoch` predates a death, both while dead and after `RecordResume`; a matching epoch on an alive session still applies.
