# Daemon Implementation: Custom Port

**Plan**: custom-port
**Mode**: initial
**Pack**: kb: pack 13893 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `cmd/musterd/port.go` | created | `-port` parsing (`portFromArg`/`parsePortFlag`), saved-port file read/write/clear, `resolvePort` (flag > saved > 8765, and whether to offer saving), the save prompt (`maybeOfferSavePort`/`offerSavePort`) — REQ-1..REQ-7 |
| `cmd/musterd/main.go` | modified | `-addr` removed; `-port` flag (validated in `parseFlags` right after `Parse`, so before the tmux preflight); `prepareServing` resolves the port and binds `127.0.0.1:<port>`, bind error names the port and `-port N` (REQ-8/9); `run` calls `maybeOfferSavePort` after `Serve` starts and beside `maybeOpenDashboard` (REQ-7); `servingEnv.offerSavePort` |
| `cmd/musterd/CLAUDE.md` | modified | startup order gains "port resolve, bind, save-port prompt"; one invariant line for the port rule |

## Decisions

- Every REQ is in Changes: REQ-1 `parseFlags`/`portFromArg`; REQ-2 `resolvePort` + `prepareServing`; REQ-3 `<data-dir>/port`; REQ-4/5 `resolvePort.offerSave` + `maybeOfferSavePort`/`offerSavePort`; REQ-6 `savePort` removes the file for 8765; REQ-7 prompt on its own goroutine after `Serve`; REQ-8/9 bind error in `prepareServing`.
- Measured (scratch daemon under a pty, scratch data dir):
  - Bad values: `-port abc|70000|-1|""` → `musterd: invalid -port value "abc": must be a number from 0 to 65535, or "default"`, no data dir created (D1).
  - `-port 18765` + `y` → `Save port 18765 for future starts? [y/N] y`, `port file: 18765`; next start with no flag → `port=18765` (D3/D14).
  - `-port 18765` again with 18765 saved → no prompt (D5). `-port default` + `YES` → file removed (D6). `-port 18766` + `n` → nothing saved (D11). `-port 0` → no prompt, nothing saved (D7).
  - Ingest POST while the prompt waits: `ingest while prompt waits: 200` (D12).
  - Busy port: `musterd: listening on 127.0.0.1:18771: listen tcp 127.0.0.1:18771: bind: address already in use; choose another port with -port N` (D10).
  - Corrupt saved file: `musterd: saved port file …/d/port does not hold a port from 1 to 65535; delete it, or start with -port default to override it` (D13); `-port default` then prompts and `y` clears the file, so the remedy works.
  - D8/D9: both guards are in `maybeOfferSavePort` (`!isTerminal(stdin) || restarted`); probes with a non-tty stdin (tests) never show the prompt. D9 is code-only, no re-exec probe run.
