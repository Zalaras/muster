# Plan: tmux-installation

**Created**: 2026-08-31
**Status**: completed
**Work Type**: daemon
**E2E Scope**: harness-only
**Description**: Preflight tmux at startup with a legible failure and remedy, auto-open the dashboard in the default browser, and rewrite the README install story — closes #2 and #4.

## Overview

Two triaged pre-v1 issues share one seam. [#2](https://github.com/Zalaras/muster/issues/2):
on a machine without tmux, the first launch dies inside `POST /api/sessions` with a raw exec
error (`internal/server/sessions.go:165` wraps it into `500 launch_failed`, so the user reads
`spawning tmux session: tmux new-session: exec: "tmux": executable file not found in $PATH`
in the launch dialog). Nothing checks for tmux before that moment.
[#4](https://github.com/Zalaras/muster/issues/4): the GitHub Release is the only distribution
path, so `README.md` has to carry the whole install story and currently does not.

This plan adds a **startup preflight**: `musterd` verifies tmux is present and new enough
before it creates a data dir or binds a port, prints a report naming the problem, and exits
non-zero with the remedy. tmux is the only gating dependency — Claude Code's own version check
is untouched and stays warn-only, surfaced in the dashboard through `hello.claudeCode` as it is
today. `internal/tmux` owns the version knowledge; `cmd/musterd` only renders and gates.

It also adds **`-open`**, default on: after the listener is bound and `tokens.json` is written,
`musterd` runs macOS `open` on the tokenized dashboard URL so the browser comes up on its own.
Two things must both hold for it to fire: the flag, and a stdin that is a real terminal. The
second is what makes it safe by construction — every daemon spawned under test gets a
`/dev/null` stdin, so no test can open a browser even if it forgets the flag.

Folded in, because it is the same file and the same startup path: `isCharDevice`
(`cmd/musterd/main.go:398`) is not a TTY check. `/dev/null` is a character device — measured
2026-08-31, `mode=Dcrw-rw-rw- charDevice=true` — and both the E2E harness
(`stdio: ["ignore", …]`, `web/e2e/helpers/daemon.ts:420`) and `cmd/musterd/onexit_test.go`'s
subprocesses give musterd a `/dev/null` stdin. So `-on-exit=ask` enters the prompt in every
scratch daemon, and since `daemon.ts:461` escalates to `SIGKILL` after 5 s while the prompt
waits 10 s, those daemons are **force-killed and never shut down gracefully**. Replacing the
check with a real terminal test fixes both the wasted 5 s and the lost graceful shutdown.

## Requirements

### Must Have
- [ ] REQ-1: `musterd` runs a tmux preflight at startup, before the data dir is created and
      before the listen address is bound. tmux absent from `$PATH`, not executable, exiting
      non-zero, or failing to respond to `tmux -V` within 2 s is fatal: a report is printed to
      stderr and `run` returns an error naming the remedy.
- [ ] REQ-2: The preflight rejects a tmux older than **3.2**. Justification, to be cited in
      the code: `internal/tmux/tmux.go` uses `new-session -e` (`NewSession`, tmux 3.2) and
      `set-option -as terminal-features` (`serverOptions`, tmux 3.2). Below 3.2 those fail
      obscurely at first launch rather than at startup.
- [ ] REQ-3: A `tmux -V` that *runs successfully* but whose output does not parse as a version
      (`tmux master`) is **not** fatal — it prints a warning row and startup proceeds. Only a
      failure to run tmux at all is fatal. Muster cannot prove an unrecognised build is too old.
- [ ] REQ-4: tmux version detection, parsing and the 3.2 minimum live in `internal/tmux`.
      `cmd/musterd` renders the report and decides to exit; it holds no tmux knowledge.
- [ ] REQ-5: `musterd -version` succeeds on a machine with no tmux — the preflight runs after
      the `-version` early return, as `tmux.ValidateSocket` already does.
- [ ] REQ-6: New flag `-open` (bool, default **true**). Auto-open fires iff **both** `-open` is
      true **and** stdin is a real terminal (`isTerminal`, REQ-9). When it fires — after the
      listener is bound and `tokens.json` is written — `musterd` runs the `-open-cmd` program
      with the dashboard URL as its single argument. Otherwise nothing is executed. The terminal
      condition is the load-bearing one: it is what guarantees no test run can open a browser
      (Edge Cases 12 and 16), and `-open=false` is the explicit override on top of it.
- [ ] REQ-7: New flag `-open-cmd` (string, default `open`) — a test seam of exactly the kind
      `-claude-bin`, `-usage-api-url` and `-issue-token-file` already are.
- [ ] REQ-8: Auto-open never blocks startup and never delays shutdown: it runs on its own
      goroutine under a context bounded at 10 s. A missing program, a non-zero exit (macOS
      `open` with no default browser) or the timeout logs a warning and startup continues.
- [ ] REQ-9: `isCharDevice` is replaced by a real terminal check, `isTerminal(*os.File) bool`,
      built on `github.com/mattn/go-isatty` — already in the module graph as an indirect
      dependency of zerolog, so this promotes it to direct and adds nothing to `go.sum`.
      `-on-exit=ask` consults `isTerminal`, so a `/dev/null` stdin resolves to leave immediately
      instead of sitting out the 10 s prompt timeout. Auto-open (REQ-6) consults the same helper,
      which is why this fix and the browser feature are one plan and not two.
- [ ] REQ-10: The E2E harness passes `-open=false` to every scratch daemon it spawns. This is
      defence in depth, not the guarantee — REQ-6's terminal condition already covers these
      spawns, since `stdio: ["ignore", …]` gives fd 0 `/dev/null`.
- [ ] REQ-11: `cmd/musterd/onexit_test.go`'s three daemon-spawning tests pass `-open=false`,
      likewise as defence in depth over REQ-6's terminal condition.
- [ ] REQ-12: `README.md` gains a **Prerequisites** section leading with tmux, and its Install
      section carries the whole story: which of the two darwin archives to take, where the
      binary belongs, the quarantine note, and how to confirm it worked. The tmux remedy string
      is byte-identical to the one the preflight error prints.

### Should Have
- [ ] REQ-13: On an all-clear preflight nothing is printed — the detected tmux version joins
      the existing `musterd starting` log line as a `tmux` field. The report block is for
      failures and warnings only; a clean startup does not gain three lines of noise.
- [ ] REQ-14: The report's tmux row names the **resolved absolute path** (`exec.LookPath`), so
      a stale tmux earlier in `$PATH` than the Homebrew one is visible rather than mysterious.
- [ ] REQ-15: `web/e2e/helpers/daemon.ts`'s `kill()` logs a warning when its 5 s `SIGKILL`
      escalation fires, so a future regression back into a non-graceful shutdown is visible in
      the suite's output instead of silent.
- [ ] REQ-16: `.claude/skills/dev-loop/SKILL.md` notes that `make run` now opens a browser and
      that `-open=false` suppresses it.

### Nice to Have
- [ ] REQ-17: The preflight's fatal error distinguishes *not installed* from *too old* in its
      remedy (`brew install tmux` vs `brew upgrade tmux`).

## Protocol Contract

**No protocol changes.** No WS message, no HTTP endpoint, and no field of any existing message
is added, removed or changed. `docs/protocol.md` is untouched by this plan.

The deliberate consequence: tmux's absence is never reported to the dashboard, because a
musterd that fails its tmux preflight never starts serving one. Claude Code's availability
continues to reach the UI through `hello.claudeCode` (§5.1) exactly as before — this plan does
not touch `checkClaudeCode`, its severity, or its position in `run`.

## Schema Changes

No schema changes required.

## UI Specifications

No dashboard changes. The only user-facing surface this plan adds is `musterd`'s own stderr,
specified here so the implementation and its tests agree on it.

### The preflight report

Printed to stderr only when a row is not OK (REQ-13). Rows are two-space indented; exact column
padding is the implementation's call, but each row carries the marked substrings.

tmux absent — fatal:

```
musterd preflight
  x tmux    not found in $PATH

musterd: tmux is required - Muster runs every session in tmux. Install it with: brew install tmux
```

tmux too old — fatal:

```
musterd preflight
  x tmux    3.1a at /usr/local/bin/tmux - need 3.2 or newer

musterd: tmux is required - Muster runs every session in tmux. Upgrade it with: brew upgrade tmux
```

tmux unrecognised — warning, startup proceeds:

```
musterd preflight
  ? tmux    unrecognised version "master" at /opt/homebrew/bin/tmux - assuming 3.2 or newer
```

The `musterd: …` line is **not** part of the report block: the preflight returns an error and
`main`'s existing `fmt.Fprintln(os.Stderr, "musterd:", err)` prints it. Rows diagnose; the
returned error carries the verdict and the remedy. Nothing is printed twice.

### States

- **No data yet**: not applicable — the preflight is synchronous and has a result before
  anything renders.
- **Daemon down**: not applicable — this surface exists only while the daemon is starting.

### Testable UI Elements

None — this plan ships no DOM.

## Affected Files

### Daemon
- `internal/tmux/preflight.go` — **new**. `MinVersion` (3.2) and the tmux check: `exec.LookPath`,
  `tmux -V` under a 2 s context, version parsing, comparison. Returns a result struct
  (found/path/version/status), never formatted text and never an `os.Exit`.
- `cmd/musterd/preflight.go` — **new**. Renders the report block to stderr and turns a failing
  result into the error `run` returns. Holds no tmux knowledge beyond calling `internal/tmux`.
- `cmd/musterd/open.go` — **new**. `openDashboard(ctx, cmdName, url string, log zerolog.Logger)`:
  runs the program on a goroutine under a 10 s bounded context, logs a warning on any failure.
- `cmd/musterd/main.go` — `-open` and `-open-cmd` flags; the preflight call sited per the
  ordering below; `isCharDevice` replaced by `isTerminal`; the auto-open call after
  `writeTokensFile` and the `musterd starting` log line; the `tmux` field on that log line
  (REQ-13).
- `go.mod` / `go.sum` — `github.com/mattn/go-isatty` moves from the indirect block to the direct
  one (`go mod tidy`). No new module enters the graph.
- `README.md` — Prerequisites + Install rewrite (REQ-12). Owned by **daemon-impl**, because its
  tmux remedy must match the string daemon-impl writes into the preflight error.
- `.claude/skills/dev-loop/SKILL.md` — the `-open` note (REQ-16).

**Startup ordering in `run`** — load-bearing, so stated explicitly:

1. flag parse
2. `-on-exit` value validation (unchanged, and must stay first — `TestRun_InvalidOnExitValueIsRejected` depends on it)
3. `-version` early return (unchanged — REQ-5)
4. `tmux.ValidateSocket` (unchanged)
5. logger construction (unchanged)
6. **tmux preflight (new)** — fatal here, before anything below has happened
7. `checkWebDist`, `os.MkdirAll(dataDir)`, store open, tokens, `checkClaudeCode`, listen (all unchanged and all after)

### Web
None. `web/src/` is not touched by this plan.

### E2E harness (owned by e2e-specs — harness-only scope)
- `web/e2e/helpers/daemon.ts` — push the literal single argument `-open=false` into
  `spawnAndWait`'s args (REQ-10); `kill()` gains the escalation warning (REQ-15).

### Tests (owned by daemon-tests)
- `internal/tmux/preflight_test.go` — **new**. Table-driven version parsing and comparison.
- `cmd/musterd/preflight_test.go` — **new**. Report rendering; the fatal gate via a scratch
  `$PATH`; the no-side-effects assertion.
- `cmd/musterd/open_test.go` — **new**. The `-open-cmd` stub-script seam.
- `cmd/musterd/main_test.go` — `TestIsCharDevice` becomes `TestIsTerminal`, gaining the
  `/dev/null` regression case and a real-pty positive case.
- `cmd/musterd/onexit_test.go` — `-open=false` on the three spawns (REQ-11); the bounded
  assertion on the ask path (D11).

## Edge Cases

1. **`tmux -V` hangs.** Bounded at 2 s. A timeout is a *failure to run tmux*, therefore fatal
   (REQ-1) — `tmux -V` never contacts a server and is instant; a hang means the binary is
   broken, and starting anyway only defers the failure to the first launch, which is the bug
   being fixed.
2. **tmux present but not executable** (permission bits). `exec.LookPath` succeeds or the exec
   fails; either way it lands on the same fatal path as "not found", and the row shows the
   resolved path so the cause is visible (REQ-14).
3. **Version `3.10`.** Must compare **numerically**, not as a string — `"3.10" < "3.2"`
   lexically, so a string compare would reject a tmux four minor versions *newer* than the
   minimum. Parse to two integers and compare pairwise.
4. **Version `next-3.4` or `3.3a-openbsd`.** Take the first `(\d+)\.(\d+)` match: both parse.
   Trailing letters and suffixes are ignored, never compared.
5. **Version `master`.** No numeric match — REQ-3's warning row, startup proceeds.
6. **A second tmux earlier in `$PATH`.** Muster uses whatever `tmux` resolves to, which is what
   `internal/tmux` will exec later; the report prints that path so the two can never disagree
   silently.
7. **`open` is missing or fails.** Warning, startup continues (REQ-8). The dashboard URL is
   already on the `musterd starting` log line, so the user can still copy it.
8. **No default browser configured.** macOS `open` exits non-zero — same warning path as 7.
9. **`-open-cmd` points at a program that never exits.** The 10 s bounded context kills it; the
   goroutine means it never held up startup in the first place, and never delays shutdown.
10. **`-addr 127.0.0.1:0`.** The URL is built from the *actually bound* port, which is already
    how `dashboardURL` is computed — auto-open inherits that correctness for free.
11. **Restarting musterd repeatedly.** Each start opens a browser window. Accepted: the flag is
    the escape hatch, and there is no way to detect an already-open dashboard.
12. **Any daemon spawned under test.** `cmd/musterd/onexit_test.go` sets no `cmd.Stdin`, so its
    subprocesses inherit `/dev/null`; the E2E harness passes `stdio: ["ignore", …]`, which is
    also `/dev/null`. Both are non-terminals, so REQ-6's condition fails and no browser opens —
    with or without `-open=false`. This is the guarantee; the flags are the belt.
13. **`isTerminal(nil)`.** False — `cmd/musterd/main_test.go:126` passes a nil stdin to `run`
    and must keep working. A nil stdin therefore also means no auto-open.
14. **`/dev/null` stdin with `-on-exit=ask` and live sessions.** Resolves to leave immediately
    (REQ-9). This is the folded-in fix; before it, the prompt was entered and the E2E harness
    `SIGKILL`ed the daemon 5 s later, mid-shutdown.
15. **A real terminal with `-on-exit=ask`.** Unchanged — still prompts, still 10 s, still
    defaults to leave. `isTerminal` is true for a tty, which is what `isCharDevice` was
    reaching for.
16. **musterd started with no terminal at all** (launchd, a wrapper script, `run_in_background`).
    No auto-open, by REQ-6. Deliberate: it is the same condition that protects the tests, and
    the dashboard URL is on the `musterd starting` log line for anyone in that position. If
    headless auto-open is ever wanted, it is a one-line change to a tri-state flag mirroring
    `-on-exit` — explicitly not built now.
17. **Running `make test` on a machine without tmux.** `cmd/musterd/onexit_test.go` already
    requires a real tmux; the preflight turns its failure from a mid-test spawn error into a
    startup error naming the remedy.

## Acceptance Criteria

IDs are unique across the whole section.

### Daemon
- **D1**: With tmux absent from `$PATH`, `run` returns an error whose text contains
  `brew install tmux`.
- **D2**: With a tmux reporting a version below 3.2, `run` returns an error naming both the
  detected version and the 3.2 minimum.
- **D3**: With a tmux whose `-V` output does not parse, `run` proceeds past the preflight
  rather than returning an error.
- **D4**: A failed preflight leaves no side effects: the listen address is unbound and the
  data dir is not created.
- **D5**: `musterd -version` exits 0 with tmux absent from `$PATH`.
- **D6**: Version parsing and the 3.2 comparison are exercised through `internal/tmux`'s own
  exported surface, not through `cmd/musterd`.
- **D7**: Version comparison orders `3.10` above `3.2`.
- **D8**: With `-open` defaulted, a stdin that is a real terminal (a pty from `creack/pty`) and
  `-open-cmd` pointed at a stub, the stub is executed exactly once, with the dashboard URL from
  `tokens.json` as its only argument.
- **D9**: With `-open=false` and a terminal stdin, the stub is never executed.
- **D9b**: With `-open` defaulted and a `/dev/null` stdin, the stub is never executed — the
  condition that makes every test spawn browser-free without relying on a flag.
- **D10**: With `-open-cmd` naming a program that does not exist, `run` still reaches its
  serving state.
- **D11**: `-on-exit=ask` against a `/dev/null` stdin with a live session resolves to leave and
  exits well inside the 10 s prompt timeout, asserted by a bounded wait.
- **D12**: `isTerminal` returns false for `/dev/null`, false for a pipe, false for a regular
  file, false for nil, and true for a pty opened with `creack/pty`.
- **D13**: The `README.md` tmux remedy string and the preflight's not-found remedy string are
  identical.

### E2E
- **E1**: `web/e2e/helpers/daemon.ts` passes `-open=false`; combined with REQ-6's terminal
  condition, no suite run can open a browser.
- **E2**: The full Playwright suite passes.

### Automated Checks

```checks
D1 make test
D2 make lint
D3 go build ./...
D13 rg -q "brew install tmux" README.md
E1 rg -q -e "-open=false" web/e2e/helpers/daemon.ts
E2 make e2e
```

`D1 make test` is the gate for D1–D12; each has its own named Go test, listed under Affected
Files → Tests. `D13`'s grep proves README carries the string; that it *matches* the preflight's
is the reviewer's read below.

### Reviewer-Verified

- **R1**: The README remedy and the preflight error's remedy are the same string, not merely
  both present.
- **R2**: `cmd/musterd` holds no tmux version knowledge — no version literal, no parsing, no
  minimum. Grep `cmd/` for `3.2` and confirm every hit is prose.
- **R3**: The report block prints nothing on an all-clear startup (REQ-13), and the detected
  version appears on the `musterd starting` log line instead.
- **R4**: Auto-open adds no new log line carrying the UI token. The token already appears in
  `tokens.json` (0600) and in `dashboard_url` on the existing startup line; this plan must not
  add a third place.
- **R5**: `go.sum` is unchanged by the go-isatty promotion — the module was already in the
  graph.
- **R6**: A scratch E2E daemon with a live session at teardown exits on `SIGTERM` without
  tripping `kill()`'s 5 s escalation warning (REQ-15).
- **R7**: README's Prerequisites section leads with tmux, and its Install section covers arch
  choice, destination, quarantine, and verification.

## Implementation Notes

**Doc upkeep — addressed to the orchestrator, not to an impl agent.** `SPEC.md` and `TODO.md`
are the orchestrator's at Completion:

- Tick both `TODO.md` "Reported issues (pre-v1 release)" entries — #2 and #4 — keeping their
  full markdown links intact (the file's own triage rule).
- Add a `SPEC.md` changelog entry: tmux is a preflighted hard dependency with a stated 3.2
  minimum; the dashboard auto-opens by default; `isCharDevice` was not a TTY check.
- `/land` closes both issues via `closes #2` / `closes #4` in the squash subject.

**The `/dev/null` measurement** (2026-08-31, this planning session). A Go program stat-ing
`/dev/null` printed `mode=Dcrw-rw-rw- charDevice=true`. That is what makes `isCharDevice` wrong
for its purpose and why REQ-9 is in this plan rather than deferred. This is a macOS/POSIX fact,
not a Claude Code wire-format fact, so it belongs here and in the `SPEC.md` changelog — **not**
in `spikes/canary-fields.md` or `spikes/FINDINGS.md`, which are for measured Claude Code
behaviour only.

**No test run may open a browser — this is a hard condition on the plan, not a preference.**
The guarantee is REQ-6's terminal condition, which holds by construction: `onexit_test.go` sets
no `cmd.Stdin` and the E2E harness passes `stdio: ["ignore", …]`, so both hand musterd a
`/dev/null` stdin, which `isTerminal` reports false for. That is why the condition is on stdin
rather than on the flag alone — a flag-only design would put the guarantee in each test's hands,
and `cmd/musterd/onexit_test.go` is a *test* file that daemon-impl may not edit (CLAUDE.md
boundary), so between daemon-impl landing `-open` and daemon-tests landing REQ-11 a local
`make test` would have opened three browser windows. With the terminal condition there is no
such window at any point in the pipeline. Do not weaken it to "flag only", and do not have
daemon-impl edit the test to compensate. D9b is the regression test for exactly this.

**The `-open-cmd` seam.** Follow `-claude-bin`'s pattern exactly: a real default, a flag the
test replaces with a stub script that records its arguments to a file in `t.TempDir()`. Nothing
in the production path branches on being under test.

**Token in argv — accepted residual, and already true elsewhere.** The dashboard URL carries
the UI token, so `open <url>` makes it visible in `ps` to a same-user process. SPEC §2.6 already
accepts precisely this attacker ("same-user malware can read the token file — but that attacker
can read Claude credentials directly anyway"). No new exposure class; do not add a mitigation,
and do not log the argv (R4).

**Version comparison.** Two ints, compared pairwise (Edge Case 3). Resist `strings.Compare` and
resist a full semver dependency — tmux versions are not semver (`3.3a`, `next-3.4`) and the
conventions table does not carry one.

**gofmt doc-comment trap** (`docs/conventions.md` § Go). Doc comments must not contain paired
backticks or `''` — gofmt silently rewrites them to curly quotes. This plan's code will want to
mention `tmux -V` and `-open=false` in doc comments: write them bare, or keep the literal inside
the function body.

**Where the tmux knowledge boundary sits.** CLAUDE.md's hard rule names `internal/claudecode/`
explicitly, and `internal/tmux` is the same shape of boundary in practice —
`tmux.ValidateSocket` already lives there and is already called from `main`. REQ-4 keeps the new
check beside it. A preflight that grew a version literal inside `cmd/musterd` would be the same
violation in a different package (R2).
