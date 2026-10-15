# Daemon Implementation: rename-claude-session

**Plan**: rename-claude-session
**Mode**: initial
**Pack**: kb: pack 28450 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/claudecode/promptreply.go` | created | `IsPromptSubmit` and `PromptTitleReply` — the reply body is Claude Code format, built here (REQ-1) |
| `internal/claudecode/settings.go` | modified | hook wrapper prints the daemon's body on a 2xx only; status-line wrapper keeps discarding (REQ-5) |
| `internal/claudecode/launch.go` | modified | `BuildArgv` emits `--name` beside `--resume` (REQ-6) |
| `internal/session/titledelivery.go` | created | in-memory delivery record on `Session`, `TakeTitleToSend` / `PendingTitle` / `MarkTitleSent` (REQ-1, REQ-2, REQ-6, REQ-7, REQ-8) |
| `internal/session/session.go` | modified | unexported `titleDelivery` field |
| `internal/session/writeorder.go` | modified | `titleDelivery` added to `restoreChangedFields` and `restoredSessionFields` (the field-coverage check) |
| `internal/session/title.go` | modified | `SetTitle` re-arms delivery when the override value changes (REQ-2) |
| `internal/session/apply.go` | modified | `ApplyStatus` runs `observeClaudeTitle` on every status post carrying a name; a clear persists and broadcasts (REQ-7, REQ-8) |
| `internal/server/ingest.go` | modified | `route` split out of `resolveSessionID`; `replyFor` builds the hook reply from in-memory state; handler writes it (REQ-1–REQ-4) |
| `internal/server/launcher.go` | modified | in-place resume passes the pending override as `Title`, marks it sent once the spawn succeeded (REQ-6) |

## Decisions

REQ coverage: REQ-1, REQ-2, REQ-3, REQ-4 (ingest.go, titledelivery.go), REQ-5 (settings.go), REQ-6 (launch.go, launcher.go), REQ-7, REQ-8 (apply.go, titledelivery.go) — none deliberately skipped.

Evidence: `go test -race -count=1 ./internal/server/` ok (includes the plan's red test, now green, and the shell round-trip tests); `./internal/session/` ok; a throwaway session-level test of REQ-7/REQ-8 (before-delivery untouched, straggler of the pre-delivery name kept, suffix clears, equal-at-once then `/rename` clears) passed and was deleted. Wrapper script probed against a scratch python HTTP server on the generated template: 200 `{"a":1}` prints `{"a":1}`; 404 prints nothing; daemon down prints nothing, all exit 0.

- design: delivery state is an unexported `titleDelivery` struct on `Session` (value, and Claude's name just before delivery), not a Manager-level map — it follows `currentPromptID` / `pendingResumeClaudeSessionID`, the other in-memory-only Session fields, so `Clone`, removal and `restoreChangedFields` (+ `CheckSessionFieldCoverage`) cover it with no extra bookkeeping. Writers: `SetTitle`, `ApplyStatus`, `TakeTitleToSend`, `MarkTitleSent`, all under `Manager.mu`. `rg -n "func.*[Dd]eliver|sessionTitle" internal` found nothing existing to reuse.
- design: the clear-after-delivery rule lives in `ApplyStatus` (via `Session.observeClaudeTitle`), not in `applyStatusUpdate`, so `applyStatusUpdate` still never touches `TitleOverride` and its existing test stays true; the observer runs on every status post carrying a name (not only on a changed title) so a restarted daemon whose Claude name already equals the override records the delivery before a later `/rename`.
- design: `ingestQueue.route` is the old `resolveSessionID` body returning `(id, logMiss func())`; `resolveSessionID` wraps it. The handler's `replyFor` calls `route` too, so there is one routing implementation and an unroutable prompt hook is not logged twice. Matched the existing `ingestQueue` method style; nothing else in the package routes events.
- design: `replyFor` parses the hook body in the handler (`claudecode.ParseIngestBody`, in-memory JSON only) a second time beside the worker's parse. The queue doc says parsing is the worker's; the reply has to know the event type and session synchronously, and moving the worker's parse into the handler would change seq/parse ordering, so the second parse is kept. No DB, queue or file is read (REQ-4).
- design: resume uses `PendingTitle` before spawn and `MarkTitleSent` after a successful spawn (not `TakeTitleToSend` before), so a failed spawn does not spend the send. A prompt hook racing the spawn-to-mark gap could send once more; harmless, Claude Code skips a name it holds.
- design: wrapper `writeEnvelopeScript` takes the post tail (`postAndDiscardReply` / `postAndEchoReply`) so only `hook.sh` can ever print; `status-line.sh` stdout is the status-line text and stays silent.
- size: `internal/server/launcher.go` was already over the 500-line threshold (606 → 611); five lines added to one existing function, no split.
- doc-delta: the plan's `## Doc Delta` rename line "a name Claude Code suffixes … stays suffixed in Claude Code while the dashboard shows Muster's title" is no longer true as written: kb:adr/rename-claude-change-after-delivery-clears-override clears the override on a suffixed name, so the dashboard shows the suffixed name too.
- doc-delta: `BuildArgv` order is `--model`, `--resume`, `--name`, `--permission-mode`; the plan's `docs/protocol.md` sentence lists `--resume` before `--model`, which was already not the emitted order.

