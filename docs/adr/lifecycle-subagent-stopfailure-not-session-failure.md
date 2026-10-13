---
id: lifecycle-subagent-stopfailure-not-session-failure
type: decision
status: accepted
date: 2026-10-13
summary: A subagent-marked StopFailure changes no state; the main agent's background-completion turn reports the failure through its own end.
features: [lifecycle]
tags: [state-machine]
files: [internal/claudecode/interpret.go, internal/session/machine.go]
tests: [TestApplyInput_SubagentStopFailureChangesNothing]
refs: [plan:state-issues, kb:fact/subagent-stopfailure-carries-agent-id, kb:fact/stopfailure-replaces-stop, "#86"]
supersedes: []
---
**Context.** A background subagent whose API call fails emits `StopFailure` carrying its
`agent_id` and the parent's already-closed `prompt_id`. Muster read it as the session's turn
failing, and the card read `failed` while Claude was idle (#86).

**Options.** (A) Inert. (B) Show it as a note without changing state. (C) Treat it as activity.

**Decision.** A. It persists, with no transition and no field change.

**Consequences.** The main agent's background-completion turn follows. If that turn fails, its own
unmarked `StopFailure` lands `failed`; if it succeeds, the card stays honest.
