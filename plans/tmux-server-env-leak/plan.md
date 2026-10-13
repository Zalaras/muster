# Plan: tmux-server-env-leak

**Status**: completed
**Shape**: fix
**Work Type**: daemon
**E2E Scope**: none
**Fixture plan**: none
**Features**: surfaces
**Description**: The tmux client strips `MUSTER_SESSION` from the environment it starts a tmux server with, so no pane inherits the daemon's own session identity whatever shell the daemon or a test was started from.

## Symptom

From `TODO.md` § Issues › Together — `MUSTER_SESSION` from the surrounding environment (filed
2026-10-12 by the developer from `plans/reader-expanded-persists/proposed-backlog.md`):

> **`make test` fails inside a Muster session** — run from a Claude session Muster launched,
> `TestShellRegistry_EnsurePaneEnvironmentNeverCarriesMusterSession` and
> `TestShellRegistry_RespawnsAfterExternalKillWithNoMusterSession` (`internal/server`) fail with
> `MUSTER_SESSION=[9]` where they expect `MUSTER_SESSION=[]`; with it unset they pass. They
> should pass whatever environment they run in.

> **Shell panes may inherit `MUSTER_SESSION` from the daemon's environment** — a `musterd`
> started from a terminal that already carries `MUSTER_SESSION` (a Claude session Muster
> launched) may hand it on to the shell panes it creates; not yet measured against a running
> daemon. A shell pane should never see `MUSTER_SESSION`, whatever environment the daemon was
> started in.

What the developer sees: `make check` run from a Claude session Muster launched goes red on the
two tests above and nothing else; and, unmeasured until now, a shell surface opened by a daemon
that was itself started from such a session carries the outer session's id, so a `claude` typed
into that shell would post hooks enveloped as that outer session.

## Findings

Both entries hold, with one cause. Reproduced 2026-10-13 from a Claude session Muster launched
(`MUSTER_SESSION=9` in the environment), untouched `main` at 98ff20ae:

```
$ go test -count=1 ./...
--- FAIL: TestShellRegistry_EnsurePaneEnvironmentNeverCarriesMusterSession (0.21s)
    shells_test.go:141: expected: "MUSTER_SESSION=[]"  actual: "MUSTER_SESSION=[9]"
--- FAIL: TestShellRegistry_RespawnsAfterExternalKillWithNoMusterSession (0.40s)
    shells_test.go:172: expected: "MUSTER_SESSION=[]"  actual: "MUSTER_SESSION=[9]"
FAIL	github.com/Zalaras/muster/internal/server	87.296s
```

Every other `make check` gate (lint, web-lint, web-test, contrast, e2e-lint, check-versions,
check-kb) and the plain-shell E2E spec (18/18) were green under the same environment.

Cause: a tmux server's global environment is seeded from whichever client **starts** it, and
every pane the server ever spawns inherits that global environment; the environment of later
clients does not matter. `internal/tmux/tmux.go:723` (`execSeparated`) builds every tmux
command with `exec.CommandContext` and never sets `cmd.Env`, so tmux inherits the daemon's (or
the test process's) full environment, `MUSTER_SESSION` included, and the server it starts hands
that on to every shell pane. Claude panes are unaffected because the launcher sets
`MUSTER_SESSION=<id>` per pane with `new-session -e`. Measured on a scratch socket:

```
inherit first-pane:  [9]      <- server started by a client carrying MUSTER_SESSION=9
inherit second-pane: [9]      <- a later new-session on the same server, same client env
inherit global env:  MUSTER_SESSION=9
inherit session env: unknown variable: MUSTER_SESSION
scrub   first-pane:  []       <- server started with the variable unset (env -u)
scrub   second-pane: []       <- a later new-session from a client that DOES carry it
```

