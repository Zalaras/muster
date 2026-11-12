# Daemon Implementation: sweep-2026-11-12-1

**Plan**: sweep-2026-11-12-1
**Mode**: initial
**Pack**: kb: pack 30825 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/claudecode/interpret.go` | modified | `StateInput.ReopensClosedPrompt` (REQ-5); `<agent-message` prefix skipped for Prompt (REQ-4); tool/permission hooks read by new `interpretToolEvent` |
| `internal/session/session.go` | modified | `reopenPrompt(id)` beside `closePrompt` (REQ-1, REQ-2) |
| `internal/session/machine.go` | modified | both closed-prompt guards honour the flag; reopen then normal transition (REQ-1..3) |
| `internal/session/CLAUDE.md` | modified | straggler invariant gains the reopen qualifier, cites the new ADR |

## Decisions

design: `interpretToolEvent` extracted because adding the flag pushed `interpretKind` to gocyclo 16 (>15); it merges the PreToolUse/PostToolUse/PostToolBatch and PermissionRequest cases, which already shared one payload shape. `rg "agent_id" internal/claudecode/interpret.go` found only per-case inline structs; matched the `interpretStop` sibling shape.
design: `reopenPrompt` removes the id from the ring via `slices.DeleteFunc` and sets `currentPromptID`; matches `closePrompt`'s ring handling.
Size: `applyInput` funlen warning (56 > 40) is covered by its existing gocyclo nolint rationale; the reopen lines stay inline because the guards sit in the per-Kind arms.
doc-delta: none beyond the plan's.

## Handoff

**Build status**: `go build ./...` exits 0; `make lint` 0 issues; `go test -race` for internal/session and internal/claudecode green (all five red tests now pass). Test files needing changes: None.

## Fix Attempt 1 (review cycle 1, REQ-6)

**Status**: blocked, no code changed.

**Failures addressed**: TestSweepInterrupts_ReopenedPromptNotReclosedByOldInterrupt (not made green).

**Why the current seam cannot hold the fix**: `session.InterruptChecker` is `func(path, promptID string) (bool, error)` and the test assigns `claudecode.PromptInterrupted` to `Config.InterruptChecker` through that exact type. `PromptInterrupted` rescans the last 64 KiB on every call and answers only true/false, so after a reopen the old interrupt line and a genuinely new one give the same answer. No Manager-side state (consumed count, transcript size or offset at the close) can tell them apart from a bool; the discriminator has to come out of the transcript read, which must stay in `internal/claudecode`.

**Decisions**: none; nothing was committed beyond this log.

### Handoff (blocked)

**Build status**: `go build ./...` exits 0 (tree untouched).

Signature needed. In `internal/claudecode/interpret_transcript.go` add the count and make the checker return it:

```go
func PromptInterruptCount(transcriptPath, promptID string) (int, error)
```

(same tail read and `lineInterrupts` match as `PromptInterrupted`, counting every matching line instead of stopping at the first; missing file is `(0, nil)`; `PromptInterrupted` can stay as `count > 0` for the canary test).

In `internal/session`: `type InterruptChecker func(path, promptID string) (int, error)`; `Config.InterruptChecker`, `server.Config.InterruptChecker` and `cmd/musterd/main.go:447` follow. `sweepInterrupts` keeps a map `{session id, prompt id} -> consumed count`, owned by the sweep goroutine alone (the poll loop is its only caller), set to the count it acted on when Apply closes the prompt, and treats the prompt as interrupted only when the count exceeds the consumed one. One caveat: the 64 KiB tail window can drop old lines as the transcript grows, so a count that shrinks below the consumed value must reset the baseline to the smaller count rather than stay stuck.

Test-file changes this forces (test agent, sanctioned by REQ-6 / the developer's option B):
- `internal/session/interrupt_test.go`: `withInterruptChecker` parameter type and `checkerDouble.check`/`answer` signatures return `int` instead of `bool`; the REQ-6 test's wiring line becomes `withInterruptChecker(claudecode.PromptInterruptCount)`; any other `withInterruptChecker(...)` call site, including `internal/session/manager_cardstate_test.go:286`, follows.
- `internal/claudecode/interpret_transcript_test.go`: add count cases if `PromptInterruptCount` ships.

Alternative that keeps the test untouched: none found. The orchestrator decides whether to approve the signature change.

## Fix Attempt 2 (review cycle 1, REQ-6) — recorded by the orchestrator

Committed as 679b9885; the agent reported it but did not write this section. Per its report:
`claudecode.PromptInterruptedAt(path, promptID) (int64, error)` (offset just past the last interrupt
line, 0 when none; `PromptInterrupted` is `at > 0`); `session.InterruptChecker` takes the new
signature; `cmd/musterd/main.go` wires it; the sweep keeps one in-memory mark per session (under the
manager mutex), dropped when the session is removed or moves to another prompt, kept while the prompt
is closed; `readTailFrom` in `launchtranscripts.go` gives the tail's start offset. go build, go vet,
make lint (0 issues) and go test -race for internal/session, internal/claudecode, internal/server passed.
Size: `internal/session/manager.go` over its 500-line warning (≈6 lines added).
