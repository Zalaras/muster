# Daemon Implementation: post-worktree-spike-issues

**Plan**: post-worktree-spike-issues
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/claudecode/version.go` | modified | REQ-1/REQ-2: `InstalledVersion`'s `exec.CommandContext(...).Output()` now sets `cmd.WaitDelay = 2*time.Second` before calling `Output()`, so a `claude --version` whose descendant holds stdout open after the process itself is killed on ctx expiry still returns instead of hanging musterd's startup. |
| `internal/claudecode/credentials.go` | modified | REQ-1: same `WaitDelay` added to `RunCommand`'s `cmd.Stdout = &stdout` + `Run()` pattern (the Keychain `security` invocation). |
| `internal/tmux/preflight.go` | modified | REQ-1/REQ-3: `runCommand` (the seam `Preflight` uses for `tmux -V`) gets `cmd.WaitDelay`; the doc comment that wrongly asserted "Output returns once the process is killed" is corrected to describe the actual WaitDelay-bounded behaviour. |
| `internal/tmux/tmux.go` | modified | REQ-1: both subprocess sites — `run()`'s `CombinedOutput()` and `runCapture()`'s `Stdout`/`Stderr` buffer pair + `Run()` — get `cmd.WaitDelay`. Added `"time"` import. |
| `internal/gitutil/gitutil.go` | modified | REQ-1: `runGit`'s `Output()` call gets `cmd.WaitDelay`. Added `"time"` import. |
| `internal/locate/spotlight.go` | modified | REQ-1: `runMdfind`'s `cmd.Stdout` buffer + `Run()` gets `cmd.WaitDelay`. |
| `internal/ghissue/ghissue.go` | modified | REQ-1: `RunCommand`'s `Stdout`/`Stderr` buffer pair + `Run()` gets `cmd.WaitDelay`. |

All seven sites use the same value (`2 * time.Second`) and the same one-line rationale
comment repeated verbatim per plan's Implementation Notes ("Pick one delay constant and one
rationale comment ... a repeated one-liner, not a new shared helper package") — no shared
helper package was added, and no constant or symbol crossed a package boundary.

`internal/termbridge/termbridge.go` and `cmd/musterd/open.go` are untouched (REQ-1's
exclusions) — verified with `git diff --quiet main -- <path>`, both exit 0.

## Decisions

- Used an inline literal `2 * time.Second` at each call site rather than a named package
  constant. Two of the seven sites share a package with another site already touched
  (`internal/claudecode`: version.go + credentials.go; `internal/tmux`: preflight.go +
  tmux.go), so a named `const` would either collide (same name, same package, defined
  twice — a compile error) or need an arbitrary per-file name. An inline literal with a
  repeated comment matches the plan's explicit "repeated one-liner, not a new shared
  helper package" instruction without introducing that naming question. Verified no
  collision risk applies to a literal: `go build ./...` and `go vet ./...` both exit 0.
- REQ-10 (`docs/conventions.md` gains the WaitDelay rule): the plan's own Implementation
  Notes assign this to the orchestrator's doc-upkeep pass ("record REQ-10's rule in
  `docs/conventions.md`" under that heading, not under any agent's Affected Files entry),
  and the first daemon-impl subagent run correctly left it out on that basis. The
  team-lead's dispatch to daemon-impl for this plan explicitly named REQ-10
  (`docs/conventions.md`) as in-scope, so it was done here after all rather than deferred a
  second time — added a bullet to the Go section's `context.Context` rule stating the
  `exec.CommandContext` + pipe + `WaitDelay` rule (`docs/conventions.md`), committed
  separately as `db2eced`. `go build ./...` still exits 0 after the doc-only change.
- `cmd/musterd`'s REQ-8 (10s wait bound, arithmetic comment) and REQ-9 (shared stub
  `claude`) are listed under "Daemon — tests" in Affected Files (`cmd/musterd/onexit_test.go`,
  `cmd/musterd/open_test.go`), not "Daemon — implementation". Not touched here; that's
  daemon-tests' scope.

## Handoff

**Build status**: `go build ./...` exits 0.

No test files were touched or need changes. `go vet ./...` clean, `make lint` reports
"0 issues", and the existing test suites for every touched package
(`internal/claudecode`, `internal/tmux` + `tmuxtest`, `internal/gitutil`,
`internal/locate`, `internal/ghissue`) pass unchanged (D1):

```
ok  	github.com/Zalaras/muster/internal/claudecode	4.269s
ok  	github.com/Zalaras/muster/internal/tmux	5.351s
ok  	github.com/Zalaras/muster/internal/tmux/tmuxtest	2.793s
ok  	github.com/Zalaras/muster/internal/gitutil	4.676s
ok  	github.com/Zalaras/muster/internal/locate	2.093s
ok  	github.com/Zalaras/muster/internal/ghissue	0.758s
```

daemon-tests still needs to add the REQ-2/REQ-3 stub-descendant-holds-stdout tests
(`version_test.go`, `preflight_test.go`) that exercise the new `WaitDelay` behaviour, plus
the REQ-7/REQ-8/REQ-9 work in `internal/server/terminal_test.go`,
`cmd/musterd/onexit_test.go`, and `cmd/musterd/open_test.go` — none of that is implemented
by this agent, per the plan's Affected Files split.

## Fix Attempt 1 (review cycle 1)

**Failures addressed**: review.md Minor 1 (`[daemon-impl]`) — the `WaitDelay` rationale in
`docs/conventions.md:31-36` and in all seven per-site comments claimed the hang scenario
"even though the context is already done" / "once ctx has killed the process itself", i.e.
that the timer needs the context to fire. `TestInstalledVersion_DescendantHoldingStdoutDoesNotHangStartup`
runs under `context.Background()` (never cancelled) and still returns via `WaitDelay`'s
second trigger (`Wait` observing the child exit) — so the shipped rationale contradicted
the shipped test, and a future author reading it under a long-lived/`Background` context
would wrongly conclude the rule doesn't apply to them.

**Changes made**: reworded the rationale in all eight locations to state both triggers
("the timer starts when the context is done or when `Wait` sees the child exit, whichever
comes first") and to say explicitly that the grandchild/held-pipe case does not require the
context to fire. No behaviour or test changes — comments and one doc bullet only, per the
review issue's own scope note.

| File | What changed |
|------|--------------|
| `docs/conventions.md:31-36` | Reworded the second sentence of the `WaitDelay` rule per the review's suggested wording. |
| `internal/claudecode/version.go:33-38` | Reworded `InstalledVersion`'s `WaitDelay` comment. |
| `internal/claudecode/credentials.go:36-40` | Reworded `RunCommand`'s `WaitDelay` comment. |
| `internal/tmux/tmux.go:301-305` | Reworded `run`'s `WaitDelay` comment. |
| `internal/tmux/tmux.go:322-326` (now shifted a line by the first edit) | Reworded `runCapture`'s `WaitDelay` comment. |
| `internal/gitutil/gitutil.go:52-56` | Reworded `runGit`'s `WaitDelay` comment. |
| `internal/locate/spotlight.go:36-40` | Reworded `runMdfind`'s `WaitDelay` comment. |
| `internal/ghissue/ghissue.go:62-66` | Reworded `RunCommand`'s `WaitDelay` comment. |
| `internal/tmux/preflight.go:35-39` | Smallest change of the eight (reviewer noted it was already closest to right): replaced "past the kill" / "past ctx's deadline plus the delay" framing with the two-trigger wording and an explicit "even if ctx never fires" clause. |

**Verification — grep proving the narrowed phrasing is gone everywhere:**

```
$ grep -rn "once ctx has killed" docs/ internal/
(no output, exit 1)
$ grep -rn "context is already done\|ctx's deadline achieves nothing\|past ctx's deadline plus the delay" \
    docs/conventions.md internal/claudecode/version.go internal/claudecode/credentials.go \
    internal/tmux/tmux.go internal/gitutil/gitutil.go internal/locate/spotlight.go \
    internal/ghissue/ghissue.go internal/tmux/preflight.go
(no output, exit 1)
```

**Gate**:

```
$ go build ./...
(exit 0)
$ make lint
golangci-lint run
0 issues.
$ gofmt -l internal/claudecode/version.go internal/claudecode/credentials.go internal/tmux/tmux.go \
    internal/gitutil/gitutil.go internal/locate/spotlight.go internal/ghissue/ghissue.go internal/tmux/preflight.go
(no output, exit 0)
```

Scope check: no test files touched (`internal/claudecode/version_test.go`,
`internal/tmux/preflight_test.go` untouched — verified by this diff containing no edits to
either); nothing under `web/` touched; no `cmd.WaitDelay` value changed, comments only.
