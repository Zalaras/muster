# Daemon Tests: post-worktree-spike-issues

**Plan**: post-worktree-spike-issues
**Verdict**: pass

## Summary

Tests created: 4 new tests (2 subprocess-based WaitDelay-discrimination tests, 1 shared-stub
infrastructure change with no new test function, 1 existing test amended in place) | Passing: all
| Failing: 0

Scope was exactly the plan's "Daemon — tests" Affected Files: `internal/claudecode/version_test.go`
(REQ-2/D2), `internal/tmux/preflight_test.go` (REQ-3/D3), `internal/server/terminal_test.go`
(REQ-7/D4), `cmd/musterd/onexit_test.go` (REQ-8/D8, REQ-9/D9), `cmd/musterd/open_test.go`
(REQ-8/REQ-9). No implementation file was touched.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/claudecode/version_test.go` | `TestInstalledVersion_DescendantHoldingStdoutDoesNotHangStartup` | D2/REQ-2: a stub `claude` that prints its version, exits 0, but backgrounds a `sleep 60` that inherits stdout — `InstalledVersion` must return within the WaitDelay bound (proven via a test-side bounded select), not hang on the descendant | pass |
| `internal/tmux/preflight_test.go` | `TestRunCommand_DescendantHoldingStdoutDoesNotHang` | D3/REQ-3: the same shape through the real production run seam `runCommand` (not `fakePreflighter`'s canned func) | pass |
| `internal/server/terminal_test.go` | `TestHandleTerminal_TakeoverNeverLeavesTwoClientsAttachedAtOnce` (amended in place) | D4/REQ-7: the takeover test now reads tmux's initial repaint from `c2` before writing the marker (precondition), while still asserting the marker echo afterward (not a substitute) — `maxSeen <= 1`, the 2ms poller, and its start position before the second dial are all unchanged | pass |
| `cmd/musterd/onexit_test.go` | (infra only — `newSleepStubClaude`, `runTestMain`, `tokensFileWriteBound`) | REQ-9/D9: one stub `claude` written once per package run (in `TestMain`, shared across every `spawnDaemon`/`openTestDaemonArgs` call), not one per call. REQ-8/D8: the `tokens.json` wait bound is a named constant with the 7s (2s preflight + 5s version-check) derivation written down | pass |
| `cmd/musterd/open_test.go` | (three `Eventually` sites at `waitForTokensFile`, the stub-invocation wait, and the warning-message wait) | REQ-8/REQ-9: all three now use the shared `tokensFileWriteBound` constant and the shared stub via the unchanged `newSleepStubClaude(t)` call sites | pass |

Existing tests unchanged and still passing: `TestVersionRE`, `TestVersionDriftErrorIsMatchable`
(claudecode); `TestPreflight_TooOld` and every other `fakePreflighter`-based test (tmux) — D1 holds.

## Discrimination proof (D2/D3 — Reviewer-Verified requirement)

Both new stub-based tests were run against the fix, then against the implementation with
`cmd.WaitDelay` reverted locally (never committed), to prove they actually exercise the bug and
not just the ordinary bounded-context-kill path. The stub's shape is load-bearing: it **exits
while leaving a descendant (a backgrounded `sleep 60`) holding stdout** — the direct child (what
`exec.CommandContext`/`Wait` tracks) exits promptly and successfully, so the only thing that can
possibly bound the call is `WaitDelay` forcing the pipe closed; a stub that merely slept *before*
exiting would instead be killed by ctx and would pass even without `WaitDelay` set, testing
nothing about this bug.

### `internal/claudecode` — `TestInstalledVersion_DescendantHoldingStdoutDoesNotHangStartup`

With the fix (`cmd.WaitDelay = 2 * time.Second` in `version.go`):
```
=== RUN   TestInstalledVersion_DescendantHoldingStdoutDoesNotHangStartup
--- PASS: TestInstalledVersion_DescendantHoldingStdoutDoesNotHangStartup (2.29s)
PASS
ok  	github.com/Zalaras/muster/internal/claudecode	2.739s
```

With `cmd.WaitDelay = 2 * time.Second` commented out locally (not committed) and the resulting
unused `"time"` import blanked to `_ "time"` so the revert alone still builds:
```
=== RUN   TestInstalledVersion_DescendantHoldingStdoutDoesNotHangStartup
    version_test.go:94: InstalledVersion did not return within 15s of a descendant holding stdout open — this is the startup hang REQ-2 fixes (revert cmd.WaitDelay in version.go to reproduce)
