# Daemon Tests: Maintainability Regressions

**Plan**: maintainability-regressions
**Verdict**: pass
**Pack**: `kb: pack 21883 words (budget 20000)` — WARN over budget; sections rules 885 · features 7394 · decisions 6992 · facts 5237 · lessons 1367 · runbooks 2 (features launch, ingest, connection)

## Summary

Tests created: 26 | Passing: 26 | Failing: 0

(Counts include the review-cycle-1 fix wave's two additions — see Fix Cycle 1 below.)

Coverage against the plan's Daemon acceptance criteria (D1–D9), scoped to what
`daemon-implementation.md` actually added: `claudecode.ResolveBinaryIdentity`,
`server.modelsFeature` (the cache + `GET /api/models` handler), the
`newSessionLauncher`↔`modelsFeature` wiring, and `claudecode.writeScriptAtomically`.
`claudecode.CheckModel` itself was unchanged by this plan and already has exhaustive
coverage in `modelcheck_test.go` (`TestCheckModel_*`, `TestStderrSaysUnrecognised`,
`TestRunModelCheck_*`) — not duplicated here.

- **D1–D5** (the cache: hit-avoids-a-run, concurrent fan-out, identity invalidation,
  fail-open/never-cached, coalesced concurrent misses) are unit-tested directly against
  `*modelsFeature` with `check`/`identify` overridden — never a real subprocess or
  `$PATH` lookup.
- **D6** (`GET /api/models` handler shape, 400s, 401) is tested through the feature's own
  `mount(mux, guard)` on a bare `http.ServeMux`, not through a full `*Server` — a full
  `New()` always resolves a real `"claude"` binary identity, which on a machine with
  Claude Code installed would let an uncached lookup reach a real subprocess (CLAUDE.md
  hard rule: never launch a real `claude` from a unit test).
- **D7/D8** (atomic replace, unchanged-content no-op) are tested directly against
  `claudecode.writeScriptAtomically`.
- **D9** (`Launch` reads the cache, not a fresh check) is tested through the real
  `newSessionLauncher` constructor wired to a real `*modelsFeature` — this is the one
  place the actual production wiring (not a test double) is exercised, since D9 is
  specifically about that wiring, and `sessions_test.go`'s existing
  `newModelCheckLauncher`/`TestLauncher_Model*` tests only exercise the generic
  `checkModel` field's seam (unchanged by this plan), never `newSessionLauncher` itself.
- `ResolveBinaryIdentity`'s own correctness (resolve, follow symlink, error cases,
  content-change) is unit-tested in `internal/claudecode`, underpinning D3/INV-3 but not
  itself an acceptance criterion.

