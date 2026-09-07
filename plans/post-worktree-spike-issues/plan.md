# Plan: post-worktree-spike-issues

**Created**: 2026-09-07
**Status**: completed
**Work Type**: full-stack
**E2E Scope**: harness-only
**Fixture plan**: no new specs; `views.spec.ts` keeps its per-test `daemon` fixture (E7 asserts daemon-global rail order and auto-focus)
**Description**: Fix the two reproduced defects and the three live flakes the worktree spike's history census surfaced; the two census findings that were already fixed become doc corrections, not work.

## Overview

The worktree spikes' history census (`spikes/worktree/S5-census.md`, TODO.md 532–559) logged four
repo findings. Validating them against `main` @ `2aea5ee` — measured, in
`plans/post-worktree-spike-issues/validation.md` — splits them in half. Two are real and
reproduced: the missing `cmd.WaitDelay` that can hang `musterd` startup forever, and the E2E
fixture that leaks a process, a tmpdir and an HTTP listener whenever `start()` fails. Two were
already fixed by `e0319f8` and `feec502`, and the census only saw them because it measured
mostly pre-fix trees; the pair index in its logs increases with recency, so every tree at
index ≤ 25 predates both fixes.

The `WaitDelay` finding is also wider than logged. `Wait` blocks on the stdout/stderr copy
whenever os/exec owns the pipe, which covers `Output()`, `CombinedOutput()` **and**
`cmd.Stdout = &buf` — so seven files carry the same latent hang, two of them on the startup
path, not the one site the census named.

The flakes get fixed, not deferred. Each has a specific mechanism, diagnosed here rather than
guessed: `views.spec.ts` E7 synchronizes on a `<select>`'s own value while `focusNth` reads a
`railSort` that only changes on the `prefs` broadcast; the takeover test writes into a tmux
attach that is still setting its terminal up; and `cmd/musterd`'s daemon-startup waits are
bounded at 10 s on a path whose own legitimate timeouts already total 7 s. No requirement here
raises a timeout as its fix — the standing rule in `docs/design/test-strategy.md` is that a
timing gate on a shared machine is a flake generator, so each fix removes the dependence on
timing instead. The one exception is stated as such (REQ-8) and is a *bound derived from the
path's own worst case*, not a bumped magic number.

## Requirements

### Must Have

- [ ] REQ-1: Every `exec.CommandContext` in the daemon whose stdout or stderr is a pipe created
  by os/exec sets `cmd.WaitDelay`, so context expiry actually bounds the call instead of
  blocking on a descendant that inherited the pipe. The seven exposed files are listed under
  Affected Files. `internal/termbridge/termbridge.go` is deliberately excluded (a PTY, not an
  exec pipe, and its teardown semantics are load-bearing for attach); `cmd/musterd/open.go` is
  excluded as unexposed (`Run()` with no `Stdout` set).
- [ ] REQ-2: `claudecode.InstalledVersion` returns within its context's deadline plus the wait
  delay even when the invoked binary exits but leaves a descendant holding stdout — the exact
  shape that took `musterd` startup down before its first log line at `e0319f8`.
- [ ] REQ-3: `tmux.Preflight` has the same property (the other startup-path site).
- [ ] REQ-4: A failed `ScratchDaemon.start()` leaves nothing behind: the spawned `musterd` is
  signalled and reaped, its private tmux server is killed, the `denyStubServer` listener
  `start()` opened is closed, and the `muster e2e-*` tmpdir is removed. Holds for all three
  fixture shapes, since `daemon`, `startDaemon` and `fileDaemon()` all call
  `startScratchDaemon`.
- [ ] REQ-5: The rejection from a failed `start()` still names why the daemon was unhealthy and
  still carries the captured `musterd` output — the cleanup must not swallow the diagnostic that
  makes such a failure debuggable.
- [ ] REQ-6: `views.spec.ts` E7 presses ⌥⌘1 only once the rail is actually in attention order,
  observed from the rail's own DOM (`railOrderIds`), not from `#rail-sort`'s value. The
  assertions the test makes after the chord are preserved verbatim.
