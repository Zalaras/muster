---
id: lifecycle-attention-owned-by-raising-agent
type: decision
status: accepted
date: 2026-10-01
summary: A permission wait remembers which agent raised it; only that agent's activity ends it, and a main-agent Stop keeps a subagent's wait.
features: [lifecycle]
tags: [state-machine]
files: [internal/session/machine.go, internal/claudecode/interpret.go]
tests: []
refs: [plan:status-inconsistencies, kb:fact/subagent-hooks-during-permission-wait, kb:fact/subagent-permission-request-marked, kb:fact/ask-user-question-hook-sequence, "#40"]
supersedes: []
---
**Context.** A background subagent keeps emitting tool hooks while the main agent waits on a
permission prompt or a question dialog. Every turn-activity event cleared `attention`, so the card
left Needs Input with the prompt still on screen (#40 and the background-subagent entry).

**Options.** (A) Ignore all subagent activity while `needs_input`. (B) Record the raising agent on
the wait and let only that agent's activity end it. (C) Leave it.

**Decision.** B. The Claude Code package passes the marker's agent id as an opaque string (empty
for the main agent). A permission request sets the owner; a permission notification keeps an
existing owner. Turn activity from any other agent neither clears `attention` nor transitions. A
main `Stop` keeps a subagent-owned wait; `StopFailure` and an interrupt still end it.

**Consequences.** (A) would have stranded a subagent's own wait after its answer. A lost owner
event leaves the wait up until the main turn fails, is interrupted or the next prompt from its
owner — the stale timer is the honest signal. The owner is persisted, never on the wire.
