# Daemon Implementation: General Cleanup

**Plan**: general-cleanup
**Mode**: initial
**Pack**: `<!-- kb:pack plan=general-cleanup role=daemon-impl features=ingest,lifecycle,surfaces,actions,connection,theme,reader,triage,launch -->`

## Scope

REQ-1, REQ-3 (`ingestQueue.Drain` API only), REQ-10, REQ-11, REQ-12 (including the
`claudecodetest` fixture change), REQ-13.

## Changes

| File | Action | What and Why |
|------|--------|---------------|
| `internal/triage/checks.go` | modified | REQ-1: `reVersion` widened to `^(v?[0-9]+(\.[0-9]+)*(-[A-Za-z0-9.]+)?(-[0-9]+-g[0-9a-f]+)?(-dirty)?\|[0-9a-f]{7,40}(-dirty)?)$` — admits every `git describe --tags --always --dirty` shape (tagged, `-N-gHASH`, `-dirty`, and the bare `--always` hex fallback); the existing `len <= 32` guard still rejects the >32-char case. |
| `internal/server/ingest.go` | modified | REQ-3: `ingestJob` gained an optional `drainAck chan<- struct{}`; the worker closes it in place of `process` when set; `ingestQueue.Drain(ctx) error` sends a marker job behind every already-enqueued job on the same channel and waits for the worker to reach it, returning `ctx.Err()` if that doesn't happen in time (covers both "nothing queued" — returns at once — and "worker not running" — blocks to the deadline — with no special-casing). REQ-12: `resolveSessionID` now reads `Manager.PaneOf` and applies the corroboration predicate (`exists && (stored == "" \|\| (envelope pane present && == stored))`) before routing; a mismatch/absent pane is logged at Info with `muster_session`/`stored_pane`/`envelope_pane` (never the payload) and persists unrouted. |
| `internal/session/manager.go` | modified | REQ-12: new `PaneOf(id) (pane string, ok bool)` read under the existing lock. REQ-13: new `shellNamesOnSocket`/`KillAllShells`/`ShellCount` next to `EndAll`, reusing the same `tmux.IsShellSessionName` predicate reconcile's `reportAndSweepUnknown` already uses (not the same function, since that one is entangled with the full reconcile classification, but the same match rule) — no new duplicated logic beyond the shared `shellNamesOnSocket` helper. |
| `internal/claudecode/claudecodetest/claudecodetest.go` | modified | REQ-12: removed the `tmuxPane` "%12" default from `EnvelopedHookBody`, `SessionStartOpts`/`EnvelopedSessionStart`, `EnvelopedSessionStartTranscript`, `EnvelopedStatusLinePreFirstResponse`, `StatusLineFullOpts`/`EnvelopedStatusLineFull` — an empty `TmuxPane`/`tmuxPane` now omits the envelope key entirely (the headless shape) instead of filling one in. Doc comments updated to stop claiming a pane default. |
| `internal/server/sessions.go` | modified | REQ-10: added fixed-phrase constants (`msgEndFailed`, `msgRemoveFailed`, `msgLaunchFailed`, `msgShellSpawnFailed`, `msgInternalError`); `launchFailed()` is now parameterless and always returns `msgLaunchFailed`; every one of its 11 call sites (Launch and Resume paths) now logs the raw error/detail at the adjacent site before returning the fixed phrase — several sites had no log line before and gained one. `handleEndSession`/`handleRemoveSession`'s `end_failed` bodies and `handleSetTitle`'s `internal_error` body now use the fixed constants; their existing `log.Error().Err(...)` lines are unchanged. |
| `internal/server/shells.go` | modified | REQ-10: `shell_spawn_failed` and `internal_error` (shell-pane-check) bodies now use `msgShellSpawnFailed`/`msgInternalError`; existing log lines unchanged. |
| `internal/tmux/tmux.go` | modified | REQ-11: `run`'s failure path now checks `ctx.Err() != nil` first and returns `fmt.Errorf("tmux %s: %w (%v)", args[0], ctx.Err(), err)` — wrapping `ctx.Err()`, deliberately *not* wrapping the original `*exec.ExitError` (kept only as `%v` diagnostic text) so every caller's `errors.As(err, &exitErr)` correctly misses on an expired context instead of reading "signal: killed" as "tmux said gone". `PaneExists`/`KillSession`/`ListSessions` doc comments updated to name the new behaviour. `//nolint:errorlint` added on the new line with the linter's name and the reason (the non-wrapping `%v` is intentional, not an oversight). |
| `internal/server/server.go` | modified | REQ-13: `KillAllShells`/`ShellCount` composition-root pass-throughs (one line each) beside the existing `EndAllSessions`. |
| `cmd/musterd/main.go` | modified | REQ-13: `shutdownGracefully` now calls `srv.ShellCount` before `resolveOnExit` (error logged at Warn, treated as 0, never blocks); the on-exit path now runs when `live > 0 \|\| shells > 0`; the `kill` branch runs `EndAllSessions` then `KillAllShells` (order: sessions first, they may hold the socket busy) under its own `shutdownTimeout` context, and the `ended live sessions on shutdown` log line gains a `shells` field (message text unchanged); the `leave` branch's `leaving live sessions running` line gains the same field. `resolveOnExit`/`askKillPrompt` both gained a `shells int` parameter; the prompt format is now `"%d live sessions and %d shells on tmux socket %s — kill them? [y/N] "` (deliberately plural-fixed, "1 shells", per Damian's 2026-09-16 ruling — D16). |

