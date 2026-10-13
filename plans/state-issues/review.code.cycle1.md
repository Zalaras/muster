# Correctness review: State Issues

**Plan**: state-issues
**Verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 35205 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes: `applyIdleNotice` (`internal/session/machine.go`) never sets `Attention` or `StateNeedsInput`; `interpretNotification` maps `idle_prompt` → `KindIdleNotice` | Yes: `TestApplyInput_IdleNotice` (8 sources × 4 prompt shapes), D3 table INV-B, E2/E3/E4 | pass |
| REQ-2 | Yes: working/planning + open or unseen id → closes the named and current prompt, clears attention/failure, `idle`, returns `turnEnded` so `Apply` sets `unread` from the watcher; `LastActivity`/`BackgroundTasks` untouched | Yes: `TestApplyInput_IdleNotice`, `TestApply_CardStateUnread` (watched and unwatched), E3, planning e2e, edge 9 (#72) | pass |
| REQ-3 | Yes: started/idle/failed and `needs_input`/permission only close the named prompt; legacy `idle` wait (`idleWait()`) ends into `idle` | Yes: `TestApplyInput_IdleNotice` rows, edge 10, E2, E4 | pass |
| REQ-4 | Yes: nil or closed `prompt_id` returns before any mutation | Yes: `TestApplyInput_IdleNotice` inert rows assert whole-struct equality; edges 12, 13; three e2e pins | pass |
| REQ-5 | Yes: `permissionWaitOwnedByOther` checks `Attention.Reason == attentionPermission` | Yes: `TestApplyInput_LegacyIdleWaitEndsOnAnyAgentsActivity`, edge 11 | pass |
| REQ-6 | Yes: `applyCompactionBegan` outside `inOpenTurn()` adopts the prompt, marks `compactionPromptID`, clears attention/failure, `StateWorking` (latch not consulted), `Compactions++` | Yes: `TestApplyInput_CompactionBegan` (latch default and plan), E1, E1b, plan-mode e2e | pass |
| REQ-7 | Yes: inside a turn only `Compactions++` | Yes: `TestApplyInput_CompactionBegan` (asserts current prompt, attention, `stateSince` unchanged and the id is not marked), edge 6, E1c/E1d | pass |
| REQ-8 | Yes: `applyCompactionEnded` + `compactionOpen` (marker == current, not closed) closes it, lands `idle`, `turnEnded` → `unread` | Yes: `TestApplyInput_CompactionEnded` (from started/idle/failed; Context, Compactions, LastActivity, LastPrompt, BackgroundTasks asserted unchanged), `TestApply_CardStateUnread`, E1/E1b | pass |
| REQ-9 | Yes: every other compact `SessionStart` is `bindIdentity` only; a different `session_id` escalates through `applyBind` (clear-rebind); `isBindKind` and the `byClaude` update include `KindCompactionEnded` | Yes: six no-op shapes asserted by whole-struct equality, edge 14 from all 8 sources, `TestApply_CompactionEndedBinding` (one broadcast, binding map consistent) | pass (see Decision 1 for an already-left `session_id`) |
| REQ-10 | Yes: `interpretSessionStart` only adds a `compact` case | Yes: `TestInterpret_SessionStart` unchanged, `TestInterpret_SessionStartCompactAndUnknownSource` (absent/null/empty/unknown/wrong case → `KindBind`), e2e REQ-10 pin | pass |
| REQ-11 | Yes: no code change; `inOpenTurn` is state-only, so a compaction's `working` is inside the sweep | Yes: `TestSweepInterrupts_CompactionPromptIsInsideTheSweep` | pass |
| REQ-12 | Yes: `latchPermissionMode` returns on `input.FromSubagent`; its only callers are the turn-activity and Stop arms | Yes: `TestApplyInput_SubagentEventsNeverMoveTheLatch` (8 sources × 3 latches × 6 modes, plus an unmarked control per row), edge 15, E5 and the acceptEdits pin | pass |
| REQ-13 | Yes: `StopFailure` reads `agent_id` (`FromSubagent`/`Agent`, the same `!= nil` rule as the other marked events); `KindTurnFailed` returns first when marked | Yes: `TestApplyInput_SubagentStopFailureChangesNothing` (whole-struct equality, marked and unmarked, 4 prompt shapes), `TestInterpret_StopFailureSubagentMarker`, edges 16–18, E6 | pass |
| DIAG | `kb:diagram/daemon-components` (named by `kb for` on all five changed production files): no import changed, so still true. The lifecycle spec's inline state diagram is the plan's `## Diagrams` delta, and doc-reconcile applies it | — | pass |

## Build & Tests

E2E tests: pass (763/763, 26 of them in the new `state-transitions.spec.ts`) · Daemon tests (race): pass (every package `ok`) · Web tests: pass (2492) · Daemon build: pass · Web build: pass · Lint: pass (`golangci-lint` 0 issues, biome clean, e2e-lint clean, contrast 0 failures) — all read from `$GATES_LOG_DIR` (`/var/folders/8t/36s1xtwj1xjfn1pg_jrwztjw0000gn/T//gates-state-issues-c1`). `16-size.log` WARN lines belong to review-maintainability.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass (deduped to the baseline `test-race`, `02-test.log`) |
| D5 | `make lint` | pass (deduped to `lint`, `03-lint.log`: `0 issues.`) |
| D6 | `go build ./...` | pass (deduped to `build`, `01-build.log`) |
| K1 | `make check-kb` | pass (deduped to `kb-check`, `11-kb-check.log`: 556 records, 0 problems) |
| E1 | `make e2e` | pass (deduped to `e2e`, `17-e2e.log`: `763 passed (6.1m)`) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. The five proposed ADRs exist with `status: proposed` and `refs: plan:state-issues`, and they match what shipped. The impl log has no `deviation:` line. `ux-flows.md` has the Needs-Input row edit. The `TODO.md` ticks for #65/#66/#70/#72/#78/#86/#87 are still open; SKILL.md says no ✅ tick until review approves, so they are re-verified at Completion. Every Doc Delta assertion holds against the code. Two gaps are under Minors 1 and 2 |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D2 | each D2-pinned edge case has its own test | pass | `TestApplyInput_CardStateEdgeCases` names edges 1, 2+4, 3, 6, 7, 9, 10, 11, 12, 13, 15, 16, 17, 18 as sequences and asserts the state after every step. Edge 14 is in `TestApplyInput_CompactionEnded` (all 8 sources) and `TestApply_CompactionEndedBinding`. Edges 5 and 8 are marked untested by the plan |
| D3 | the table crosses every listed input with every listed source state | pass | `TestApplyInput_CardStateInvariants_D3`: 9 inputs (idle_prompt no/open/closed/unseen id, PreCompact, compact SessionStart own/other, marked StopFailure, marked activity carrying `dontAsk`) × 8 sources (`needs_input` as main permission, subagent permission and legacy idle). It asserts INV-A (`assertTurnStateInvariants`), INV-B, INV-C and INV-D after every row. INV-C is applied as "unless already started" (Note 3) |
| D4 | interpret tests cover all four `SessionStart` sources plus a missing one | pass | `startup`/`resume`/`clear` in `TestInterpret_SessionStart`; `compact` and absent/null/empty/unknown in `TestInterpret_SessionStartCompactAndUnknownSource` |
| D7 | `internal/session` branches only on neutral kinds | pass | No added production line in `internal/session` compares an event name, `notification_type`, `source` or `agent_id`. The new arms switch on `KindIdleNotice`/`KindCompactionBegan`/`KindCompactionEnded` and `FromSubagent`. The `attentionPermission`/`attentionIdle` consts are Muster's own wire enum |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass: `agent_id` and `source:"compact"` are read only in `internal/claudecode/interpret.go`. `rg` for payload field names outside `internal/claudecode` finds only SQL column names in `internal/store` and a pre-existing comment |
| 2 | Terminal-output state parsing | pass: no new state source (the #78 gap is accepted, not filled from the pane) |
| 3 | Blocking hook handler | pass: ingest path untouched |
| 4 | Bare tmux | pass: no tmux invocation added |
| 5 | Payload logging | pass: no log call added |
| 6 | Empty-gauge dishonesty | pass: no gauge path touched |
| 7 | Identity on `session_id` | pass: compaction state keys on the Muster session; `compactionPromptID` is per-session |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary/probes | pass: tests and e2e use synthesized payloads; `test/canary/state_test.go` only had its imports regrouped |

## Issues

### Critical
None.

### Major
None.

### Minor
1. **[orchestrator]** The Doc Delta leaves two lifecycle-spec sentences that this plan made false off its "stops being true" list. doc-reconcile promotes the delta verbatim, so these would survive beside the new lines:
   - States: "`needs_input` (a permission **or idle prompt** is waiting …)". REQ-1 means an idle prompt never raises a wait any more.
   - Inputs: "The permission mode is a last-known latch … overwritten by **any event** that carries the field". This contradicts the delta's own new sentence "Only main-agent events move the mode latch" (REQ-12).

   Also, in `docs/protocol.md` `kb:anchor/state.tracked`, `unread` is "set by the `Stop` row". The `idle_prompt` turn-end, compaction-end and interrupt rows now set it too, and the transitions table already says "`unread` as `Stop`". Add these lines to the Doc Delta before doc-reconcile runs.
2. **[orchestrator]** The fact `kb:fact/hook-payload-fields` (verified `2.1.233..2.1.296`) says "`prompt_id` is on all except `SessionStart`". `kb:fact/compact-hook-sequence` measured on 2.1.296, and canary `TestCompactHookSequence` (`test/canary/state_test.go:38`) guards, that `SessionStart{source:"compact"}` carries the compaction's `prompt_id`. REQ-8 depends on that. Qualify the older fact to say startup/clear/resume carry none and compact does. The comment at `internal/claudecode/ingest_test.go:28` has the same stale claim (a [note]-level comment).

### Decisions
1. **[orchestrator:user-decision]** A compact `SessionStart` whose `session_id` this session has already left now rebinds **backwards**. `applyCompactionEnded` (`internal/session/machine.go`) sends any id that differs from the bound one to `applyBind` as a clear-rebind. That resets context, compactions, `lastActivity` and `backgroundTasks` and lands `started`. It also skips `Apply`'s monotonic guard, because `isBindKind` now includes `KindCompactionEnded`. This follows REQ-9 to the letter ("a `session_id` different from the bound one still escalates to the clear-rebind"). It is in tension with accepted `kb:adr/ingest-monotonic-rebind` ("An enveloped event never rebinds a session backwards") and with the protocol table row "Any enveloped non-status event whose `session_id` is a previous id … no rebind". The two rows now contradict each other for this input. The startup bind has the same pre-existing exemption, but a startup never carries an old id. A compact `SessionStart` does carry the current one, about 10 s after its `PreCompact`. daemon-tests reported this as an observation and did not assert it either way.
   - **Option A: keep it (REQ-9 as written).** No code change. The protocol's previous-id row gains a "except a `SessionStart`" qualifier. The risk is that the compact `SessionStart` is delivered after a `/clear`'s `SessionStart(clear)`. That needs the developer to `/clear` inside one hook-delivery window (tens of ms) after a compaction ends, which is unlikely but is the same reordering class the ADR was written for.
   - **Option B: monotonic for compaction ends.** `applyCompactionEnded` does nothing on an already-left id: it routes and applies with no rebind, as the straggler row says. This needs `byClaude` (the Manager's map) to be consulted, for example by not treating `KindCompactionEnded` as a binder for a left id. It is a few lines plus a REQ-9 and protocol-row qualifier, and the ADR then holds without exception for this kind.

### Notes
1. **[note]** The comment pass (`plans/state-issues/comment-pass.json`, 21 of 22 dropped) removed whole **pre-existing** doc blocks because the implementer edited one word in each. Examples:
   - the `Apply` contract on the envelope binding cases (`internal/session/apply.go:11`);
   - `restoreChangedFields`'s restore-target rationale (`internal/session/writeorder.go:165`);
   - the `FromSubagent` doc, including "internal/session sees only this neutral bool, never the marker's payload key name" (`internal/claudecode/interpret.go:60`);
   - `isBindKind` (`apply.go:87`);
   - the pending-resume graduation note with its `kb:adr/launch-resume-pending-hold-persisted` citation, moved into `bindIdentity` (`machine.go:189`);
   - `Attention.Reason`'s value list (`session.go:62`).

   None of them is false; they are gone. review-maintainability owns the reading of this. The orchestrator may want to restore the pre-existing blocks with their one-word edit.
2. **[note]** `kb pack --role review` is over budget: 35205 words against 30000.
3. **[note]** INV-C as amended still cannot hold literally from source `started`. A compact `SessionStart` naming another prompt is REQ-9's no-op there, so the card stays `started`. The D3 table checks it as "never lands `started` unless it already was" (`internal/session/machine_cardstate_test.go`, the `TestApplyInput_CardStateInvariants_D3` doc comment says so), which is the only reading consistent with REQ-9. This is the same shape as the INV-B amendment, and the test is honest.
4. **[note]** The impl log records a residual hazard the plan accepts (REQ-3): an `idle_prompt` naming the open current prompt of a `needs_input`/permission session closes it, so the answering activity would read as a straggler and the interrupt sweep would no longer see an open current prompt. `kb:fact/permission-wait-gets-no-idle-prompt` says this sequence does not occur. No change is requested.
