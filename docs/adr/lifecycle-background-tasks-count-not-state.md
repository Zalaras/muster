---
id: lifecycle-background-tasks-count-not-state
type: decision
status: accepted
date: 2026-10-01
summary: The latest Stop's running background tasks become a count on the Session; the state stays idle and the card shows a neutral line.
features: [lifecycle, rail]
tags: [state-machine, ux]
files: [internal/session/machine.go, internal/claudecode/interpret.go, web/src/sessions/card.ts]
tests: []
refs: [plan:status-inconsistencies, kb:fact/background-tasks-field, kb:fact/agent-tool-async-by-default, "#60"]
supersedes: [lifecycle-subagent-marked-events-not-stragglers]
---
**Context.** A backgrounded command left the card reading idle with nothing to say work was still
running (#60). `Stop.background_tasks` lists every running subagent and shell reliably, and the
previous decision kept it out of the machine as fixture realism only.

**Options.** (A) Keep `idle`; carry a count and show `1 background task` on the card. (B) A new
`background` state. (C) `working` while subagents run, the count for shells.

**Decision.** A, chosen by the developer 2026-09-30. `backgroundTasks` is the running count from
the latest `Stop`, reset by a clear or a resume, never a state input. The rest of the superseded
decision — subagent-marked events for a closed prompt move the session without reopening it —
stands unchanged.

**Consequences.** A dev server shows its line for hours without pinning a state. A session with
only background work still sorts as your turn. `StopFailure` carries no list, so the count holds
across a failed turn.
