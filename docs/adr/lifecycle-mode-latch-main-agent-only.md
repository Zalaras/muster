---
id: lifecycle-mode-latch-main-agent-only
type: decision
status: accepted
date: 2026-10-13
summary: Only main-agent events move the permission-mode latch; a subagent may run under a mode its definition declares, which is not the session's.
features: [lifecycle]
tags: [state-machine]
files: [internal/session/machine.go]
tests: [TestApplyInput_SubagentEventsNeverMoveTheLatch]
refs: [plan:state-issues, kb:fact/subagent-declared-mode-on-hooks, kb:fact/permission-mode-presence-split, "#70"]
supersedes: []
---
**Context.** The latch took `permission_mode` from every event carrying it. The built-in
`claude-code-guide` agent declares `dontAsk`, and its hooks report it even under a plan-mode
parent. So a planning session flipped to `working` with no plan approved (#70).

**Options.** (A) Latch only from main-agent events. (B) Ignore only the modes no main agent
could be in.

**Decision.** A. Subagent-marked events never move the latch. All other effects of a subagent's
turn activity are unchanged.

**Consequences.** The card shows the session's own mode. A subagent's mode is not shown anywhere,
which nothing asked for.
