# Plan: claude-version-watch

**Status**: completed
**Shape**: fix
**Work Type**: full-stack
**E2E Scope**: new-specs
**Fixture plan**: claude-version.spec.ts startDaemon (the stub's `--version` must answer slowly for one daemon only, a new per-daemon knob beside `stubClaudeVersion`)
**Features**: connection, issue
**Touches**: usage
**Description**: The daemon checks the Claude Code version off its startup path, re-checks it whenever the `claude` binary file changes, and pushes the result to open dashboards, so a slow first run of a new binary neither stalls startup nor leaves the readout unknown.

## Symptom

From `TODO.md` § Together — launching a session (#81, #68):

> **Taking long time to launch a new session** ([#81](https://github.com/Zalaras/muster/issues/81)) — a
> newly launched session took a long time to come up, with six live sessions at the time, and
> musterd logged the model check failing for every model in the launch dialog:
> `model-catalog check failed; unchecked error="context deadline exceeded"` for `haiku`,
> `fable`, `sonnet` and `opus`. A launch should be ready promptly, and the model check should
> complete. #89 logs a call to Claude Code being killed the same
> way; the two may share a fix.

And [#89](https://github.com/Zalaras/muster/issues/89), "Getting error running claude --version":
`could not determine claude code version error="running claude --version: signal: killed"` — the
masthead then reads "Claude installation unknown" until the daemon restarts.

## Findings

Measured 2026-10-15 on the developer's machine (darwin, x86_64, Claude Code 2.1.300, six live
`claude` processes, load ≈ 2.3):

```
claude --version (installed binary, 3 runs):        real 0.02 / 0.02 / 0.02
model pre-check, haiku (2 runs):                     real 1.02 / 0.99
four model pre-checks at once (haiku fable sonnet opus): 1.22 1.22 1.23 1.23
fresh copy of the 2.1.300 binary, --version:         real 10.71 user 0.00   then 0.03, 0.03
another fresh copy, model pre-check:                 real 11.01 user 0.39   then 0.87
fresh copy killed at 3 s, then --version:            real 7.02              then 0.04
```

The claim held with a different cause. Load and the six sessions are not it. The first run of a
newly written `claude` binary takes ~11 s with no CPU of its own: macOS checks the file before
exec. Every later run is normal, and killing the first run does not reset that cost; it keeps
going (3 s + 7 s). Claude Code updates itself in the background
(`~/.local/share/claude/versions/2.1.296` landed 10:04 SAST on 2026-10-12, just before #81 was
filed), so the first daemon process to exec the new file pays it:

- #81: the dialog's four model checks (`internal/claudecode/modelcheck.go:63`,
  `modelCheckTimeout` 5 s) all die at 5 s, nothing is cached, and the session's own `claude`
  then waits out the rest of the check. The developer dropped changing the model-check timeout:
  it moves the wait without shortening it. What shortens it is running the binary once as soon
  as it appears, before anyone launches (REQ-3).
- #89: `cmd/musterd/main.go:373` runs the version check before `Listen` with
  `versionCheckTimeout` 5 s (`cmd/musterd/claudeversion.go:15`). A first run of a new binary at
  startup stalls the daemon 5 s and is then killed; `hello.claudeCode` says `unknown` for the
  daemon's whole life, since the version is only ever read at startup and only ever reaches the
  dashboard in `hello`, which is sent once per connection (`web/src/features/connection.ts:164`).

The kb:adr/launch-model-check-cached-per-binary-identity consequence "the first dialog open
after an update pays about a second" does not hold: it pays ~11 s and times out.

## Requirements

### Must Have

- **REQ-1**: The daemon serves (its startup log line, `/healthz`, the dashboard) without
  waiting for the Claude Code version check, however long `claude --version` takes. The check
  runs in the background with a 30 s bound; until it finishes, `hello.claudeCode` reports
  `status: "unknown"`, `installed: null`.
- **REQ-2**: When the check finishes with a value different from the one the daemon holds, every
  connected dashboard receives it in a `claudeCode` message and the masthead readout re-renders
  from it without a page refresh. A dashboard connecting later gets it in `hello`.
- **REQ-3**: The daemon re-checks the version whenever the resolved `-claude-bin` file's
  identity (path after symlinks, size, mtime — `claudecode.ResolveBinaryIdentity`) changes,
  looking every 30 s; looking is a stat, never a `claude` run. A changed identity runs
  `claude --version` once in the background, which is also what makes macOS check the new file
  before the next launch. A changed result is pushed as in REQ-2.
- **REQ-4**: An issue captured from the dashboard carries the daemon's latest version result,
  not the startup one.
- **REQ-5** (added at /land, 2026-10-15, the developer's call on browser review Note 2): the
  masthead controls left of `#claude-version` (Issue, Settings, refresh, usage readouts) do not
  move when the readout's text changes live, and the masthead fits wherever it fitted before.
  Amended after browser review cycle 3 (decisions/readout-reserved-width): the unknown state
  reads "claude unknown" (hover text explains it), and the readout reserves the widest version
  text's width, right-aligned.
- **REQ-6** (added at /land, 2026-10-15, the developer's call on cycle-2 review Note 1): when the
  `claude` binary cannot be resolved, the warn line says the binary could not be resolved and
  that the last result is kept, and carries the held result's `status` (and `installed` when
  held) rather than `status: unknown`.

## Protocol Contract

Approved by the developer in the planning session (2026-10-15) as part of this small track.
Additive, no protocol version bump (kb:adr/connection-protocol-bumps-only-on-shape-change).

New WS message, beside `claudeTheme`:

```jsonc
{ "type": "claudeCode", "claudeCode": { "installed": "2.1.300", "floor": "2.1.246", "verified": "2.1.300", "status": "verified" } }
```

- `claudeCode` — the same object, same field rules, as `hello.claudeCode`.
- Sent only when the daemon's result changed since the last one it held — never per look,
  never with a timestamp. The first value a client sees is `hello.claudeCode`, so a reconnect
  needs no replay.

`hello.claudeCode` changes meaning, not shape: it is the daemon's **latest** check result, not
the startup one; `unknown` also covers "not checked yet".

## Affected Files

### Daemon (daemon-impl)

- `cmd/musterd/main.go`, `cmd/musterd/claudeversion.go` — REQ-1: the version check leaves
  `prepareServing`'s pre-`Listen` path; its log line moves with it.
- `internal/server/claudeversion.go` (new, feature file, `themepoll.go`'s shape) — REQ-1–3:
  holds the latest `ClaudeCodeInfo` under a mutex, runs the first check after listen and the
  identity look every 30 s (interval and the check/identify seams injectable for tests),
  broadcasts `claudeCode` on change. Logs each result as `checkClaudeCode` does today.
- `internal/server/server.go`, `internal/server/ws.go` — REQ-1/2: `hello` reads the feature's
  current value; `Config.ClaudeCode` gives way to what the feature needs (the binary).
- `internal/server/issue.go`, `internal/server/issuesnapshot.go` — REQ-4: read the current value
  at capture time.

### Web (web-impl)

- `web/src/style.css` — REQ-5: `.claude-version` reserves its widest text's width, content right-aligned.

- `web/src/protocol/messages.ts` (+ the `hello.ts` parser reused) — REQ-2: parse `claudeCode`.
- `web/src/features/connection.ts`, `web/src/wsapp.ts` — REQ-2: re-render `#claude-version` on it.

- `internal/server/claudeversion.go` — REQ-6: the unresolved-identity log line (daemon-impl).

### Existing tests this breaks

- `cmd/musterd/main_test.go` (`checkClaudeCode` cases at :216, :244): the function moves; the
  cases move with it to `internal/server`'s tests (daemon-tests).
- `internal/server` tests that build `Config{ClaudeCode: …}` and assert `hello` / the issue
  snapshot: they set the value through the new feature instead (daemon-tests).

## Proof

`web/e2e/claude-version.spec.ts`, a new test written by **e2e-specs**: a `startDaemon` whose stub
`claude` sleeps 7 s before answering `--version` (a new per-daemon knob in `helpers/daemon.ts`,
like `stubClaudeVersion`; 7 s is past today's 5 s bound and inside the new 30 s one). It asserts
the daemon is serving within 3 s of spawn, opens the dashboard, and expects `#claude-version` to
read `claude <stub version>` within 15 s with no reload. Red today: startup blocks 5 s, the check
is killed, and the readout stays "Claude installation unknown".

After green, daemon-tests pins REQ-3 and REQ-4 with unit tests on the new feature: an identity
change runs one check and broadcasts once; an unchanged identity runs none; an unchanged result
broadcasts nothing; the issue snapshot reads the latest value.

REQ-5: e2e-specs extends the slow-`--version` test (or adds one beside it) to assert
`#settings-button`'s bounding box x is unchanged from before the readout flips to after.
REQ-6: daemon-tests updates `TestClaudeVersion_UnresolvableIdentityLogsOncePerUnresolvedStretch`
to assert the new message and the held status.

## Edge Cases

1. The check fails or times out → `unknown` stays, nothing is broadcast if it was already
   `unknown` → D2.
2. The binary changes while a check is running → the look waits for it; the next look sees the
   new identity again and checks once more → D2.
3. The binary disappears (an update mid-swap) → identity fails to resolve; no check runs, the
   held value stays, the next look retries → D2 (shared with edge case 1).
4. Normal startup (`--version` in 20 ms) → the readout shows the version on first paint with no
   visible `unknown` → E1 (existing claude-version specs stay green).

## Acceptance Criteria

### Automated Checks

```checks
E1 cd web && npx playwright test e2e/claude-version.spec.ts
D1 go test -count=1 ./cmd/musterd/ ./internal/server/
D2 go test -count=1 -run 'ClaudeVersion' ./internal/server/
D3 make lint
W1 make web-lint
W2 make web-test
```

### Reviewer-Verified

- No `claude` subprocess runs on the request path or before `Listen`; the identity look is a stat.
- The new feature follows `themepoll.go`: registered in `New`, no logic in `server.go`.

## Doc Delta

**connection** — becomes true:
- The Claude version readout updates live: the daemon checks the version in the background after it starts serving, re-checks whenever the `claude` binary file changes, and pushes each new result in a `claudeCode` message.
- `hello.claudeCode` is the latest result; `unknown` also covers "not checked yet".
- A daemon that cannot resolve `claude` logs "could not resolve the claude binary; keeping the last claude code version result" once per unresolved stretch, carrying the held result's status (REQ-6).
- The readout keeps one width whatever it shows (the widest realistic version plus its glyph), right-aligned, so the masthead controls beside it hold still (REQ-5).
- The unknown state reads "claude unknown" (was "Claude installation unknown"), with hover text "The Claude Code version check failed or hasn't completed yet" (REQ-5, decisions/readout-reserved-width).

**connection** — stops being true:
- The version is classified once, at daemon startup.

Records (the planning session writes these, accepted):
- fact: the first run of a newly written `claude` binary costs ~11 s on macOS, with no CPU of its own; killing it does not reset the cost (measured 2.1.300, darwin x86_64).
- ADR superseding kb:adr/launch-model-check-cached-per-binary-identity: same decision, with the first-run cost corrected and the version watch's warm-up named.
- ADR: the Claude Code version is checked off the startup path, re-checked on a binary identity change, and pushed live.

## Out of scope

- The model-check timeout (dropped by the developer).
- #88 (restart sessions onto the latest Claude version) — this only makes the readout current.
