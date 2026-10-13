## Doc Delta

**lifecycle** — becomes true (`docs/features/lifecycle/spec.md`):
- Inputs: "`PermissionRequest` and a `permission_prompt` enter `needs_input`. An `idle_prompt` never does: naming an open prompt of a `working` or `planning` session, it ends the turn into `idle` like `Stop`; otherwise it only closes that prompt (kb:fact/local-command-orphan-idle-prompt)."
- Inputs: "A `PreCompact` outside a turn enters `working` and its compact `SessionStart` lands `idle`; inside a turn it only counts (kb:fact/compact-hook-sequence)."
- Inputs: "An Esc before any output leaves the card `working` until the next prompt (kb:fact/interrupt-before-output-leaves-no-trace)."
- Inputs: "Only main-agent events move the mode latch; a subagent's `StopFailure` changes nothing (kb:fact/subagent-declared-mode-on-hooks)."
- The machine diagram carries the Diagrams delta above.

**lifecycle** — stops being true:
- Inputs: "Notification `permission_prompt` and `idle_prompt`, and `PermissionRequest`, enter `needs_input` (kb:fact/notification-types-observed); an `idle_prompt` with no prompt id follows `/clear` and changes nothing (kb:fact/clear-idle-prompt-carries-no-prompt-id)."
- Inputs: "`PreCompact` increments the compaction counter."
- Inputs: "Observed values include `bypassPermissions` (kb:fact/bypass-permission-mode-on-wire)." (the protocol's mode enum already lists it)
- The machine: "Only the interrupt and turn-activity arms guard on the source state; every other arrow is drawn from every state."
- The machine: "compaction, death_hint, clear_death_hint and inert change no state." becomes "death_hint, clear_death_hint and inert change no state."
- The machine: "A closed-prompt needs_input_idle always returns early; see Ordering for the other closed-prompt inputs."
- The `needs_input_idle` arrows in the machine diagram.

**protocol.md**: as `plans/state-issues/plan.md` § Protocol Contract.

**Folded in by the orchestrator (implementation log and review cycle 1):**

- lifecycle, The machine (daemon-implementation.md doc-delta): the neutral kind names in prose and the diagram are now `idle_notice`, `compaction_began` and `compaction_ended`. `needs_input_idle` and the single `compaction` kind are gone.
- lifecycle, States (review.md correctness Minor 1): "`needs_input` (a permission or idle prompt is waiting …)" stops being true. Only a permission wait raises it, and an `idle` reason survives only on a row persisted by an earlier daemon.
- lifecycle, Inputs (review.md correctness Minor 1): "latch … overwritten by any event that carries the field" becomes "any **main-agent** event that carries the field".
- protocol.md, `kb:anchor/state.tracked` (review.md correctness Minor 1): `unread` is set when a turn ends into idle. That means the `Stop` row, the `idle_prompt` turn end (REQ-2), the compaction end (REQ-8) and the interrupt row, no longer "the `Stop` row" alone.
- lifecycle, Inputs (daemon-implementation.md Fix Attempt 1 doc-delta; decisions/compact-sessionstart-left-id): a compact `SessionStart` is not a binder. It goes through `Apply`'s envelope check like any non-bind event, so a new unseen `session_id` forward-rebinds and one the session already left is a straggler, never a backwards rebind (kb:adr/lifecycle-compaction-end-monotonic). On the bound id it records the model as `SessionStart` does. `docs/protocol.md`'s `state.transitions` compact rows already say this, landed by the decision.
