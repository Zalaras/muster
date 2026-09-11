---
id: lifecycle-subagent-marked-events-not-stragglers
type: decision
status: accepted
date: 2026-09-03
summary: A subagent-marked hook for a closed prompt moves the session to working or needs-input without reopening it; unmarked stragglers stay inert.
features: [lifecycle, ingest]
tags: [state-machine, claude-code-format]
files: [internal/session/machine.go, internal/claudecode/interpret.go]
tests: [TestApplyInput_TurnActivity_ClosedPromptSubagentMarked, TestApplyInput_NeedsInputPermission_ClosedPromptSubagentMarked, TestApplyInput_TurnActivity_SubagentMarkedUnseenPromptSelfHeals, TestInterpret_FromSubagentMarker, web/e2e/subagent-status.spec.ts]
refs: [docs/history/spec-changelog.md, docs/history/protocol-changelog.md, plan:claude-status-fixes, kb:fact/subagent-hooks-carry-agent-id, kb:fact/subagent-permission-request-marked, kb:fact/background-tasks-field, kb:fact/background-completion-new-prompt-id, kb:anchor/state.ordering, kb:anchor/state.transitions, kb:adr/lifecycle-prompt-ordering-guards, "#14"]
supersedes: []
---
**Context.** A background subagent's tool and permission hooks carry the parent turn's prompt id, arrive after that turn's Stop, and carry an agent marker main-agent hooks never do. The straggler guard, which drops activity on a closed prompt, therefore dropped them, and the rail said idle while the subagent edited files. Each background completion arrives as a fresh prompt closed by its own Stop, so only the window between the parent's Stop and that fresh prompt was wrong.

**Options.** (A) Keep a session working for as long as the Stop payload reports running background tasks. (B) Let marked events for a closed prompt through to working or needs-input without reopening or adopting the prompt, so the next Stop-family event still lands idle or failed; leave unmarked stragglers inert. (C) Drop them, as before.

**Decision.** B. The Claude Code package derives a neutral from-subagent input from the marker, so the key name never leaves the package; the background-tasks field is fixture realism only, never a state input.

**Consequences.** A Stop with background work still running lands idle and the first marked hook returns the session to working, a brief blip accepted as the price of not pinning a session for as long as a backgrounded shell lives. The straggler guard is unchanged for unmarked events. A subagent's permission wait is identified only by its marked permission request, because the notification it triggers carries no marker.
