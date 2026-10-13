# Doc Reconcile: state-issues

**Verdict**: reconciled
**Pack**: kb: pack 11789 words (budget 30000)
**Features derived**: lifecycle, ingest, canary (plan header: **Features** lifecycle; **Touches** ingest, focus, canary)

`kb scope --plan state-issues` reports every changed source file covered. Every changed file maps to lifecycle (Features) or ingest, canary (Touches); nothing widened.

## Claims

| Feature | Claim | Verified against | Action |
|---------|-------|------------------|--------|
| lifecycle | `PermissionRequest` and a `permission_prompt` enter `needs_input`; an `idle_prompt` never does | `internal/session/machine.go:applyInput` (`KindNeedsInputPermission`), `applyIdleNotice`; `internal/claudecode/interpret.go:interpretNotification` | rewritten |
| lifecycle | `idle_prompt` naming an open prompt of a working/planning session ends the turn into idle like `Stop`; otherwise only closes that prompt; no prompt id changes nothing | `machine.go:applyIdleNotice` (nil/closed prompt returns false; `!endsTurn` only closes) | rewritten |
| lifecycle | PreCompact outside a turn enters working, its compact SessionStart lands idle; inside a turn only counts | `machine.go:applyCompactionBegan`, `applyCompactionEnded`; `session.go:compactionOpen`; `interpret.go:interpretSessionStart` (`compact`) | added, old "PreCompact increments the counter" deleted |
| lifecycle | A compact SessionStart is not a binder: Apply's envelope check applies (new id forward-rebinds, left id is a straggler); on the bound id it records the model | `apply.go:Apply` (`isBindKind` excludes `KindCompactionEnded`), `machine.go:applyCompactionEnded` -> `bindIdentity` | added |
| lifecycle | Esc before any output leaves the card working until the next prompt | no code path reads it: `internal/session/interrupt.go` sweep needs a transcript line (kb:fact/interrupt-before-output-leaves-no-trace); accepted by kb:adr/lifecycle-early-interrupt-gap-accepted | added |
| lifecycle | Latch moves only on main-agent events; a subagent's StopFailure changes nothing | `machine.go:latchPermissionMode` (`FromSubagent`), `KindTurnFailed` arm; `interpret.go` StopFailure `AgentID` | added |
| lifecycle | `needs_input` is a permission wait; an `idle` reason survives only on a row an earlier daemon persisted | `session.go:permissionWaitOwnedByOther`, `idleWait`; `machine.go` raises only `attentionPermission` | rewritten |
| lifecycle | Neutral kinds are `idle_notice`, `compaction_began`, `compaction_ended`; `needs_input_idle` and `compaction` are gone | `interpret.go` InputKind consts | rewritten (named in prose and diagram) |
| lifecycle | idle_notice ends the turn only from working, planning or a legacy idle wait; compaction_ended lands idle only for its compaction's own open prompt | `machine.go:applyIdleNotice`, `applyCompactionEnded`; `session.go:compactionOpen` | added |
| lifecycle | Diagram: `needs_input_idle` arrows removed; `compaction_began`, `compaction_ended`, `idle_notice` arrows added | same | edited |
| lifecycle | "Observed values include `bypassPermissions`" | the protocol's mode enum already lists it | deleted (ref `kb:fact/bypass-permission-mode-on-wire` dropped from frontmatter) |
| lifecycle | "Only the interrupt and turn-activity arms guard on the source state; every other arrow is drawn from every state"; "A closed-prompt needs_input_idle always returns early" | `machine.go` (idle_notice, compaction arms now guard) | deleted |
| lifecycle | `unread` is set on every turn end into idle (Stop, idle_prompt turn end, compaction end, interrupt) | `apply.go:Apply` (`turnEnded` from `applyInput`, replaces `closesTurn`) | protocol.md `kb:anchor/ws.session` and `kb:anchor/state.tracked` `unread` lines edited (were "the `Stop` row" alone) |
| protocol | `state.transitions` rows (compact, idle_prompt, StopFailure subagent, PreCompact, turn-activity ownership), `attention` reason comment, `modeLatch`, early-Esc paragraph | checked row by row against `machine.go` and `apply.go`; match the code | verified, unchanged |
| lifecycle | Budget: spec body 797 words after the edits (800 budget) | `check-kb` | to fit, condensed sentences that restate `protocol.md`: the Liveness/reconcile/shutdown and Ordering paragraphs, the `unread` clear conditions, the "Done" rationale and the kind list were shortened without dropping a claim |

## Contradictions

None. Every claim in the delta, the orchestrator's folded-in lines and the compact-SessionStart decision matches the code.

## For the orchestrator

- [orchestrator] The delta's claims change `ingest` behaviour: `internal/claudecode/interpret.go` now emits `idle_notice`, `compaction_began`, `compaction_ended`, and a subagent-marked `StopFailure` carries `FromSubagent`. `ingest` is a **Touches** feature; promote it to **Features** (kb:adr/process-touched-features-widen-without-stopping). Its spec (`docs/features/ingest/spec.md:24`) lists the subscribed events only and stays true, so no ingest spec edit was needed.
- [orchestrator] I condensed existing lifecycle prose to stay inside 800 words; the removed detail (unread cleared by any transition out of idle or by an attach, resume/shutdown wording) remains in `docs/protocol.md`.
- [orchestrator] `SPEC.md`: no change needed (no mention of idle-prompt attention).

## Checks

```
$ make gen-kb && make check-kb
kb: regenerated 4 file(s): docs/features/card-location/contract.md, docs/features/connection/contract.md, docs/features/lifecycle/contract.md, docs/features/reader/contract.md
go tool kb check
kb: 557 records, 27 features, 0 problem(s)
kb: all checks pass
```

Word counts: `docs/features/lifecycle/spec.md` body 797 (frontmatter and mermaid fence excluded, budget 800). `docs/protocol.md` has no budget.
