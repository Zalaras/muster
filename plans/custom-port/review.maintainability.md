# Maintainability review: Custom Port

**Plan**: custom-port
**Verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 11493 words (budget 30000)
**Scope**: 5 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (`cmd/musterd/CLAUDE.md`, `cmd/musterd/main.go`, `cmd/musterd/onexit.go`, `cmd/musterd/port.go`, `cmd/musterd/stdin.go`). This is a full review, not a delta: cycle 2 left a Major open.

## Cycle 2 findings

| Cycle 2 finding | Fix commit | Verified how |
|-----------|-----------|---------------|
| Major 1: the save-port prompt and the kill prompt were two copies of the "ask y/N" routine | 02614e32 | `stdin.go:58` adds `(*lineInput).confirm(ctx, stderr, prompt) bool`. It prints the prompt, reads one line through `readLine`, prints a newline when the read gives up, and accepts only `y`/`yes` (case-insensitive). `askKillPrompt` (`onexit.go:148-157`) and `offerSavePort` (`port.go:126-140`) both call it. Each keeps its own prompt text and its own ctx (a 10s `WithTimeout` for the kill prompt, cancel-on-shutdown for the save prompt), and each does its own thing with the answer. `rg -n '"y", "yes"' cmd internal --glob '*.go'` finds one line: `cmd/musterd/stdin.go:66`. `rg -n 'confirm\(' cmd` finds the definition and the two callers (`onexit.go:153`, `port.go:127`). Fix Attempt 3 in Decisions adds a `design:` line that names `confirm` as the shared routine and pastes its reuse grep. The gate test line (`go test -race -count=1 ./...`) gives `ok … cmd/musterd 92.255s`. Resolved. |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| cmd/musterd/stdin.go | onexit.go, port.go, open.go, main.go | yes (`lineInput` owner and guard; `confirm` as the one y/N routine) | none | pass |
| cmd/musterd/port.go | onexit.go, stdin.go, open.go, tokens.go, main.go | yes | none | pass |
| cmd/musterd/onexit.go | stdin.go, port.go, main.go | yes (covered by the `lineInput` and `confirm` lines) | none | pass |
| cmd/musterd/main.go | onexit.go, open.go, port.go, preflight.go | yes | funlen `parseFlags` 53 (48 on main), reason holds; funlen `run` 47 (44 on main), reason holds; filelen 540 (518 on main), reason holds | pass |
| cmd/musterd/CLAUDE.md | (package brief; no siblings) | n/a | none | pass |

## Issues

### Critical

### Major

### Minor

### Notes
1. **[note]** The first `design:` line in `daemon-implementation.md` § Decisions still says "The prompt copies `askKillPrompt`'s shape". Fix Attempt 3's `design:` line replaced that: both prompts now share `lineInput.confirm`. Decisions is a log written one fix attempt at a time, so the later line wins. Still, a newcomer who reads only the first line would get the wrong picture. Not filed: this is the log, not code.
2. **[note]** Cycle 2 note 1 still holds. The `stop` that `maybeOfferSavePort` returns is called only on the signal exit (`main.go:323`). The restart exit (`main.go:318-320`) and the serve-error exit (`main.go:304-308`) end the prompt through `run`'s `defer cancel()` and do not wait for its goroutine. This is cosmetic: on restart, an abandoned prompt line may have no line ending. The goroutine shares no state with the restart.
3. **[note]** Cycle 2 note 2 still holds. `lineInput` (`stdin.go:12-17`) and `confirm` have no doc comment, and in the struct `mu` sits between `reader`, which it does not guard, and `pending`, which it does. The `design:` line names the guard, which is what § Design "Shared state names its writers and its guard" asks for. Code comments belong to the comment pass (kb:adr/process-comment-pass-owns-code-comments). `askKillPrompt`'s doc comment (`onexit.go:141-146`) still says it "reads one line from stdin, racing a 10s timeout". That is still true in effect, since the race is now a ctx timeout inside `confirm`.
4. **[note]** Cycle 2 notes 3, 5 and 6 still hold:
   - `run` checks `isTerminal(stdin)` twice in a row (`maybeOpenDashboard` and `newLineInput`), and a `design:` line explains why.
   - The `cmd→atomicfile` diagram edge is drawn.
   - The `-port` usage text repeats its literals the way `-on-exit` does.
   - The port file logic matches `tokens.go`.
5. **[note]** Test-file size warnings, which are outside my diff and are not `dupl` hits:
   - `cmd/musterd/port_proc_test.go:286` is 64 lines against a limit of 60.
   - `cmd/musterd/main_test.go:164` is 67 lines against a limit of 60.

   They belong to review-work if anyone's.
