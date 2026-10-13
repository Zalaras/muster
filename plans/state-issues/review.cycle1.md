# Review: state-issues

**Plan**: state-issues
**Verdict**: needs-changes
**Cycle**: 1
**Gates**: 0 failed
**Parts**: code, maintainability | skipped: browser
**Part verdicts**: code approved, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: State Issues

**Plan**: state-issues
**Part verdict**: approved
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

## Maintainability review

# Maintainability review: State Issues

**Plan**: state-issues
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb pack (role review-maintainability, plan state-issues) — conventions § Go/§ Design, daemon-components diagram, lessons
**Scope**: 8 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (6 Go, 2 generated CLAUDE.md trailers)

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/session/machine.go | apply.go, session.go, interrupt.go, writeorder.go | yes (bindIdentity, latchPermissionMode, turnEnded) | funlen `applyInput` 51>40, reason holds (identical at main, new arms are helpers) | Major 1, Minor 1 |
| internal/session/apply.go | machine.go, interrupt.go, manager.go | yes (turnEnded replaces closesTurn) | none | Major 1 (bind-kind list) |
| internal/session/session.go | machine.go, writeorder.go, row.go | yes (compactionPromptID, permissionWaitOwnedByOther) | none | pass |
| internal/session/writeorder.go | session.go, apply.go | covered by compactionPromptID line | none | pass |
| internal/claudecode/interpret.go | interpretStop / interpretSessionStart / interpretNotification in same file, ingest | yes (kind renames) | none | pass |
| internal/claudecode/claudecodetest/claudecodetest.go | RawStop / RawPermissionRequest / RawPreToolUse in same file | n/a (fixture field) | filelen 629>500, pre-existing (630 at main) | note |
| internal/claudecode/CLAUDE.md | — (generated trailer) | n/a | none | pass |
| internal/session/CLAUDE.md | — (generated trailer) | n/a | none | pass |

## Issues

### Critical

### Major

1. **[daemon-impl]** A second home for the rebind decision, without the original's monotonic guard — `internal/session/machine.go:279-282` (`applyCompactionEnded`: `if sess.ClaudeSessionID != "" && sess.ClaudeSessionID != claudeSessionID { applyBind(... KindClearRebind ...) }`) beside `internal/session/apply.go:31-45` (Apply's enveloped branch, which rebinds only when `byClaude[claudeSessionID]` does not already point at this session — kb:adr/ingest-monotonic-rebind). Adding `KindCompactionEnded` to `isBindKind` (`apply.go:87`) takes the compact SessionStart out of Apply's guarded path, and `applyCompactionEnded` re-decides "different id → clear-rebind" on its own. Cites `docs/conventions.md` § Design "One owner per concept … Two places that must agree will not." Concrete interleaving the two homes disagree on: session bound to A; `/clear` lands, binding B (`byClaude[A]` and `byClaude[B]` both → this session); a reordered `SessionStart(source:"compact")` for A then arrives — Apply's guard would treat it as a straggler, but `applyCompactionEnded` clear-rebinds backwards to A, resets context/compactions, and `apply.go:52` writes `byClaude[A]`. The `design:` line for `bindIdentity` names REQ-9 for the clear-rebind but not why the monotonic check does not apply. A fix must make true: the decision "this event's id differs from the bound one — forward rebind or straggler?" is made in one place for every enveloped kind including the compact SessionStart, and a compact SessionStart naming an id this session already left does not rebind backwards (or Decisions states, with a source, why compact is exempt and that exemption is visible at the one place the decision lives).

### Minor

1. **[daemon-impl]** The leave-a-turn-for-idle step now has four copies — `internal/session/machine.go:232-234` (`applyTurnClosed`), `:246-249` (`applyTurnInterrupted`), `:264-267` (`applyIdleNotice`), `:294-297` (`applyCompactionEnded`): each is `clearAttention(); Failure = nil; setState(StateIdle, now)` (three of them preceded by the same `closePrompt(*promptID)`). Main had two (`git show main:internal/session/machine.go`, lines 237-239 and 251-253); the branch added two. This sequence is how the attention-iff-needs_input and failure-iff-failed invariants are kept on the way to idle; a fifth arm that forgets `Failure = nil` breaks one silently. Cites § Design "Reuse before add" and "One owner per concept"; the `design:` line ("Sibling shape matched: the helpers beside applyTurnClosed/applyTurnInterrupted") explains where the helpers sit, not the repeated tail. A fix must make true: ending a turn into idle (close prompt, clear attention, clear failure, set idle) has one home that the four helpers call, and the return-`true` they share stays with it or beside it.

### Notes

1. **[note]** The comment pass removed pre-existing `main` comments, contrary to kb:adr/process-comment-pass-owns-code-comments ("legacy comments on `main` are out of scope"). When the branch edited one word inside an existing block, `tools/commentpass strip` took the whole block as branch-added and the judge dropped it (`plans/state-issues/comment-pass.json` cycle 1). Removed blocks that were on main nearly verbatim: `internal/session/apply.go:11` Apply's 33-line doc (the monotonic-rebind straggler rules, the one-persist-one-broadcast contract); `internal/session/writeorder.go:165` restoreChangedFields' 44-line restore-target policy; `internal/claudecode/interpret.go:60` FromSubagent's boundary doc ("internal/session sees only this neutral bool"); `internal/session/session.go:243` the wait-ownership doc; `internal/session/machine.go:191` the resume-claim graduation note and `:199` "never resets the latch"; `internal/session/session.go:62` Attention.Reason's enumeration; `internal/claudecode/claudecodetest/claudecodetest.go:89,394`. A newcomer to `apply.go` and `writeorder.go` now meets the least obvious code in the package with no doc at all. Also gone: `compactionPromptID`'s declaration (`session.go:203`) no longer names its writers or its guard (§ Design "Shared state names its writers and its guard"). For the orchestrator: restore the main-text blocks, or bring the tool into line with its ADR (`/retro` material).
2. **[note]** `internal/session/apply.go:52` and `isBindKind` (`apply.go:87`) are two hand-kept lists of bind kinds that intentionally differ (ResumeBind is in one, not the other), and the branch extended both. They predate the branch; the new entry makes them harder to read. Folding them falls under Major 1's single home if the fix touches it.
3. **[note]** `Attention.Reason` stays an untyped `string` with untyped consts `attentionPermission`/`attentionIdle` (`session.go:55-58`), while its siblings `State` and `PermissionMode` are typed string enums in the same file. Replacing the literal with consts is an improvement; a typed `AttentionReason` would match the siblings. No change requested.
4. **[note]** Size: `applyInput` funlen 51>40 has a reason in Decisions that holds (same count at main; the new arms go to helpers). `claudecodetest.go` filelen 629>500 has no reason given, but the file was already 630 lines at main and the branch made it a line shorter. Nothing to fix.
5. **[note]** Race: every write to `compactionPromptID` (`machine.go:278`, `session.go:281`) runs inside `Apply` under `Manager.mu` (`apply.go:14`), and the field is in both `restoreChangedFields` and `restoredSessionFields`, so `mustCoverEverySessionField` stays honest. I found no interleaving to report.
6. **[note]** Diagram: the new kinds `idle_notice` / `compaction_began` / `compaction_ended` change the lifecycle machine's inputs; review-work checks whether the lifecycle diagram and spec name them (the daemon log's `doc-delta:` line).
