# Doc delta — status-inconsistencies

Seeded from plan.md § Doc Delta, amended by the orchestrator for what the run changed.


**lifecycle** — becomes true:
- Turn-activity events are `UserPromptSubmit`, `PreToolUse`, `PostToolUse` and `PostToolBatch`.
- A permission wait remembers the agent that raised it; only that agent's activity ends it, and a main `Stop` does not end a subagent's wait.
- An `idle_prompt` with no prompt id (it follows `/clear`) changes nothing.
- An interrupt emits no hook; the daemon reads the transcript each poll tick while a turn is open and closes an interrupted turn into `idle` (kb:adr/lifecycle-interrupt-read-from-transcript).
- `backgroundTasks` counts the background work the latest `Stop` reported running.

**lifecycle** — stops being true:
- "State is derived only from ingested hook events, Muster's own launch and resume actions and tmux pane liveness." It becomes: … plus the transcript's interrupt line.
- "Notification `permission_prompt` and `idle_prompt` … enter `needs_input`" loses the unconditional reading for `idle_prompt`.
- The transitions table row "Turn-activity event (prompt not closed) … clear `attention`" gains the other-agent guard.

**ingest** — becomes true: Muster registers twelve events, `PostToolBatch` among them.
**ingest** — stops being true: every "eleven events" count.

**rail** — becomes true: a live card offers no action button; `1 background task` (or `<n> background tasks`) is the card's last line while background work runs.
**rail** — stops being true: "a live card offers End" (and the card anatomy's End mention).

**protocol.md**: the Session object's `backgroundTasks`; tracked variables; the table rows above.


**lifecycle** — also becomes true (applied by this delta, from plan § Diagrams): the inline
`stateDiagram-v2` gains `active --> idle : turn_interrupted` and `needs_input --> idle :
turn_interrupted`; the prose under it gains the other-agent no-transition guard, the main-Stop
exception for a subagent-owned wait, and the prompt-less-`idle_prompt` no-transition guard. A
clear-rebind keeps the closed prompt ids (it resets the current prompt id), so a straggler for the
previous conversation's closed prompt stays inert (pre-review fix, D3).

**actions** — becomes true (header widened at the wave-1 gate, kb:adr/rail-live-card-offers-no-actions):
End, Resume and Remove live in the Focus mainhead and in hover-revealed action rows on tile
footers and on **ended** rail/strip cards; a live rail or strip card offers no action button.

**actions** — stops being true: "They live in the Focus mainhead above the terminal and in
hover-revealed action rows on rail cards and tile footers" as an unqualified statement that a live
rail card carries End.

**protocol.md**: already merged at approval; doc-reconcile verifies it against the code (no new
contract change this run).

Implementation-log `doc-delta:` lines: daemon (writeorder restore fields — no doc sentence
affected); web (`CardAction` comment cites the new ADR — no doc sentence affected).
