# Plan: sweep-2026-11-06-2

**Status**: completed
**Shape**: fix
**Work Type**: daemon
**E2E Scope**: none
**Fixture plan**: none
**Render fixtures**: none
**Features**: connection
**Description**: musterd asks "Save port N for future starts? [y/N]" before it starts serving and waits for the answer, so startup log lines can no longer bury the question (#120).

## Symptom

### e2 — Port not saving

- [ ] **Port not saving** ([#120](https://github.com/Zalaras/muster/issues/120)) — After setting the
  port to 8766 twice, a plain start still tries port 8765 and fails because the address is already
  in use; the save-port prompt appears but the choice does not persist. Expected: A port the author
  chose and saved should be used on later starts without needing the port flag.
  Reported error: "listen tcp 127.0.0.1:8765: bind: address already in use".
  Filed 2026-11-06 from musterd 0.29.0 / Claude Code 2.1.317, focus view, session idle.
  Labels: bug, settings.

## Findings

Reproduced on a scratch data dir with the 0.29.0 release binary and a `main` build under a real pty
(research `plans/sweep-2026-11-06/research/e2.md`). Saving works when `y` is typed: the
`<data-dir>/port` file is written and the next plain start binds it. The symptom comes from the
prompt itself: `maybeOfferSavePort` (`cmd/musterd/main.go:299`) runs the prompt on its own
goroutine after `srv.Start()` (`main.go:281`) and `logStartup` (`main.go:289`). By then the
version-watch, usage-poll and update-check goroutines write zerolog lines to the same stderr, so
`Save port N for future starts? [y/N] ` (`port.go:126`, printed by `lineInput.confirm`,
`stdin.go:61`) is immediately followed by unrelated log lines. Left unanswered and then Ctrl-C,
`stopSavePrompt()` cancels the read and the port is silently not saved. The issue paste on the
laptop shows the same: the prompt buried at once, nothing typed.

What did not hold: nothing reads the port file late or from the wrong data dir.

Developer's answer (2026-11-06, "2b" → option (b)): ask synchronously **before serving** and before
the async startup checks begin, so the prompt is the last line and the daemon waits for the answer.
Default stays No; the opt-in save stands. This supersedes the "The daemon serves while the prompt
waits" sentence of kb:adr/connection-port-saved-per-profile-on-prompt (a new ADR). With no terminal
on stdin, or after an update re-exec, nothing is asked (unchanged). No fallback to a free port.

## Requirements

### Must Have
- **REQ-1**: With `-port N` differing from the saved/default port, on a terminal and not after a
  restart, musterd binds the port (a busy port still fails startup first, naming `-port N`), then
  prints `Save port N for future starts? [y/N] ` and waits for the answer **before** the HTTP
  server serves and before any background startup work (`srv.Start()`: version check, usage poll,
  update check) or the `musterd starting` log line runs — so nothing is printed after the prompt
  until it is answered. (e2)
- **REQ-2**: Answering `y`/`yes` saves the port exactly as today (`port saved for future starts`,
  or clearing for `default`); any other answer saves nothing; either way startup then continues
  (serving, `musterd starting` line, browser open). (e2)
- **REQ-3**: SIGINT/SIGTERM while the prompt waits saves nothing, prints a newline after the
  prompt, and the daemon exits cleanly with status 0 (store closed; no on-exit prompt, since nothing
  was served). (e2)

## Affected Files
### Daemon (daemon-impl)
- `cmd/musterd/main.go` — REQ-1/REQ-3: call the save prompt synchronously after `prepareServing`
  (bind) and before `server.New`/`srv.Start()`/`Serve`/`logStartup`; install the signal handler
  before the prompt so a signal cancels the read; return cleanly when the prompt was interrupted.
  The `lineInput` is created once, before the prompt, and reused by shutdown.
- `cmd/musterd/port.go` — REQ-1/REQ-2: `maybeOfferSavePort` becomes a blocking call (no goroutine,
  no stop func); `offerSavePort` unchanged in what it saves and logs.
- `cmd/musterd/stdin.go` — only if needed for cancellation; `confirm` behaviour unchanged.
### Existing tests this breaks
- `cmd/musterd/port_proc_test.go`: `TestPortProc_DeclineSavesNothingAndIngestIsServedWhilePromptWaits`
  asserts ingest is served while the prompt waits (D12) — now false by design; rewrite to assert
  ingest is **not** answered while the prompt waits and that `n` saves nothing then serving starts.
  `TestPortProc_ShutdownAskPromptAnswerNeverReachesTheSavePrompt` launches sessions while the save
  prompt is unanswered — impossible now; drop the two unanswered rows and keep the
  "save answered y first, then y kills" row (answer the save prompt before launching).

## Proof

e2 — `cmd/musterd/port_proc_test.go`, written by **daemon-tests**:
`TestPortProc_SavePromptIsAskedBeforeServingAndStaysTheLastLine`. Spawn with `-port <free>` on a
pty (the scratch daemon's unreachable `-usage-api-url` produces an async WRN once serving starts);
wait for `promptTextPrefix+port`; then assert for a bounded window (`assert.Never`) that nothing
follows the prompt in stderr (`strings.HasSuffix(stderr, "[y/N] ")` holds) and that stderr has no
`musterd starting` line; answer `y`; assert the port file is written and `musterd starting`
appears after the prompt. Red today: the `musterd starting` line precedes the prompt and WRN lines
follow it. Also `TestPortProc_InterruptAtSavePromptSavesNothingAndExitsZero` (REQ-3): SIGINT while
the prompt waits → exit 0, no port file. Plus the two rewrites listed above.

## Edge Cases
1. Busy port with `-port N` on a terminal fails before any prompt (existing `TestPortProc_BusyPortExitsNamingThePortAndTheFlag`) → D1
2. Pipe stdin / restarted / port 0 / flag equals saved: no prompt, serves immediately (existing `TestPortProc_NeverPrompts`) → D1
3. Signal while the prompt waits (REQ-3) → D1

## Acceptance Criteria
### Automated Checks
```checks
D1 go test -count=1 -run 'TestPortProc' ./cmd/musterd/
D2 make lint
```
### Reviewer-Verified
- No goroutine is left reading stdin for the save prompt after it returns, so the shutdown
  `-on-exit ask` prompt still gets its own line.

## Doc Delta
**connection** — becomes true: on a terminal the save-port question is asked after binding and
before serving, and the daemon waits for the answer (default No); stops being true: "the daemon
serves while the prompt waits". New ADR `connection-port-save-prompt-before-serving` superseding
kb:adr/connection-port-saved-per-profile-on-prompt (restating its standing decision D, opt-in save,
default No, no fallback). `cmd/musterd/CLAUDE.md` invariant "The save prompt runs after serving
starts" → "before serving starts". `docs/features/connection/spec.md` § Transport and auth sentence
if it states the order.

## Out of scope
Nothing.