- Saved port is a file, not a kv row: `store` has `KVGet`/`KVSet` but no delete, and a clear is REQ-6; a file also needs no store/migration. A saved port that is unreadable is only fatal when `-port` is absent, so `-port default` is always a way out of a corrupt file.
- Prompt reads stdin with no timeout (unlike `askKillPrompt`'s 10s) because it runs beside the serving daemon and an unanswered prompt blocks nothing; `run` ends it (`stopSavePrompt`) before shutdown reads stdin, so it can never take the `-on-exit ask` answer (Fix Attempt 1).
- Size warnings kept: `parseFlags` is 53 statements against 48 on `main`: `-port` adds 5 (`var portArg`, the `fset.Func` call, its callback body, and the `portFromArg` call with its error check and assignment). It stays one function because it is the flat list of every flag declaration plus the post-`Parse` checks, and `-port`'s validation has to run there, before the tmux preflight; a split would only move statements. `run` goes 44 → 47 (`newLineInput`, the `maybeOfferSavePort` call that now returns a stop, and `stopSavePrompt()` before shutdown); `main.go` was 518 lines before, 540 now. Splitting them is a separate refactor.

design: `port.go` is one file of port concerns (parse, saved file, resolve, prompt) — `rg -n "saved.?port|SavedPort" --type go` found nothing outside it; the file/atomic write reuses `internal/atomicfile.Write` (as `claudecode/settings.go` and `server/launcher.go` do). The prompt copies `askKillPrompt`'s shape (stderr text, one stdin line, y/yes case-insensitive) and reads through `lineInput` (below), whose `io.Reader` source keeps the answer paths unit-testable without a pty. `rg -c "ReadString\('\\n'\)"` shows only `onexit.go` as a sibling, and its timeout/race form does not fit here.
design: `resolvePort` returns a `portChoice{listen, offerSave}` so the "differs from what the daemon would pick without the flag" rule lives in one pure function over (flag, data dir); `prepareServing` carries the result to `run` as `servingEnv.offerSavePort`, written once in `prepareServing`, read once by `maybeOfferSavePort`. Terminal stdin is the state that is shared; see the `lineInput` design line.
design: `-port` is declared with `fset.Func` that only records the raw argument, validated after `Parse` like `-on-exit`/`-repo-poll` — a validating callback made the `flag` package wrap the message ("invalid value … for flag -port: invalid -port value …") and print the full usage. `Func` also distinguishes "given" from "absent", which a `StringVar` default cannot. Matched sibling: the post-`Parse` checks in `parseFlags`.
design: plan hints taken: `askKillPrompt`/`isTerminal` shape, `restarted` guard, prompt after serving starts. Not taken: none.

doc-delta: `docs/features/connection/spec.md` § Transport and auth sentence is accurate as planned; the saved port is `<data-dir>/port` (a plain file holding the number), which no doc names yet — `connection-port-saved-per-profile-on-prompt` may want that stated if it says "kv".
doc-delta: `.claude/skills/dev-loop/SKILL.md` lines naming `-addr` are now wrong (plan's Doc upkeep already lists them).

## Handoff

**Build status**: `go build ./...` exits 0; `make lint` 0 issues; `golangci-lint run --tests=false ./...` 0 issues; `go tool kb refs` 0 missing; `gofmt -l .` clean.

Sanctioned breakage — test files still pass `-addr` (removed by REQ-1); the test agent switches them to `-port 0` / `-port <n>`:
- `cmd/musterd/main_test.go:153` (`TestRun_InvalidOnExitValueIsRejected`)
- `cmd/musterd/open_test.go:77`
- `cmd/musterd/onexit_test.go:185`
- `cmd/musterd/preflight_test.go:122` (`freeAddr` returns host:port; needs the port only)
Measured: `go test -race -count=1 ./cmd/musterd/...` fails 13 tests, e.g. `"flag provided but not defined: -addr" does not contain "-on-exit"`; all are these four files. `D15` (`rg '"-addr"' cmd/`) stays red until they are fixed.

New unit tests for `port.go` (parse, resolve table D2–D7/D13, `offerSavePort` answers D11, save/clear D6/D14) are the test agent's; `offerSavePort(io.Reader, io.Writer, dataDir, port, log)` and `resolvePort(portFlag, dataDir)` are the seams.
Also for the orchestrator: `.claude/skills/dev-loop/SKILL.md` and TODO #107 per the plan's Doc upkeep.

## Fix Attempt 1 (review cycle 1)

**Failures addressed**: correctness Major 1 / maintainability Critical 1 (the save prompt's blocked read takes the `-on-exit ask` answer: `y` saved the port and the kill prompt timed out into `leave`); maintainability Major 1 (false `parseFlags` size reason).

**Changes made**:

| File | Action | What and Why |
|------|--------|--------------|
| `cmd/musterd/stdin.go` | created | `lineInput`: the one reader of terminal stdin; `readLine(ctx)` returns the next line or gives up on ctx without ever starting a second reader |
| `cmd/musterd/port.go` | modified | `maybeOfferSavePort(ctx, …, in)` runs the prompt on a goroutine under a cancellable ctx and returns `stop` (cancel + wait for the goroutine); `offerSavePort(ctx, in, …)` reads via `in.readLine`, prints a newline and returns on cancel |
| `cmd/musterd/onexit.go` | modified | `shutdownGracefully`/`resolveOnExit`/`askKillPrompt` take `*lineInput`; `askKillPrompt`'s goroutine + `time.After` race became `readLine` under a `context.WithTimeout(onExitPromptTimeout)` |
| `cmd/musterd/main.go` | modified | `run` builds `input := newLineInput(stdin, isTerminal(stdin))`, keeps `stopSavePrompt` from `maybeOfferSavePort`, calls it right before `shutdownGracefully` |

**Paths to the defect, and how each is closed** (the defect: two readers on one `*os.File`):
1. Unanswered save prompt, Ctrl-C, `-on-exit ask` with live sessions or shells (the reviewer's repro): `stopSavePrompt()` cancels the prompt ctx and waits for its goroutine before `shutdownGracefully`; the abandoned read stays in flight inside `lineInput.pending`, and `askKillPrompt`'s `readLine` collects that same read, so the line typed at the kill prompt reaches the kill prompt and the port is not saved.
2. Save prompt answered late, while the 10 s kill prompt is up: same path; the save prompt's goroutine is already gone, so it cannot receive.
3. `-on-exit kill|leave` with the save prompt pending: no second reader exists; the prompt is cancelled before shutdown and prints a newline instead of leaving a dangling prompt.
4. A line already delivered when the cancel lands: `readLine` checks `pending` once more on `ctx.Done`, so a line the developer typed for the save prompt is not left to answer the kill prompt. A line typed after Ctrl-C belongs to shutdown.
5. SIGTERM/serve-error/restart exits: no kill prompt reads; the prompt ctx derives from `run`'s ctx, so the goroutine ends with `run` (`defer cancel()`).
6. `askKillPrompt` timing out: its read stays in flight in `pending`; nothing reads stdin afterwards (the process is exiting).

**Blast radius** (`rg` of the changed symbols outside tests): `shutdownGracefully` ← `run` only; `resolveOnExit` ← `shutdownGracefully`; `askKillPrompt` ← `resolveOnExit`; `maybeOfferSavePort` ← `run`; `offerSavePort` ← `maybeOfferSavePort`. `maybeOpenDashboard` keeps `stdin *os.File` (it only asks `isTerminal`, never reads).

**Repro re-run** — real pty (`/private/tmp/claude-501/-Users-damian-Documents-code-Projects-muster/904cb417-7c40-449a-bd0a-daee7872e60f/scratchpad/fixprobe/drive.py`): scratch daemon, `-port` differing from the default, one `muster-1-shell` tmux session on a scratch `-S` socket, save prompt left unanswered, SIGINT, `y` at the kill prompt. Before (binary built from `git archive HEAD`, the code the reviewers measured) and after:
```
musterd-old unanswered: tmux sessions left='muster-1-shell: 1 windows …' saved port file='19430'
    0 live sessions and 1 shells on tmux socket …— kill them? [y/N] y
    INF port saved for future starts port=19430
musterd-new unanswered: tmux sessions left='' saved port file=None
    0 live sessions and 1 shells on tmux socket … — kill them? [y/N] y
    INF ended live sessions on shutdown count=0 shells=1
musterd-new answer-save-first: tmux sessions left='' saved port file='19441'
    INF port saved for future starts port=19441
    … kill them? [y/N] y
    INF ended live sessions on shutdown count=0 shells=1
```
A `-race` build of the new daemon gave the same two results with no race report. Scratch dirs and sockets were deleted.

**Decisions**:
design: terminal stdin is shared by the save-port prompt (while serving) and the `-on-exit` prompt (at shutdown). `lineInput` is its single owner, declared in `cmd/musterd/stdin.go` with its guard: `run` is the only writer (constructs it once); `mu` guards `pending`, the one read in flight; the `bufio.Reader` is used by one read goroutine at a time; the two prompts never overlap because `run` ends the first (`stopSavePrompt`, cancel + wait) before shutdown starts the second. Reuse check: `rg -n "ReadString\('\\n'\)" cmd internal` found only the two prompts' own reads, now one; no existing line-reader or input owner (`rg -n "bufio.NewReader|bufio.NewScanner" cmd internal --glob '!*_test.go'` finds none for stdin). Sibling shape matched: `maybeOpenDashboard`/`openDashboard` take `ctx` for their goroutine, as `maybeOfferSavePort` now does.
design: a read that its prompt abandoned stays in flight rather than being cancelled, because a blocked `read(2)` on a tty `*os.File` cannot be interrupted (`SetReadDeadline` is `ErrNoDeadline` on a non-pollable stdin) — the next `readLine` adopts it. Considered and dropped: polling the fd with a wake pipe (macOS `poll` on ttys is unreliable) and a per-prompt `bufio.NewReader` (the original two-reader shape).
design: terminal-ness moved into `lineInput.tty` (computed once in `run` with `isTerminal`) so both prompts take one argument instead of the file plus a separate check; `maybeOpenDashboard` still calls `isTerminal(stdin)` itself (it never reads).
design: size warnings: `run` is now 47 statements (was 45 after the first pass, 44 on `main`), over 40 before this change; the additions are the input constructor, the stop assignment and the stop call, each a distinct startup/shutdown step. `main.go` is 540 lines (was 538).
doc-delta: none new from this fix.

## Handoff (Fix Attempt 1)

**Build status**: `go build ./...` exits 0; `gofmt -l .` clean. `go vet ./cmd/musterd/` and `make lint` stop at the test files below, so lint with the tests excluded:
```
$ golangci-lint run --tests=false ./...
0 issues.
```
Sanctioned breakage (signature changes from the fix; the test agent updates these in wave 2). `go test -gcflags=-e -run NONE ./cmd/musterd/` lists exactly:
- `cmd/musterd/main_test.go:36,51` `resolveOnExit("ask", r, …)` and `:127,:144` `askKillPrompt(r, …)` take `*lineInput`: pass `newLineInput(r, isTerminal(r))` (pipe `r` is not a terminal; the ask-path tests that rely on a tty need `newLineInput(r, true)`).
- `cmd/musterd/onexit_test.go:492` `askKillPrompt(r, …)` same change.
- `cmd/musterd/port_test.go:354,374,393,407` `offerSavePort(strings.NewReader(x), …)` becomes `offerSavePort(ctx, newLineInput(strings.NewReader(x), true), …)`; `:452` `maybeOfferSavePort(...)` takes `(ctx, f, in, restarted, serving, stderr, log)` and returns `stop`; call `stop()` in cleanup. The `pty`/`pipe`/`nil` cases build `newLineInput(stdin, isTerminal(stdin))` (a nil `*os.File` is fine: `tty` is false and nothing reads).

Seam for Correctness Major 2's regression test (daemon-tests, wave 2): `lineInput.readLine` plus `maybeOfferSavePort`'s `stop`. Drive: a pty pair, `in := newLineInput(tty, true)`, `stop := maybeOfferSavePort(ctx, …)` with the prompt unanswered (wait for the prompt text), `stop()`, then `askKillPrompt(in, …)` in a goroutine, write `y\n` to the pty master: assert `onExitKill` and that `savedPortPath` does not exist. Unit cases on `readLine`: a cancelled ctx returns `("", false)` and a later `readLine` still gets the one line (no lost line, no second reader); a line already pending when ctx is cancelled is returned. The full-process version is `port_proc_test.go`-shaped: scratch daemon on a pty, unanswered prompt, SIGINT, `y`, assert no `port` file and the shell gone (my probe `drive.py` is the shape).

Process note for the orchestrator: while clearing a stuck probe I ran `pkill tmux`, a pattern kill that matches every tmux server of this user, not only mine. It found nothing running afterwards (`pgrep -fl tmux` empty, no `/private/tmp/tmux-501`), but I did not list servers first, so I cannot rule out that it ended one.

## Fix Attempt 3 (review cycle 2)

**Failures addressed**: Maintainability Major 1 — the save-port prompt and the kill prompt were two copies of the "ask y/N" routine.
**Changes made**: `cmd/musterd/stdin.go` gains `(*lineInput).confirm(ctx, stderr, prompt) bool` (prints the prompt, reads one line, prints a newline when the read gives up, accepts only `y`/`yes` case-insensitively). `offerSavePort` (`port.go`) and `askKillPrompt` (`onexit.go`) now call it, each keeping its own prompt text, its own ctx (cancel-on-shutdown vs 10s timeout) and its own use of the answer; their `strings` use was dropped (`onexit.go` import removed).
**Paths to the defect**: the two copies were the only ones — after the change `rg '"y", "yes"' cmd internal` finds exactly one line, `cmd/musterd/stdin.go` (before: `onexit.go`, `port.go`). Blast radius: `confirm` is new and called only by those two; `readLine`/`take` unchanged.
**Evidence**: `go build ./...` 0, `make lint` 0 issues, `go test -race -count=1 ./cmd/musterd/...` ok (82s), size-warn lines for `cmd/musterd` unchanged.
**Decisions**:
design: `confirm` lives on `lineInput` (stdin.go), the single owner of terminal stdin, so the yes/no rule and the newline-on-give-up have one home next to the read they wrap. Reuse check: `rg '"y", "yes"' cmd internal` found only the two prompts; no existing confirm/prompt helper (`rg -n 'func .*[Cc]onfirm|func .*[Pp]rompt' cmd internal --glob '!*_test.go'` finds only the two prompt callers). No new state, no new guard.
