# Maintainability review: Custom Port

**Plan**: custom-port
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 11489 words (budget 30000)
**Scope**: 3 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (`cmd/musterd/CLAUDE.md`, `cmd/musterd/main.go`, `cmd/musterd/port.go`)

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| cmd/musterd/port.go | onexit.go, open.go, preflight.go, tokens.go, update.go, main.go | yes (4 lines) | none | Critical 1: second stdin reader, no owner |
| cmd/musterd/main.go | onexit.go, open.go, preflight.go, tokens.go, update.go | yes (`fset.Func` post-Parse validation, `servingEnv.offerSavePort`) | funlen `parseFlags` 48→53, reason contradicted; funlen `run` 44→45, reason holds; filelen 518→538, reason holds | Major 1 |
| cmd/musterd/CLAUDE.md | (package brief; no siblings) | n/a | none | pass |

## Issues

### Critical
1. **[daemon-impl]** Two goroutines read the same terminal stdin and nothing owns it, so the answer to the `-on-exit` kill prompt goes to the save-port prompt. `cmd/musterd/port.go:113-120`: `maybeOfferSavePort` starts `offerSavePort`, which blocks in `bufio.NewReader(stdin).ReadString('\n')` with no context and no way to end it. `cmd/musterd/onexit.go:154-156`: `askKillPrompt` later starts a second `bufio.NewReader(stdin)` on the same `*os.File`.
   The interleaving: the developer runs `musterd -port 9000` on a terminal, ignores "Save port 9000 for future starts? [y/N]", and presses Ctrl-C with live sessions. `shutdownGracefully` prints "… kill them? [y/N]" and the developer types `y`. The first reader, which is still blocked, gets the `y`. `offerSavePort` takes it as "yes, save port 9000", writes `<data-dir>/port` and logs "port saved for future starts". `askKillPrompt` times out after 10 s and returns `leave`. So one keystroke saves a port the developer never agreed to save and leaves the sessions they asked to kill.
   - Measured with a stand-alone copy of the two reader shapes under a pty (`/private/tmp/claude-501/-Users-damian-Documents-code-Projects-muster/904cb417-7c40-449a-bd0a-daee7872e60f/scratchpad/stdinrace/`). The first reader starts, the second starts 300 ms later, and the test types `y\n`. It went the same way in all 5 runs:
     ```
     0 ['SAVE-PROMPT reader got "y"', 'KILL-PROMPT timed out -> leave']
     … (runs 1–4 identical)
     ```
   - Decisions names this as a "known edge" that "times out into `leave` (the safe default)". That describes only half the effect: it leaves out the unrequested port save.
   - The `design:` line says "no sharing across goroutines", but that refers to the `offerSavePort` bool. Stdin is the state actually shared, and no `design:` line names it.
   - Cites `docs/conventions.md` § Design "Shared state names its writers and its guard" and "One owner per concept". Also § Go: "`context.Context` is the first parameter of anything that blocks … or should die on shutdown — nothing ignores ctx". The sibling `maybeOpenDashboard`/`openDashboard` (`main.go:505`, `open.go:22`) takes `ctx` for its goroutine; `maybeOfferSavePort` does not.
   - A fix must make these true:
     - Stdin has one reader at a time.
     - A line typed while the `-on-exit` prompt is showing reaches `askKillPrompt` and never `offerSavePort`. The reverse holds too.
     - The save prompt's read is over before shutdown reads stdin.
     - A `design:` line names stdin as shared and says what guards it.

### Major
1. **[daemon-impl]** The size-warning reason for `parseFlags` is false. Decisions says "`parseFlags` (48 statements) was already over 40 and my change is statement-neutral". The gates' size log says `cmd/musterd/main.go:115:6: Function 'parseFlags' has too many statements (53 > 40)`. `golangci-lint run --enable-only funlen ./cmd/musterd/` on a `git archive main` copy says `(48 > 40)`. So the change adds 5 statements: `var portArg`, the `fset.Func` callback body, and the `portFromArg` call with its error check and assignment, at `main.go:142-180`. Cites the review rule for size warnings (a reason the code contradicts is a Major) and kb:adr/process-size-linters-warn-never-fail. A fix must make the Decisions reason for `parseFlags` true for the code as it stands, or restructure `parseFlags`. A split made only to silence funlen does not count.

### Minor

### Notes
1. **[note]** This branch adds an import edge from `cmd/musterd` to `internal/atomicfile` (`port.go:15`). `kb:diagram/daemon-components` draws `atomicfile` only from `claudecode`, `server` and `selfupdate`. That is review-work's DIAG row.
2. **[note]** Reuse check (`rg`):
   - `"y", "yes"` appears at `cmd/musterd/onexit.go:162` and `cmd/musterd/port.go:122`.
   - `ReadString('\n')` appears at `onexit.go:155` and `port.go:120`.
   - `65535` and `8765` appear only in `port.go` and the `-port` usage text.
   - Other `atomicfile.Write` callers: `internal/selfupdate/apply.go:216`, `internal/claudecode/settings.go:373`, `internal/server/launcher.go:621`.

   No second implementation of the port logic exists. The yes-parse is three lines copied from `askKillPrompt`, which the `design:` line says was on purpose. If Critical 1's fix gives stdin a single reader, that reader is the natural home for the yes-parse too.
3. **[note]** The default port 8765 and the `"default"` word are constants in `port.go:19-20`, and the `-port` usage string at `main.go:144` repeats both as literals. That is the same shape as `-on-exit`'s usage repeating `ask` (`main.go:152`), so it matches the siblings. Still, changing `defaultPort` would leave the usage text out of date.
4. **[note]** Putting the saved-port file logic in `cmd/musterd` rather than `internal/` matches `tokens.go`, which also owns a data-dir file (`writeTokensFile`). Decisions gives a good reason for using a file instead of a kv row: `store` has no delete, and clearing the port needs one.
5. **[note]** `run` funlen 44→45 and `main.go` length 518→538: the reasons in Decisions hold. Each is one call beside `maybeOpenDashboard`, and both functions were already over the threshold on `main`. Decisions says 535 lines; the gate measured 538. `main_test.go`'s `TestBuildServerConfig_…` funlen warning was already there on `main`.