## Handoff

**Build status**: `go build ./...` exits 0. `make lint` 0 issues; `golangci-lint run --tests=false ./...` 0 issues (the broken tests below fail at runtime, not at compile, so lint still sees them).

Sanctioned breakage (plan's "Existing tests this breaks"), for the test agent:
- `internal/claudecode/launch_test.go` — `TestBuildArgv/ResumeSessionID_emits_--resume_and_omits_--name_even_when_Title_is_also_set` now gets `--name <title>` after `--resume` (REQ-6).
- `internal/claudecode/settings_test.go` — `TestWriteEnvelopeScript_NeverWritesToStdoutOrStderr` asserts no `printf ` and `--output /dev/null` in `hook.sh`; the hook wrapper now prints a 2xx body (REQ-5). The status-line script still discards.
- `internal/session/title_test.go` `TestApplyStatusUpdate_NeverTouchesTitleOverride` still passes (the clear is in `ApplyStatus`, not `applyStatusUpdate`); the REQ-7 clear needs new tests at `ApplyStatus` level.
- New coverage still needed: REQ-3 (non-prompt events, status endpoint, unroutable envelope, no override, override equal to Claude's name), REQ-6 (resume carries `--name`, next prompt sends nothing), REQ-7/REQ-8 through `Manager.ApplyStatus`, wrapper behaviour for a 2xx body / non-2xx / daemon down.

## Fix Attempt 3 (review cycle 2)

**Failures addressed**: Major 1 — `internal/server/CLAUDE.md` Invariants still said ingest does no parsing or state work on the request path.
**Changes made**:
- `internal/server/CLAUDE.md` Invariants: now "Ingest enqueues and answers at once; the only request-path work is an in-memory parse plus a session-state read to build a `UserPromptSubmit` rename reply (kb:adr/rename-pushed-to-claude-once). Persistence and state transitions stay in the single worker." Generated part untouched.
- `internal/server/ingest.go` `ingestJob` doc carried the same now-false claim ("Parsing happens in the worker, not the handler"); restated the same way. Other docs checked with `rg "request path|not-yet-parsed|Parsing happens" internal/server/*.go`: the `handleIngest` doc already says a routed prompt-submit reply may be written and "No DB work happens on this path", and the `ingestQueue` doc only claims the worker processes jobs in order, both still true.
**Decisions**: none new; comment-only and doc-only edits, no behaviour change. `go build ./...` exits 0, `make lint` clean.
