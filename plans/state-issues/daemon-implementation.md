# Daemon Implementation: State Issues

**Plan**: state-issues
**Mode**: initial
**Pack**: kb: pack 23804 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/claudecode/interpret.go` | modified | `idle_prompt` → `KindIdleNotice` (was `KindNeedsInputIdle`); `PreCompact` → `KindCompactionBegan` (was `KindCompaction`); `SessionStart{source:"compact"}` → new `KindCompactionEnded`; `StopFailure` now sets `FromSubagent`/`Agent` from `agent_id` (REQ-1–4, 6–9, 13) |
| `internal/session/machine.go` | modified | New arms `applyIdleNotice`, `applyCompactionBegan`, `applyCompactionEnded`; `bindIdentity` split out of `applyBind`; latch ignores subagent events; subagent `StopFailure` inert; `applyInput` and the turn-closing helpers now return whether a turn ended into idle |
| `internal/session/session.go` | modified | `compactionPromptID` (in-memory), `compactionOpen`, `idleWait`, `permissionWaitOwnedByOther` (replaces `waitOwnedByOther`, REQ-5), `attentionPermission`/`attentionIdle` consts, `closePrompt` clears the marker |
| `internal/session/apply.go` | modified | Unread is set from `applyInput`'s turn-ended result, replacing `closesTurn`; `KindCompactionEnded` is a binder for the envelope rebind check and updates `byClaude` |
| `internal/session/writeorder.go` | modified | `compactionPromptID` joins the rollback CAS and the field-coverage list |

REQs: REQ-1, 2, 3, 4 (applyIdleNotice); REQ-5 (permissionWaitOwnedByOther); REQ-6, 7 (applyCompactionBegan); REQ-8, 9 (applyCompactionEnded); REQ-10 (startup/clear/resume/missing source untouched in interpretSessionStart); REQ-12 (latchPermissionMode); REQ-13 (interpret + KindTurnFailed arm); REQ-11 deliberately no code (the sweep's scope is unchanged; an open compaction prompt never matches an interrupt line).

## Decisions

- design: `applyInput` returns `turnEnded` instead of `closesTurn(kind)` in `apply.go`. The old test was kind-based plus `State == idle`, which would set `unread` on a no-op `idle_prompt` or stale compact `SessionStart` landing in an already-idle card (REQ-3/REQ-9 change no field). The arm that really closed the turn now says so; Stop and interrupt keep their result (an interrupt whose guard fails no longer re-sets `unread` from idle, a latent over-set). `rg "closesTurn" . ` found 1 production caller (apply.go) and 1 comment in `interrupt_test.go:436`.
- design: new `Session.compactionPromptID` (in-memory, writers `applyCompactionBegan`/`closePrompt` under `Manager.mu`, rolled back by `restoreChangedFields`). `rg "compactionPromptID|compaction.*[Pp]rompt" internal` found nothing to reuse. It matches `currentPromptID`'s lifecycle: a daemon restart mid-compaction loses it and the 60 s `idle_prompt` then ends the turn (plan Schema Changes).
- design: `bindIdentity` extracted from `applyBind` (claude id, pending-resume graduation, model) so a compact `SessionStart` binds without `applyBind`'s unconditional `clearAttention`/`Failure=nil`/`setState(started)`. A different `session_id` still calls `applyBind` as a clear-rebind (REQ-9). Sibling shape matched: the helpers beside `applyTurnClosed`/`applyTurnInterrupted` in `machine.go`.
- design: kinds renamed to say what they now mean: `KindIdleNotice` / `KindCompactionBegan` / `KindCompactionEnded`, matching the Diagrams delta's `idle_notice` / `compaction_began` / `compaction_ended`.
- design: `latchPermissionMode` takes the `StateInput` so the subagent test lives in one place; its callers are the turn-activity and Stop arms (`rg "latchPermissionMode"`: machine.go only).
- design: `permissionWaitOwnedByOther` reads `Attention.Reason` (new `attentionPermission`/`attentionIdle` consts replace the literal in the arm that writes it) rather than adding an owner-kind field.
- `applyInput` still trips funlen (51 statements > 40), identical at HEAD (`golangci-lint --enable-only funlen` on a `git archive HEAD` tree: `machine.go:23:6 ... (51 > 40)`); the arms I added are helpers, so the count did not grow. Kept per its existing `nolint:gocyclo` reason.
- Residual hazard recorded, not fixed (plan REQ-3 is explicit): an `idle_prompt` naming the open current prompt of a `needs_input`/`permission` session closes that prompt, so the answering turn activity on the same prompt id would then read as a straggler. kb:fact/permission-wait-gets-no-idle-prompt says this does not occur in practice.
- doc-delta: `docs/features/lifecycle/spec.md` "The machine" still names `needs_input_idle`, `KindCompaction`-era wording ("compaction ... change no state"), and the Inputs sentence the plan's Doc Delta lists; the neutral kind names in prose are now `idle_notice`, `compaction_began`, `compaction_ended`.
- No ADR-worthy deviation from the plan.

## Handoff

**Build status**: `go build ./...` exits 0. `golangci-lint run --tests=false ./...` → `0 issues.` (test files are sanctioned-broken, so `make lint` is blind). `gofmt -l internal` clean. `make web-build build` run; E2E smoke: `web/e2e/state-transitions.spec.ts`, `sessions.spec.ts`, `gauges.spec.ts` → `50 passed`, no mismatches with the authored specs. sessions.spec.ts E14 (two PreCompact bump the counter) and gauges.spec.ts E10 (`/clear` resets context and counter) both still hold (passed above).

Test files that no longer compile (rename `KindNeedsInputIdle` → `KindIdleNotice`, `KindCompaction` → `KindCompactionBegan`) and whose assertions the new behaviour also changes (plan "Existing tests this breaks"):
- `internal/session/machine_test.go` (497, 642, 728, 882; `TestApplyInput_NeedsInputIdle_FromFailedViaUnseenFreshPromptClearsFailure` expects `needs_input`/`idle`)
- `internal/session/machine_turnstate_test.go` (68, 82, 96, 481, 484, 548-549)
- `internal/session/rail_unread_test.go` (45-46 `needs_input_idle_*` rows)
- `internal/session/interrupt_test.go` (481, 499, 516, 533 use `KindNeedsInputIdle`; comment at 436 cites `closesTurn`)
- `internal/session/manager_test.go` (also references the old kind names)
- `internal/claudecode/interpret_test.go` (121, 196, 431)
New tests owed: D2 edge-case tests, D3 input × source-state table (INV-A..D), D4 and D8 interpret tests.

## Fix Attempt 1 (review cycle 1)

**Failures addressed**: Maintainability Major 1 (second home for the rebind decision, `applyCompactionEnded` vs `Apply`'s monotonic guard); Maintainability Minor 1 (the idle-landing tail had four copies). Pack: `kb: pack 23819 words (budget 30000)`.

**Changes made**:
- `internal/session/apply.go`: `isBindKind` is main's three kinds again, so a compact SessionStart goes through `Apply`'s single guarded branch (never-bound binds; a new id forward-rebinds; an id `byClaude` already maps to this session is a straggler and neither rebinds nor writes `byClaude`). The post-`applyInput` `byClaude` write is main's `KindBind || KindClearRebind` again.
- `internal/session/machine.go`: `applyCompactionEnded` no longer decides anything about a differing id. It calls `bindIdentity` (model, pending-resume graduation) only when the event's id is the bound one, then closes the compaction prompt when it is the open one. New `endTurnIntoIdle` (clear attention, clear failure, set idle, return `true`) is the one home of the landing; `applyTurnClosed`, `applyTurnInterrupted`, `applyIdleNotice` and `applyCompactionEnded` call it.

**Every path that reaches the defect (compact SessionStart naming an id different from the bound one)**:
1. Enveloped, id never this session's: `Apply`'s guard forward-rebinds (clear-rebind, `byClaude` written) then `applyCompactionEnded` runs with equal ids, so the model binds and the prompt check finds `currentPromptID` cleared and returns false. Same final state as before (started, counters reset).
2. Enveloped, id already left (`byClaude[id] == this session`): the guard skips the rebind; `applyCompactionEnded` sees unequal ids and skips `bindIdentity`; no reset; the post-step `byClaude` write no longer includes `KindCompactionEnded`, so nothing writes `byClaude[A]`.
3. Enveloped, never bound: guard binds, no transition.
4. Raw (non-enveloped): never binds or rebinds (Apply's contract); `applyCompactionEnded` leaves a differing id alone.
5. Direct `applyInput` (unit tests only): a differing id is not rebound at the machine; the rebind lives in `Apply`.

**Measured repro** (throwaway test, deleted; bind A, clear-rebind B, `PreCompact` on B with prompt p1, then a late `SessionStart{compact}` naming A with a model):
```
before: id=B state=working compactions=1 model=&{sonnet sonnet}
after : id=B state=idle compactions=1 model=&{sonnet sonnet}
```
`assertBindingConsistent` passed (no backward `byClaude`/`ClaudeSessionID` move, no reset, straggler's model ignored).

**Blast radius** (`rg "isBindKind|KindCompactionEnded|applyCompactionEnded" -g '*.go' internal` non-test): `isBindKind` has one caller (apply.go:31); `KindCompactionEnded` is produced in `interpret.go:237`, routed in `machine.go:28`; `endTurnIntoIdle` has four callers, all the helpers above. Gates: `go build ./...` ok; `golangci-lint run --tests=false ./...` → `0 issues.`; `gofmt -l .` clean; `go vet ./...` clean; `make size-warn` only the pre-existing `applyInput` funlen (51 > 40) warning.

**Decisions**:
- design: the forward-or-straggler decision for a compact SessionStart lives only in `Apply`'s branch (kb:adr/ingest-monotonic-rebind, kb:adr/lifecycle-compaction-end-monotonic). `rg "ClaudeSessionID !=|ClaudeSessionID ==" internal/session -g '*.go'` outside tests shows `Apply` (decision) and `applyBind` (escalation of a bind-kind) plus the one equality in `applyCompactionEnded`, which only gates the identity refresh (model) on the event naming the conversation the card is on; it does not choose between rebind and straggler.
- design: `endTurnIntoIdle` is the tail only. `closePrompt` stays at the call sites because they differ in order and condition: `applyTurnClosed` closes before the subagent-wait early return, `applyIdleNotice` closes before its `endsTurn` test and then closes the current prompt too. Sibling matched: `clearAttention`/`setState` helpers in `session.go`; `rg "clearAttention\(\)" -g '*.go' internal/session` still shows the same pair at the `NeedsInputPermission`, `TurnActivity`, `TurnFailed`, `CompactionBegan` and bind arms, which land on other states and are not this landing.
- REQ-8 on a straggler: a straggler's prompt id is matched only against the open compaction prompt (`compactionOpen`: marker, current and unclosed). A left conversation's prompt is never the current compaction prompt in practice (a rebind clears `currentPromptID`), so it closes nothing. If a late compact SessionStart names the open compaction prompt on the bound conversation's own ids it is not a straggler. The measured repro above reused prompt `p1` on purpose and ended the compaction (`state=idle`), the prompt id being the only thing the match keys on; I kept that rather than add a second id comparison in the machine.
- No deviation from the plan other than REQ-9's already-amended text.
- doc-delta: `docs/features/lifecycle/spec.md` / the plan Doc Delta must say the compact SessionStart is not a binder for `Apply`'s envelope check; a different unseen `session_id` still forward-rebinds through the same guard, and a left id is a straggler (kb:adr/lifecycle-compaction-end-monotonic).

**Handoff (tests, sanctioned breakage from this refactor)**:
- `internal/session/machine_cardstate_test.go` `TestApplyInput_CompactionEnded/a_different_session_id_escalates_to_the_clear-rebind_from_every_state_(edge_14)` (line ~302) calls `applyInput` directly with a new id; the machine no longer rebinds, `Apply` does. The same behaviour is already covered through `Apply` by `TestApply_CompactionEndedBinding/a_different_session_id_rebinds_once_from_*`; delete or move this subtest.
- `internal/session/machine_cardstate_test.go` `TestApplyInput_CompactionEnded/on_a_never-bound_session_it_binds_and_changes_no_state` (line ~320): binding a never-bound session is `Apply`'s; covered by `TestApply_CompactionEndedBinding/a_never-bound_session_binds_and_keeps_its_state`. Delete or move.
- To add: a unit test for the left-id straggler through `Apply` (bind A, clear-rebind B, compact SessionStart naming A: `ClaudeSessionID` stays B, `Compactions`/`Context`/state unchanged, model not applied, `assertBindingConsistent`), plus a machine-level case that `applyInput` with an id different from the bound one leaves `ClaudeSessionID` and `Model` alone.
- Everything else in `./internal/session/...` and `./internal/claudecode/...` passes under `-race` (only the two subtests above fail).
