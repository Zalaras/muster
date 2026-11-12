# Review: sweep-2026-11-12-1

**Plan**: sweep-2026-11-12-1
**Verdict**: approved
**Cycle**: 2
**Gates**: 0 failed
**Parts**: code | skipped: browser, maintainability
**Part verdicts**: code approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: sweep-2026-11-12-1

**Plan**: sweep-2026-11-12-1
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 48439 words (budget 30000)

Delta scope: `git diff 23982dff..HEAD`. Production files touched: `cmd/musterd/main.go`, `internal/claudecode/interpret_transcript.go`, `internal/claudecode/launchtranscripts.go`, `internal/session/interrupt.go` and `internal/session/manager.go`. Tests touched: `internal/claudecode/interpret_transcript_test.go` and `internal/session/interrupt_test.go`. Docs touched: the new ADR, plus the plan's REQ-6, Proof 5, D7, Doc Delta and `**Touches**`.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1..REQ-5 | Unchanged since cycle 1: `machine.go`, `session.go` and `interpret.go` are not in the delta | D1–D5 green in this gate run | pass |
| REQ-6 | Yes. `claudecode.PromptInterruptedAt` returns the absolute offset just past the last interrupt line for the prompt: `readTailFrom` returns the tail's start offset, and `scanInterruptEnd` adds line lengths to it. `sweepInterrupts` acts only when `offset > 0` and `interruptIsNew`, meaning no mark, a mark for another prompt, or a greater offset. After a successful Apply it records `{promptID, offset}` per session id. `pruneInterruptActed` keeps a mark while the turn is closed (`currentPromptID == ""`) or on the same prompt. The seam matches the plan's "Cycle 1 wave" ruling exactly (`func(path, promptID string) (int64, error)`, wired in `cmd/musterd/main.go:447`, `server.Config` through the shared type) | D7 `TestSweepInterrupts_ReopenedPromptNotReclosedByOldInterrupt` drives the real `PromptInterruptedAt` over a real file: interrupt → idle, reopen → working, two sweeps on the same file stay working, an appended interrupt line → idle. `TestPromptInterruptedAt` covers 0 for none / plan rejection / other prompt / missing file, a positive in-file offset, a strictly larger offset for a second line, no change from another prompt's line, an absolute offset past the 64 KiB window, and a directory as an error. A gap in the prune branch is Minor 1 | pass |
| Edge 2 | Now holds for the interrupt closer too: a reopened interrupt-closed prompt stays working until a new interrupt | D7 | pass |
| DIAG | `kb:diagram/daemon-components`: `Rel(cmd, cc, "wrapper scripts, version, interrupt checker")` is still true, and no package imports changed. `kb:diagram/containers` (for `cmd/musterd/main.go`): the transcript-interrupt read is still described correctly | — | pass |

## Build & Tests

