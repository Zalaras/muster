# Daemon Implementation: sweep-2026-11-06-2

**Plan**: sweep-2026-11-06-2
**Mode**: initial
**Pack**: kb: pack 13820 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `cmd/musterd/main.go` | modified | `run` creates the `lineInput` and installs the SIGINT/SIGTERM handler right after `prepareServing` (bind), asks the save prompt, and only then builds the server, calls `srv.Start()`, serves, logs `musterd starting` and opens the browser. A signal at the prompt closes the listener and returns nil (exit 0, store closed by the existing defer). `stopSavePrompt` removed. (REQ-1, REQ-3) |
| `cmd/musterd/port.go` | modified | `maybeOfferSavePort` is a blocking call with no goroutine and no stop func; new `offerSavePortUnlessSignalled` runs it against the signal channel so a signal cancels the read (`confirm` prints the newline). `offerSavePort` unchanged. (REQ-1, REQ-2, REQ-3) |
| `cmd/musterd/CLAUDE.md` | modified | Invariant and startup order now say the prompt runs after the bind, before serving. |

## Decisions

- deviation: kb:adr/connection-port-saved-per-profile-on-prompt says "the daemon serves while the prompt waits" and that the prompt runs after serving starts; this fix asks synchronously after the bind and before serving/background startup work, as the developer chose (option (b), issue #120), so the prompt is the last line on stderr. Standing decision (opt-in, default No, no fallback) unchanged. → ADR: connection-port-save-prompt-before-serving
- design: `offerSavePortUnlessSignalled` (port.go) joins the prompt to the signal channel with one short-lived goroutine (joined before return) rather than `signal.NotifyContext`, which has no signal name for the existing `shutting down signal=` log line and leaves a gap between stopping it and the later `signal.Notify`. Shape matched: `maybeOfferSavePort`'s previous cancel-and-join, now local to the call. `rg "signal.Notify" cmd/musterd` found only `run`; nothing reusable.
- design: `sigCh` is created once, before the prompt, and the main `select` reads the same channel; its readers are `offerSavePortUnlessSignalled` (during the prompt) and `run`'s select (after), never concurrent, so no signal is lost to a second channel.
- design: the `lineInput` is created once before the prompt and reused by shutdown; the pending-read goroutine is consumed by the answer, so none outlives the prompt on the answered path and shutdown's `-on-exit ask` gets its own line.
- Size: `run` funlen (48 > 40) and `main.go` filelen (542, was 540) warnings kept; both pre-exist and the plan names this function; splitting `run` is outside this fix.
- REQ-1/2/3 all covered above (REQ-2: `offerSavePort` untouched).
- doc-delta: `cmd/musterd/CLAUDE.md` already edited by this work; the ADR `connection-port-save-prompt-before-serving` is the orchestrator's; `rg "Save port|save prompt" docs/features/connection/spec.md` found no order sentence to amend.

## Handoff

**Build status**: `go build ./...` exits 0; `golangci-lint run --tests=false ./...` prints `0 issues.`

Sanctioned breakage (the plan makes `maybeOfferSavePort` blocking with no stop func; Affected Files `port.go`): `cmd/musterd/port_test.go` no longer compiles (`go vet`: "(no value) used as value" at lines 453, 502, 550, 575), so `go test ./cmd/musterd/` cannot build until the test agent rewrites:
- the table test around line 453: drop `stop`; the call blocks, so answer first or run it in a goroutine.
- `TestSavePromptThenKillPrompt_OneTerminalOneReader` (~502): remove the unanswered rows and `stop()`; keep answered-first rows.
- `TestMaybeOfferSavePort_StopEndsAnUnansweredPrompt` (~540) and `TestMaybeOfferSavePort_ParentContextEndsThePrompt` (~565): `stop` is gone; cancel the ctx passed to the blocking call (or drive `offerSavePortUnlessSignalled` with a sigCh) and assert the `[y/N] \n` ending and nothing saved.

Evidence: with a temporary local patch of port_test.go (`stop := func() {}; maybeOfferSavePort(...)`, reverted), `go test -race -count=1 -run TestPortProc ./cmd/musterd/` gave `ok github.com/Zalaras/muster/cmd/musterd 18.476s`, including the plan's new and rewritten proc tests.