- [ ] REQ-7: `TestHandleTerminal_TakeoverNeverLeavesTwoClientsAttachedAtOnce` writes its marker
  only after the new attach has proved itself live by emitting tmux's initial repaint, and its
  `maxSeen <= 1` invariant assertion is preserved unchanged — including the poller still
  starting before the second dial, which is what gives the invariant its coverage.
- [ ] REQ-8: `cmd/musterd`'s "daemon wrote `tokens.json`" waits are bounded above the startup
  path's own legitimate worst case, with the arithmetic written down at the bound: the tmux
  preflight (2 s) and the `claude --version` check (5 s) are both bounded-but-blocking steps
  that precede the write, so a 10 s bound sits below 7 s + fork latency + migrations and is a
  threshold the suite will keep crossing.
- [ ] REQ-12: `ScratchDaemonOptions` gains a single `musterdBinOverride` field naming the binary
  to spawn, defaulting to today's module-relative `bin/musterd` so every existing caller is
  unaffected. It is documented as harness-self-test-only and exists so REQ-4's check can induce
  an unhealthy daemon without mutating `bin/musterd` for every concurrent build and E2E run.
- [ ] REQ-9: `cmd/musterd`'s tests stop paying macOS's first-exec penalty per test: the stub
  `claude` is written once per package run rather than freshly per `spawnDaemon`/
  `openTestDaemonArgs` call (~7 fresh scripts per run today), mirroring `ensureSharedStubClaude`
  in the E2E harness.

### Should Have

- [ ] REQ-10: `docs/conventions.md` gains the rule REQ-1 generalises, so the next
  `exec.CommandContext` is written with `WaitDelay` rather than rediscovering this.

### Nice to Have

- [ ] REQ-11: A drift guard that a *new* pipe-owning `exec.CommandContext` cannot land without
  `WaitDelay`. Recorded as Reviewer-Verified rather than a check: the reliable version needs
  more shell than a one-liner, and the explicit per-file check (D5) covers today's sites.

## Protocol Contract

No protocol changes. No WS message, HTTP endpoint or payload shape is added, removed or altered.

## Schema Changes

No schema changes required.

## UI Specifications

No UI changes. Nothing in `web/src/` is touched: the `views.spec.ts` fix is test-side
synchronization against the existing rail DOM, and `main.ts`'s deliberate
"`railSort` only ever changes via the `prefs` broadcast" design (`web/src/main.ts:395`, INV-6)
is the *correct* behaviour the test was racing — it is not to be made optimistic to suit a test.

### Views

- Unchanged.

### User Flows

- Unchanged.

### States

- No data yet: unchanged.
- Daemon down: unchanged.

### Testable UI Elements

No new elements. The fix uses the oracle the `order-sidebar` plan already established:

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| Rail card order | — | — | `railOrderIds(page)` in `web/e2e/helpers/railorder.ts` — `#sessions [data-testid='session-card']` read as a `data-session-id` sequence. Existing helper, unchanged. |

## Affected Files

### Daemon — implementation (`daemon-impl`)

- `internal/claudecode/version.go` — `WaitDelay` on the `--version` command (REQ-1/REQ-2); the
  doc comment's "a hung claude binary must not stall it indefinitely" becomes true.
- `internal/tmux/preflight.go` — `WaitDelay` on `runCommand` (REQ-1/REQ-3). The comment at
  line 35 currently asserts "Output returns once the process is killed", which is the belief
  this plan corrects; fix the comment with the code.
- `internal/tmux/tmux.go` — `WaitDelay` at both sites (`CombinedOutput()` at ~300, the
  `Stdout`/`Stderr` buffer pair at ~318).
- `internal/gitutil/gitutil.go` — `WaitDelay` (`Output()` at ~51).
- `internal/locate/spotlight.go` — `WaitDelay` (`cmd.Stdout` buffer + `Run()` at ~36).
- `internal/claudecode/credentials.go` — `WaitDelay` (`cmd.Stdout` buffer + `Run()` at ~36).
- `internal/ghissue/ghissue.go` — `WaitDelay` (`Stdout`/`Stderr` buffers + `Run()` at ~62).