## Decisions

No deviations from the plan's Protocol Contract or Error vocabulary/Corroboration
predicate/Shells-at-shutdown/Context-deadline Implementation Notes — every site follows
the pseudocode given there. `launchFailed()` was made parameterless (plan didn't specify
the internal signature, only that every call site's *message* becomes the fixed phrase)
since a message parameter that is always ignored is dead weight; every call site still
logs its own detail via `l.log` immediately before returning it.

No `doc-delta:` entries beyond what the plan's own Doc Delta section already states — no
production behaviour landed here needs a wording the plan didn't already anticipate.

## Handoff

**Build status**: `go build ./...` exits 0.

**Sanctioned wave-1 test breakage** (do not attribute to a defect in this code — confirmed
by re-running the untouched files' own git status, and by the plan's own text: "REQ-12's
fixture change... will break existing Go test files that relied on the %12 default — that
is a sanctioned wave-1 test break for daemon-tests to repair"):

- `cmd/musterd/main_test.go` — **fails to compile** (`go vet`/`golangci-lint run ./...`
  both stop here): `resolveOnExit`/`askKillPrompt` gained a `shells int` parameter
  (REQ-13). Call sites: lines 28, 29, 41, 56, 132, 149. Line 135's assertion
  (`assert.Contains(t, stderr.String(), "3 live sessions on tmux socket muster")`) also
  needs updating for the new prompt text (`"3 live sessions and 0 shells on tmux socket
  muster"` for that test's inputs, since it never sets up a shell). This is REQ-13's own
  D13–D16 acceptance criteria — `cmd/musterd/onexit_test.go` is named in the plan as
  daemon-tests' file for those; `main_test.go`'s existing `TestResolveOnExit_*`/
  `TestAskKillPrompt*` tests are the ones this signature change breaks and need the same
  treatment (add a `shells` argument at each call site, update the one text assertion).
- `internal/server/gauges_test.go` — 4 tests fail at runtime (compiles fine): every
  `TestIngestStatusLine_*` test posts an enveloped status line via `claudecodetest`
  without stating `TmuxPane`, so REQ-12's corroboration now persists it unrouted (headless
  shape vs. a session with a recorded, non-empty pane). Needs the seeded pane passed at
  each enveloped call site (plan: "%1 where routing is expected").
- `internal/server/ingest_routing_test.go` —
  `TestIngestRouting_EnvelopedSessionStartBindsThenRawHookRoutesByClaudeSessionID` fails
  at runtime for the same reason.
- `internal/server/reader_test.go` —
  `TestIngestRouting_SubagentMarkedWriteBroadcastsDocChanged` and
  `TestIngestRouting_StragglerFromBeforeAClearNeverMovesTranscriptOrPlan` fail at runtime
  for the same reason; the latter is also REQ-3's own target (`Drain` + `t.Context()`-style
  deadline replacing every `require.Eventually(..., 2*time.Second, ...)` in that test) —
  daemon-tests rewrites it for REQ-3 and REQ-12 together.
- `internal/server/sessions_test.go` —
  `TestLauncher_CorruptSettingsFileRefusesAndRollsBackTheSessionRow` and
  `TestLauncher_ExhaustsThreeAttemptsOnRepeatedErrSessionExists` fail at runtime: both
  assert the *message* body contains raw detail ("settings.local.json", "muster-") that
  REQ-10 deliberately removed from the wire — the detail now lives only in the adjacent
  `log.Error().Err(...)` line. This is D7's own acceptance shape ("the log line carries
  the raw error"); daemon-tests reasserts against the log output (or a captured
  `zerolog` sink) instead of the response body for these two.

