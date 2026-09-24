# Daemon Implementation: Maintainability Cleanup — Unit D8 (cmd/musterd layout)

**Plan**: maintainability-cleanup
**Mode**: initial
**Pack**: not run for this unit — briefed directly by the team lead with the exact finding
IDs read in full: `review.maintainability.c-adapters.md` Minor 13 (file layout), Minor 14
(`-help` plan-ID strings), Minor 9 (`-version` format's single owner), and the Seed check
M1 note (`run`/`parseFlags` funlen already settled, real content is Minor 13). Also read
`cmd/musterd/CLAUDE.md` (preflight.go named as the exemplar) and
`daemon-implementation-D7a.md` for D7a's just-landed `selfupdate.CheckNewer`/`MayApply`
that `cmd/musterd/update.go` already calls (no D8 change needed there).

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `cmd/musterd/onexit.go` | created | **Pure move**: `onExitPromptTimeout`, `shutdownGracefully`, `onExitDecision`/`onExitLeave`/`onExitKill`, `resolveOnExit`, `isTerminal`, `askKillPrompt` — the on-exit step whose tests already live in `onexit_test.go` (Minor 13). One wording fix in `askKillPrompt`'s doc comment: "Damian accepted it" → "the developer accepted it" (repo's "the developer" convention; this was the `main.go:768` comment the plan named). |
| `cmd/musterd/webdist.go` | created | **Pure move**, byte-identical: `checkWebDist` — the web-dist step whose tests already live in `webdist_test.go` (Minor 13). |
| `cmd/musterd/tokens.go` | created | **Pure move**, byte-identical: `bootstrapTokens`, `getOrCreateToken`, `randomToken`, `tokensFile`, `writeTokensFile` — the token-bootstrap step (Minor 13). `keychainUser` stays in `main.go`: it has no dedicated test (unlike the other three steps) and is wired inline into `buildServerConfig`'s usage config, which stays "wiring" in main.go. |
| `cmd/musterd/claudeversion.go` | created | **Pure move**, byte-identical: `versionCheckTimeout`, `checkClaudeCode` — the Claude Code version-check/render step (Minor 13). |
| `cmd/musterd/main.go` | modified | Removed the four moved chunks and their now-unused imports (`bufio`, `crypto/rand`, `encoding/hex`, `encoding/json`, `io/fs`, `strings`, `github.com/mattn/go-isatty`). 791 → 487 lines; the filelen warning is gone (`make size-warn` no longer flags it). `-help` strings at the five lines Minor 14 named (`-claude-bin`, `-tmux-socket`, `-open`, `-open-cmd`, `-update`) had their plan-ID tokens (`REQ-19`, `m2-terminal REQ-5`, `REQ-6`, `REQ-7`, `REQ-22`) removed; every flag's stated meaning is unchanged (see Handoff for the before/after `-help` text). Minor 9: the `-version` printer now builds off `selfupdate.VersionLinePrefix` instead of hand-spelling `"musterd "`. `run`/`parseFlags` are untouched (M1: already phased, kept per kb:adr/process-size-linters-warn-never-fail). |
| `internal/selfupdate/exeversion.go` | modified | Minor 9: added exported `VersionLinePrefix = "musterd "`; `versionPattern` is now built from it (`regexp.QuoteMeta(VersionLinePrefix) + ...`) instead of hand-spelling the same literal a second time. `cmd/musterd/main.go`'s `-version` printer and this file's probe regex now consult one declaration. |

## Decisions

Every REQ this unit's scope covers (Minor 9, Minor 13, Minor 14, the `main.go:768` comment)
is done above; nothing deliberately skipped.

- **File split follows the siblings' one-step-per-file shape exactly** (`open.go`,
  `preflight.go`, `update.go` — each one startup step, tests in a same-named `_test.go`).
  `rg -n '^func ' cmd/musterd/*.go` before this change showed every existing non-`main.go`
  file already followed this pattern; the fix makes `main.go`'s four remaining steps do the
  same rather than inventing a different grouping.
- **`keychainUser` stays in `main.go`, not `tokens.go`.** It has no dedicated test file
  (`grep -n 'keychainUser' cmd/musterd/*_test.go` → no hits) and is a one-line piece of
  `buildServerConfig`'s usage-config wiring, not part of the UI/ingest token-bootstrap step
  Minor 13 named (`main.go:598-667`); `keychainUser` sits at `main.go:669-680`, just outside
  that range. Minor 13's fix criterion is "each startup step **with its own test file**
  gets its own source file … main.go keeps flags, run and wiring" — keychainUser has no
  test file of its own, so it stays as wiring.