Pick one delay constant and one rationale comment, and place it where the boundary already
lives — `internal/claudecode/` keeps its own (CLAUDE.md hard rule: Claude-Code-format knowledge
never leaks outward), so this is a repeated one-liner, not a new shared helper package.

### Daemon — tests (`daemon-tests`)

- `internal/claudecode/version_test.go` — REQ-2: a stub binary that prints its version, exits,
  and leaves a `sleep` holding stdout; assert `InstalledVersion` returns inside the deadline
  plus the delay rather than hanging.
- `internal/tmux/preflight_test.go` — REQ-3: the same shape through the run-func seam's real
  `runCommand`. Note the existing `TestPreflight_TooOld` needs no change — it is already
  subprocess-free (this is finding 2, already fixed).
- `internal/server/terminal_test.go` — REQ-7: the takeover test reads tmux's initial repaint
  from `c2` before writing the marker. `maxSeen <= 1`, the 2 ms poller and its start position
  are untouched.
- `cmd/musterd/onexit_test.go` — REQ-8 (`spawnDaemon`'s `tokens.json` wait at ~191) and REQ-9
  (`newSleepStubClaude` becomes once-per-package). The `waitForLiveTmuxSession` bound at ~222
  is a different wait — a launch reaching tmux — and REQ-8 does not cover it; leave it.
- `cmd/musterd/open_test.go` — REQ-8/REQ-9 at the three 10 s bounds (~100, ~143, ~220) and the
  shared stub, since `openTestDaemonArgs` spawns daemons the same way.

### Web — harness (`web-impl`)

- `web/e2e/helpers/daemon.ts` — REQ-4/REQ-5: guard `ScratchDaemon.start()` so a throwing
  `spawnAndWait()` routes through the same teardown the success path gets, and rethrow with the
  original message and captured output intact. Also REQ-12's `musterdBinOverride` field on
  `ScratchDaemonOptions` — one optional string, defaulting to the current module-relative
  `bin/musterd`.
- `web/scripts/` — REQ-4's self-test: a script that starts a fake `musterd` which never answers
  `/healthz`, calls `startScratchDaemon`, and exits non-zero if a child process or a
  `muster e2e-*` tmpdir survives. Owned by web-impl, like `e2e-lint.sh` and
  `playwright.config.ts` — gate knobs never belong to the agent the gate judges.
- `web/package.json`, `Makefile` — the entry point for that check, so W3 is a Make/npm target
  rather than an ad-hoc pipeline.

### E2E specs (`e2e-specs`)

- `web/e2e/views.spec.ts` — REQ-6 only: the readiness wait before `Alt+Meta+Digit1`. No other
  test in the file changes.

## Edge Cases

1. A `claude` binary that exits 0 promptly but whose descendant holds stdout for minutes — the
   census's reproduced case; the call must return on the deadline, not on the descendant.
   → D2
2. A `claude` binary that hangs without exiting at all (no output, no exit): `CommandContext`
   kills it on ctx expiry and `WaitDelay` bounds the pipe drain. → D2
3. A binary that writes more than the pipe buffer and is then killed — `WaitDelay` must not
   truncate output the command already delivered on a *successful* run, so the happy path's
   parsed version must still be exact. → D1 (existing version tests) + D2
4. `tmux -V` with a descendant holding the pipe, on the startup path before any log line. → D3
5. `start()` fails *before* the process is spawned (a `mkdtemp` or stub-write error): the
   tmpdir and the deny stub may or may not exist yet, so cleanup must tolerate absent pieces
   and must not mask the original error with a teardown error. → W3 + W4
6. `start()` fails after the process is spawned but the process has *already* exited (a bind
   failure): killing must be a no-op, not a hang or a throw. → W3
7. Two failed starts concurrently (Playwright runs 4 workers): each cleans up only its own
   process, tmpdir and listener. → W4
8. The `prefs` broadcast for `railSort` arrives *after* ⌥⌘1 in E7 — today's flake. The fix must
   wait on rail order, and must still fail (not hang green) if attention order never arrives.
   → E2
9. The rail is already in the asserted order by luck, so the readiness wait passes trivially:
   E7 explicitly launches B before A and gives only A a permission prompt, so manual and
   attention order genuinely differ and the wait cannot be vacuous. → E2
10. tmux emits its initial repaint but never echoes the marker (a real regression): REQ-7's
    fix must keep failing in that case, not pass on the repaint alone. → D4
11. A takeover where the *old* client's eviction is what is slow: the poller starts before the
    second dial, so the invariant still samples the whole window. → D4
12. `musterd` startup legitimately exceeding even REQ-8's derived bound (a machine under far
    heavier load than a `make check`): the failure message must name the bound and its
    arithmetic so the next reader can tell a slow machine from a regression.
    → untested: asserting a wait's own failure text requires inducing the failure, which is the
    timing dependence this plan removes.