--- FAIL: TestInstalledVersion_DescendantHoldingStdoutDoesNotHangStartup (15.00s)
FAIL
FAIL	github.com/Zalaras/muster/internal/claudecode	15.790s
```
`version.go` was restored byte-identical afterward (`git diff --stat` clean).

### `internal/tmux` — `TestRunCommand_DescendantHoldingStdoutDoesNotHang`

With the fix (`cmd.WaitDelay = 2 * time.Second` in `preflight.go`'s `runCommand`):
```
=== RUN   TestRunCommand_DescendantHoldingStdoutDoesNotHang
--- PASS: TestRunCommand_DescendantHoldingStdoutDoesNotHang (2.28s)
PASS
ok  	github.com/Zalaras/muster/internal/tmux	2.670s
```

With the same line reverted locally (not committed):
```
=== RUN   TestRunCommand_DescendantHoldingStdoutDoesNotHang
    preflight_test.go:261: runCommand did not return within 15s of a descendant holding stdout open — this is the startup hang REQ-3 fixes (revert cmd.WaitDelay in preflight.go's runCommand to reproduce)
--- FAIL: TestRunCommand_DescendantHoldingStdoutDoesNotHang (15.00s)
FAIL
FAIL	github.com/Zalaras/muster/internal/tmux	15.723s
```
`preflight.go` was restored byte-identical afterward (`git diff --stat` clean).

Note on the test-side bound: both tests run the call under test in a goroutine and race it
against a `select`/`time.After`, rather than letting a reverted build hang the whole `go test`
run for the stub's full `sleep 60`. The stub's own sleep (60s) is set comfortably above the
test's own select timeout (15s, chosen after the first attempt at 5s/`sleep 10` proved too tight
under `make test`'s full-suite CPU contention — see Notes below) so a reverted build fails within
15s rather than the call incidentally succeeding once the descendant's sleep happens to finish
first.

## Discrimination proof (D4 — Reviewer-Verified requirement)

To confirm the repaint-read added ahead of the marker write is a genuine precondition and not a
substitute for the marker assertion (Edge Case 10: "tmux emits its initial repaint but never
echoes the marker … REQ-7's fix must keep failing in that case"), I temporarily changed the
post-repaint assertion to require a marker string that can never appear
(`"THIS_MARKER_WILL_NEVER_APPEAR"`) and reran the test (not committed):

```
=== RUN   TestHandleTerminal_TakeoverNeverLeavesTwoClientsAttachedAtOnce
    Error: "...echo TAKEOVER_ORDER_MARKER\r\n" does not contain "THIS_MARKER_WILL_NEVER_APPEAR"
--- FAIL: TestHandleTerminal_TakeoverNeverLeavesTwoClientsAttachedAtOnce (0.59s)
FAIL
```

This shows the repaint (visible in the captured bytes: the shell prompt/redraw escape sequences)
arrived and was consumed by the precondition read, yet the test still failed because the actual
marker-echo assertion is real and load-bearing. `terminal_test.go` was restored to the intended
diff afterward (`git diff --stat` shows only the intended 11-line addition).

With the real fix in place:
```
=== RUN   TestHandleTerminal_TakeoverNeverLeavesTwoClientsAttachedAtOnce
--- PASS: TestHandleTerminal_TakeoverNeverLeavesTwoClientsAttachedAtOnce (0.60s)
PASS
```

`maxSeen <= 1`, the 2ms poller, and the poller starting before the second dial are all byte-for-byte
unchanged from before this step (only the repaint-read block was inserted between the `c2` dial
and the marker write).

## REQ-8 (D8) — the bound and its arithmetic

`cmd/musterd/onexit_test.go` now names a package-level constant:

```go
const tokensFileWriteBound = 20 * time.Second
```

with a doc comment stating the derivation: `internal/tmux.preflightTimeout` (2s) +
`cmd/musterd`'s own `versionCheckTimeout` (5s) = 7s of legitimate, bounded-but-blocking steps
that precede `writeTokensFile` on the startup path (`main.go` run(), roughly lines 139-185: tmux
preflight → `checkWebDist` → mkdir → `store.Open`'s migrations → `bootstrapTokens` → `claude
--version` → listen → `writeTokensFile`). The previous 10s bound left only ~3s of margin over
that 7s for fork/exec latency and the migrations themselves, and measured one real flake at
10.02s under load per `validation.md`. 20s clears the 7s legitimate worst case with real headroom.
All three `open_test.go` sites (`waitForTokensFile`, the stub-invocation wait, and the
warning-message wait) and `onexit_test.go`'s own `tokens.json` wait now use this one named
constant, each with a comment pointing back at the shared derivation rather than repeating or
inventing a second number.

This is the plan's one explicit exception to "never lengthen a timeout" (REQ-8's own text: "a
bound derived from the path's own worst case, not a bumped magic number") — every other fix in
this plan removes a timing dependence instead of raising a bound.

## REQ-9 (D9) — one stub `claude` per package run

`cmd/musterd/onexit_test.go`'s `runTestMain` (already building `musterdBinary` once via
`TestMain`) now also writes the stub `claude` script once, into the same run-scoped temp
directory, storing its path in a new package-level `sharedStubClaude` var. `newSleepStubClaude(t)`
(called by both `onexit_test.go`'s `spawnDaemon` and `open_test.go`'s `openTestDaemonArgs` — same
`main` package) now just returns that shared path instead of writing a fresh `t.TempDir()`-scoped
script per call. This mirrors `web/e2e/helpers/daemon.ts`'s `ensureSharedStubClaude` (read for
the exact rationale: macOS charges a real, serialized ~270ms cost on the first exec of a newly
written executable), minus that harness's hash-keyed path and atomic write+rename — those exist
there because concurrent Playwright workers race to create the file, and nothing here does: this
package's tests run sequentially (no `t.Parallel()`), and the shared stub is written once, before
`m.Run()`, with no concurrent writer to race. Confirmed by reading `onexit_test.go` and
`open_test.go`: no other call site writes a stub-claude script.

## Test Run Output

`go build ./...`:
```
(clean, no output)
```

`make test` (full suite, after restoring both implementation files to their committed state):
```
go test -count=1 ./...
ok  	github.com/Zalaras/muster/cmd/musterd	14.215s
ok  	github.com/Zalaras/muster/internal/claudecode	11.928s
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
ok  	github.com/Zalaras/muster/internal/ghissue	1.530s
ok  	github.com/Zalaras/muster/internal/gitutil	3.161s
ok  	github.com/Zalaras/muster/internal/locate	3.229s
ok  	github.com/Zalaras/muster/internal/server	25.201s
ok  	github.com/Zalaras/muster/internal/session	6.129s
ok  	github.com/Zalaras/muster/internal/store	7.445s
ok  	github.com/Zalaras/muster/internal/termbridge	7.356s
ok  	github.com/Zalaras/muster/internal/tmux	17.124s
ok  	github.com/Zalaras/muster/internal/tmux/tmuxtest	5.603s
ok  	github.com/Zalaras/muster/internal/usage	8.162s
ok  	github.com/Zalaras/muster/internal/webui	7.146s
?   	github.com/Zalaras/muster/test/rig/capture	[no test files]
?   	github.com/Zalaras/muster/test/rig/failproxy	[no test files]
```

`make lint`:
```
golangci-lint run
0 issues.
```

D10 (`for i in 1 2 3 4 5; do go test -count=1 ./cmd/musterd || exit 1; done`) — 5/5 green,
standalone run:
```
ok  	github.com/Zalaras/muster/cmd/musterd	5.525s
ok  	github.com/Zalaras/muster/cmd/musterd	5.621s
ok  	github.com/Zalaras/muster/cmd/musterd	5.953s
ok  	github.com/Zalaras/muster/cmd/musterd	5.812s
ok  	github.com/Zalaras/muster/cmd/musterd	5.658s
```

D11 (`for i in 1 2 3 4 5; do go test -count=1 ./internal/server || exit 1; done`) — 5/5 green,
standalone run:
```
ok  	github.com/Zalaras/muster/internal/server	19.149s
ok  	github.com/Zalaras/muster/internal/server	18.676s
ok  	github.com/Zalaras/muster/internal/server	19.031s
ok  	github.com/Zalaras/muster/internal/server	20.269s
ok  	github.com/Zalaras/muster/internal/server	20.043s
```

A second, final D10+D11 run was launched against the committed tree (both implementation files
restored, both test files in their final state) to reconfirm after the select-timeout tuning
described in Notes below:

```
=== D10 final: cmd/musterd 5x ===
ok  	github.com/Zalaras/muster/cmd/musterd	6.970s
ok  	github.com/Zalaras/muster/cmd/musterd	6.550s
ok  	github.com/Zalaras/muster/cmd/musterd	5.964s
ok  	github.com/Zalaras/muster/cmd/musterd	5.556s
ok  	github.com/Zalaras/muster/cmd/musterd	5.573s
=== D11 final: internal/server 5x ===
ok  	github.com/Zalaras/muster/internal/server	19.582s
ok  	github.com/Zalaras/muster/internal/server	19.406s
ok  	github.com/Zalaras/muster/internal/server	19.662s
ok  	github.com/Zalaras/muster/internal/server	19.861s
ok  	github.com/Zalaras/muster/internal/server	20.537s
```

## Notes

- **Self-inflicted flake caught and fixed before commit.** The first version of the two new
  WaitDelay-discrimination tests used a 5s test-side select timeout and a `sleep 10` descendant.
  In isolation both passed in ~2.3-2.6s, but running the *full* `make test` suite (14 packages,
  several spinning up real tmux servers concurrently) pushed both past 5s under CPU contention —
  exactly the class of flake this plan exists to remove, ironically self-inflicted by a new test.
  Fixed by widening the test's own select bound to 15s and the stub's descendant sleep to 60s (so
  a genuinely-reverted fix still fails within 15s rather than the descendant's own sleep finishing
  first and masking the bug). Re-ran `make test` after the change: clean. This is reported as a
  test-authoring correction, not an implementation-bug finding — the production `WaitDelay` value
  (2s) and behavior were never in question, only my own test's headroom.
- No implementation file has any net diff: `internal/claudecode/version.go` and
  `internal/tmux/preflight.go` were each temporarily edited and rebuilt twice (once for the D2/D3
  discrimination proof, once again during the select-timeout tuning above) and restored from a
  byte-identical backup copy each time; `git diff --stat` against both confirms zero net changes.
  `internal/server/terminal_test.go` likewise has only the one intended 11-line addition after a
  temporary marker-swap experiment for the D4 proof.
- `cmd/musterd/onexit_test.go`'s `waitForLiveTmuxSession` bound (~line 222 in the pre-change file)
  was left untouched, per the plan's explicit instruction — it is a different wait (a launch
  reaching tmux), and REQ-8 does not cover it.
- No web file was touched (`web-impl` is running concurrently on `web/e2e/helpers/daemon.ts`,
  `web/scripts/`, `web/package.json`, `Makefile`) — confirmed via `git diff --stat` against those
  paths showing no change from this step.
- `plans/post-worktree-spike-issues/orchestration-state.json`'s uncommitted diff is the
  orchestrator's, not touched here.
