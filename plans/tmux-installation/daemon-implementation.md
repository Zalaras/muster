# Daemon Implementation: tmux-installation

**Plan**: tmux-installation
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/tmux/preflight.go` | created | `MinVersion` (3.2), `ParsedVersion`/`ParseVersion`/`Less` (numeric compare, Edge Case 3-4), `PreflightStatus`/`PreflightResult`, `Preflight(ctx)` — LookPath, `tmux -V` under a 2s timeout, classifies OK/NotFound/TooOld/Unrecognized. Never formats text, never exits (REQ-1..4). |
| `cmd/musterd/preflight.go` | created | `runTmuxPreflight` renders `internal/tmux.Preflight`'s result to stderr per the UI spec's exact row text and turns a fatal result into the error `run` returns; `tmuxInstallRemedy` const is the single source README.md's Prerequisites section quotes byte-for-byte (D13/R1). |
| `cmd/musterd/open.go` | created | `openDashboard(ctx, cmdName, url, log)` — runs the auto-open program on its own goroutine under a 10s bounded context (REQ-6/8), logs a warning on failure that never includes `url` (R4). |
| `cmd/musterd/main.go` | modified | `-open` (bool, default true) and `-open-cmd` (string, default "open") flags; preflight call sited between logger construction and `checkWebDist` (ordering step 6); `tmux` field added to the "musterd starting" log line (REQ-13); auto-open call after that log line, gated on `*openFlag && isTerminal(stdin)`; `isCharDevice` renamed to `isTerminal`, reimplemented on `github.com/mattn/go-isatty` instead of `Stat().Mode()&os.ModeCharDevice` (REQ-9). |
| `go.mod` | modified | `go mod tidy` promoted `github.com/mattn/go-isatty` from the indirect block to the direct one; `go.sum` unchanged (verified below). |
| `README.md` | modified | New Prerequisites section (tmux 3.2+ leading, macOS, Claude Code) quoting `brew install tmux` / `brew upgrade tmux` byte-identically to `cmd/musterd/preflight.go`; Install section rewritten with arch choice, destination, quarantine note, and a `-version` verification step; Requirements table's tmux row now notes it's the dev machine's version, not the floor. |
| `.claude/skills/dev-loop/SKILL.md` | modified | Noted `make run` now auto-opens the dashboard by default and that `-open=false` suppresses it (REQ-16). |

## Decisions

- **`PreflightResult.Version` strips the "tmux" program-name prefix.** The plan's own UI
  spec rows show `3.1a at <path>` and `unrecognised version "master" at <path>` — no leading
  "tmux" — but real `tmux -V` output is `tmux 3.1a` / `tmux master`. Storing the raw string
  verbatim would have printed `tmux 3.1a at ...`, contradicting the spec's own illustrated
  rows byte-for-byte. Fixed by trimming a literal "tmux" prefix (case-sensitive, matching
  every measured real output) before storing it in `Version`; `ParseVersion` still runs
  against the untrimmed raw string so a prefix mismatch can never suppress digit matching.
  Verified against a real tmux 3.7b and against fake `tmux -V` stubs printing "tmux 3.1a"
  and "tmux master" — see the manual verification runs below, output matched the plan's
  illustrated rows exactly (`3.1a at /tmp/.../fakebin/tmux - need 3.2 or newer` and
  `unrecognised version "master" at /tmp/.../fakebin/tmux - assuming 3.2 or newer`).
- **`StatusNotFound` covers four failure shapes** (absent from `$PATH`, not executable,
  non-zero exit, and the 2s timeout) rather than one status per shape — REQ-1 groups all
  four as fatal with the same "install" remedy, and Edge Case 2 says the not-executable
  case "lands on the same fatal path as not found." The row text still distinguishes "not
  found in $PATH" (Found=false) from "found at `<path>` but did not run" (Found=true) so
  Edge Case 2/REQ-14's path-visibility requirement holds without inventing four remedy
  strings the plan never specified.
- **The preflight call passes `context.Background()`, not a shared outer ctx.** The
  Affected Files ordering puts the preflight (step 6) before `run`'s own `ctx, cancel :=
  context.WithCancel(...)` is constructed (step 7, alongside `MkdirAll`). `Preflight` applies
  its own 2s bound internally, so no outer context was needed at that point in `run`.

## Handoff

**Build status**: `go build ./...` exits 0 (verified — see command output during this session).

**Sanctioned test breakage** (per the plan's Implementation Notes, not mine to fix):
`cmd/musterd/main_test.go` — `TestIsCharDevice` (lines 51-71) calls the now-renamed
`isCharDevice`; `go vet ./cmd/musterd/...` and `golangci-lint run ./cmd/musterd/...` both fail
on `undefined: isCharDevice` in this file only (confirmed: `internal/tmux` and every other
package vet/lint clean). The plan's Affected Files > Tests section already assigns this
rename to daemon-tests ("`TestIsCharDevice` becomes `TestIsTerminal`, gaining the `/dev/null`
regression case and a real-pty positive case"), and CLAUDE.md's test-file boundary is why
daemon-impl doesn't touch it. `cmd/musterd/onexit_test.go` (REQ-11, `-open=false` on the three
spawns) is likewise untouched — also daemon-tests' file per the plan.

## Manual verification (ad-hoc probes, cleaned up after each — no tmux socket litter)

All done against a `go build -o /tmp/musterd-check ./cmd/musterd` binary (removed at the end)
and scratch `-data-dir`/`-web-dist` directories under `mktemp -d` (all removed):

- **D1/D4/D5** (tmux absent from a scratch `$PATH`): exit 1, stderr:
  ```
  musterd preflight
    x tmux    not found in $PATH

  musterd: tmux is required - Muster runs every session in tmux. Install it with: brew install tmux
  ```
  `ls <data-dir>` afterward: "No such file or directory" (D4: no side effects).
  `musterd -version` with the same empty `$PATH`: exits 0, prints the version line (D5).
- **D2** (fake `tmux -V` printing "tmux 3.1a"): exit 1, stderr:
  ```
  musterd preflight
    x tmux    3.1a at /tmp/.../fakebin/tmux - need 3.2 or newer

  musterd: tmux is required - Muster runs every session in tmux. Upgrade it with: brew upgrade tmux
  ```
- **D3** (fake `tmux -V` printing "tmux master"): stderr shows the warning row
  (`? tmux    unrecognised version "master" at /tmp/.../fakebin/tmux - assuming 3.2 or newer`)
  and the process proceeds — `tokens.json` and the rest of `<data-dir>` were written, and the
  "musterd starting" log line carries `tmux=master`.
- **R3** (real tmux 3.7b, all-clear): no "musterd preflight" block in stderr at all; the
  "musterd starting" log line carries `tmux=3.7b`.
- **D8** (real pty stdin via `creack/pty`, `-open` defaulted, `-open-cmd` a stub script):
  stub's recorded argv was exactly the `dashboardUrl` from `tokens.json`, written exactly
  once.
- **D9** (`-open=false`, same pty stdin, same stub): stub's record file never created
  (`os.ReadFile` returned "no such file or directory").
- **D9b** (default `-open`, `/dev/null` stdin — `cmd.Stdin` left nil): stub's record file
  never created.
- **D10** (`-open-cmd` pointed at a nonexistent path, pty stdin): daemon still reached serving
  state — `tokens.json` was written with a populated `dashboardUrl` — and stderr logged
  `WRN could not auto-open the dashboard error="fork/exec ...: no such file or directory"
  open_cmd=/nonexistent-binary-xyz-does-not-exist`, confirming R4: the warning line carries
  `open_cmd` but never the URL.
- **D12** (`isatty.IsTerminal` directly): `/dev/null` → false, a pipe → false, a regular
  temp file → false, both ends of a `creack/pty` pty → true.
- **The `/dev/null` charDevice fact this plan cites**: re-measured directly —
  `os.Open("/dev/null")`'s `Stat().Mode()` prints `Dcrw-rw-rw-` with
  `Mode()&os.ModeCharDevice != 0` true, confirming the old `isCharDevice` would have
  wrongly treated a `/dev/null` stdin as a terminal; `isTerminal` (via go-isatty) reports
  false for the same file, per D12 above.
- **go.sum**: `git diff go.mod go.sum` after `go mod tidy` shows only `go.mod` moving
  `github.com/mattn/go-isatty` from the indirect block to the direct one — `go.sum` has zero
  diff lines (R5).
- Every ad-hoc daemon spawned above used the default `-tmux-socket` (named socket, tmux's
  own socket dir) and never called `POST /api/sessions`, so none of them ever created a live
  tmux session or socket to clean up; `tmux -L muster ls` still reports "no server running"
  and no new files appeared under `/private/tmp/tmux-*/` from this session's work.

## Fix Attempt 1 (implementation bug, not review)

**Failures addressed**: `make lint` govet shadow findings —
```
cmd/musterd/main.go:123:5: shadow: declaration of "err" shadows declaration at line 118 (govet)
	if err := checkWebDist(*webDist, log); err != nil {
	   ^
cmd/musterd/main.go:127:5: shadow: declaration of "err" shadows declaration at line 118 (govet)
	if err := os.MkdirAll(*dataDir, 0o700); err != nil {
	   ^
2 issues:
* govet: 2
make: *** [lint] Error 1
```

**Root cause**: `preflight, err := runTmuxPreflight(...)` at (then) line 118 was the first
place `run()` declared `err` outside any `if`/`select` initializer, so it lived in `run`'s
own block scope. Every later `if err := ...; err != nil {` in the function — a Go idiom used
throughout `run()` — creates its own inner scope and therefore shadows that outer `err`.

**Every site in `run()` that could shadow the outer `err`, enumerated by grep, and its
disposition after the fix**:
- `checkWebDist` (`if err := ...`) — govet-reported. Fixed (outer `err` no longer exists at
  this point).
- `os.MkdirAll` (`if err := ...`) — govet-reported. Fixed (same reason).
- `st, err := store.Open(...)` — top-level `:=`, not `if`-scoped, so this was always going to
  become the *actual* first outer-scope `err` declaration in `run()` once preflight stopped
  claiming that slot. Not a shadow site itself.
- `uiToken, ingestToken, err := bootstrapTokens(...)` — top-level `:=`, reuses the outer `err`
  from `store.Open` (one new var, `uiToken`/`ingestToken`, alongside a reused `err` — no
  shadow).
- `ln, err := lc.Listen(...)` — same: reuses outer `err`, no shadow.
- `if err = writeTokensFile(...); err != nil` — plain `=`, assigns the existing outer `err`,
  no new declaration, no shadow.
- `hookScript, statusLineScript, legacyScript, err := claudecode.WriteWrapperScripts(...)` —
  reuses outer `err`, no shadow.
- `case err := <-serveErr:` inside the shutdown `select` — new scope, would shadow the outer
  `err` from `store.Open` onward. Pre-existing before this plan's preflight insertion (unaffected by my fix — `go vet ./...` and `make lint` both come back clean after the fix, confirmed below, so this is not currently flagged) and out of this plan's scope to touch.
- `if err := httpServer.Shutdown(shutdownCtx); err != nil` — same as the `select` case: a
  pre-existing `if err :=` shadowing the `store.Open` outer `err`, not something this plan's
  preflight change introduced or that `make lint` currently flags.

**Fix applied**: renamed the preflight call's error variable from `err` to `preflightErr`
(`cmd/musterd/main.go`, around what is now line 115-123), so `run()` gains no outer-scope
`err` at all until `store.Open` — matching the pre-existing pattern this plan's insertion had
disrupted. No inner `if err :=` blocks were touched, per the prompt's preference for scoping
the new declaration over renaming the many existing ones.

**Verification** (paste of actual command output, not asserted):
```
$ go build ./...
(exit 0, no output)

$ go vet ./...
(exit 0, no output)

$ make lint
golangci-lint run
0 issues.
```

**Files touched**: `cmd/musterd/main.go` only — the five daemon-tests files listed in the
prompt (`internal/tmux/preflight_test.go`, `cmd/musterd/preflight_test.go`,
`cmd/musterd/open_test.go`, `cmd/musterd/main_test.go`, `cmd/musterd/onexit_test.go`) were left
untouched, staged, and uncommitted, as instructed.