No other files needed changes I wasn't allowed to make.

## Verification run

```
$ go build ./...                                    # exit 0
$ gofmt -l .                                         # no output
$ go vet $(go list ./... | grep -v cmd/musterd)      # clean
$ go vet ./...                                       # fails only at cmd/musterd/main_test.go (sanctioned, see Handoff)
$ golangci-lint run --tests=false ./...              # 2 pre-existing `unused` findings in
                                                      # internal/server/issue.go (buildIssueSnapshot)
                                                      # and internal/server/prefs.go (loadPrefs) —
                                                      # both called only from their own *_test.go
                                                      # files (confirmed: git status shows neither
                                                      # file touched by this work), an artifact of
                                                      # --tests=false itself, not a defect introduced
                                                      # here. Zero findings in every file this plan
                                                      # touched.
$ golangci-lint run ./...                            # stops at cmd/musterd's typecheck failure
                                                      # (main_test.go, sanctioned) and reports
                                                      # nothing else — confirms why --tests=false
                                                      # was run separately (kb:lesson/sanctioned-test-break-blinds-lint)
$ rg -n 'writeJSONError\([^\n]*\.Error\(\)\)|launchFailed\((fmt\.Sprintf|[A-Za-z]+\.Error\(\))|launchError\{[^\n]*\.Error\(\)' internal/server --glob '!*_test.go'
                                                      # no matches (D6)
$ go test ./internal/tmux/... ./internal/session/... ./internal/triage/... ./internal/claudecode/...
                                                      # all green
$ go test ./internal/server/...                      # green except the sanctioned breaks listed
                                                      # above (gauges_test.go x4, ingest_routing_test.go
                                                      # x1, reader_test.go x2, sessions_test.go x2);
                                                      # TestShell* all pass unchanged
```

## Fix Attempt 1 (pre-review fix)

**Failures addressed**: the two daemon-tests implementation-bug findings (not test failures —
daemon-tests left the regression test red and documented the missing seam rather than working
around it).