REQ-6–REQ-10, REQ-13 and W1–W3 are web-side (web-impl/web-tests), out of scope here per
the plan header.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|----------------|--------|
| `internal/claudecode/modelcheck_test.go` | `TestResolveBinaryIdentity_ResolvesPathSizeAndModTime` | Path/Size/ModTime match `os.Stat` after `$PATH` resolution | pass |
| `internal/claudecode/modelcheck_test.go` | `TestResolveBinaryIdentity_FollowsSymlink` | identity is the symlink's target, not the link | pass |
| `internal/claudecode/modelcheck_test.go` | `TestResolveBinaryIdentity_NotOnPath_Errors` | REQ-3: unresolvable binary errors | pass |
| `internal/claudecode/modelcheck_test.go` | `TestResolveBinaryIdentity_DanglingSymlink_Errors` | REQ-3: dangling symlink errors | pass |
| `internal/claudecode/modelcheck_test.go` | `TestResolveBinaryIdentity_ChangedContentChangesIdentity` | D3: a replaced binary yields a different identity | pass |
| `internal/claudecode/settings_test.go` | `TestWriteScriptAtomically_ReplacesByRenameAndFdKeepsReadingOldContent` | D7/INV-5: rename-replace, stale fd keeps old content, no temp file left, mode 0o700 | pass |
| `internal/claudecode/settings_test.go` | `TestWriteScriptAtomically_UnchangedContentLeavesInodeAndMtimeUntouched` | D8/REQ-12: identical content is a no-op (same inode, same mtime) | pass |
| `internal/claudecode/settings_test.go` | `TestWriteScriptAtomically_FreshPathWritesContent` | first-ever write (`os.IsNotExist` treated as "no existing content") | pass |
| `internal/server/launchermodels_test.go` | `TestModelsFeature_TwoLookupsSameIdentityOneCheckRun` | D1: cache hit runs no second check | pass |
| `internal/server/launchermodels_test.go` | `TestModelsFeature_FourUncachedModelsCheckedConcurrently` | D2: fan-out — fake run blocks until all four started | pass |
| `internal/server/launchermodels_test.go` | `TestModelsFeature_ChangedIdentityNeverReturnsOldVerdict` | D3/INV-3: identity change forces a fresh run, never returns the old verdict | pass |
| `internal/server/launchermodels_test.go` | `TestModelsFeature_CheckError_UncheckedAndNeverCached` | D4/INV-4: run error → unchecked, never cached | pass |
| `internal/server/launchermodels_test.go` | `TestModelsFeature_UnresolvableIdentity_UncheckedWithoutRunningCheck` | D4/REQ-3: unresolvable identity → unchecked, check never invoked | pass |
| `internal/server/launchermodels_test.go` | `TestModelsFeature_ConcurrentLookupsShareOneRun` | D5/REQ-5: two concurrent lookups of one (identity, model) share one run | pass |
| `internal/server/launchermodels_test.go` | `TestHandleModels_RequiresCookie` | D6: 401 without the UI cookie | pass |
| `internal/server/launchermodels_test.go` | `TestHandleModels_ResponseShape` | D6: dedupe, first-seen order, `message` present iff `unrecognized` | pass |
| `internal/server/launchermodels_test.go` | `TestHandleModels_EightDistinctModelsAllowed` | D6/D10 boundary: exactly 8 distinct values is not yet a refusal | pass |
| `internal/server/launchermodels_test.go` | `TestHandleModels_InvalidRequest` (4 subtests) | D6/D10: no `model`, empty value (alone/among others), 9 distinct values | pass |
| `internal/server/launchermodels_test.go` | `TestLauncher_CachedVerdict_LaunchRunsNoCheck` (2 subtests) | D9/REQ-4: `Launch` via `newSessionLauncher` reads the cache, runs no fresh check, for both cached verdicts | pass |
| `internal/server/launchermodels_test.go` | `TestModelsFeature_CheckInFlightWhenIdentityChanges_NotCachedNorServed` | INV-3's concurrent path: a check in flight under identity A finishes only after a lookup under identity B has reset the maps and started its own run — A's finish must not evict B's still-live in-flight entry, a second concurrent B lookup must still share B's run, A's own verdict still reaches its own caller, and the cache ends up holding B's verdict only | pass |
| `internal/server/launchermodels_test.go` | `TestModelsFeature_LeaderCancellation_JoinerGetsRealVerdictAndOwnCancelReturnsPromptly` | REQ-5's cancellation half: the leader's ctx is cancelled mid-run — a joined waiter with a live ctx still gets the run's real verdict, the leader itself still gets its own real verdict, and a separate waiter whose own ctx is already cancelled returns `unchecked` promptly instead of waiting on the run | pass |

## Fix Cycle 1 (review cycle 1)

**Issues addressed**: code Minor 5 (mine — `[daemon-tests]`), plus the regression
coverage for two wave-1 daemon-impl fixes that the fix-mode brief assigned to this role
(daemon-impl may not write tests): maintainability Minor 1 and maintainability Minor
2/code Minor 2.

**1. code Minor 5** — INV-3's only non-trivial path (a check started under identity A
finishing after a lookup under identity B has already reset the maps and registered its
own in-flight run) had no test; D3 covered only the sequential identity-change case, not
this concurrent one.