## Acceptance Criteria

IDs are unique across the whole section.

### Daemon

- **D1**: The existing `internal/claudecode` and `internal/tmux` version/preflight tests still
  pass unchanged — the `WaitDelay` addition alters no successful-run behaviour.
- **D2**: `InstalledVersion` against a stub that exits leaving a `sleep` holding stdout returns
  within the context deadline plus the wait delay, rather than hanging (REQ-2).
- **D3**: `tmux.Preflight` has the same property against the same stub shape (REQ-3).
- **D4**: The takeover test still fails if the marker never echoes — the repaint wait is a
  precondition, not a substitute for the assertion (REQ-7).
- **D5**: Every file named in REQ-1 sets `WaitDelay`.
- **D6**: `internal/termbridge/termbridge.go` is unchanged — its PTY path is deliberately out of
  scope (REQ-1).
- **D7**: No Claude-Code-format knowledge moved out of `internal/claudecode/` while adding the
  delay there (CLAUDE.md hard rule).
- **D8**: `cmd/musterd`'s startup bound states the arithmetic that derives it (REQ-8).
- **D9**: `cmd/musterd` writes one stub `claude` per package run, not one per `spawnDaemon`
  call (REQ-9).
- **D10**: `go test -count=1 ./cmd/musterd` is green across 5 consecutive runs (REQ-8/REQ-9 —
  the flake measured 1 red in 3 runs before this plan).
- **D11**: `go test -count=1 ./internal/server` is green across 5 consecutive runs (REQ-7).

### Web

- **W1**: A failed `start()` leaves no surviving child process, no `muster e2e-*` tmpdir and no
  open deny-stub listener (REQ-4).
- **W2**: The error a failed `start()` rejects with still names the unhealthy daemon and carries
  the captured `musterd` output (REQ-5).
- **W3**: The REQ-4 self-test exits 0 on a tree with the guard and non-zero without it — i.e. it
  actually discriminates, rather than passing either way.
- **W4**: Cleanup tolerates a partially-constructed daemon and never replaces the original
  failure with a teardown error (Edge Cases 5, 7).
