# Maintainability review: Custom Port

**Plan**: custom-port
**Verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 11493 words (budget 30000)
**Scope**: 5 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (`cmd/musterd/CLAUDE.md`, `cmd/musterd/main.go`, `cmd/musterd/onexit.go`, `cmd/musterd/port.go`, `cmd/musterd/stdin.go`). This is a full review, not a delta: cycle 1 left a Critical and a Major open.

## Cycle 1 findings

| Cycle 1 finding | Fix commit | Verified how |
|-----------|-----------|---------------|
| Critical 1: two stdin readers, no owner | 4bbbe0a0 (+ tests 0a44f9ce) | Read `stdin.go`. `lineInput` holds the only `bufio.Reader` on stdin, and `readLine` starts a new read goroutine only when `pending` is nil. `pending` is cleared only in `take`, after the previous read has delivered its line. So the `bufio.Reader` has one goroutine at a time, ordered by the channel. `rg 'bufio\.NewReader\(' cmd internal --glob '!*_test.go'` finds `stdin.go:19` and `internal/claudecode/interpret_transcript.go:44` (a transcript, not stdin). `run` calls `stopSavePrompt()` (cancel, then wait on `done`) before `shutdownGracefully` (`main.go:323-324`). The gate test line ran `go test -race -count=1 ./...` and got `ok … cmd/musterd`, including `stdin_test.go` and `TestPortProc_ShutdownAskPromptAnswerNeverReachesTheSavePrompt`. A `design:` line now names stdin as shared and names its guard. Resolved. |
| Major 1: false `parseFlags` size reason | 4bbbe0a0 (Decisions text) | The gate size log says `parseFlags … (53 > 40)`. Decisions now says "53 statements against 48 on `main`", lists the 5 added statements and explains why the function stays one piece. `parseFlags` (`main.go:115-197`) is a flat list of flag declarations followed by post-`Parse` checks, so the reason holds. Resolved. |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| cmd/musterd/stdin.go | onexit.go, open.go, port.go, preflight.go, tokens.go, main.go | yes (`lineInput` owner and guard, the abandoned read kept in flight, `tty` folded in) | none | pass |
| cmd/musterd/port.go | onexit.go, open.go, preflight.go, tokens.go, update.go, main.go | yes (4 lines + the fix's 3) | none | Major 1 |
| cmd/musterd/onexit.go | port.go, stdin.go, main.go | yes (covered by the `lineInput` line) | none | Major 1 (the other half of the pair) |
| cmd/musterd/main.go | onexit.go, open.go, preflight.go, tokens.go, update.go | yes | funlen `parseFlags` 48→53, reason holds; funlen `run` 44→47, reason holds; filelen 518→540, reason holds | pass |
| cmd/musterd/CLAUDE.md | (package brief; no siblings) | n/a | none | pass |

## Issues

### Critical

### Major
1. **[daemon-impl]** The save-port prompt and the kill prompt are now two copies of the same "ask y/N on the terminal" routine.
   - Old `cmd/musterd/onexit.go:149-166`, `askKillPrompt`:
     ```go
     fmt.Fprintf(stderr, "… kill them? [y/N] ", …)
     answer, ok := in.readLine(ctx)
     if !ok { fmt.Fprintln(stderr); return onExitLeave }
     switch strings.ToLower(answer) { case "y", "yes": return onExitKill; default: return onExitLeave }
     ```
   - New `cmd/musterd/port.go:126-138`, `offerSavePort`:
     ```go
     fmt.Fprintf(stderr, "Save port %d for future starts? [y/N] ", port)
     line, ok := in.readLine(ctx)
     if !ok { fmt.Fprintln(stderr); return }
     switch strings.ToLower(line) { case "y", "yes": default: return }
     ```
   - The `rg` result:
     ```
     $ rg -n '"y", "yes"' cmd internal --glob '*.go'
     cmd/musterd/onexit.go:161:	case "y", "yes":
     cmd/musterd/port.go:135:	case "y", "yes":
     ```
   - The two copies hold the same rules: what counts as yes, and that a prompt it gives up on ends its line with a newline. A third prompt, or a change to either rule, has to edit both, and nothing makes them agree.
   - In cycle 1 this was a note (note 2). Back then the two reads had different shapes: a fresh reader per call, and a timeout race. The fix moved both prompts onto `lineInput.readLine(ctx)`, so the two functions now match line for line except the prompt text and the result. Note 2 named `lineInput` as the natural home for the yes-parse.
   - The `design:` line says "the prompt copies `askKillPrompt`'s shape" on purpose. A stated reason does not excuse a copy.
   - Cites `docs/conventions.md` § Design: "Reuse before add … What it finds is reused or generalised, never copied, whatever Decisions says", and "One owner per concept … a rule has one home".
   - A fix must make these true:
     - The y/N answer grammar and the "end the prompt line when the read gives up" behaviour each live in one place.
     - `askKillPrompt` and `offerSavePort` both call that one place.
     - Each keeps its own prompt text, its own ctx (timeout or cancel) and what it does with the answer.
     - A `design:` line names the shared routine.

### Minor

### Notes
1. **[note]** `maybeOfferSavePort` hands back a `stop` (cancel, then wait for the goroutine). Only the signal exit path calls it (`main.go:323`). The restart path (`main.go:318-320`) and the serve-error path (`main.go:304-308`) return without calling it. Both still end the prompt through `run`'s `defer cancel()`, so ctx is honoured. What differs is that nothing waits for the goroutine.
   - On restart, the prompt goroutine's newline (`port.go:130`) can race `syscall.Exec`. If it loses, the abandoned "Save port …? [y/N] " has no line ending, and the restarted daemon's first log line runs onto it.
   - This is cosmetic, and the goroutine writes no state shared with the restart, so it is not filed. A newcomer adding a fourth exit from `run` would not know `stop` exists. The sibling `maybeOpenDashboard` returns no handle, which is why this one stands out.
2. **[note]** The comment pass (35c74654) dropped the doc comment above `lineInput`. That comment named `mu` as the guard of `pending` and said the `bufio.Reader` has one read goroutine at a time. The `design:` line in `daemon-implementation.md` still states both, which is what § Design "Shared state names its writers and its guard" asks for. So nothing is filed (kb:adr/process-comment-pass-owns-code-comments). In the struct, `mu` sits between `reader`, which it does not guard, and `pending`, which it does. A newcomer has to read `readLine` to find out which fields `mu` covers.
3. **[note]** `run` checks `isTerminal(stdin)` twice in a row: once inside `maybeOpenDashboard` (`main.go:508`) and once to build `lineInput` (`main.go:298`). A `design:` line explains this: `maybeOpenDashboard` never reads stdin. It matches its sibling, so nothing is filed.
4. **[note]** A size warning on a test file, which is outside my diff: `cmd/musterd/port_proc_test.go:286` `TestPortProc_ShutdownAskPromptAnswerNeverReachesTheSavePrompt` is 64 lines against a limit of 60 (funlen). `daemon-tests.md` gives no reason for it, and its size line (`:56`) still quotes cycle 1's numbers (`run` 45, `main.go` 538). It is not a `dupl` hit, so it is not a `[daemon-tests]` finding here. That is review-work's call.
5. **[note]** Cycle 1 note 1 is resolved: `docs/diagrams/daemon-components.md` now draws `Rel(cmd, atomicfile, "saved port")`. `stdin.go` adds no import edge.
6. **[note]** Cycle 1 notes 3–5 still hold:
   - The `-port` usage text repeats `8765`/`"default"` as literals, the same way `-on-exit` does.
   - Port file logic in `cmd/musterd` matches `tokens.go`.
   - The `run` and `main.go` size reasons hold. Decisions now says 540 lines, which is what the gate measured.