Added `TestModelsFeature_CheckInFlightWhenIdentityChanges_NotCachedNorServed` to
`internal/server/launchermodels_test.go`. It holds A's check blocked (`f.check`) via a
channel, starts a lookup under a new identity B for the same model (B's own check also
held), releases A first — so A's finishing cleanup runs while B's entry is still
in-flight — and then asserts, directly against `f.inflight` under `f.mu`, that A's finish
left B's entry alone. It then starts a second, concurrent lookup under B's identity and
releases B, asserting that second lookup is served B's run's verdict (`checkCalls` stays
at 2 — one for A, one shared for both B lookups — never a third), that A's own verdict
still reaches A's own caller, and that `f.cached["opus"]` ends up holding B's verdict, not
A's. This same interleaving is also the exact one maintainability Minor 1's own report
describes (A registers, identity changes, B registers and runs, A finishes, a further
lookup must share B's run rather than starting a second one) — one test covers both.

Regression proof (per the fix-mode instructions: a throwaway copy, never this tree):
`git archive HEAD | tar -x` into a scratch dir, reverted the guarded
`if f.inflight[model] == call { delete(...) }` in `launchermodels.go` back to the
unconditional `delete(f.inflight, model)` the review flagged, copied the new test in, and
ran it:

```
$ go test -race -count=10 -run TestModelsFeature_CheckInFlightWhenIdentityChanges_NotCachedNorServed ./internal/server/... -v
--- FAIL (×10/10)
    Error: Should be true
    Messages: A's finish must not remove B's still-running in-flight entry for the same model
FAIL
```

Against the actual (fixed) tree, the same command passes 20/20 with `-race -count=20`.

**2. maintainability Minor 2 / code Minor 2** (regression test assigned to this role) —
"a fix must make one caller's cancellation unable to become another live caller's
verdict," fixed by running the shared check on `context.WithoutCancel(ctx)` and giving a
waiter a `<-ctx.Done()` arm; no test drove that interleaving.

Added `TestModelsFeature_LeaderCancellation_JoinerGetsRealVerdictAndOwnCancelReturnsPromptly`
to `internal/server/launchermodels_test.go`. The leader registers under a cancellable
`ctx`, blocks in a fake `check` that itself selects on `ctx.Done()` versus a release
channel (so it would visibly take the cancellation branch if the shared run were ever
given the leader's own ctx instead of a detached one); a joiner with `context.Background()`
attaches to the same in-flight call; the leader's ctx is then cancelled and the check held
open a further 20 ms (scheduling headroom, matching the existing D5 test's documented
pattern, so a broken run has a real chance to notice and return early before the release);
a second, separate waiter whose own ctx is already cancelled is asserted to return
`unchecked` within a 2 s timeout rather than blocking on the run; then the run is released
and both the leader and the live-ctx joiner are asserted to get the real verdict
(`catalogRecognized`), with exactly one check run total (`checkCalls == 1`).

Regression proof (same throwaway-copy method): reverted `context.WithoutCancel(ctx)` back
to plain `ctx` and the waiter's `select { case <-call.done: ...; case <-ctx.Done(): ... }`
back to a bare `<-call.done`, copied the test in, and ran it:

```
$ go test -race -timeout 30s -count=5 -run TestModelsFeature_LeaderCancellation_JoinerGetsRealVerdictAndOwnCancelReturnsPromptly ./internal/server/... -v
--- FAIL (×4/5, one hitting the 2s timeout instead)
    Not equal: expected 1, actual 0  — the leader's own cancellation must not turn its own answer into unchecked
    Not equal: expected 1, actual 0  — a joined waiter with a live ctx must get the run's real verdict...
    Not equal: expected 1, actual 2  — only the leader may run a check; every other caller here must share it
    (one run) a waiter whose own ctx is cancelled must return promptly instead of waiting on the shared run
FAIL
```

Every one of the 5 reverted runs failed, on the exact assertions the two Minor reports
describe. Against the actual (fixed) tree, the same command passes 20/20 with
`-race -count=20`.

**Verification** (this tree, fixed code, both new tests together):

```
$ go build ./...
(exit 0)

$ gofmt -l internal/server/launchermodels_test.go
(no output)

$ go test -race -count=1 ./internal/server/... ./internal/claudecode/...
ok  	github.com/Zalaras/muster/internal/server	145.163s
ok  	github.com/Zalaras/muster/internal/claudecode	5.749s
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]

$ make lint
golangci-lint run
0 issues.

$ make test
ok for every package (cmd/musterd, internal/server, internal/claudecode, ...)

$ python3 .claude/skills/orchestrate/scripts/comment-checks.py daemon-tests
comment-checks: clean

$ python3 .claude/skills/orchestrate/scripts/dead-refs.py internal/server/launchermodels_test.go
dead-refs: 1 references checked, 0 missing
```

No implementation bugs found in this cycle — both wave-1 fixes hold under their own
described interleavings.

## Test Run Output

```
$ go build ./...
(exit 0, no output)

$ go vet ./...
(exit 0, no output)

$ go test -race -count=1 ./internal/server/... ./internal/claudecode/...
ok  	github.com/Zalaras/muster/internal/server	144.642s
ok  	github.com/Zalaras/muster/internal/claudecode	6.060s
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]

$ make lint
golangci-lint run
0 issues.

$ gofmt -l internal/server/launchermodels_test.go internal/claudecode/modelcheck_test.go internal/claudecode/settings_test.go
(no output)

$ python3 .claude/skills/orchestrate/scripts/dead-refs.py
dead-refs: 844 references checked, 0 missing

$ bash .claude/skills/orchestrate/scripts/size-warn.sh | grep -i "launchermodels\|modelcheck_test\|settings_test"
(no output — none of the touched test files triggered a size warning)
```

That size claim held at the first wave only. The review-cycle-1 fix wave's
`TestModelsFeature_CheckInFlightWhenIdentityChanges_NotCachedNorServed` trips `funlen` (55 > 40
statements, cycle-2 gate `15-size.log`). Reason, and it stays one function: it is one ordered
interleaving driven by four gate channels (`aStarted`, `releaseA`, `bStarted`, `releaseB`) —
A blocks, B resets the maps and blocks, A is released while B still runs, a second B lookup
joins, then B is released — and each assertion depends on the step before it. A table cannot
express an ordering, and splitting the steps across helpers would hide the order the test
exists to pin (kb:adr/process-size-linters-warn-never-fail). Added by the orchestrator for
review cycle 2's maintainability Minor 1 (a plan-log wording fix).

No implementation bugs found. No test file needed a workaround for a defect; every
acceptance criterion this role owns (D1–D9) is green against the implementation as built.