- **`-help` text: removed only the plan-ID tokens, kept every flag's meaning** (Minor 14
  said "no `-help` string names a plan ID", not "no explanatory clause"). Before/after
  pasted in Handoff.
- **`versionCheckTimeout` moved with `checkClaudeCode` into `claudeversion.go`** even though
  it's also read from `prepareServing` in `main.go` (`versionCtx, versionCancel :=
  context.WithTimeout(ctx, versionCheckTimeout)`) — same package, no import needed, and it
  bounds exactly the one check `claudeversion.go` now owns.
- **Minor 9's fix lives in `internal/selfupdate`, not `cmd/musterd`.** `cmd/musterd` (package
  `main`) can't be imported by `internal/selfupdate`, so the shared declaration has to sit on
  the side either function can reach: `selfupdate` already owns "release knowledge" and the
  probe regex (kb:adr/update-release-knowledge-in-selfupdate-package), so `VersionLinePrefix`
  joins it there and `cmd/musterd`'s printer imports `selfupdate` (already imported) to use
  it. Only the literal prefix `"musterd "` is shared, not the trailing `"(Claude Code
  verified %s)"` clause — that part is display-only and irrelevant to what the probe parses.
- doc-delta: none. No feature spec or `docs/protocol.md` sentence describes `cmd/musterd`'s
  internal file layout, the `-help` string wording, or the `-version` line's internal
  composition — the printed `-version` output and every `-help` flag's documented behaviour
  are byte-for-byte unchanged except the plan-ID token removal itself, which is user-visible
  `-help` text, not a doc claim.

## Handoff

**Build status**: `go build ./...` exits 0.

```
$ gofmt -l cmd/musterd internal/selfupdate
(no output)

$ go build ./...
(exit 0)

$ go vet ./...
(no output)

$ golangci-lint run
0 issues.

$ golangci-lint run --tests=false ./...
0 issues.

$ go test -race -count=1 ./cmd/... ./internal/selfupdate/...
ok  	github.com/Zalaras/muster/cmd/musterd	56.033s
ok  	github.com/Zalaras/muster/internal/selfupdate	1.945s

$ make size-warn | grep -E 'musterd|selfupdate'
WARN  cmd/musterd/main.go:104:6: Function 'parseFlags' has too many statements (41 > 40) (funlen)
WARN  cmd/musterd/main.go:187:6: Function 'run' has too many statements (44 > 40) (funlen)
WARN  cmd/musterd/main_test.go:266:6: ... (test table, pre-existing)
WARN  internal/selfupdate/apply_test.go:235:6: ... (test table, pre-existing)
WARN  internal/selfupdate/install_test.go:21:6: ... (test table, pre-existing)
```
main.go's filelen warning (791 lines) is gone — main.go is now 487 lines. `parseFlags`
(41) and `run` (44) funlen warnings are kept on purpose: M1's seed check confirmed `run` is
already phased into helpers and `parseFlags` is a flat flag table where splitting would
only silence the linter (kb:adr/process-size-linters-warn-never-fail); neither is touched
by this unit.

```
$ make build
go build -ldflags "-X main.version=..." -o bin/musterd ./cmd/musterd

$ ./bin/musterd -help 2>&1 | grep -nE 'REQ-|m[0-9]-|D[0-9]+'
(no output, exit 1 — no match)

$ ./bin/musterd -version
musterd v0.18.2-18-gf2c06e1-dirty (Claude Code verified 2.1.246–2.1.280)
```

`-help` text before → after (meaning preserved, only the plan-ID token removed):
- `-claude-bin`: `"... (REQ-19: lets E2E launch a stub)"` → `"... (lets E2E launch a stub)"`
- `-tmux-socket`: `"... (REQ-19: never the user's default server); ... — m2-terminal REQ-5"` → `"... (never the user's default server); ..."`
- `-open`: `"... a real terminal (REQ-6)"` → `"... a real terminal"`
- `-open-cmd`: `"... like -claude-bin (REQ-7)"` → `"... like -claude-bin"`
- `-update`: `"... or restarts anything (REQ-22)"` → `"... or restarts anything"`

No test files needed changes for this unit — every moved function kept its exact
signature; no test imports a specific `cmd/musterd/*.go` file (same package), and no
exported `selfupdate` symbol changed shape (`VersionLinePrefix` is additive).

**doc-delta**: none (see Decisions).