**Bug 1 — `UpsertRepo` check-then-insert race (`internal/store/repo.go`).**
`UpsertRepo` did a `SELECT` (repo not found) then a separate `INSERT`; the store is
`SetMaxOpenConns(1)` (this package's own CLAUDE.md), but that serializes each *round trip*
through the connection pool, not two round trips together — goroutine B's `SELECT` could
still slot in between goroutine A's `SELECT` and `INSERT`, so both saw "not found" and both
attempted the `INSERT`, and the loser hit `UNIQUE constraint failed: repo.path`. Replaced the
two-step check-then-insert with a single `INSERT ... ON CONFLICT(path) DO UPDATE ...
RETURNING` statement — one round trip is atomic with respect to every other caller under the
single-connection pool, so there is no window left for two goroutines to interleave.
`created` (the `firstLaunchHere` source) is read off the returned `launch_count == 1` rather
than a follow-up existence check, since a follow-up check would reopen exactly the race being
closed: every pre-existing row already has `launch_count >= 1` from its own first insert, so
the `UPDATE` branch's `launch_count = repo.launch_count + 1` can never produce `1` — a
returned `1` is only reachable via the `INSERT` branch. `repoByPath` (now dead) and its
`database/sql`/`errors` imports were removed along with it. `RETURNING` is supported by
`modernc.org/sqlite v1.58.0` (already used one-statement `ON CONFLICT ... DO UPDATE` for the
`kv` table in `store.go:97`, just without `RETURNING`).

Every code path that reached the race: `UpsertRepo` has exactly one caller
(`sessionLauncher.Launch` in `internal/server/sessions.go:204`), and the race lived entirely
inside `UpsertRepo` itself (not in the caller), so fixing the one function closes every path —
confirmed by `rg -n "repoByPath|UpsertRepo\b" --type go` (transcript below) showing no other
production call site.

Re-ran the reporter's exact repro:
```
$ go test ./internal/server -run TestLauncher_ConcurrentLaunchesForTheSameDirectoryProduceTwoDistinctRows -race -count=1   # x10 in a loop
ok  	github.com/Zalaras/muster/internal/server	2.5s   (all 10 runs: ok)
$ go test -count=1 ./internal/server    # x3 in a loop (previously ~2/3 failed)
ok  	github.com/Zalaras/muster/internal/server	30.1s   (all 3 runs: ok)
```
Pre-existing `TestUpsertRepo_CreatesOnFirstLaunch`/`TestUpsertRepo_SecondLaunchIncrementsCountAndUpdatesDefaults`
(`internal/store/repo_test.go`, not touched) still pass unchanged — `created`/`launch_count`
semantics preserved.

**Bug 2 — no injectable run func on `internal/tmux.Client` (`internal/tmux/tmux.go`).**
Added an unexported `exec func(ctx, name string, args ...string) ([]byte, error)` field on
`Client`, the same seam shape `preflighter`'s `run` field, `locate.SpotlightFinder`'s `run`
field and `claudecode`'s `execFunc` already use in this repo (docs/conventions.md §Testing).
`New` sets it to the new `execCombinedOutput` (the exact `exec.CommandContext` +
`cmd.WaitDelay` + `cmd.CombinedOutput()` body `run` built inline before, moved out unchanged).
`run` now calls `c.exec(ctx, "tmux", full...)` instead of constructing `exec.Cmd` itself; its
ctx-wrapping/error-wrapping logic (REQ-11's `ctx.Err()` branch) is untouched. `runCapture` is
unchanged — REQ-5(d)'s branch (`KillSession`'s post-kill `PaneExists` recheck) is reached only
through `run` (both `KillSession` and `PaneExists` call `c.run`), so `runCapture` needed no
seam for this fix; widening it would be scope beyond the reported bug.

Every call site that goes through `c.run` (`NewNamedSession`, `serverRunning`,
`applyServerOptions`, `ResizeWindow`, `DisplayVar`, `ResolveSessionTarget`, `PaneExists`,
`KillWindow`, `KillSession`, `ListSessions`) is now driven through the single `exec` field —
confirmed there is exactly one call site constructing `exec.Cmd` for `run` (the old inline
body, now `execCombinedOutput`) via `rg -n "exec.CommandContext" internal/tmux/tmux.go`
(transcript below): two matches, one in `execCombinedOutput` (the new production seam) and one
in `runCapture` (deliberately untouched, see above).

No `_test.go` file needed a change: `internal/tmux/tmux_test.go` is `package tmux` (not
`tmux_test`), so a same-package test can set `c.exec` directly on a `*Client` returned by
`New`, or construct `&Client{socket: ..., exec: fakeFunc}` — the same pattern
`internal/tmux/preflight.go`'s own tests already use to construct a `*preflighter` literal.
`New(socket string) *Client`'s signature is unchanged, so every existing call site (`New(...)`
across tests and production) keeps compiling with no seam access at all.

**Verification**:
```
$ go build ./...                                     # exit 0
$ gofmt -l .                                         # no output
$ go vet ./...                                       # clean
$ make lint                                          # golangci-lint run: 0 issues
$ golangci-lint run --tests=false ./...              # same 2 pre-existing `unused` findings as
                                                      # the initial pass (internal/server/issue.go,
                                                      # internal/server/prefs.go) — neither file
                                                      # touched by this fix wave; zero findings in
                                                      # internal/store or internal/tmux
$ go test -count=1 ./...                             # all packages ok (full tree, not just the
                                                      # two touched packages)
$ rg -n "repoByPath|UpsertRepo\b" --type go           # UpsertRepo: 1 def + 1 call site
                                                      # (internal/server/sessions.go:204) + test
                                                      # call sites only; repoByPath: 0 matches
                                                      # (removed, confirmed dead)
$ rg -n "exec.CommandContext" internal/tmux/tmux.go   # 3 matches: a comment line referencing
                                                      # it (run's ctx.Err() doc comment,
                                                      # unchanged text) plus the 2 real call
                                                      # sites — execCombinedOutput (new) and
                                                      # runCapture (untouched)
```

**Decisions**: no new `deviation:` or `doc-delta:` lines — both fixes are internal to their
functions' existing contracts (`UpsertRepo`'s signature and semantics are unchanged;
`tmux.New`'s signature is unchanged); no plan-visible behaviour or protocol-contract surface
moved.

**Files touched**: `internal/store/repo.go`, `internal/tmux/tmux.go`. No test files touched.

## Fix Attempt 2 (pre-review fix)

**Failure addressed**: `reconcile.spec.ts:23` E2 (INV-1, INV-3) — "a session whose pane
died right before a daemon restart can be swept instead of marked ended and kept."
`daemon-tests.md`'s "Validate Attempt 1" root-cause read: the still-shutting-down old
process's own 5s liveness poll (`pollLoop`) is never paused before `shutdownGracefully`
begins, so it can race its own shutdown and persist `alive:false` before the fresh
process's Reconcile ever sees the row, which then sweeps instead of keeping it.