- **W5**: No `web/src/` file changed (`main.ts`'s broadcast-only `railSort` stays as designed).
- **W6**: `musterdBinOverride` is optional and defaults to the existing module-relative
  `bin/musterd`, so no existing caller changes behaviour (REQ-12).
- **W7**: Only the REQ-4 self-test passes `musterdBinOverride` — no spec file uses it.

### E2E

- **E1**: The full suite passes.
- **E2**: `views.spec.ts` passes 5 consecutive runs, including E7 (REQ-6 — measured 4/5 before
  this plan).
- **E3**: The new self-test script did not require weakening any of `e2e-lint.sh`'s three rules
  (the script itself still passing is covered by D1 — `make check` runs `e2e-lint`).

### Automated Checks

```checks
D1 make check
D5 for f in internal/claudecode/version.go internal/claudecode/credentials.go internal/tmux/preflight.go internal/tmux/tmux.go internal/gitutil/gitutil.go internal/locate/spotlight.go internal/ghissue/ghissue.go; do rg -q "WaitDelay" "$f" || { echo "missing WaitDelay: $f"; exit 1; }; done
D6 git diff --quiet main -- internal/termbridge/termbridge.go
D10 for i in 1 2 3 4 5; do go test -count=1 ./cmd/musterd || exit 1; done
D11 for i in 1 2 3 4 5; do go test -count=1 ./internal/server || exit 1; done
W1 make e2e-fixture-leak-check
W5 git diff --quiet main -- web/src
E1 make e2e
E2 make web-build build && for i in 1 2 3 4 5; do (cd web && npx playwright test e2e/views.spec.ts) || exit 1; done
```

### Reviewer-Verified

- **D2**: read the new `InstalledVersion` test and confirm the stub really leaves a descendant
  holding stdout — a stub that merely sleeps *before* exiting tests the ordinary timeout, not
  this bug, and would pass without the fix.
- **D3**: the same, for `tmux.Preflight`.
- **D4**: the takeover test still asserts the marker; the repaint read did not become the
  assertion.
- **D7**: the delay constant added inside `internal/claudecode/` did not become a cross-package
  export.
- **D8**: the bound's comment names the preflight and version timeouts it clears.
- **D9**: exactly one stub `claude` is written per `cmd/musterd` package run.
- **W2**: the rethrown error preserves the original message and the captured output.
- **W3**: the self-test discriminates — confirm by reading it, or by reverting the guard locally.
- **W6**: every existing `startScratchDaemon` call site still spawns the same binary it did
  before REQ-12.
- **W7**: `musterdBinOverride` appears only in `helpers/daemon.ts` and the self-test — kept a
  reviewer check deliberately, since a negative grep for it would have to name the field in the
  plan text and `plan-lint.sh` rightly refuses a banned string the plan itself contains.
- **W4**: cleanup handles a partially-constructed daemon and does not mask the original error.
- **E3**: none of `e2e-lint.sh`'s three rules was relaxed, and the self-test lives outside
  `web/e2e/*.spec.ts` so it needs no exemption.
- **REQ-10**: `docs/conventions.md` states the pipe/`WaitDelay` rule.
- **REQ-11**: judgement on whether a drift guard is worth adding, given D5 covers today's sites.

## Implementation Notes

### Settled: how the leak self-test makes `start()` fail (REQ-12)

`ScratchDaemon.start()` resolves the binary from the module's own path
(`web/e2e/helpers/daemon.ts:44`), so a self-test cannot point it at a deliberately-unhealthy
binary without either a new option field or swapping `bin/musterd` globally. **Decided
2026-09-07 (Damian): the option field.** The global swap is what the manual repro did, and it is
unsafe as a checked-in gate — any concurrent build or E2E run would pick up the fake, and the
E2E suite runs 4 workers. One optional string on `ScratchDaemonOptions`, defaulting to today's
path, keeps every existing caller byte-identical in behaviour and makes the fixture's own
failure path exercisable rather than reviewer-read-only.

Rejected: dropping the W1 check and verifying REQ-4 by reading alone. The defect's whole
character is that it goes unnoticed until hundreds of processes pile up (~730 `musterd` and 893
tmpdirs in the census), which is precisely the class that needs a gate rather than a careful
reader.

### Measured facts this plan rests on

All in `plans/post-worktree-spike-issues/validation.md`, measured 2026-09-07 against `2aea5ee`:

- The leak is reproduced, not inferred: with `bin/musterd` replaced by `exec sleep 600`,
  `startScratchDaemon()` threw, the `muster e2e-*` tmpdir **survived**, and the calling node
  process could not exit — nothing followed the `catch` but two synchronous reads, yet it hung
  until killed at 2 minutes, because the un-killed child still held its stdio pipes.
- The takeover test is **21/21 green at HEAD** (8× alone, 10× under load at 0.60–0.61 s each,
  plus 3/3 full `go test ./...` runs). Its 11 census failures are all on trees ≤ 25, before
  `3056d6f` cut ~20 process forks out of `internal/server`. REQ-7 therefore fixes a *shape*, not
  a reproduced failure, and the plan says so: the census failures are an **empty** capture at
  5.2 s, and `websocket.Accept` (`internal/server/terminal.go:194`) completes before `s.attach`
  (line 206), so the test's immediate write races tmux's own terminal setup. The likely
  mechanism is tmux's `tcsetattr` discarding pending input during client startup, which would
  drop the marker keystrokes entirely and produce exactly that empty capture — stated as a
  hypothesis, not a measurement. Reading the initial repaint first is correct either way, and
  this codebase already treats that repaint as a known signal (`daemon.ts`'s "emits nothing
  after tmux's initial repaint"; `readUntilError`'s "tmux's own final repaint").
- `TestOnExit_Leave_LiveSessionSurvivesShutdown` failed 1 of 3 full runs at **10.02 s** —
  `spawnDaemon`'s 10 s wait for `tokens.json`, not the 15 s shutdown wait. Honest caveat: that
  run overlapped a `make build` and the leak repro, so its load exceeded a plain `make check`.
  Startup order before the write (`cmd/musterd/main.go:139–185`): tmux preflight → `checkWebDist`
  → mkdir → `store.Open` (migrations) → `bootstrapTokens` → `claude --version` under
  `versionCheckTimeout` → listen → `writeTokensFile`. Two bounded-but-blocking subprocess steps
  totalling 7 s sit under a 10 s assertion.
- E7's mechanism is read from the source, not guessed: `focusNth`
  (`web/src/main.ts:465`) reads `orderRail(store.values(), railSort)`, and `requestRailSort`
  (line 395) documents that `railSort` "only ever changes locally via the resulting `prefs`
  broadcast (INV-6), never optimistically here". The test asserts
  `expect(page.locator("#rail-sort")).toHaveValue("attention")` — the `<select>`'s own DOM value,
  which flips on `selectOption` regardless of the round trip. So ⌥⌘1 can index into the still-
  manual order and focus `prio-b`, leaving `terminalRegion(page, "prio-a")` to time out at the
  full 15 s. The TODO entry's hypothesis ("the keypress landing before the keydown listener is
  attached") is wrong and should not be implemented against.

### Findings that need no code — doc corrections only (orchestrator's Doc-Upkeep)

- TODO.md finding 2 (`TestPreflight_TooOld`): already fixed by `e0319f8`. Census failures read
  `Status` 2→1, `Version` `"3.1a"`→`""` at exactly 2.00 s — the real `tmux -V` subprocess
  exhausting `preflightTimeout`. HEAD's test is `fakePreflighter(...)`; no subprocess exists.
- TODO.md finding 3 (`actions.spec.ts:640`): already fixed by `feec502`, which replaced the
  one-shot `expect(neighbourWidthAfter).toBe(...)` (`Expected "80", Received "84"`) with
  `expect.poll(neighbourGeometry)` plus `expectAllTileGeometrySettled`. All 15 failures are on
  trees ≤ 17; every tree containing `feec502` ran 281/281. The census's "still flaked on pairs
  21, 24, 27, 28" is a grep artefact — it matched the test's name in the ✓ *pass* list.
- `theme.spec.ts` (census `log-17-M`, and `test-strategy.md`'s baseline flake): also fixed by
  `feec502`, which converted the failing `expect(await htmlTheme(page)).toBe("instrument")` to
  `expect.poll`.
- The census's headline — "16 of 25 merges had a spurious red … any automated gate will cry wolf
  on roughly one land in three" — does not hold for today's tree, and the worktree/land-queue
  design note should not be planned against it.

Doc upkeep for the orchestrator: strike findings 2 and 3 in `TODO.md` as fixed-before-this-plan
citing `validation.md`; tick the `WaitDelay`, fixture-leak and `views.spec.ts` E7 entries on
completion; record REQ-10's rule in `docs/conventions.md`; add REQ-8's lesson ("a wait bound
must clear the path's own legitimate worst case") and the `cmd/musterd` shared-stub tax to
`docs/design/test-strategy.md`. No `SPEC.md` decision changes.

### Explicitly out of scope

The suite has 81 other `expect(await …)` one-shot assertions. Most are legitimate (a settled
read, or a deliberate "it stayed unchanged" check), none is a known flake, and converting them
wholesale would weaken real assertions to chase a hypothetical. Not touched here.
