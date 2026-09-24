# Daemon Tests: Maintainability Cleanup — Final Pass (FW-D1b + FW-Z daemon)

**Plan**: maintainability-cleanup
**Verdict**: pass
**Pack**: `go run ./tools/kb pack --plan maintainability-cleanup --role daemon-tests` → `kb: pack 67323 words (budget 8000)` / `kb: WARN pack exceeds budget of 8000 words` (same over-budget note every prior daemon-tests wave on this plan has recorded; worked from `plans/maintainability-cleanup/daemon-implementation-FW-D1b.md` (both attempts) and `daemon-implementation-FW-Z.md`, both read in full, plus the reviewer's scratchpad probes at `cw2/internal/session/zz_probe_test.go` and `zz_probe_batch_test.go`).

## Summary

Tests created: 5 new (4 interleaving behaviour tests + 1 field-coverage test) | Test files with new content: 3 (`manager_writeturnstile_interleave_test.go`, `manager_writeorder_test.go`, `terminal_closeall_takeover_test.go`) | Mechanical fixes: 27 `store.Open`/`Open` call sites given a third `zerolog.Nop()` argument, one test restructured off the deleted `SetLogger`, one stale comment fixed | Passing: all | Failing: 0

Scope, per the team lead's brief: `internal/session`, `internal/store` (FW-D1b's `store.Open` signature break and its four interleaving probes, plus `CheckSessionFieldCoverage`), and `internal/server`/`internal/claudecode` (FW-Z's `closeShutdown` fix, which only the implementer had probed, never committed as a test).

## Part 1 — FW-D1b: the 27-site `store.Open`/`Open` signature break

FW-D1b's Fix Attempt 2 (Major 4) deleted `Store.SetLogger` and gave `Open` a third `log zerolog.Logger` parameter, matching `session.NewManager(cfg Config)`'s `Config.Logger` and internal/server's `newXFeature(..., log zerolog.Logger)` pattern. That broke every two-arg test call site's compilation — the handoff named 27; I found the same 27 (`grep -rn "store\.Open(\|:= Open(context" --include="*_test.go" .`, excluding `docs/history/spikes/`'s unrelated `queue.Open`). All 27 got a `zerolog.Nop()` third argument, matching `internal/session/manager_test.go`'s own existing `zerolog.Nop()` convention for "don't care about logging" test doubles (not the handoff's suggested `zerolog.Logger{}` — the zero value works too, but the codebase already has a named idiom for this exact case):

```
cmd/musterd/onexit_test.go:373 (+ new "github.com/rs/zerolog" import — this file had none)
internal/server/browse_test.go:148, fakes_test.go:280, helpers_test.go:68,
internal/server/ingest_sessionid_logging_test.go:31,34, issue_test.go:42,
internal/server/prefs_test.go:267,278, sessions_test.go:205,691,
internal/server/shells_remove_lock_test.go:89, shellscroll_test.go:97, state_test.go:98,
internal/server/staticserve_test.go:25, terminal_test.go:38, themepoll_test.go:249,
internal/server/update_test.go:436,746, usage_test.go:29, usagepoll_test.go:287
internal/session/manager_test.go:34
internal/store/store_test.go:20,37,41,62
internal/usage/aggregator_test.go:26
```

**One test needed restructuring, not just an added argument**, exactly as the handoff flagged:
`internal/store/store_test.go`'s `TestScanSession_CorruptStoredTimeReadsAsZeroAndLogsWarning` used
to build its store via `openTestStore(t)` then call the now-deleted `SetLogger` to swap in a
buffer-backed logger after construction. It now builds its own `*Store` directly with the buffer
wired in at `Open`:

```go
var logBuf bytes.Buffer
st, err := Open(context.Background(), filepath.Join(t.TempDir(), "muster.db"), zerolog.New(&logBuf))
require.NoError(t, err)
t.Cleanup(func() { _ = st.Close() })
```

This is a mechanical adaptation to the new constructor shape, not a new behaviour test — the test's
own assertions (corrupt `state_since` reads as zero, the warning names table/row/column, a sibling
row and `ListSessions` are unaffected) are unchanged and still pass. It doesn't need a "fails on
HEAD" proof for the same reason the 27 argument-only fixes don't: the pre-wave code these adapt to
simply doesn't compile against the post-wave `Store`, so there is no meaningful "run this exact test
against HEAD" — HEAD's own version of this test already covered the identical assertions against
`SetLogger`. Confirmed by running the full `internal/session`/`internal/store` suites unmodified
(only the call sites patched) and by the whole-tree `make test-race` below.

Also fixed the one stale comment the handoff named:
`manager_writeturnstile_interleave_test.go:74` said "combined with `persistWholeRow`'s
live-at-persist-time read" — the function is now `persistWholeRowLocked` (the live read itself is
`wholeRowPersist`, which it calls); reworded to name `wholeRowPersist` directly.

## Part 2 — FW-D1b: the four write-turnstile interleaving tests

Lifted the four bodies the implementer measured against `git archive HEAD` in their own scratch
copies (three from the reviewer's `zz_probe_test.go`, one new for item (d)), adapted only in name
and comments (no `Probe A/B/C/D` labels, no review-cycle/finding-tag citations — restated each
rationale in the code's own terms per `docs/conventions.md` § Comments) — the assertions and
concurrency-forcing mechanics are unchanged. Added to `manager_writeturnstile_interleave_test.go`
(its existing helpers — `drawWriteTicket`, `waitForTicketDrawn`, `requireChainIdle`,
`currentTicketChan`, `canceledContext` — already there, all reused, none duplicated):

| Test | What It Proves |
|------|-----------------|
| `TestBroadcastAndPersist_EarlierSuccessLaterFailureLeavesMemoryMatchingDB` | `restoreChangedFields`'s revert target is the chain's last *persisted* row, not a failing write's own stale `prev`: an earlier write commits `Unread=true` (read live at its own turn), a later write on the same id then fails, and its restore must leave memory matching the DB and the last broadcast, not revert to the value before either write started |
| `TestBroadcastAndPersist_WriteAheadOfRemovalNeverBroadcastsAfterRemoval` | a write drawn ahead of a `Remove` on the same id finishes its own persist and broadcast — inside `wholeRowPersist`'s closure, before `finishWrite`'s deferred `done()` runs — strictly before the removal's own `sessionRemoved`, never after |
| `TestBroadcastAndPersist_TwoSuccessfulWritesBroadcastInTicketOrder` | broadcast order follows ticket order, not whichever write's persist happens to return from the store first |
| `TestSetOrder_QueuedBehindRemovalSkipsOnlyTheRemovedSession` | `persistAndBroadcastRail` treats `ErrUnknownSession` (this batch entry's session removed out from under it) as "skip this one, keep going", not a genuine failure that rolls back every other entry in the same `SetOrder`/`SetPinned` call |

One adaptation bug of my own, caught before finalizing: my first draft of the second test dropped
the reviewer probe's `order = nil` reset after `createLaunchedSession` (whose own launch already
broadcasts once) — it failed with `[]string{"upsert", "upsert", "removed"}` instead of comparing
correctly. Fixed by restoring the reset (with a comment explaining why it's there, since it's
non-obvious); re-ran and it passed. This was a test bug in my own transcription, not a finding about
the implementation.

### Proof each fails on HEAD (pre-FW-D1b, commit `a14aa72`)

Per instructions, used a scratch copy (`git archive HEAD | tar -x -C .../scratchpad/daemon-tests-old`), confirmed it predates FW-D1b entirely (`persistWholeRow` not `-Locked`, `restoreChangedFields` a free function, no `lastPersisted`, no `CheckSessionFieldCoverage` — i.e. this is FW-D1's own code, matching what the implementation log describes these bugs as being found against), dropped the four test bodies in as a new file (they only call public/package-test-surface `Manager` methods — `SetTitle`, `MarkSeen`, `removeSessionRecord`, `SetOrder` — none of the renamed internals, so they compile unchanged against HEAD), and ran:

```
=== RUN   TestBroadcastAndPersist_EarlierSuccessLaterFailureLeavesMemoryMatchingDB
    Error: memory must match the DB after the later write's restore
        expected: false
        actual  : true
--- FAIL (0.14s)
=== RUN   TestBroadcastAndPersist_WriteAheadOfRemovalNeverBroadcastsAfterRemoval
    Error: Not equal:
        expected: []string{"upsert", "removed"}
        actual  : []string{"removed", "upsert"}
--- FAIL (0.13s)
=== RUN   TestBroadcastAndPersist_TwoSuccessfulWritesBroadcastInTicketOrder
    Error: Not equal:
        expected: "second"
        actual  : "first"
--- FAIL (0.18s)
=== RUN   TestSetOrder_QueuedBehindRemovalSkipsOnlyTheRemovedSession
    Error: Received unexpected error:
        persisting rail order for session 1: unknown session
--- FAIL (0.20s)
FAIL	github.com/Zalaras/muster/internal/session	1.532s
```

All four pass against the real worktree's current (fixed) tree:

```
=== RUN   TestCheckSessionFieldCoverage_SessionFieldsFullyPartitioned
--- PASS (0.00s)
=== RUN   TestBroadcastAndPersist_EarlierSuccessLaterFailureLeavesMemoryMatchingDB
--- PASS (0.14s)
=== RUN   TestBroadcastAndPersist_WriteAheadOfRemovalNeverBroadcastsAfterRemoval
--- PASS (0.63s)
=== RUN   TestBroadcastAndPersist_TwoSuccessfulWritesBroadcastInTicketOrder
--- PASS (0.65s)
=== RUN   TestSetOrder_QueuedBehindRemovalSkipsOnlyTheRemovedSession
--- PASS (0.21s)
PASS
ok  	github.com/Zalaras/muster/internal/session	3.505s
```

Scratch copy deleted afterward (`rm -rf`); the real worktree's test files were never swapped.

## Part 3 — FW-D1b: `CheckSessionFieldCoverage`

Added `TestCheckSessionFieldCoverage_SessionFieldsFullyPartitioned` to `manager_writeorder_test.go`
(one assertion, as the implementer's Decisions section asked for): `assert.Empty(t,
CheckSessionFieldCoverage())`. This is new functionality, not a regression fix — `CheckSessionFieldCoverage`
does not exist in HEAD at all, so there is no meaningful "make it fail on HEAD" run (measured, not
assumed: `grep -n CheckSessionFieldCoverage` against the `a14aa72` scratch copy returns nothing).
What it guards going forward: a new mutable `Session` field added later that forgets to be listed in
`restoredSessionFields` or `immutableSessionFields` would otherwise silently survive a failed
write's restore.

## Part 4 — FW-Z: `attachAndPump`'s first `errRegistryClosed` check never got a close frame

The FW-Z implementation log's Handoff named this as untested: `takeover`'s *first* `closed` check
(before `attach` ever runs) had no `ws` to close on the pre-fix code, so a connect racing shutdown
saw a bare TCP drop instead of a close frame; `closeShutdown` plus `attachAndPump`'s new
`errRegistryClosed` branch fixed it, verified only by a throwaway, uncommitted probe. The existing
`TestTerminalRegistry_TakeoverAfterCloseAllClosesNewConnWithShutdownCode`
(`terminal_closeall_takeover_test.go`, from an earlier FW-D3 wave) calls `r.takeover` directly and
covers the *second* check, where `takeover` itself already closes the conn — it does not exercise
`attachAndPump`'s own close-on-`errRegistryClosed` branch at all, since that path is never reached
when calling `takeover` directly.

Added `TestAttachAndPump_RegistryAlreadyClosedGetsShutdownCloseFrame` to the same file: closes the
registry before the connect even starts, dials a real client at an `httptest.Server` wired to
`attachAndPump` (via `newSessionTestManager`, the package's existing no-tmux `session.Manager`
builder — no real tmux needed since the assertion is about the registry's closed state, never a
tmux-observable effect, so a real tmux socket per CLAUDE.md's testing convention would be the wrong
tool here), and reads directly off the client side:

```go
_, _, readErr := c.Read(context.Background())
var ce websocket.CloseError
require.ErrorAs(t, readErr, &ce, "the client must see a close frame, not a bare connection drop")
assert.Equal(t, websocket.StatusNormalClosure, ce.Code, ...)
assert.Equal(t, "musterd shutting down", ce.Reason)
assert.False(t, attachCalled.Load(), "takeover's first closed check must refuse before attach ever runs")
```

### Proof it fails on HEAD (pre-FW-Z, commit `a14aa72`)

Confirmed the scratch copy predates FW-Z (`grep -n closeShutdown internal/server/terminal.go` — no
match; the `errRegistryClosed` branch in `attachAndPump` is a bare `return`, per the implementation
log's own description). Dropped the test in (2-arg `store.Open`, matching pre-wave `Store`) and ran:

```
=== RUN   TestAttachAndPump_RegistryAlreadyClosedGetsShutdownCloseFrame
    Error: Should be in error chain:
        expected: websocket.CloseError
        in chain: "failed to get reader: failed to read frame header: EOF" (*fmt.wrapError)
            "failed to read frame header: EOF" (*fmt.wrapError)
            "EOF" (*errors.errorString)
    Messages: the client must see a close frame, not a bare connection drop
--- FAIL (0.12s)
FAIL	github.com/Zalaras/muster/internal/server	1.074s
```

Exactly the bug: a bare TCP drop (`EOF`), no close frame. Passes against the real worktree's current tree:

```
=== RUN   TestAttachAndPump_RegistryAlreadyClosedGetsShutdownCloseFrame
--- PASS (0.12s)
=== RUN   TestTerminalRegistry_TakeoverAfterCloseAllClosesNewConnWithShutdownCode
--- PASS (0.00s)
ok  	github.com/Zalaras/muster/internal/server	2.465s
```

Scratch copy deleted afterward; the real worktree's test files were never swapped.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/session/manager_writeturnstile_interleave_test.go` | `TestBroadcastAndPersist_EarlierSuccessLaterFailureLeavesMemoryMatchingDB` | later write's restore reverts to the chain's last persisted value, not its own stale `prev` | pass |
| `internal/session/manager_writeturnstile_interleave_test.go` | `TestBroadcastAndPersist_WriteAheadOfRemovalNeverBroadcastsAfterRemoval` | a write ahead of a Remove broadcasts before `sessionRemoved`, never after | pass |
| `internal/session/manager_writeturnstile_interleave_test.go` | `TestBroadcastAndPersist_TwoSuccessfulWritesBroadcastInTicketOrder` | broadcasts follow ticket order, not persist-return order | pass |
| `internal/session/manager_writeturnstile_interleave_test.go` | `TestSetOrder_QueuedBehindRemovalSkipsOnlyTheRemovedSession` | a rail batch behind a Remove skips only the removed entry | pass |
| `internal/session/manager_writeorder_test.go` | `TestCheckSessionFieldCoverage_SessionFieldsFullyPartitioned` | `restoredSessionFields`/`immutableSessionFields` fully and unambiguously partition `Session`'s fields | pass |
| `internal/store/store_test.go` | `TestScanSession_CorruptStoredTimeReadsAsZeroAndLogsWarning` (restructured) | unchanged assertions, now built via `Open(..., zerolog.New(&logBuf))` instead of `SetLogger` | pass |
| `internal/server/terminal_closeall_takeover_test.go` | `TestAttachAndPump_RegistryAlreadyClosedGetsShutdownCloseFrame` | takeover's *first* closed check, reached through `attachAndPump`, gets the shutdown close frame | pass |
| 27 files | (mechanical) | `store.Open`/`Open` two-arg call sites given a `zerolog.Nop()` third argument | pass (existing assertions unchanged) |

## Gate Run Output

```
$ go vet ./...
(no output — clean)

$ go vet -tags=canary ./test/...
(no output — clean)

$ make lint
golangci-lint run
0 issues.

$ make test-race
go test -race -count=1 ./...
ok  	github.com/Zalaras/muster/cmd/musterd	73.395s
?   	github.com/Zalaras/muster/internal/boundedwait	[no test files]
ok  	github.com/Zalaras/muster/internal/claudecode	18.685s
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
ok  	github.com/Zalaras/muster/internal/evict	9.527s
ok  	github.com/Zalaras/muster/internal/ghissue	7.273s
ok  	github.com/Zalaras/muster/internal/gitutil	2.871s
ok  	github.com/Zalaras/muster/internal/kb	3.710s
ok  	github.com/Zalaras/muster/internal/keyedlock	3.197s
ok  	github.com/Zalaras/muster/internal/locate	4.464s
ok  	github.com/Zalaras/muster/internal/reader	7.179s
ok  	github.com/Zalaras/muster/internal/selfupdate	6.594s
ok  	github.com/Zalaras/muster/internal/server	146.327s
ok  	github.com/Zalaras/muster/internal/session	41.971s
ok  	github.com/Zalaras/muster/internal/store	16.266s
ok  	github.com/Zalaras/muster/internal/termbridge	9.747s
ok  	github.com/Zalaras/muster/internal/tmux	22.528s
ok  	github.com/Zalaras/muster/internal/tmux/tmuxtest	8.908s
ok  	github.com/Zalaras/muster/internal/triage	8.249s
ok  	github.com/Zalaras/muster/internal/tty	8.645s
ok  	github.com/Zalaras/muster/internal/usage	12.345s
ok  	github.com/Zalaras/muster/internal/webui	8.160s
?   	github.com/Zalaras/muster/test/rig/capture	[no test files]
?   	github.com/Zalaras/muster/test/rig/failapi	[no test files]
?   	github.com/Zalaras/muster/test/rig/failproxy	[no test files]
ok  	github.com/Zalaras/muster/tools/kb	6.529s
ok  	github.com/Zalaras/muster/tools/triage	6.656s
ok  	github.com/Zalaras/muster/tools/versions	10.979s

$ make check-kb
kb: 426 records, 23 features, 0 problem(s)
kb: all checks pass

$ make refs
python3 .claude/skills/orchestrate/scripts/dead-refs.py --all
dead-refs: 3138 references checked, 0 missing
(remaining lines are pre-existing "ignored (gitignored by design)" notices for
.claude/settings.local.json and web/dist, unrelated to this wave)

$ go build ./...
(exit 0)

$ gofmt -l .
(no output — clean)
```

`internal/boundedwait` still has no test files — that's Minor 3's "four pollers" residue, explicitly
out of scope for both FW-D1b (session/store) and FW-Z (server/claudecode); not touched here.

## Files

- `internal/session/manager_writeturnstile_interleave_test.go` (4 new tests + 1 comment fix)
- `internal/session/manager_writeorder_test.go` (1 new test)
- `internal/store/store_test.go` (1 test restructured off `SetLogger`, 4 call sites patched)
- `internal/server/terminal_closeall_takeover_test.go` (1 new test)
- 25 other `*_test.go` files: mechanical `zerolog.Nop()` third argument added to `store.Open`/`Open`
  (`cmd/musterd/onexit_test.go` also gained a `zerolog` import)