**Bug 1 — periodic poll not paused before shutdown teardown begins (real, fixed).**
`internal/session/manager.go`'s `Manager.Stop` already existed (cancels `pollLoop`'s ctx,
waits for the goroutine); it was only ever called from `Server.Shutdown`, at the very end
of `cmd/musterd/main.go`'s `shutdownGracefully` — after the REQ-13 `ShellCount` round
trip, the on-exit prompt, and (on `kill`) `EndAllSessions`/`KillAllShells`, each up to
`shutdownTimeout` (10s). Added `Server.StopLivenessPoll(ctx)`
(`internal/server/server.go`), a narrower wrapper around `s.manager.Stop(ctx)` that
touches nothing else (not WS/terminal connections, not other features), and call it as
the literal first statement of `shutdownGracefully`
(`cmd/musterd/main.go`), before `LiveSessionCount`/`ShellCount`/anything else. `Stop` is
idempotent (`m.cancel()` on an already-canceled ctx, `wg.Wait()` on an already-empty
group), so `Server.Shutdown`'s own later `s.manager.Stop(ctx)` call is unaffected and
still needed for the one caller that skips `shutdownGracefully` entirely
(`stopForRestart`, the auto-update restart path).

Blast radius measured: `rg -n "manager\.Stop\(|StopLivenessPoll\(" internal/server
cmd/musterd --glob '!*_test.go'` — two call sites, `Server.Shutdown` (unchanged) and the
new one in `shutdownGracefully`; no other caller of `Manager.Stop` exists.

Verified two ways:
1. A standalone Go probe (`internal/session.Manager` wired with a fake `PaneChecker`
   whose `PaneExists` sleeps 300ms before answering "pane gone", `PollInterval=100ms`):
   called `Stop` 150ms after `Start` (guaranteed mid-tick), confirmed `Stop()` blocks
   until the in-flight `checkOneLiveness`→`markEnded`→`UpdateSession` call fully resolves
   (ctx-cancel makes `UpdateSession` return `context.Canceled`, `markEnded` rolls the
   in-memory flip back), and that both in-memory and the DB end up `alive:true`,
   consistent — no torn state. (Probe was a throwaway `cmd/diagprobe/main.go`, deleted
   after use — not part of this diff.)
