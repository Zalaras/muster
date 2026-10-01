# Daemon Implementation: Status Inconsistencies

**Plan**: status-inconsistencies
**Mode**: initial
**Pack**: kb: pack 32595 words (budget 20000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/claudecode/settings.go` | modified | `PostToolBatch` registered (REQ-2); twelve events |
| `internal/claudecode/interpret.go` | modified | `PostToolBatch` is turn activity; `StateInput.Agent`, `AgentUnknown`, `BackgroundTasks`; `KindTurnInterrupted`; Stop parsing moved to `interpretStop` (REQ-2, 3, 5) |
| `internal/claudecode/interpret_transcript.go` | created | `PromptInterrupted` + pure `scanInterrupt` over the 64 KB tail via `readTail` (REQ-4) |
| `internal/claudecode/claudecodetest/claudecodetest.go` | modified | builders: `RawPostToolBatch`, `RawPromptlessIdleNotification`, `RawSubagentPermissionRequest`, `InterruptLine`, `PlanRejectionLine`, `StopOpts.RunningShells/CompletedShells` |
| `internal/session/machine.go` | modified | REQ-1 (prompt-less idle_prompt no-op), REQ-3 (other-agent guard, owner recorded), REQ-4 (`KindTurnInterrupted` arm), REQ-5 (count set/reset), REQ-8 (Stop keeps a subagent wait) |
| `internal/session/session.go` | modified | `BackgroundTasks`, `AttentionAgent`, `clearAttention`, `waitOwnedByOther`, `inOpenTurn` |
| `internal/session/interrupt.go` | created | poll-tick sweep; checker runs outside the lock, applied via `Apply` |
| `internal/session/manager.go`, `liveness.go` | modified | `Config.InterruptChecker`; `pollLoop` calls the sweep after `checkLiveness` |
| `internal/session/apply.go` | modified | `Unread` set only when a closing input actually lands `idle` (`closesTurn`) |
| `internal/session/row.go`, `writeorder.go` | modified | row mapping; new fields in `restoreChangedFields` and `restoredSessionFields` (coverage check) |
| `internal/store/migrations/0011_turn_state.sql`, `internal/store/session.go` | created/modified | two columns |
| `internal/server/sessionwire.go` | modified | `backgroundTasks` |
| `internal/server/server.go`, `cmd/musterd/main.go` | modified | `Config.InterruptChecker`, wired to `claudecode.PromptInterrupted` in `buildServerConfig` |

REQ-9 (canary static strings) is `test/canary/static_test.go`, a test file: daemon-tests'.

## Decisions

- design: `StateInput.AgentUnknown` — a Notification `permission_prompt` has an empty `Agent` that means "cannot say", not "main"; the plan's row ("attentionAgent kept when already needs_input") needs the machine to tell it from a main `PermissionRequest`. Searched `rg "FromSubagent" internal/` — only the bool exists, which cannot carry that distinction.
- design: `interrupt.go` sweep mirrors `checkLiveness` (collectSessions value copies under `m.mu`, work outside the lock). It feeds the existing `Apply` with `KindTurnInterrupted` rather than a new setter, so persist, ordering turnstile and broadcast stay single-path; the arm re-validates current prompt and open-turn state under the lock, so a turn that closed between checker and apply is a no-op (it still persists/broadcasts one identical upsert in that rare race). `rg "PromptInterrupted|interrupt" internal/` found nothing to reuse.
- design: `clearAttention()` owns clearing `Attention` and `AttentionAgent` together (INV-A); every former `sess.Attention = nil` uses it. Shared state: `AttentionAgent`/`BackgroundTasks` are written only by `applyInput`/`applyBind` under `Manager.mu` (declared on the fields).
- design: idle_prompt guard lives in the machine (`promptID == nil` → return), not in `Interpret`, so the enveloped rebind in `Apply` still runs for a prompt-less event on a new Claude id (D2).
- Turn activity from another agent during `needs_input` still records `LastPrompt`, adopts an open unseen prompt id and latches mode (plan: "latch still updates; prompt adopted"); it does not transition.
- A main `Stop`/interrupt-free wait raised by main (`AttentionAgent == ""`) is also not cleared by a subagent's activity (plan INV-B, literal). Consequence: a main-owned `idle` wait is no longer cleared by subagent-marked activity.
- Size: `claudecodetest.go` (621 lines) and `manager.go` (559) were already over 500; kept, builders belong beside their siblings.
- doc-delta: `restoredSessionFields`/`restoreChangedFields` gained `BackgroundTasks` and `AttentionAgent`; no doc sentence affected.

## Handoff

**Build status**: `go build ./...` exits 0; `go vet ./...` clean; `make lint` 0 issues; `gofmt -l .` empty; `go test -race` passes for `internal/server`, `cmd/musterd`; `internal/session` passes.

Tests failing for count changes the plan sanctions (test agent updates them):
- `internal/store/migrate_test.go` (`TestMigrate_AppliesInitSchema`, `TestMigrate_SecondCallIsANoOp`) and `internal/store/store_test.go` (`TestOpen_SecondOpenOnSamePathDoesNotReapplyMigrations`): migration count 10 → 11 (Schema Changes, 0011).
- `internal/claudecode/settings_test.go` `TestMergeSettings_FreshFileRegistersCommandEntryOnAllElevenEvents`: eleven → twelve (Affected Files, settings.go).
- `internal/store/session_test.go` round-trip test should cover `BackgroundTasks`/`AttentionAgent` (D12); `machine_test.go`, `interpret_test.go`, new `interpret_transcript_test.go`, sessionwire test, and `test/canary/static_test.go` per the plan's test list.

## Fix Attempt 1 (pre-review fix)

**Failures addressed**: D3 `TestApply_PromptlessIdlePromptAfterClear/D3_…` — clear-rebind wiped `closedPromptIDs`, so a previous-conversation straggler `idle_prompt` read as unseen.
**Changes made**: `internal/session/machine.go` applyBind clear-rebind branch no longer sets `closedPromptIDs = nil` (still resets `currentPromptID` and the rest); comment says why.
**Paths enumerated** (`rg closedPromptIDs`, non-test): reset: machine.go only (the one removed); append/bound: `closePrompt` (session.go, `maxClosedPrompts` cap unchanged); read: `promptClosed` (session.go); rollback: writeorder.go `slices.Equal` restore (unaffected, compares post vs cur). No other door.
**Repro re-run**: D3 subtest now PASS; `make lint` 0 issues; gofmt/vet/build clean.
**Decisions**: none new.
**Handoff**: sanctioned breakage — `TestApplyInput_ClearRebind` in `internal/session/machine_test.go` (line ~108 `assert.Empty(t, sess.closedPromptIDs)`) asserts the old wipe; must now assert the ids are kept. It is the only failing test in `internal/session`.

## Fix Attempt 1 (review cycle 1)

**Failures addressed**: maintainability Minor 1-4.
**Changes made**:
- `internal/session/machine.go`: KindTurnClosed and KindTurnInterrupted arms pulled into `applyTurnClosed` / `applyTurnInterrupted`; `applyInput` 68 -> 51 statements (`make size-warn`: `51 > 40`; main was 52), so it is now below its `main` size.
- `internal/session/manager.go`, `internal/server/server.go`: one named `session.InterruptChecker` type; the session Config, Manager field and server Config all use it (`rg InterruptChecker` shows no remaining inline func types).
- `internal/claudecode/claudecodetest/claudecodetest.go`: `markSubagent` helper owns `agent_id`/`agent_type`; the three opts builders and `RawSubagentPermissionRequest` call it; `RawPermissionRequest` delegates with an empty agent id (no more decode/re-encode).
- `internal/claudecode/interpret_transcript.go`: comment on `scanInterrupt` giving the reader reason.

**Decisions**:
- design: `scanInterrupt` keeps `bufio.Reader.ReadBytes` rather than sharing `transcriptScan.scanChunk`'s `bufio.Scanner`: Scanner caps a line at 1 MiB and ends the scan on an over-long one, so a huge tool_result line in the tail before the interrupt line would hide the interrupt; ReadBytes has no cap. Different callers (accumulating titles vs a boolean probe) and no common iteration shape worth a shared helper.
- design: `session.InterruptChecker` named func type beside `PaneChecker` in manager.go; `rg "func\(path, promptID string\)|func\(transcriptPath, promptID" internal` found only the three inline copies.
- size: `cmd/musterd/main.go` filelen 513 -> 515: the two lines are the `InterruptChecker: claudecode.PromptInterrupted` wiring and its blank separator in `buildServerConfig`; the file is the composition root, so wiring lives there (conventions § Composition roots). `claudecodetest.go` filelen (619) is the shared builder file, builders kept together by design.
**Handoff**: no test files touched or broken; lint 0 issues, `go test -race` session/claudecode/server ok.