So the second entry's "may" is a "does": the daemon's own `-L muster` server has the same
seeding, through the same `Client`, whenever musterd is started inside a managed pane (the dev
loop's `make run` from a Muster-launched Claude session is exactly that). The tests are right
and stay as they are; the daemon is what changes. The E2E oracle `tmuxShowEnv` reads the
per-session table (`show-environment -t`), which the probe shows never carries the inherited
value, which is why E2E stays green and blind to this.

What did not hold: nothing in either entry. The first entry's "they should pass whatever
environment they run in" is satisfied by fixing the daemon, not the tests: with the scrub in the
client, the per-test tmux server the tests start is clean too.

## Requirements

### Must Have

- **REQ-1**: A pane spawned on a tmux server the daemon's `tmux.Client` started never carries
  `MUSTER_SESSION` inherited from the daemon's own environment — whatever environment the daemon
  (or a test process) was started in. The variable reaches a pane only when a caller sets it
  explicitly per pane (`NewSession`'s `env` map, as the launcher does).
- **REQ-2**: `go test ./internal/server/` passes with `MUSTER_SESSION` set in the test runner's
  environment, with the two tests named in § Symptom unchanged.

## Affected Files

### Daemon (daemon-impl)

- `internal/tmux/tmux.go` — REQ-1: `execSeparated` sets `cmd.Env` to the process environment
  minus `MUSTER_SESSION` on every tmux invocation (the server is started by whichever call comes
  first, so the scrub belongs at the one seam every call passes through, not in a particular
  caller). The variable's name is spelled once in this package as an exported name
  `internal/server`'s guard test can compare with `claudecode.MusterSessionEnvVar`
  (`internal/tmux` must not import `internal/claudecode`: kb:diagram/daemon-components keeps
  the two adapters apart, and the TODO refactor entry on who owns the `MUSTER_SESSION` name is
  left open, not settled here).

### Existing tests this breaks

- none

## Proof

`internal/tmux/tmux_test.go`, a new test
`TestNewSession_PaneNeverInheritsMusterSessionFromTheClientEnvironment` (REQ-1), written by
**daemon-tests**. It sets `MUSTER_SESSION` in the test process with `t.Setenv` (so the test is red
on today's tree from any shell, not only a Muster-launched one), starts a session on a fresh
per-test socket with a `/bin/sh -c` command that writes `[$MUSTER_SESSION]` to a file in the
test's temp dir and sleeps (the shape of `TestNewSession_SetsExtraEnvironmentInThePane`), and
asserts the file reads `[]`. Red today:

```
expected: "[]\n"  actual: "[leaked]\n"
```

After the implementation lands, daemon-tests adds one guard test in
`internal/server/shells_test.go` asserting the name `internal/tmux` scrubs equals
`claudecode.MusterSessionEnvVar`, so the two spellings cannot drift apart.

## Edge Cases

1. The daemon's environment carries `MUSTER_SESSION` and a Claude session is launched: the pane
   still gets its own id from `new-session -e` → D2 (`TestLauncher_SuccessfulLaunchEndToEnd`'s
   pane-environment assertion in the server package runs under `make test`; the probe's second-pane
   row shows a per-pane `-e` is unaffected by the global scrub).
2. The terminal bridge attaches with the daemon's full environment (`internal/termbridge`,
   `os.Environ()`): an attach never starts a server, and tmux's default `update-environment`
   list does not include `MUSTER_SESSION`, so nothing reaches a session table → untested: tmux's
   own behaviour, and the probe's "session env: unknown variable" row already shows it.
3. The self-updater re-execs the daemon with `os.Environ()` plus `MUSTER_RESTARTED=1`: the
   restarted daemon still carries the variable, and the scrub at the tmux seam covers it the
   same way → untested: same code path as REQ-1.

## Acceptance Criteria

### Automated Checks

```checks
D1 go test -count=1 -run 'TestNewSession_PaneNeverInheritsMusterSessionFromTheClientEnvironment' ./internal/tmux/
D2 make test
D3 MUSTER_SESSION=9 go test -count=1 -run 'TestShellRegistry_(EnsurePaneEnvironmentNeverCarriesMusterSession|RespawnsAfterExternalKillWithNoMusterSession)' ./internal/server/
D4 make lint
```

### Reviewer-Verified

- **R1**: the scrub sits in `execSeparated` (the production `Client.exec` seam), so every tmux
  invocation — `new-session`, `has-session`, `kill-session`, `capture-pane`, the server-option
  calls — runs with the same scrubbed environment; no caller can start the server unscrubbed.
- **R2**: nothing else about the environment tmux receives changed (no other variable dropped,
  none added), and `NewSession`'s per-pane `env` map still reaches the pane via `-e`.

## Doc Delta

**surfaces** — becomes true:
- The shell pane carries no Muster session environment whatever environment the daemon itself was started in: the tmux client strips `MUSTER_SESSION` before any command, so the server it starts, whose global environment every pane inherits, never holds the daemon's own.

**surfaces** — stops being true:
- Nothing; the sentence "with no Muster session environment" was already the claim and now holds unconditionally.

## Out of scope

- The open refactor entry "Decide the owner of the ingest route and `MUSTER_SESSION`" — this
  plan adds a second spelling of the name in `internal/tmux`, guarded by a test, and leaves the
  ownership question where it is.