2. By hand against a real daemon (`bin/musterd`, real tmux, no fakes): launched a
   session, bound it via the enveloped `SessionStart` hook, `tmux kill-window` the pane,
   then `SIGTERM` the process immediately (mirroring the spec's `killTmuxWindow()` then
   `restart()`), then started a second daemon on the same data dir/socket and read its
   `reconciled sessions` log line. 15/15 clean runs (`marked_ended=1 swept=0` every time;
   `alive=1` confirmed in the sqlite row between the two daemons on one run). Before the
   fix, the same by-hand repro raced correctly (kept `alive=1` in the DB after SIGTERM
   in the one case I captured it going through `PaneExists`'s ctx-cancel path) — this
   mechanism is real and is now closed.

**Bug 2 — this is not the E2 spec's dominant failure (measured, NOT closed, escalated).**
Re-ran the reporter's exact repro after Bug 1's fix: `make e2e-soak SPEC=reconcile.spec.ts
N=10` — still 9/10 failing, unchanged from before the fix. Instrumented a debug build
(temporary log lines in `pollLoop`/`checkOneLiveness`/`markEnded`, reverted before this
commit — none of this diff) and ran the single E2 test directly
(`npx playwright test e2e/reconcile.spec.ts -g "E2, INV-1, INV-3" --workers=1` with
`-debug` and per-line stderr echo) to see the true sequence. Two runs captured:

- Run A: `checkOneLiveness entered session_id=1` logged, immediately followed by
  `shutting down signal=terminated`, then (after `StopLivenessPoll` returned and
  `leaving live sessions running count=1` was logged) `markEnded UpdateSession returned
  ctx_err_nonnil=false` with no `update_err` — i.e. the write succeeded — yet
  `LiveSessionCount` read `count=1` moments earlier. No `poll tick firing` diagnostic
  (added on `pollLoop`'s ticker branch specifically) appeared anywhere in that daemon's
  log before this.
- Run B (this one passed on the first restart): same shape — no `poll tick firing`
  line, `checkOneLiveness entered` immediately followed by `shutting down`.

`rg -n "checkOneLiveness\(" internal/session/manager.go` names exactly three call sites:
`endLocked` (`End`, not exercised here — no End action in this test), `checkLiveness`'s
loop (the periodic poll, ruled out by the missing `poll tick firing` line), and `Nudge`.
`rg -n "\.Nudge\b" internal` (note: not `\.Nudge\(`, which misses a bare method value)
finds the third caller: `internal/server/terminal.go:273`,
`pumpPTYToSocket(ctx, f.log, c, bridge, id, true, f.manager.Nudge)` — wired into
`terminalFeature.handleTerminal`'s PTY-read goroutine. Its own doc comment (line 271)
names this REQ-6, pre-existing and unrelated to this plan: "a Claude pane's death is its
session's death — a clean PTY EOF here nudges the liveness poll rather than waiting out
the ~5s interval." `Manager.Nudge`'s own doc comment cites `kb:anchor/terminal.ws`
verbatim: "a PTY EOF should promptly flip alive:false... rather than lagging up to the
~5s interval." `pumpPTYToSocket`'s EOF branch
(`internal/server/terminal.go:319-326`) calls `nudge(context.WithoutCancel(ctx),
sessionID)` — deliberately stripped of cancellation, by design, so the nudge outlives
its own connection-teardown race (its own comment: "the nudge must outlive that teardown
race, same pattern as sessions.go's rollback").

Because the dashboard's Focus view attaches a live terminal WS to a freshly-launched
session by default, `killTmuxWindow` in the E2 spec produces an EOF on that live PTY
bridge almost immediately — well before `daemon.restart()` even calls `kill()`/sends
`SIGTERM` — and `Nudge`'s `checkOneLiveness`→`markEnded` runs to completion right then,
entirely independent of `pollLoop`/`Manager.Stop`/anything in `shutdownGracefully`, and
deliberately immune to ctx cancellation. This is not a shutdown-ordering race at all: by
the time SIGTERM is sent, the row is already, legitimately `alive:false` from real-time
detection the daemon was fully up and running for. REQ-13's `ShellCount` call is not a
contributor to this path (it runs after Nudge has already finished, and Nudge doesn't go
through `Manager.Stop`'s ctx at all) — bisection at 652af3c^ was moot for this mechanism.

**Why I did not attempt a further code fix.** `Nudge`'s call is deliberately
cancellation-proof (see above), so nothing in `shutdownGracefully`'s ordering can
intercept it — it has usually already completed before shutdown begins. The only way to
change the *outcome* would be to change `classifySessionsByOwnership`'s rule itself (e.g.
treat a very-recently-ended row as if reconcile were seeing it for the first time), which
directly touches `kb:adr/lifecycle-reconcile-converges-with-the-socket`'s decision text
("No row is deleted while its pane is alive" — classified purely by ownership+alive, no
timestamp heuristic) — a product decision, not mine or the orchestrator's to make
unilaterally per my constraints. The alternative — the spec not holding a live terminal
WS open on the session it's about to kill out from under itself — is a test-side change I
am not permitted to make (Constraints: daemon-impl never edits test files).

**Decisions**: `deviation: none` for the shipped code (Bug 1's fix stays, verified,
narrow, and correct on its own terms). Escalating Bug 2 rather than shipping a fix: the
given root-cause ("the still-shutting-down process's own poll races its own shutdown")
does not hold for the dominant failure mode — `kb:adr/lifecycle-reconcile-converges-with-the-socket`
would have to change for a code-only fix to exist here, which I am not authorized to
decide → needs an orchestrator/user call (possibly `/interface-probe`-style scoping of
whether E2 should avoid attaching a terminal, or whether reconcile's classification
should gain a recency exception).

**Handoff**: `go build ./...` exits 0. `gofmt -l .` clean. `go vet ./...` clean.
`golangci-lint run ./...` — 0 issues. `golangci-lint run --tests=false ./...` — the same
2 pre-existing `unused` findings in `internal/server/issue.go`/`internal/server/prefs.go`
noted in the initial Handoff (neither file touched by any fix wave). `go test -count=1
./...` — full tree green. No test files touched, no test file needs a change I wasn't
permitted to make. `python3 .claude/skills/orchestrate/scripts/dead-refs.py` — 971
references checked, 0 missing.

**Files touched**: `cmd/musterd/main.go`, `internal/server/server.go`. No test files
touched. (`cmd/diagprobe/` was a throwaway diagnostic Go program created and deleted
within this fix wave — never committed, not part of this diff.)

## Fix Attempt 3 (pre-review fix)

**Failure addressed**: `reconcile.spec.ts:23` E2 (INV-1, INV-3), re-opened. The
orchestrator bisected the regression itself with `make e2e-soak SPEC=reconcile.spec.ts
N=10` in three clean-built worktrees and found it was introduced by this plan, not
pre-existing: `58427de` (main, before this plan) 50/50 pass; `7a52028` (REQ-12's E2E
spec migration alone, daemon not yet touched) 50/50 pass; `652af3c` (this plan's
REQ-10..13 daemon change) 8/10 E2 failures. My Fix Attempt 2 log had wrongly read its own
captured evidence as showing the Nudge write completing *before* REQ-13's `ShellCount`
round trip and the "leaving live sessions running" log line, and concluded REQ-13 was
"not a contributor." Re-reading that same transcript line by line: `markEnded
UpdateSession returned` is the line **after** "leaving live sessions running" in the
capture, not before — the write was still in flight *through* `ShellCount` and the
on-exit log, completing only afterward. That is REQ-13 providing exactly the extra
runway the race needed, not an unrelated mechanism finishing first.

**Which REQ, measured.** REQ-11 (tmux `run`'s `ctx.Err()` wrapping) is not a contributor
to this path: `terminal.go:325` calls `nudge(context.WithoutCancel(ctx), sessionID)`,
and `context.WithoutCancel`'s documented contract is that the returned context is never
canceled, carries no deadline, and `Err()` is always `nil` — so `internal/tmux.Client.run`'s
new `if ctx.Err() != nil` branch (the whole of REQ-11's change) can never fire for any
tmux call this Nudge path makes, regardless of what the connection's own ctx was doing.
No behavioural difference is possible here between the two REQs' code — confirmed by
inspection of both `run` (`internal/tmux/tmux.go:493`) and the `context.WithoutCancel`
call site, not asserted.

REQ-13 (`cmd/musterd/main.go`'s `shutdownGracefully`) *is* the contributor: it added an
unconditional `ShellCount` tmux subprocess round trip
(`shellCountCtx`/`srv.ShellCount`) executed synchronously, before the on-exit branch even
resolves — real wall-clock work with no bearing on this session's own liveness, sitting
directly in the process's path to exit. `cmd diagprobe`-style reasoning aside, the
mechanism is structural, not a hunch: this plan's `Manager.Nudge` (called from a PTY EOF
that `killTmuxWindow` triggers essentially immediately, entirely independent of and
racing the daemon's own SIGTERM handling) is deliberately allowed to keep running past
its own connection's teardown (the `WithoutCancel` doc comment above), and is the *only*
thing standing between "the row's alive flag reconcile itself flips on the next boot" (E2's
whole point, per its own comment: "this exercises reconcile's alive=1-but-pane-gone
branch... not the live ~5s liveness poll") and "the row already reads alive:false before
the next boot even starts, so reconcile immediately sweeps it instead" (the observed
failure). Adding real synchronous latency anywhere in `shutdownGracefully` before process
exit — which is exactly what REQ-13's `ShellCount` call is — only ever widens that
window in the wrong direction for this race; REQ-11 changes no timing and no branch
reachable on this path.

**Fix (real, not a timing tweak).** The previous read treated this as two independent,
timing-luck races (poll-loop-vs-shutdown in Fix Attempt 1, Nudge-vs-shutdown in Fix
Attempt 2) and escalated the second as unfixable without touching
`classifySessionsByOwnership`. It doesn't need touching: the actual defect is that once
shutdown has begun, an opportunistic real-time liveness signal (the poll tick, or a PTY
EOF's Nudge) can still win a race against shutdown's own on-exit policy and persist a
write shutdown never asked for and has no way to account for. Added
`Manager.stopped atomic.Bool` (`internal/session/manager.go`), set as the literal first
statement of `Stop()` (before `m.cancel()`, so it takes effect for anything already
racing `Stop` regardless of how long the poll-loop wait afterward takes — `Stop` is Fix
Attempt 1's `StopLivenessPoll`, already called as `shutdownGracefully`'s own first
statement). `checkOneLiveness` — the shared body for the periodic poll, `Nudge`, and
`End` — now checks `!endOnCheckError && m.stopped.Load()` immediately before the
`markEnded` persist call and returns without writing if both hold. `endOnCheckError` is
`true` only for `End`'s own call (`internal/session/manager.go` doc comment on
`checkOneLiveness`), so the "kill" on-exit policy's `EndAllSessions` → `End` →
`endLocked` → `checkOneLiveness(..., true)` chain is untouched — REQ-13's D13–D16
shell/session-count-at-shutdown behaviour and E4 (`-on-exit=kill`) are unaffected; only
the periodic-poll tick and `Nudge`'s opportunistic paths (`endOnCheckError=false`) are
gated. This makes the daemon's final alive bookkeeping during shutdown deterministic
instead of a wall-clock race: once `Stop` has run, only the on-exit policy's own explicit
actions (or the next boot's reconcile) get to decide, matching
`kb:adr/lifecycle-reconcile-converges-with-the-socket`'s own model of where that
authority lives — not a change to its classification rule.

Every path that reaches `checkOneLiveness`, enumerated (`rg -n "checkOneLiveness\("
internal/session/manager.go`): `endLocked` (`End`, `endOnCheckError=true`, unaffected),
`checkLiveness`'s loop (the periodic poll, `endOnCheckError=false`, now gated), and
`Nudge` (`endOnCheckError=false`, now gated — this is the one the regression actually
runs through, per Fix Attempt 2's own captured log sequence). No fourth caller exists.

**Blast radius measured.** `rg -n "\.Stop\(|checkOneLiveness|stopped\b"
internal/session --glob '*_test.go'` — every existing test that calls `Nudge` or
`checkLiveness` (`TestNudge_*`, `TestCheckLiveness_*`, `TestPollLoop_RunsUntilStopped`)
either never calls `Stop` at all, or (`TestPollLoop_RunsUntilStopped`) waits for the death
to already be persisted via `require.Eventually` before calling `Stop` — `m.stopped` is
false for every one of them at the point `checkOneLiveness` runs, so none is affected;
confirmed by the green run below rather than by this reasoning alone. `rg -n
"m\.Stop\(|StopLivenessPoll\(" internal/server cmd/musterd --glob '!*_test.go'` — same
two call sites Fix Attempt 2 already found (`Server.Shutdown`, `shutdownGracefully`); no
new caller of `Stop` was added or needed.

**Re-ran the orchestrator's exact repro:**
```
$ make e2e-soak SPEC=reconcile.spec.ts N=10
...
  50 passed (28.3s)
```
50/50, including every E2 run (`reconcile.spec.ts:23:1 ... (E2, INV-1, INV-3)`) — zero
failures, up from 8/10 failing before this fix.

**Full suite:**
```
$ make e2e
...
  376 passed (2.2m)
```

**Verification**:
```
$ go build ./...                                     # exit 0
$ gofmt -l .                                          # no output
$ go vet ./...                                        # clean (cmd/musterd/main_test.go's
                                                       # sanctioned wave-1 breakage from the
                                                       # initial Handoff has since been
                                                       # repaired by daemon-tests; nothing
                                                       # left un-compiling)
$ golangci-lint run ./...                             # 0 issues
$ golangci-lint run --tests=false ./...               # same 2 pre-existing `unused`
                                                       # findings noted in every prior
                                                       # Handoff (internal/server/issue.go,
                                                       # internal/server/prefs.go); zero
                                                       # findings in internal/session
$ go test -count=1 ./internal/session/... ./internal/server/... ./cmd/musterd/...
                                                       # all green
$ python3 .claude/skills/orchestrate/scripts/dead-refs.py
                                                       # 971 references checked, 0 missing
```

**Decisions**: `deviation: none`. No `doc-delta:` — `Manager.stopped` is an internal
scheduling detail of an already-documented shutdown sequence (`StopLivenessPoll` first,
per Fix Attempt 2's own `doc-delta`-free note), not a new observable behaviour the plan's
Doc Delta or protocol contract describes; the *outcome* it fixes (E2's kept-then-swept
sequence) is exactly what the plan's Protocol Contract and `docs/adr/lifecycle-reconcile-converges-with-the-socket`
already claim, now true reliably instead of by timing luck. `kb:adr/lifecycle-reconcile-converges-with-the-socket`
is unchanged, as directed — `classifySessionsByOwnership` was not touched.

**Which REQ caused the regression (for the retro)**: REQ-13, specifically
`shutdownGracefully`'s unconditional `ShellCount` round trip landing ahead of the
on-exit branch — not REQ-11, which changes no reachable behaviour on this path
(`context.WithoutCancel`'s ctx never carries a deadline for `run`'s new `ctx.Err()`
branch to observe). Fix Attempt 2 misread its own captured log ordering and cleared
REQ-13 on that basis; re-reading the same transcript shows the write landing *after*,
not before, `ShellCount`'s own log line.

**Files touched**: `internal/session/manager.go`. No test files touched, no test file
needs a change I wasn't permitted to make.