E2E tests: pass (92, scoped to 11 files: auth, claude-version, embedded, ingest-envelope, ingest, masthead-update-dot, past-sessions, reconcile, resilience, state-transitions, subagent-status) · Daemon tests (race): pass (6 packages: cmd/musterd, claudecode, claudecodetest, server, session, tools/versions) · Web tests: pass (3190, 110 files) · Render tests: pass (463) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues; web-lint clean; e2e-lint, render-lint and render-fixtures clean; contrast 0 failures; kb check 0 problems). All read from $GATES_LOG_DIR (27 lines, 0 failed). `WARN size` and the e2e-level census are warn-only and belong to maintainability.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `go test -count=1 -run 'TestApplyInput_TeammateReinvocationOnClosedPrompt' ./internal/session/` | pass (22-D1.log) |
| D2 | `go test -count=1 -run 'TestApplyInput_TeammateReinvocationAskUserQuestionReadsNeedsInput' ./internal/session/` | pass (23-D2.log) |
| D3 | `go test -count=1 -run 'TestApplyInput_CrossStateInvariants' ./internal/session/` | pass (24-D3.log) |
| D4 | `go test -count=1 -run 'TestInterpret_UserPromptSubmit_Prompt\|TestInterpret_ReopensClosedPromptFlag' ./internal/claudecode/` | pass (25-D4.log) |
| D5 | `go test -count=1 ./internal/session/ ./internal/claudecode/` | pass (26-D5.log) |
| D6 | `make lint` | pass (deduped to the gates' lint line, 03-lint.log: 0 issues) |
| D7 | `go test -count=1 -run 'TestSweepInterrupts_ReopenedPromptNotReclosedByOldInterrupt' ./internal/session/ ./internal/claudecode/` | pass (27-D7.log; session ok; claudecode "no tests to run", exit 0) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. The ADR rewording is accurate against kb:fact/hook-await-per-event (see Delta). The Doc Delta's new interrupt sentence matches `interruptIsNew`. The old ADR is still status-only (`git diff main` shows only the status line). There are no `deviation:`/`doc-delta:` lines in the cycle-1 wave logs. The #122/#123 ticks are left to the sweep loop |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | No Claude Code event name or payload key appears in `internal/session` (the flag is neutral) | pass | `rg 'PreToolUse\|PermissionRequest\|PostToolUse\|PostToolBatch\|agent_id\|hook_event_name\|agent-message\|prompt_id\|Request interrupted\|promptId' internal/session --glob '!*_test.go'` matches only the two pre-existing comments, `machine.go:78` and `:90`. The new seam passes a neutral `int64` offset, and the interrupt marker text and transcript read stay in `internal/claudecode` |
| RV2 | The new ADR states the decision, its awaited-hook basis, the curl-timeout edge case, any-closer reopen, and the subagent-owned-wait case; the old ADR's body is unedited | pass | All five are present. The basis now reads "PreToolUse is awaited … and a PermissionRequest follows its tool's PreToolUse", which the fact supports. Any-closer now holds for the interrupt closer ("An interrupt the sweep already acted on never closes the reopened prompt again"). The old ADR diff is the status line only |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. `PromptInterruptedAt` and `readTailFrom` are in `internal/claudecode`. `internal/session` sees `(int64, error)` only |
| 2 | No terminal-output state parsing | pass. The transcript interrupt read is the one sanctioned source (kb:adr/lifecycle-interrupt-read-from-transcript). No pane text is involved |
| 3 | Non-blocking hook handler | pass. Untouched |
| 4 | tmux via `-L muster` / sizing | pass. Untouched |
| 5 | No payload logging | pass. The only log lines are the existing Debug/Error with `session_id` and err |
| 6 | Empty-gauge honesty | pass. Not touched |
| 7 | Identity on tmux target | pass. `interruptActed` is keyed by the Muster session id |
| 8 | No settings trespass | pass |
| 9 | No real `claude` in tests | pass. Synthetic `claudecodetest.InterruptLine` files only |

## Delta (delta re-review only)

| Prior issue (id) | Status | Fix commit | Verified how |
|---|---|---|---|
| Major 1 `[orchestrator]` docs/adr/lifecycle-awaited-main-event-reopens-closed-prompt.md:Options+Decision:awaited-basis | resolved | `675d80c1` | Diff read against kb:fact/hook-await-per-event. Options (B) now says only "a PostToolUse is not awaited", which matches the fact. (C) names the two events as "start work" rather than "awaited". The Decision basis no longer claims PermissionRequest is awaited. The Doc Delta drops "only unawaited … batch end" and names the two reopening events and the inert rest. Nothing else in the ADR changed except the added interrupt consequence, which REQ-6 asked for |
| Decision 1 `[orchestrator:decision]` internal/session/interrupt.go:sweepInterrupts:re-closes-reopened-interrupted-prompt | resolved (option B, the developer's stop answer) | `679b9885` (impl), `f977cb62` / `39e2ace9` (tests), `aac3fe9b` (ruling) | Diff read. The sweep now closes only on an offset greater than the one it acted on for that session and prompt. D7 is green over a real file. The change is confined to the seam, the sweep and its two helpers, as the ruling scoped it |

No `counter:`/`refute:` was carried.

## Issues

### Critical
None.

### Major
None.

### Minor
1. **[daemon-tests]** `TestSweepInterrupts_ReopenedPromptNotReclosedByOldInterrupt` (`internal/session/interrupt_test.go:414`) runs no sweep tick between the interrupt closing p1 and the reopening PreToolUse. That leaves `pruneInterruptActed`'s keep-while-closed branch (`currentPromptID == ""`, `interrupt.go:310`) untested.
   - The poll loop sweeps every tick while the card sits idle. Suppose a prune that dropped the mark whenever `currentPromptID != mark.promptID`, including `""`. It would discard the mark during the idle stretch, and the old line would re-close the reopened prompt, which is exactly the REQ-6 failure.
   - This test still passes under that mutation, because its only post-close prune runs with p1 already current again.
   - A fix must make the test sweep at least once while p1 is closed, before the reopen, and still assert working afterwards.

   id: internal/session/interrupt_test.go:TestSweepInterrupts_ReopenedPromptNotReclosedByOldInterrupt:prune-while-closed-unexercised | confidence: 85

### Notes
1. **[note]** `daemon-implementation.md` ends on "Fix Attempt 1 … blocked, no code changed". It has no entry for the implementation that shipped in `679b9885` (the offset seam, `interruptActed`, `readTailFrom`), so the change log no longer lists every file the delta touched.
2. **[note]** `interruptActed` is in-memory only, as are `currentPromptID` and the closed ring. After a daemon restart, a re-invoked main PreToolUse under p1 adopts p1 as an unseen prompt. The old interrupt line in the tail then closes it once more, and the next PreToolUse reopens it with the mark now set. That gives one idle blip per restart, on a path no probe has shown. The Doc Delta's "never by the one that already closed it" holds within one daemon run.
3. **[note]** For doc-reconcile: the Doc Delta's "every other unmarked event on a closed prompt (tool end, batch end, notification, idle notice) is a straggler that changes nothing" is scoped by its parenthetical. A Stop-family event on an already-closed prompt still lands `idle`/`failed` (`applyTurnClosed` → `endTurnIntoIdle`), so the promoted prose should not read as covering closers.
4. **[note]** The new ADR's `files:` and `tests:` do not name `internal/session/interrupt.go`, `internal/claudecode/interpret_transcript.go` or `TestSweepInterrupts_ReopenedPromptNotReclosedByOldInterrupt`, even though its Consequences now state the sweep rule. `kb for internal/session/interrupt.go` will therefore not surface it.
