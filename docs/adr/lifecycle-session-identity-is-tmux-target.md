---
id: lifecycle-session-identity-is-tmux-target
type: decision
status: accepted
date: 2026-08-16
summary: A Muster session is identified by its tmux target; the Claude session_id is a mutable attribute that /clear replaces in the same pane.
features: [lifecycle, ingest]
tags: [state-machine, tmux, envelope]
files: [internal/session/session.go, internal/store/session.go, internal/session/manager.go]
tests: [TestApplyInput_ClearRebind, TestLoadAll_ReconstructsInMemoryStateAndClaudeBinding]
refs: [docs/history/spec-changelog.md, kb:fact/clear-mints-new-session-id, kb:anchor/ingest.envelope, kb:anchor/state.transitions]
supersedes: []
---
**Context.** The first data model keyed sessions on Claude's session id. The spike showed that a slash-clear starts a new Claude session in the same pane, so one pane emits several ids over its life.

**Options.** (A) Key on the Claude session id and treat each clear as a new Muster session. (B) Key on the tmux target and hold the current Claude id as an attribute, with a map from Claude ids to sessions for routing.

**Decision.** B. What the user sees and manages is the pane; the conversation inside it is a detail.

**Consequences.** A clear rebinds the session to the new id and resets the per-conversation gauges but keeps the row, title and history. Raw hook posts route through the id map. The event table gains a sequence and correlation columns so several conversations can share one session's log.
